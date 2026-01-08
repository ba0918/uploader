/**
 * ブラウザ起動モジュール
 *
 * プラットフォームに応じたブラウザ起動と、起動失敗時のCUIフォールバック
 */

import type {
  CuiConfirmResult,
  DiffFile,
  GitDiffResult,
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

/**
 * CUIでの差分確認（フォールバック）
 */
export async function cuiConfirm(
  diffResult: GitDiffResult,
  options?: {
    promptReader?: PromptReader;
  },
): Promise<CuiConfirmResult> {
  // 差分サマリーを表示
  logSection("Changes detected (CUI mode)");
  console.log();
  console.log(`   ${green("+")}  ${diffResult.added} files added`);
  console.log(`   ${yellow("~")}  ${diffResult.modified} files modified`);
  console.log(`   ${red("-")}  ${diffResult.deleted} files deleted`);
  console.log(`   ${"─".repeat(20)}`);
  console.log(`      ${diffResult.files.length} files total`);
  console.log();

  // ファイル一覧を表示
  if (diffResult.added > 0) {
    console.log(`   ${green("Added:")}`);
    displayFiles(diffResult.files.filter((f) => f.status === "A"), 5);
  }

  if (diffResult.modified > 0) {
    console.log(`   ${yellow("Modified:")}`);
    displayFiles(diffResult.files.filter((f) => f.status === "M"), 5);
  }

  if (diffResult.deleted > 0) {
    console.log(`   ${red("Deleted:")}`);
    displayFiles(diffResult.files.filter((f) => f.status === "D"), 5);
  }

  if (diffResult.renamed > 0) {
    console.log(`   ${cyan("Renamed:")}`);
    displayFiles(diffResult.files.filter((f) => f.status === "R"), 5);
  }

  logSectionClose();
  console.log();

  // 確認プロンプト
  const answer = await promptYesNo(
    "Proceed with upload?",
    options?.promptReader ?? defaultPromptReader,
  );

  return { confirmed: answer };
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

/**
 * 入力文字列をYes/Noとして解析
 */
export function parseYesNo(input: string | null): boolean {
  if (input === null) {
    return false;
  }
  const normalized = input.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}
