/**
 * 共通定数
 */

/**
 * ファイル転送関連の定数
 */
export const FILE_TRANSFER = {
  /** チャンクサイズ（64KB） */
  CHUNK_SIZE: 64 * 1024,
} as const;

/**
 * バイナリ判定関連の定数
 */
export const BINARY_CHECK = {
  /** バイナリ判定でチェックするバイト数 */
  CHECK_LENGTH: 8192,
} as const;
