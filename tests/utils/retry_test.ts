/**
 * リトライユーティリティのテスト
 */

import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  toError,
  withRetry,
} from "../../src/utils/retry.ts";

describe("withRetry", () => {
  it("成功した場合は結果を返す", async () => {
    const result = await withRetry(() => Promise.resolve("success"));
    assertEquals(result, "success");
  });

  it("最初に失敗しても成功するまでリトライする", async () => {
    let attempts = 0;
    const result = await withRetry(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(new Error("fail"));
      }
      return Promise.resolve("success");
    });
    assertEquals(result, "success");
    assertEquals(attempts, 3);
  });

  it("全てのリトライが失敗した場合はエラーをスロー", async () => {
    let attempts = 0;
    await assertRejects(
      async () => {
        await withRetry(
          () => {
            attempts++;
            return Promise.reject(new Error("always fail"));
          },
          { maxRetries: 3 },
        );
      },
      Error,
      "always fail",
    );
    assertEquals(attempts, 3);
  });

  it("maxRetriesオプションでリトライ回数を指定できる", async () => {
    let attempts = 0;
    await assertRejects(
      async () => {
        await withRetry(
          () => {
            attempts++;
            return Promise.reject(new Error("fail"));
          },
          { maxRetries: 5 },
        );
      },
      Error,
    );
    assertEquals(attempts, 5);
  });

  it("リトライ回数1の場合はリトライしない", async () => {
    let attempts = 0;
    await assertRejects(
      async () => {
        await withRetry(
          () => {
            attempts++;
            return Promise.reject(new Error("fail"));
          },
          { maxRetries: 1 },
        );
      },
      Error,
    );
    assertEquals(attempts, 1);
  });

  it("非Errorオブジェクトもエラーとして処理される", async () => {
    await assertRejects(
      async () => {
        await withRetry(
          () => Promise.reject("string error"),
          { maxRetries: 1 },
        );
      },
      Error,
      "string error",
    );
  });
});

describe("toError", () => {
  it("Errorオブジェクトはそのまま返す", () => {
    const error = new Error("test");
    assertEquals(toError(error), error);
  });

  it("文字列をErrorに変換する", () => {
    const result = toError("string error");
    assertEquals(result instanceof Error, true);
    assertEquals(result.message, "string error");
  });

  it("数値をErrorに変換する", () => {
    const result = toError(123);
    assertEquals(result instanceof Error, true);
    assertEquals(result.message, "123");
  });
});
