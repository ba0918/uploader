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
import { formatFileSize } from "../utils/mod.ts";
import {
  collectChangedFilesByTarget,
  getRemoteDiffs,
  hasRemoteChanges,
  rsyncDiffToFiles,
  type TargetDiffInfo,
} from "./remote-diff.ts";

/** CUIモードでのファイルリスト表示上限 */
const CUI_FILE_LIST_LIMIT = 50;

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
 * 転送元ファイル一覧を表示
 */
function displaySourceFiles(uploadFiles: UploadFile[]): void {
  const filesToUpload = uploadFiles.filter((f) => f.changeType !== "delete");
  if (filesToUpload.length === 0) {
    return;
  }

  logSection("Files collected");
  console.log();

  // ファイル数とサイズを集計
  const files = filesToUpload.filter((f) => !f.isDirectory);
  const dirs = filesToUpload.filter((f) => f.isDirectory);
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  console.log(`   ${dim("📄")}  ${files.length} file(s)`);
  console.log(`   ${dim("📁")}  ${dirs.length} director(ies)`);
  console.log(`   ${"─".repeat(20)}`);
  console.log(`      Total: ${formatFileSize(totalSize)}`);
  console.log();

  // ファイル数が多い場合は一部のみ表示
  if (files.length > CUI_FILE_LIST_LIMIT) {
    console.log(`   ${dim("Files")} ${dim(`(showing ${CUI_FILE_LIST_LIMIT} of ${files.length})`)}`);
    for (let i = 0; i < CUI_FILE_LIST_LIMIT; i++) {
      const file = files[i];
      const isLast = i === CUI_FILE_LIST_LIMIT - 1;
      const prefix = isLast ? "└─" : "├─";
      console.log(`   ${dim(prefix)} ${file.relativePath} ${dim(`(${formatFileSize(file.size)})`)}`);
    }
  } else if (files.length > 0) {
    console.log(`   ${dim("Files")}`);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isLast = i === files.length - 1;
      const prefix = isLast ? "└─" : "├─";
      console.log(`   ${dim(prefix)} ${file.relativePath} ${dim(`(${formatFileSize(file.size)})`)}`);
    }
  }

  logSectionClose();
  console.log();
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

  // total は実際に変更があるファイル数（changeType が設定されているもの）
  return {
    added,
    modified,
    deleted,
    total: added + modified + deleted,
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
    return;
  }

  // diff も error もない場合のみ unsupported を表示
  if (unsupported) {
    console.log(
      `   ${dim(`[${index + 1}]`)} ${label} ${
        dim(`(${target.protocol} - diff not supported)`)
      }`,
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

  // uploadFilesがある場合は転送元ファイル一覧を表示
  if (uploadFiles.length > 0) {
    displaySourceFiles(uploadFiles);
  }

  // uploadFilesがある場合は、それをベースに差分を表示
  const useUploadFiles = uploadFiles.length > 0;

  // rsyncターゲットがある場合のみ、追加でgetDiff()を実行
  const shouldGetRemoteDiffs = targets.length > 0 && localDir;

  let targetDiffs: TargetDiffInfo[] = [];
  let filesToDisplay: DiffFile[] = [];
  let summary = {
    added: diffResult.added,
    modified: diffResult.modified,
    deleted: diffResult.deleted,
    total: diffResult.files.length,
  };

  if (shouldGetRemoteDiffs) {
    // rsyncのgetDiff()を使用して正確な差分を取得
    console.log(dim("  Checking remote differences..."));
    targetDiffs = await getRemoteDiffs(targets, uploadFiles, localDir, {
      checksum,
    });
    // 進捗表示をクリア
    console.log("\x1b[1A\x1b[2K");

    // 最初のターゲットの差分を使用（複数ターゲットの場合は個別表示）
    if (targetDiffs.length > 0 && targetDiffs[0].diff) {
      const diff = targetDiffs[0].diff;
      summary = {
        added: diff.added,
        modified: diff.modified,
        deleted: diff.deleted,
        total: diff.added + diff.modified + diff.deleted,
      };
      // getDiff結果からDiffFileを生成
      filesToDisplay = [];
      // Note: getDiff()の詳細なファイル一覧は取得できないため、uploadFilesから生成
      if (useUploadFiles) {
        filesToDisplay = uploadFilesToDiffFiles(uploadFiles);
      } else {
        filesToDisplay = diffResult.files;
      }
    } else if (useUploadFiles) {
      // getDiff失敗時はuploadFilesから生成
      summary = createSummaryFromUploadFiles(uploadFiles);
      filesToDisplay = uploadFilesToDiffFiles(uploadFiles);
    } else {
      filesToDisplay = diffResult.files;
    }
  } else if (useUploadFiles) {
    // uploadFilesから直接サマリーを作成（全プロトコル対応）
    summary = createSummaryFromUploadFiles(uploadFiles);
    filesToDisplay = uploadFilesToDiffFiles(uploadFiles);
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
    // 各ターゲットごとにサマリーとファイルリストを表示
    for (let i = 0; i < targetDiffs.length; i++) {
      const info = targetDiffs[i];
      const label = `${info.target.host}:${info.target.dest}`;

      console.log(`   ${dim(`Target ${i + 1}: ${label}`)}`);
      console.log();

      // サマリー表示
      if (info.error) {
        console.log(`   ${red(`Error: ${info.error}`)}`);
      } else if (info.diff) {
        const diff = info.diff;
        console.log(`   ${green("+")}  ${diff.added} files added`);
        console.log(`   ${yellow("~")}  ${diff.modified} files modified`);
        console.log(`   ${red("-")}  ${diff.deleted} files deleted`);
        console.log(`   ${"─".repeat(20)}`);
        const total = diff.added + diff.modified + diff.deleted;
        console.log(`      ${total} files total`);
        console.log();

        // 件数が多い場合の警告
        if (total > CUI_FILE_LIST_LIMIT) {
          console.log(`   ${yellow("⚠")}  ${yellow(`Large number of changes detected (${total} files)`)}`);
          console.log(`   ${dim(`Showing first ${CUI_FILE_LIST_LIMIT} files per category.`)}`);
          console.log(`   ${dim(`For detailed review, use browser mode: remove --cui flag`)}`);
          console.log();
        }

        // ファイルリスト表示
        const targetFiles = rsyncDiffToFiles(diff);
        const added = targetFiles.filter((f) => f.status === "A");
        const modified = targetFiles.filter((f) => f.status === "M");
        const deleted = targetFiles.filter((f) => f.status === "D");

        if (added.length > 0) {
          console.log(`   ${green("Added:")}`);
          displayFiles(added, CUI_FILE_LIST_LIMIT);
        }
        if (modified.length > 0) {
          console.log(`   ${yellow("Modified:")}`);
          displayFiles(modified, CUI_FILE_LIST_LIMIT);
        }
        if (deleted.length > 0) {
          console.log(`   ${red("Deleted:")}`);
          displayFiles(deleted, CUI_FILE_LIST_LIMIT);
        }
      } else if (info.unsupported) {
        console.log(`   ${dim(`(${info.target.protocol} - diff not supported)`)}`);
      }

      console.log();
      console.log(`   ${"─".repeat(40)}`);
      console.log();
    }
  }

  // ファイルリスト表示の準備（targetDiffsがない場合用）
  const shouldShowFileList = targetDiffs.length === 0 && summary.total > 0;

  // ターゲット情報表示（targetDiffsがない場合のみ）
  if (targetDiffs.length === 0 && targets.length > 0) {
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

  // ファイルリスト表示（変更がある場合のみ）
  if (shouldShowFileList) {
    console.log(`   ${green("+")}  ${summary.added} files added`);
    console.log(`   ${yellow("~")}  ${summary.modified} files modified`);
    console.log(`   ${red("-")}  ${summary.deleted} files deleted`);
    console.log(`   ${"─".repeat(20)}`);
    console.log(`      ${summary.total} files total`);
    console.log();

    // 件数が多い場合の警告
    if (summary.total > CUI_FILE_LIST_LIMIT) {
      console.log(`   ${yellow("⚠")}  ${yellow(`Large number of changes detected (${summary.total} files)`)}`);
      console.log(`   ${dim(`Showing first ${CUI_FILE_LIST_LIMIT} files per category.`)}`);
      console.log(`   ${dim(`For detailed review, use browser mode: remove --cui flag`)}`);
      console.log();
    }

    // ファイル一覧を表示
    if (summary.added > 0) {
      console.log(`   ${green("Added:")}`);
      displayFiles(filesToDisplay.filter((f) => f.status === "A"), CUI_FILE_LIST_LIMIT);
    }

    if (summary.modified > 0) {
      console.log(`   ${yellow("Modified:")}`);
      displayFiles(filesToDisplay.filter((f) => f.status === "M"), CUI_FILE_LIST_LIMIT);
    }

    if (summary.deleted > 0) {
      console.log(`   ${red("Deleted:")}`);
      displayFiles(filesToDisplay.filter((f) => f.status === "D"), CUI_FILE_LIST_LIMIT);
    }

    const renamed = filesToDisplay.filter((f) => f.status === "R");
    if (renamed.length > 0) {
      console.log(`   ${cyan("Renamed:")}`);
      displayFiles(renamed, CUI_FILE_LIST_LIMIT);
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
