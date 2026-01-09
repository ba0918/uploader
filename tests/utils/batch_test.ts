/**
 * batchAsync のテスト
 */

import { assertEquals } from "@std/assert";
import { batchAsync, batchAsyncWithProgress } from "../../src/utils/batch.ts";

Deno.test("batchAsync", async (t) => {
  await t.step("空配列を処理できる", async () => {
    const results = await batchAsync(
      [],
      (x: number) => Promise.resolve(x * 2),
      5,
    );
    assertEquals(results, []);
  });

  await t.step("全要素を処理できる", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await batchAsync(
      items,
      (x) => Promise.resolve(x * 2),
      3,
    );
    assertEquals(results, [2, 4, 6, 8, 10]);
  });

  await t.step("順序が保持される", async () => {
    const items = [1, 2, 3, 4, 5];
    // ランダムな遅延を追加して順序が保持されるか確認
    const results = await batchAsync(
      items,
      async (x) => {
        await new Promise((r) => setTimeout(r, Math.random() * 10));
        return x;
      },
      2,
    );
    assertEquals(results, [1, 2, 3, 4, 5]);
  });

  await t.step("同時実行数が制限される", async () => {
    let currentConcurrent = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await batchAsync(
      items,
      async (_) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 20));
        currentConcurrent--;
      },
      3,
    );

    assertEquals(maxConcurrent, 3);
  });

  await t.step("concurrencyが配列長より大きくても動作する", async () => {
    const items = [1, 2, 3];
    const results = await batchAsync(
      items,
      (x) => Promise.resolve(x * 2),
      100,
    );
    assertEquals(results, [2, 4, 6]);
  });

  await t.step("concurrencyが0以下の場合は1として扱う", async () => {
    const items = [1, 2, 3];
    const results = await batchAsync(
      items,
      (x) => Promise.resolve(x * 2),
      0,
    );
    assertEquals(results, [2, 4, 6]);
  });

  await t.step("デフォルトconcurrencyは10", async () => {
    let currentConcurrent = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 20 }, (_, i) => i);
    await batchAsync(
      items,
      async (_) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 10));
        currentConcurrent--;
      },
    );

    assertEquals(maxConcurrent, 10);
  });

  await t.step("エラーが発生した場合は伝播する", async () => {
    const items = [1, 2, 3, 4, 5];
    let error: Error | null = null;

    try {
      await batchAsync(
        items,
        (x) => {
          if (x === 3) {
            return Promise.reject(new Error("Test error"));
          }
          return Promise.resolve(x);
        },
        2,
      );
    } catch (e) {
      error = e as Error;
    }

    assertEquals(error?.message, "Test error");
  });
});

Deno.test("batchAsyncWithProgress", async (t) => {
  await t.step("進捗コールバックが呼ばれる", async () => {
    const items = [1, 2, 3, 4, 5];
    const progressCalls: { completed: number; total: number }[] = [];

    await batchAsyncWithProgress(
      items,
      (x) => Promise.resolve(x * 2),
      {
        concurrency: 2,
        onProgress: (completed, total) => {
          progressCalls.push({ completed, total });
        },
      },
    );

    // 5回呼ばれるはず（各完了時）
    assertEquals(progressCalls.length, 5);
    // 最後の呼び出しは5/5
    assertEquals(progressCalls[progressCalls.length - 1], {
      completed: 5,
      total: 5,
    });
  });

  await t.step("空配列でも動作する", async () => {
    const progressCalls: number[] = [];

    const results = await batchAsyncWithProgress(
      [],
      (x: number) => Promise.resolve(x),
      {
        onProgress: (completed) => progressCalls.push(completed),
      },
    );

    assertEquals(results, []);
    assertEquals(progressCalls.length, 0);
  });
});
