/**
 * ブラウザ起動モジュール
 *
 * プラットフォームに応じたブラウザ起動と、起動失敗時のCUIフォールバック
 */

import type {
  CuiConfirmResult,
  DiffFile,
  GitDiffResult,
  ResolvedTargetConfig,
  UploadFile,
} from "../types/mod.ts";
import {
  cyan,
  dim,
  green,
  logSection,
  logSectionClose,
  red,
  yellow,
} from "../ui/mod.ts";
import {
  collectChangedFilesByTarget,
  getRemoteDiffs,
  hasRemoteChanges,
  type TargetDiffInfo,
} from "./remote-diff.ts";

/** ブラウザ起動用コマンド実行インターフェース */
export interface BrowserCommandRunner {
  run(command: string, args: string[]): Promise<{ code: number }>;
}

/** プロンプト入力インターフェース */
export interface PromptReader {
  read(): Promise<string | null>;
}

/** デフォルトのコマンドランナー */
export class DefaultBrowserCommandRunner implements BrowserCommandRunner {
  async run(command: string, args: string[]): Promise<{ code: number }> {
    try {
      const process = new Deno.Command(command, {
        args,
        stdout: "null",
        stderr: "null",
      });
      const { code } = await process.output();
      return { code };
    } catch {
      return { code: -1 };
    }
  }
}

/** デフォルトのプロンプトリーダー */
export class DefaultPromptReader implements PromptReader {
  async read(): Promise<string | null> {
    const buf = new Uint8Array(1024);
    const n = await Deno.stdin.read(buf);
    if (n === null) {
      return null;
    }
    return new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
  }
}

/** デフォルトインスタンス */
const defaultCommandRunner = new DefaultBrowserCommandRunner();
const defaultPromptReader = new DefaultPromptReader();

/** プラットフォームに応じたブラウザ起動コマンドを取得 */
export function getBrowserCommand(
  platform: typeof Deno.build.os,
  url: string,
): { command: string; args: string[] } {
  switch (platform) {
    case "darwin":
      return { command: "open", args: [url] };
    case "windows":
      return { command: "cmd", args: ["/c", "start", url] };
    default: // linux etc.
      return { command: "xdg-open", args: [url] };
  }
}

/**
 * ブラウザを開く
 */
export async function openBrowser(
  url: string,
  options?: {
    runner?: BrowserCommandRunner;
    platform?: typeof Deno.build.os;
  },
): Promise<boolean> {
  const runner = options?.runner ?? defaultCommandRunner;
  const platform = options?.platform ?? Deno.build.os;

  const { command, args } = getBrowserCommand(platform, url);

  const result = await runner.run(command, args);

  if (result.code !== 0 && platform === "linux") {
    // WSL環境の場合、wslviewを試す
    const wslResult = await runner.run("wslview", [url]);
    return wslResult.code === 0;
  }

  return result.code === 0;
}

/** CUIでの差分確認オプション */
export interface CuiConfirmOptions {
  promptReader?: PromptReader;
  targets?: ResolvedTargetConfig[];
  uploadFiles?: UploadFile[];
  localDir?: string;
  checksum?: boolean;
}

/**
 * UploadFilesからサマリーを作成
 */
function createSummaryFromUploadFiles(uploadFiles: UploadFile[]): {
  added: number;
  modified: number;
  deleted: number;
  total: number;
} {
  let added = 0;
  let modified = 0;
  let deleted = 0;

  for (const file of uploadFiles) {
    if (file.changeType === "add") {
      added++;
    } else if (file.changeType === "modify") {
      modified++;
    } else if (file.changeType === "delete") {
      deleted++;
    }
  }

  return {
    added,
    modified,
    deleted,
    total: uploadFiles.length,
  };
}

/**
 * UploadFilesをDiffFile形式に変換
 */
function uploadFilesToDiffFiles(uploadFiles: UploadFile[]): DiffFile[] {
  return uploadFiles.map((file) => ({
    path: file.relativePath,
    status: file.changeType === "add"
      ? "A"
      : file.changeType === "modify"
      ? "M"
      : file.changeType === "delete"
      ? "D"
      : "A", // デフォルトはA
  }));
}

/**
 * ターゲットごとの差分サマリーを表示
 */
function displayTargetDiffSummary(info: TargetDiffInfo, index: number): void {
  const { target, diff, error, unsupported } = info;
  const label = `${target.host}:${target.dest}`;

  if (unsupported) {
    console.log(
      `   ${dim(`[${index + 1}]`)} ${label} ${
        dim(`(${target.protocol} - diff not supported)`)
      }`,
    );
    return;
  }

  if (error) {
    console.log(
      `   ${dim(`[${index + 1}]`)} ${label} ${red(`(error: ${error})`)}`,
    );
    return;
  }

  if (diff) {
    const total = diff.added + diff.modified + diff.deleted;
    console.log(
      `   ${dim(`[${index + 1}]`)} ${label}`,
    );
    console.log(
      `       ${green("+")} ${diff.added}  ${yellow("~")} ${diff.modified}  ${
        red("-")
      } ${diff.deleted}  ${dim(`(${total} total)`)}`,
    );
  }
}

/**
 * CUIでの差分確認（フォールバック）
 */
export async function cuiConfirm(
  diffResult: GitDiffResult,
  options?: CuiConfirmOptions,
): Promise<CuiConfirmResult> {
  const targets = options?.targets ?? [];
  const uploadFiles = options?.uploadFiles ?? [];
  const localDir = options?.localDir ?? "";
  const checksum = options?.checksum ?? false;

  // uploadFilesがある場合は、それをベースに差分を表示
  const useUploadFiles = uploadFiles.length > 0;

  // rsyncターゲットがある場合のみ、追加でgetDiff()を実行
  const shouldGetRemoteDiffs = !useUploadFiles &&
    targets.length > 0 &&
    localDir;

  let targetDiffs: TargetDiffInfo[] = [];
  let filesToDisplay: DiffFile[] = [];
  let summary = {
    added: diffResult.added,
    modified: diffResult.modified,
    deleted: diffResult.deleted,
    total: diffResult.files.length,
  };

  if (useUploadFiles) {
    // uploadFilesから直接サマリーを作成（全プロトコル対応）
    summary = createSummaryFromUploadFiles(uploadFiles);
    filesToDisplay = uploadFilesToDiffFiles(uploadFiles);
  } else if (shouldGetRemoteDiffs) {
    // rsyncのgetDiff()を使用（従来の処理）
    console.log(dim("  Checking remote differences..."));
    targetDiffs = await getRemoteDiffs(targets, uploadFiles, localDir, {
      checksum,
    });
    // 進捗表示をクリア
    console.log("\x1b[1A\x1b[2K");
    filesToDisplay = diffResult.files;
  } else {
    // ローカルの差分のみ表示
    filesToDisplay = diffResult.files;
  }

  // 全体の変更があるかチェック
  const remoteHasChanges = hasRemoteChanges(targetDiffs);
  const hasLocalChanges = summary.total > 0;

  // 変更があるか判定
  const hasAnyChanges = targetDiffs.length === 0
    ? hasLocalChanges
    : remoteHasChanges;

  // 差分サマリーを表示
  logSection("Changes detected (CUI mode)");
  console.log();

  // remoteモードでターゲットごとの差分を表示
  if (targetDiffs.length > 0) {
    console.log(`   ${dim("Remote diff by target:")}`);
    console.log();
    for (let i = 0; i < targetDiffs.length; i++) {
      displayTargetDiffSummary(targetDiffs[i], i);
    }
    console.log();
    console.log(`   ${"─".repeat(30)}`);
    console.log();
  }

  // uploadFilesベースまたは差分取得できなかった場合の表示
  if (targetDiffs.length === 0) {
    if (targets.length > 0) {
      // ターゲット情報を表示
      if (targets.length === 1) {
        const t = targets[0];
        console.log(`   ${dim("Target:")} ${t.host}:${t.dest}`);
      } else {
        console.log(`   ${dim("Targets:")} ${targets.length} target(s)`);
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          const isLast = i === targets.length - 1;
          const prefix = isLast ? "└─" : "├─";
          console.log(`   ${dim(prefix)} ${t.host}:${t.dest}`);
        }
      }
      console.log();
    }

    console.log(`   ${green("+")}  ${summary.added} files added`);
    console.log(`   ${yellow("~")}  ${summary.modified} files modified`);
    console.log(`   ${red("-")}  ${summary.deleted} files deleted`);
    console.log(`   ${"─".repeat(20)}`);
    console.log(`      ${summary.total} files total`);
    console.log();

    // ファイル一覧を表示
    if (summary.added > 0) {
      console.log(`   ${green("Added:")}`);
      displayFiles(filesToDisplay.filter((f) => f.status === "A"), 5);
    }

    if (summary.modified > 0) {
      console.log(`   ${yellow("Modified:")}`);
      displayFiles(filesToDisplay.filter((f) => f.status === "M"), 5);
    }

    if (summary.deleted > 0) {
      console.log(`   ${red("Deleted:")}`);
      displayFiles(filesToDisplay.filter((f) => f.status === "D"), 5);
    }

    const renamed = filesToDisplay.filter((f) => f.status === "R");
    if (renamed.length > 0) {
      console.log(`   ${cyan("Renamed:")}`);
      displayFiles(renamed, 5);
    }
  }

  logSectionClose();
  console.log();

  // 変更がない場合は確認をスキップ
  if (!hasAnyChanges) {
    console.log(dim("  No changes to upload."));
    console.log();
    return { confirmed: false, noChanges: true };
  }

  // ターゲットごとの変更ファイルを収集
  const changedFilesByTarget = collectChangedFilesByTarget(targetDiffs);

  // 確認プロンプト
  const answer = await promptYesNo(
    "Proceed with upload?",
    options?.promptReader ?? defaultPromptReader,
  );

  return { confirmed: answer, changedFilesByTarget };
}

/**
 * ファイル一覧を表示（最大n件）
 */
export function displayFiles(files: DiffFile[], max: number): void {
  const displayCount = Math.min(files.length, max);

  for (let i = 0; i < displayCount; i++) {
    const file = files[i];
    const isLast = i === displayCount - 1 && files.length <= max;
    const prefix = isLast ? "└─" : "├─";
    console.log(`   ${dim(prefix)} ${file.path}`);
  }

  if (files.length > max) {
    console.log(`   ${dim("└─")} ... and ${files.length - max} more`);
  }
}

/**
 * Yes/Noプロンプト
 */
export async function promptYesNo(
  message: string,
  reader: PromptReader = defaultPromptReader,
): Promise<boolean> {
  const encoder = new TextEncoder();
  await Deno.stdout.write(encoder.encode(`${cyan("?")} ${message} (y/N): `));

  const input = await reader.read();

  if (input === null) {
    return false;
  }

  return input === "y" || input === "yes";
}
