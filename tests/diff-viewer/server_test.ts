/**
 * diff-viewer/server.ts のテスト
 */

import { assertEquals, assertExists } from "jsr:@std/assert@^1";
import { beforeEach, describe, it } from "jsr:@std/testing@^1/bdd";
import {
  getServerUrl,
  startDiffViewerServer,
} from "../../src/diff-viewer/server.ts";
import type { GitDiffResult } from "../../src/types/mod.ts";

describe("getServerUrl", () => {
  it("デフォルトポート3000でURLを生成する", () => {
    const url = getServerUrl(3000);
    assertEquals(url, "http://localhost:3000");
  });

  it("カスタムポートでURLを生成する", () => {
    const url = getServerUrl(8080);
    assertEquals(url, "http://localhost:8080");
  });

  it("ポート番号を文字列に変換する", () => {
    const url = getServerUrl(12345);
    assertEquals(url, "http://localhost:12345");
  });
});

describe("startDiffViewerServer", () => {
  const mockDiffResult: GitDiffResult = {
    files: [
      { path: "src/test.ts", status: "M" },
      { path: "src/new.ts", status: "A" },
    ],
    added: 1,
    modified: 1,
    deleted: 0,
    renamed: 0,
    base: "main",
    target: "feature",
  };

  // テスト用のポートを動的に選択
  let testPort: number;

  beforeEach(() => {
    // ランダムなポートを使用（49152-65535の範囲）
    testPort = 49152 + Math.floor(Math.random() * 16383);
  });

  it("HTTPリクエストに対してHTMLを返す", async () => {
    // サーバを起動（非同期で待機）
    const serverPromise = startDiffViewerServer(mockDiffResult, {
      port: testPort,
      openBrowser: false,
      base: "main",
      target: "feature",
      diffMode: "git",
    });

    // サーバが起動するまで少し待つ
    await new Promise((resolve) => setTimeout(resolve, 100));

    // HTTPリクエストを送信
    const response = await fetch(`http://localhost:${testPort}/`);
    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );

    const html = await response.text();
    assertExists(html);
    assertEquals(html.includes("<!DOCTYPE html>"), true);
    assertEquals(html.includes("Diff Viewer"), true);

    // WebSocket接続でキャンセルを送信してサーバを終了
    const ws = new WebSocket(`ws://localhost:${testPort}/`);
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "cancel" }));
        resolve();
      };
    });

    const result = await serverPromise;
    assertEquals(result.confirmed, false);
    assertEquals(result.cancelReason, "user_cancel");
  });

  it("404を返す（存在しないパス）", async () => {
    const serverPromise = startDiffViewerServer(mockDiffResult, {
      port: testPort,
      openBrowser: false,
      base: "main",
      target: "feature",
      diffMode: "git",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = await fetch(`http://localhost:${testPort}/nonexistent`);
    assertEquals(response.status, 404);
    await response.text(); // bodyを消費

    // サーバを終了
    const ws = new WebSocket(`ws://localhost:${testPort}/`);
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "cancel" }));
        resolve();
      };
    });

    await serverPromise;
  });

  it("WebSocket接続で初期データを受信する", async () => {
    const serverPromise = startDiffViewerServer(mockDiffResult, {
      port: testPort,
      openBrowser: false,
      base: "main",
      target: "feature",
      diffMode: "git",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const ws = new WebSocket(`ws://localhost:${testPort}/`);

    const initMessage = await new Promise<unknown>((resolve, reject) => {
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data));
      };
      ws.onerror = reject;
    });

    // 初期データの検証
    assertExists(initMessage);
    const init = initMessage as {
      type: string;
      data: {
        base: string;
        target: string;
        files: unknown[];
        summary: { added: number; modified: number };
      };
    };
    assertEquals(init.type, "init");
    assertEquals(init.data.base, "main");
    assertEquals(init.data.target, "feature");
    assertEquals(init.data.files.length, 2);
    assertEquals(init.data.summary.added, 1);
    assertEquals(init.data.summary.modified, 1);

    // サーバを終了
    ws.send(JSON.stringify({ type: "cancel" }));
    await serverPromise;
  });

  it("confirmメッセージでサーバが終了しconfirmed=trueを返す", async () => {
    const serverPromise = startDiffViewerServer(mockDiffResult, {
      port: testPort,
      openBrowser: false,
      base: "main",
      target: "feature",
      diffMode: "git",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const ws = new WebSocket(`ws://localhost:${testPort}/`);

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        // 初期データを待つ
        ws.onmessage = () => {
          ws.send(JSON.stringify({ type: "confirm" }));
          resolve();
        };
      };
    });

    const result = await serverPromise;
    assertEquals(result.confirmed, true);
    assertEquals(result.cancelReason, undefined);
  });
});
