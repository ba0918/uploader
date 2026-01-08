/**
 * CLI引数定義
 */

import { parseArgs as stdParseArgs } from "@std/cli/parse-args";
import type { CliArgs, DiffMode, DiffOption } from "../types/mod.ts";
import { showVersion } from "../ui/mod.ts";

const HELP_TEXT = `
Usage: uploader [options] <profile>

Git-based deployment tool - Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイ

Arguments:
  profile                  プロファイル名

Options:
  -c, --config <path>      設定ファイルのパス
  -d, --diff[=mode]        アップロード前にdiff viewerで確認
                           mode: git (gitモードのデフォルト)
                                 remote (fileモードのデフォルト)
                                 both (両方表示)
  -n, --dry-run            dry-run（実際のアップロードは行わない）
      --delete             リモートの余分なファイルを削除（mirror同期）
  -b, --base <branch>      比較元ブランチ（gitモード用）
  -t, --target <branch>    比較先ブランチ（gitモード用）
  -v, --verbose            詳細ログ出力
  -q, --quiet              最小限の出力
  -p, --port <number>      diff viewerのポート (default: 3000)
      --no-browser         ブラウザを自動で開かない
  -s, --strict             ファイル転送エラーで即座に終了
  -l, --log-file <path>    ログファイルのパス
      --concurrency <num>  リモートステータスチェックの同時実行数 (default: 10)
  -V, --version            バージョン表示
  -h, --help               このヘルプを表示

Examples:
  uploader development                    基本的な使い方
  uploader --diff staging                 diff確認してからアップロード
  uploader --diff=remote staging          リモートとの差分を確認
  uploader --diff=both development        git差分とリモート差分の両方を確認
  uploader --dry-run production           dry-run モード
  uploader --base=main --target=feature/xxx development  ブランチを指定
`.trim();

/** 有効なdiffモード */
const VALID_DIFF_MODES: readonly DiffMode[] = ["git", "remote", "both"];

/**
 * ヘルプを表示
 */
export function showHelp(): void {
  console.log(HELP_TEXT);
}

/**
 * diffオプションの値をパース
 *
 * - `--diff` (値なし) → "auto" (後でモードに応じて決定)
 * - `--diff=git` → "git"
 * - `--diff=remote` → "remote"
 * - `--diff=both` → "both"
 * - なし → false
 */
function parseDiffOption(value: boolean | string | undefined): DiffOption {
  if (value === undefined || value === false) {
    return false;
  }
  if (value === true) {
    // --diff（値なし）の場合は "auto"
    return "auto";
  }
  // 文字列の場合、有効なモードかチェック
  const mode = value.toLowerCase();
  if (VALID_DIFF_MODES.includes(mode as DiffMode)) {
    return mode as DiffMode;
  }
  // 無効な値は "auto" として扱う
  console.warn(`Warning: Invalid --diff mode "${value}". Using default mode.`);
  return "auto";
}

/**
 * CLI引数をパース
 */
export function parseArgs(args: string[]): CliArgs | null {
  const parsed = stdParseArgs(args, {
    string: ["config", "base", "target", "log-file", "diff"],
    boolean: [
      "dry-run",
      "delete",
      "verbose",
      "quiet",
      "no-browser",
      "strict",
      "version",
      "help",
    ],
    default: {
      "dry-run": false,
      delete: false,
      verbose: false,
      quiet: false,
      "no-browser": false,
      strict: false,
      port: 3000,
      concurrency: 10,
    },
    alias: {
      c: "config",
      d: "diff",
      n: "dry-run",
      b: "base",
      t: "target",
      v: "verbose",
      q: "quiet",
      p: "port",
      s: "strict",
      l: "log-file",
      V: "version",
      h: "help",
    },
  });

  // ヘルプ表示
  if (parsed.help) {
    showHelp();
    return null;
  }

  // バージョン表示
  if (parsed.version) {
    showVersion();
    return null;
  }

  // ポートを数値に変換
  let port = 3000;
  if (parsed.port !== undefined) {
    const parsedPort = typeof parsed.port === "number"
      ? parsed.port
      : parseInt(String(parsed.port), 10);
    if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort < 65536) {
      port = parsedPort;
    }
  }

  // concurrencyを数値に変換
  let concurrency = 10;
  if (parsed.concurrency !== undefined) {
    const parsedConcurrency = typeof parsed.concurrency === "number"
      ? parsed.concurrency
      : parseInt(String(parsed.concurrency), 10);
    if (!isNaN(parsedConcurrency) && parsedConcurrency > 0) {
      concurrency = parsedConcurrency;
    }
  }

  // diffオプションをパース
  // -d フラグ（値なし）の場合、argsに "-d" が含まれているかチェック
  let diffValue: boolean | string | undefined = parsed.diff;
  if (
    diffValue === undefined &&
    (args.includes("-d") || args.includes("--diff"))
  ) {
    // 値なしのフラグとして使われた場合
    diffValue = true;
  }
  const diffOption = parseDiffOption(diffValue);

  return {
    profile: parsed._[0] as string | undefined,
    config: parsed.config,
    diff: diffOption,
    dryRun: parsed["dry-run"],
    delete: parsed.delete,
    base: parsed.base,
    target: parsed.target,
    verbose: parsed.verbose,
    quiet: parsed.quiet,
    port,
    noBrowser: parsed["no-browser"],
    strict: parsed.strict,
    logFile: parsed["log-file"],
    concurrency,
  };
}
