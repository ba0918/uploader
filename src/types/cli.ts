/**
 * CLI引数の型定義
 */

/** ログレベル */
export type LogLevel = "verbose" | "normal" | "quiet";

/** CLI オプション */
export interface CliOptions {
  /** 設定ファイルパス */
  config?: string;

  /** diff viewerを開く */
  diff: boolean;

  /** dry-run モード */
  dryRun: boolean;

  /** リモートの余分なファイルを削除 */
  delete: boolean;

  /** Git base ブランチ */
  base?: string;

  /** Git target ブランチ */
  target?: string;

  /** 詳細ログ */
  verbose: boolean;

  /** 最小限の出力 */
  quiet: boolean;

  /** diff viewer のポート */
  port: number;

  /** ブラウザを開かない */
  noBrowser: boolean;

  /** ファイル転送エラーで終了 */
  strict: boolean;

  /** ログファイルパス */
  logFile?: string;
}

/** CLI 引数（プロファイル名含む） */
export interface CliArgs extends CliOptions {
  profile?: string;
}

/** 実行コンテキスト */
export interface ExecutionContext {
  args: CliArgs;
  logLevel: LogLevel;
  workingDir: string;
}
