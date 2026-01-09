/**
 * CLI引数定義
 */

import { parseArgs as stdParseArgs } from "@std/cli/parse-args";
import type { CliArgs, DiffMode, DiffOption } from "../types/mod.ts";
import { logWarning, showVersion } from "../ui/mod.ts";

const HELP_TEXT = `
Usage: uploader [options] <profile>

Git-based deployment tool - Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイ

Arguments:
  profile                  プロファイル名

Options:
  -c, --config <path>      設定ファイルのパス
  -d, --diff               アップロード前にdiff viewerで確認（リモートとの差分を表示）
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
      --parallel           複数ターゲットへ並列にアップロード
  -L, --list               プロファイル一覧を表示
  -V, --version            バージョン表示
  -h, --help               このヘルプを表示

Examples:
  uploader --list                         プロファイル一覧を表示
  uploader development                    基本的な使い方
  uploader --diff staging                 diff確認してからアップロード
  uploader --dry-run production           dry-run モード
  uploader --base=main --target=feature/xxx development  ブランチを指定
`.trim();

/** 有効なdiffモード */
const VALID_DIFF_MODES: readonly DiffMode[] = ["remote"];

/**
 * ヘルプを表示
 */
export function showHelp(): void {
  console.log(HELP_TEXT);
}

/**
 * diffオプションの値をパース
 *
 * - `--diff` (値なし) → "auto" (remoteモードを使用)
 * - `--diff=remote` → "remote"
 * - なし → false
 */
function parseDiffOption(value: boolean | string | undefined): DiffOption {
  if (value === undefined || value === false) {
    return false;
  }
  if (value === true) {
    // --diff（値なし）の場合は "auto"（remoteモードに解決される）
    return "auto";
  }
  // 文字列の場合、有効なモードかチェック
  const mode = value.toLowerCase();
  if (VALID_DIFF_MODES.includes(mode as DiffMode)) {
    return mode as DiffMode;
  }
  // 無効な値は警告を出して "auto" として扱う
  logWarning(`Invalid --diff mode "${value}". Using default mode.`);
  return "auto";
}

/**
 * --diff オプションを前処理して抽出
 *
 * `--diff` を string として定義すると、`--diff profile` で profile が
 * diff の値として解釈されてしまう。これを防ぐため、`--diff=value` 形式
 * のみ値を取り、`--diff` 単体は boolean として扱う。
 *
 * @returns [処理済みargs, diffValue]
 */
function preprocessDiffOption(
  args: string[],
): [string[], boolean | string | undefined] {
  const result: string[] = [];
  let diffValue: boolean | string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // --diff=value 形式
    if (arg.startsWith("--diff=")) {
      diffValue = arg.slice(7); // "--diff=" の長さは7
      continue;
    }

    // -d=value 形式
    if (arg.startsWith("-d=")) {
      diffValue = arg.slice(3); // "-d=" の長さは3
      continue;
    }

    // --diff 単体（値なし）
    if (arg === "--diff" || arg === "-d") {
      diffValue = true;
      continue;
    }

    result.push(arg);
  }

  return [result, diffValue];
}

/**
 * CLI引数をパース
 */
export function parseArgs(args: string[]): CliArgs | null {
  // diffオプションを先に抽出（後続の引数を誤って取り込むのを防ぐ）
  const [preprocessedArgs, diffValue] = preprocessDiffOption(args);

  const parsed = stdParseArgs(preprocessedArgs, {
    string: ["config", "base", "target", "log-file"],
    boolean: [
      "dry-run",
      "delete",
      "verbose",
      "quiet",
      "no-browser",
      "strict",
      "parallel",
      "version",
      "help",
      "list",
    ],
    default: {
      "dry-run": false,
      delete: false,
      verbose: false,
      quiet: false,
      "no-browser": false,
      strict: false,
      parallel: false,
      port: 3000,
      concurrency: 10,
    },
    alias: {
      c: "config",
      n: "dry-run",
      b: "base",
      t: "target",
      v: "verbose",
      q: "quiet",
      p: "port",
      s: "strict",
      l: "log-file",
      L: "list",
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

  // diffオプションをパース（前処理で抽出済み）
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
    parallel: parsed.parallel,
    list: parsed.list,
  };
}
