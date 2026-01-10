/**
 * リトライユーティリティ
 *
 * ssh-base.ts と sftp.ts で重複していた指数バックオフリトライロジックを統合
 */

/** リトライオプション */
export interface RetryOptions {
  /** 最大リトライ回数（デフォルト: 3） */
  maxRetries?: number;
  /** 初期待機時間（ミリ秒、デフォルト: 1000） */
  initialDelay?: number;
  /** バックオフ係数（デフォルト: 2） */
  backoffFactor?: number;
}

/**
 * 指数バックオフでリトライを行う
 *
 * @param fn 実行する非同期関数
 * @param options リトライオプション
 * @returns 関数の戻り値
 * @throws 全てのリトライが失敗した場合、最後のエラーをスロー
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelay = options?.initialDelay ?? 1000;
  const backoffFactor = options?.backoffFactor ?? 2;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        // 指数バックオフでリトライ
        const delay = initialDelay * Math.pow(backoffFactor, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // 全てのリトライが失敗
  throw lastError;
}

/**
 * エラーをError型に変換するヘルパー
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
