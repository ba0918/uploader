/**
 * ファイルモード関連の型定義
 */

/** 収集されたファイル情報 */
export interface CollectedFile {
  /** ソースファイルの絶対パス */
  sourcePath: string;
  /** 相対パス（アップロード先での配置パス） */
  relativePath: string;
  /** ファイルサイズ（バイト） */
  size: number;
  /** 最終更新日時 */
  mtime: Date | null;
  /** ディレクトリかどうか */
  isDirectory: boolean;
}

/** ファイル収集の結果 */
export interface FileCollectResult {
  /** 収集されたファイル一覧 */
  files: CollectedFile[];
  /** ファイル数 */
  fileCount: number;
  /** ディレクトリ数 */
  directoryCount: number;
  /** 合計サイズ（バイト） */
  totalSize: number;
  /** ソースパターン配列 */
  sources: string[];
}

/** ファイル収集オプション */
export interface FileCollectOptions {
  /** 基準ディレクトリ（デフォルト: カレントディレクトリ） */
  baseDir?: string;
  /** 除外パターン */
  ignorePatterns?: string[];
  /** シンボリックリンクを追跡するか */
  followSymlinks?: boolean;
}
