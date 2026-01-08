/**
 * Git関連の型定義
 */

/** ファイル変更種別 */
export type FileChangeType = "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X";

/** ファイル変更種別の説明 */
export const FILE_CHANGE_TYPE_LABELS: Record<FileChangeType, string> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type-changed",
  U: "unmerged",
  X: "unknown",
};

/** 差分ファイル情報 */
export interface DiffFile {
  /** ファイルパス */
  path: string;
  /** 変更種別 */
  status: FileChangeType;
  /** リネーム・コピー元のパス（R/Cの場合のみ） */
  oldPath?: string;
  /** リネーム・コピーの類似度（0-100） */
  similarity?: number;
}

/** Git差分の結果 */
export interface GitDiffResult {
  /** 差分ファイル一覧 */
  files: DiffFile[];
  /** 追加されたファイル数 */
  added: number;
  /** 変更されたファイル数 */
  modified: number;
  /** 削除されたファイル数 */
  deleted: number;
  /** リネームされたファイル数 */
  renamed: number;
  /** base ブランチ */
  base: string;
  /** target ブランチ */
  target: string;
}

/** ファイル内容取得の結果 */
export interface FileContent {
  /** ファイルパス */
  path: string;
  /** ファイル内容（バイナリの場合はnull） */
  content: string | null;
  /** バイナリファイルかどうか */
  isBinary: boolean;
}
