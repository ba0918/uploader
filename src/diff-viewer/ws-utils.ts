/**
 * diff-viewer WebSocket ユーティリティ
 *
 * デバッグログ、メッセージ送信などの共通機能
 */

import type { UploadButtonState, WsUploadStateMessage } from "../types/mod.ts";
import { isVerbose } from "../ui/mod.ts";

/**
 * デバッグログを出力（verboseモード時のみ）
 */
export function debugLog(message: string, ...args: unknown[]): void {
  if (isVerbose()) {
    console.log(message, ...args);
  }
}

/**
 * デバッグエラーを出力（verboseモード時のみ）
 */
export function debugError(message: string, ...args: unknown[]): void {
  if (isVerbose()) {
    console.error(message, ...args);
  }
}

/**
 * WebSocketでエラーメッセージを送信
 */
export function sendErrorMessage(socket: WebSocket, message: string): void {
  socket.send(JSON.stringify({
    type: "error",
    message,
  }));
}

/**
 * WebSocketにJSONメッセージを送信（接続中のみ）
 */
export function sendJsonMessage(socket: WebSocket, message: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/**
 * アップロードボタン状態更新メッセージを送信
 */
export function sendUploadStateMessage(
  socket: WebSocket,
  uploadButtonState: UploadButtonState,
): void {
  const message: WsUploadStateMessage = {
    type: "upload_state",
    data: uploadButtonState,
  };
  sendJsonMessage(socket, message);
}
