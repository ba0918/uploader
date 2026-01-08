/**
 * フォーマット関連ユーティリティ
 */

/**
 * ファイルサイズを人間が読みやすい形式にフォーマット
 * @param bytes バイト数
 * @returns フォーマットされた文字列（例: "1.5 MB"）
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  if (unitIndex === 0) {
    return `${size} ${units[unitIndex]}`;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 時間を mm:ss 形式にフォーマット
 * @param ms ミリ秒
 * @returns フォーマットされた文字列（例: "01:30"）
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${
    remainingSeconds.toString().padStart(2, "0")
  }`;
}
