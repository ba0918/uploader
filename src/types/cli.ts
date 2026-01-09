/**
 * CLI引数の型定義
 */

/** ログレベル */
export type LogLevel = "verbose" | "normal" | "quiet";

/** diff表示モードの種類（リモート差分のみサポート） */
export type DiffMode = "remote";

/** diff指定の種類（auto = remoteモードを使用） */
export type DiffOption = false | "remote" | "auto";

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

  /** リモートステータスチェックの同時実行数（デフォルト: 10） */
  concurrency: number;

  /** 複数ターゲットへの並列アップロード */
  parallel: boolean;

  /** rsync checksum比較（--checksum）*/
  checksum: boolean;
}

/** CLI 引数（プロファイル名含む） */
export interface CliArgs extends CliOptions {
  profile?: string;
  /** プロファイル一覧を表示 */
  list: boolean;
}

/** 実行コンテキスト */
export interface ExecutionContext {
  args: CliArgs;
  logLevel: LogLevel;
  workingDir: string;
}
