/**
 * CLI引数定義
 */

import { parseArgs as stdParseArgs } from "@std/cli/parse-args";
import type { CliArgs } from "../types/mod.ts";
import { showVersion } from "../ui/mod.ts";

const HELP_TEXT = `
Usage: uploader [options] <profile>

Git-based deployment tool - Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイ

Arguments:
  profile                  プロファイル名

Options:
  -c, --config <path>      設定ファイルのパス
  -d, --diff               アップロード前にdiff viewerで確認
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
  -V, --version            バージョン表示
  -h, --help               このヘルプを表示

Examples:
  uploader development                    基本的な使い方
  uploader --diff staging                 diff確認してからアップロード
  uploader --dry-run production           dry-run モード
  uploader --base=main --target=feature/xxx development  ブランチを指定
`.trim();

/**
 * ヘルプを表示
 */
export function showHelp(): void {
  console.log(HELP_TEXT);
}

/**
 * CLI引数をパース
 */
export function parseArgs(args: string[]): CliArgs | null {
  const parsed = stdParseArgs(args, {
    string: ["config", "base", "target", "log-file"],
    boolean: [
      "diff",
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
      diff: false,
      "dry-run": false,
      delete: false,
      verbose: false,
      quiet: false,
      "no-browser": false,
      strict: false,
      port: 3000,
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

  return {
    profile: parsed._[0] as string | undefined,
    config: parsed.config,
    diff: parsed.diff,
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
  };
}
