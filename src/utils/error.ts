/**
 * エラー検出ユーティリティ
 */

/**
 * SSH認証エラーかどうかを判定
 *
 * SSH/SCP/rsync で発生する認証エラーを検出する。
 * - "Permission denied" (一般的な認証失敗)
 * - "publickey" (公開鍵認証失敗)
 *
 * @param errorMsg エラーメッセージ
 * @returns 認証エラーの場合 true
 */
export function isSshAuthError(errorMsg: string): boolean {
  return (
    errorMsg.includes("Permission denied") ||
    errorMsg.includes("publickey")
  );
}

/**
 * SFTP認証エラーかどうかを判定
 *
 * ssh2ライブラリで発生する認証エラーを検出する。
 * - "authentication" (認証失敗)
 * - "publickey" (公開鍵認証失敗)
 * - "password" (パスワード認証失敗)
 *
 * @param errorMsg エラーメッセージ
 * @returns 認証エラーの場合 true
 */
export function isSftpAuthError(errorMsg: string): boolean {
  return (
    errorMsg.includes("authentication") ||
    errorMsg.includes("publickey") ||
    errorMsg.includes("password")
  );
}

/**
 * 接続拒否エラーかどうかを判定
 *
 * @param errorMsg エラーメッセージ
 * @returns 接続拒否エラーの場合 true
 */
export function isConnectionRefusedError(errorMsg: string): boolean {
  return errorMsg.includes("Connection refused");
}
