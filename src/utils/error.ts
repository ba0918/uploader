/**
 * エラー検出ユーティリティ
 */

/**
 * 共通エラーメッセージ
 */
export const ERROR_MESSAGES = {
  /** ソースファイル未指定エラー */
  NO_SOURCE_FOR_FILE_UPLOAD: "No source for file upload",
} as const;

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

/**
 * ファイル不在エラーかどうかを判定
 *
 * 以下のパターンを検出する：
 * - `Deno.errors.NotFound` エラー型
 * - "No such file" メッセージ
 * - "not found" メッセージ（大文字小文字問わず）
 * - "ENOENT" エラーコード
 *
 * @param error エラーオブジェクト
 * @returns ファイル不在エラーの場合 true
 */
export function isFileNotFoundError(error: unknown): boolean {
  if (error instanceof Deno.errors.NotFound) {
    return true;
  }

  if (error instanceof Error) {
    const msg = error.message;
    return (
      msg.includes("No such file") ||
      msg.toLowerCase().includes("not found") ||
      msg.includes("ENOENT")
    );
  }

  return false;
}

/**
 * 権限エラーかどうかを判定
 *
 * 以下のパターンを検出する：
 * - `Deno.errors.PermissionDenied` エラー型
 * - "Permission denied" メッセージ
 * - "EACCES" エラーコード
 * - "permission" メッセージ（大文字小文字問わず）
 *
 * 注意: SSH/SFTP認証エラーとは異なる。
 * ファイルシステム権限エラーを検出する。
 *
 * @param error エラーオブジェクト
 * @returns 権限エラーの場合 true
 */
export function isPermissionDeniedError(error: unknown): boolean {
  if (error instanceof Deno.errors.PermissionDenied) {
    return true;
  }

  if (error instanceof Error) {
    const msg = error.message;
    return (
      msg.includes("Permission denied") ||
      msg.includes("EACCES") ||
      msg.toLowerCase().includes("permission")
    );
  }

  return false;
}

/**
 * ネットワークエラーかどうかを判定
 *
 * 以下のパターンを検出する：
 * - "Connection refused" メッセージ
 * - "Connection reset" メッセージ
 * - "timeout" メッセージ（大文字小文字問わず）
 * - "ETIMEDOUT" エラーコード
 * - "ECONNREFUSED" エラーコード
 *
 * @param error エラーオブジェクト
 * @returns ネットワークエラーの場合 true
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    return (
      msg.includes("Connection refused") ||
      msg.includes("Connection reset") ||
      msg.toLowerCase().includes("timeout") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("ECONNREFUSED")
    );
  }

  return false;
}

/**
 * SFTPエラーコードから権限エラーを判定
 *
 * SSH2/SFTPプロトコルの標準エラーコード：
 * - code 2: No such file
 * - code 3: Permission denied
 *
 * @param code SFTPエラーコード
 * @returns 権限エラー（code 3）の場合 true
 */
export function isSftpPermissionError(code?: number): boolean {
  return code === 3;
}

/**
 * エラー種別を判定
 *
 * エラー内容とSFTPコードから、エラーの種別を分類する。
 * 優先順位：
 * 1. SFTPコード（指定されている場合）
 * 2. ファイル不在エラー
 * 3. 権限エラー
 * 4. ネットワークエラー
 * 5. その他のエラー
 *
 * @param error エラーオブジェクト
 * @param sftpCode SFTPエラーコード（オプション）
 * @returns エラー種別
 */
export function classifyError(
  error: unknown,
  sftpCode?: number,
): "NotFound" | "PermissionDenied" | "NetworkError" | "UnknownError" {
  // SFTPコードが指定されている場合は優先
  if (sftpCode === 2) {
    return "NotFound";
  }
  if (sftpCode === 3) {
    return "PermissionDenied";
  }

  // エラー内容から判定
  if (isFileNotFoundError(error)) {
    return "NotFound";
  }
  if (isPermissionDeniedError(error)) {
    return "PermissionDenied";
  }
  if (isNetworkError(error)) {
    return "NetworkError";
  }

  return "UnknownError";
}
