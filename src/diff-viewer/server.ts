/**
 * diff-viewer HTTP/WebSocket サーバ
 *
 * Deno.serve を使用してHTTPとWebSocketの両方を処理する
 */

import type {
  DiffViewerOptions,
  DiffViewerResult,
  GitDiffResult,
  WsClientMessage,
} from "../types/mod.ts";
import { getHtmlContent } from "./static/html.ts";
import { isVerbose } from "../ui/mod.ts";
import {
  createServerState,
  handleWebSocketMessage,
  sendInitMessage,
  type ServerState,
  startIdleCheckTimer,
  stopIdleCheckTimer,
} from "./ws-handler.ts";

/**
 * デバッグエラーを出力（verboseモード時のみ）
 */
function debugError(message: string, ...args: unknown[]): void {
  if (isVerbose()) {
    console.error(message, ...args);
  }
}

/**
 * diff-viewer サーバを起動
 */
export function startDiffViewerServer(
  diffResult: GitDiffResult,
  options: DiffViewerOptions,
): Promise<DiffViewerResult> {
  return new Promise((resolve) => {
    const state = createServerState(resolve, diffResult, options);

    // アイドルチェックタイマーを開始
    startIdleCheckTimer(state);

    const server = Deno.serve(
      {
        port: options.port,
        signal: state.abortController.signal,
        onListen: () => {
          // サーバ起動時のログは呼び出し側で出力
        },
      },
      (req) => handleRequest(req, state),
    );

    // サーバが終了したときの処理
    server.finished.then(() => {
      // タイマーをクリア
      stopIdleCheckTimer(state);
      // 正常終了以外の場合はキャンセル扱い
      if (state.socket === null) {
        resolve({ confirmed: false, cancelReason: "connection_closed" });
      }
    });
  });
}

/**
 * HTTPリクエストを処理
 */
function handleRequest(req: Request, state: ServerState): Response {
  const url = new URL(req.url);

  // WebSocketアップグレード
  if (req.headers.get("upgrade") === "websocket") {
    return handleWebSocketUpgrade(req, state);
  }

  // 静的ファイルの配信
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(getHtmlContent(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 404
  return new Response("Not Found", { status: 404 });
}

/**
 * WebSocketアップグレードを処理
 */
function handleWebSocketUpgrade(req: Request, state: ServerState): Response {
  const { socket, response } = Deno.upgradeWebSocket(req);

  state.socket = socket;

  socket.onopen = async () => {
    // 初期データを送信
    await sendInitMessage(socket, state);
  };

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data) as WsClientMessage;
      await handleWebSocketMessage(socket, message, state);
    } catch (error) {
      debugError("WebSocket message error:", error);
      socket.send(JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  };

  socket.onclose = () => {
    // 接続が閉じられたらサーバを終了
    if (state.socket === socket) {
      state.socket = null;
      state.abortController.abort();
      state.resolve({ confirmed: false, cancelReason: "connection_closed" });
    }
  };

  socket.onerror = (error) => {
    debugError("WebSocket error:", error);
  };

  return response;
}

/**
 * サーバのURLを取得
 */
export function getServerUrl(port: number): string {
  return `http://localhost:${port}`;
}
