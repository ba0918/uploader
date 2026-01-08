/**
 * バッチ処理ユーティリティ
 *
 * 並行処理数を制限しながら非同期処理を実行する
 */

/**
 * 並行処理数を制限しながら配列の各要素に対して非同期処理を実行
 *
 * @param items - 処理対象の配列
 * @param fn - 各要素に適用する非同期関数
 * @param concurrency - 同時実行数（デフォルト: 10）
 * @returns 処理結果の配列（入力と同じ順序）
 *
 * @example
 * ```ts
 * const results = await batchAsync(
 *   files,
 *   async (file) => await checkRemoteStatus(file),
 *   10 // 最大10件同時実行
 * );
 * ```
 */
export async function batchAsync<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number = 10,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  // 並行数は最低1、配列の長さを超えない
  const actualConcurrency = Math.max(1, Math.min(concurrency, items.length));

  // 結果を格納する配列（順序を保持するためインデックス付き）
  const results: R[] = new Array(items.length);

  // 現在処理中のインデックス
  let nextIndex = 0;

  // ワーカー関数: 次のアイテムを取得して処理を続ける
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      results[index] = await fn(item);
    }
  }

  // 指定数のワーカーを並行実行
  const workers: Promise<void>[] = [];
  for (let i = 0; i < actualConcurrency; i++) {
    workers.push(worker());
  }

  // 全ワーカーの完了を待つ
  await Promise.all(workers);

  return results;
}

/**
 * 進捗コールバック付きのバッチ処理
 *
 * @param items - 処理対象の配列
 * @param fn - 各要素に適用する非同期関数
 * @param options - オプション
 * @returns 処理結果の配列
 */
export async function batchAsyncWithProgress<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const { concurrency = 10, onProgress } = options;
  const actualConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      results[index] = await fn(item);
      completed++;
      onProgress?.(completed, items.length);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < actualConcurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return results;
}
