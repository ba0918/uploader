/**
 * CLI引数の型定義
 */

/** ログレベル */
export type LogLevel = "verbose" | "normal" | "quiet";

/** diff表示モードの種類 */
export type DiffMode = "git" | "remote" | "both";

/** diff指定の種類（auto = モードに応じてデフォルト値を使用） */
export type DiffOption = false | DiffMode | "auto";

/** CLI オプション */
export interface CliOptions {
  /** 設定ファイルパス */
  config?: string;

  /** diff viewerモード（false = 無効、auto = モードに応じたデフォルト、DiffMode = 指定値） */
  diff: DiffOption;

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
