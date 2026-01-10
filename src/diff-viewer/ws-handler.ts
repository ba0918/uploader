/**
 * diff-viewer WebSocket ハンドラ
 *
 * WebSocket メッセージの処理と進捗管理
 */

import type {
  DiffViewerOptions,
  DiffViewerProgressController,
  DiffViewerResult,
  GitDiffResult,
  RsyncDiffResult,
  TransferProgressEvent,
  UploadResult,
  WsClientMessage,
} from "../types/mod.ts";
import { shouldUseLazyLoading } from "../utils/mod.ts";
import {
  checkUploaderIdle,
  disconnectUploader,
  type UploaderState,
} from "./file-content.ts";
import {
  DEFAULT_UPLOADER_IDLE_TIMEOUT,
  LAZY_LOADING_THRESHOLD,
} from "./ws-constants.ts";
import {
  handleExpandDirectory,
  handleFileRequest,
  handleSwitchTarget,
} from "./ws-init-handler.ts";
import { debugLog, sendJsonMessage } from "./ws-utils.ts";

/** ターゲットごとの差分サマリー（キャッシュ用） */
export interface CachedTargetDiff {
  /** rsync diff結果 */
  rsyncDiff: RsyncDiffResult | null;
  /** 変更ファイルリスト */
  changedFiles: string[];
  /** 差分サマリー */
  summary: {
    added: number;
    modified: number;
    deleted: number;
    total: number;
  };
  /** エラー（発生時のみ） */
  error?: string;
  /** 削除対象ファイルリスト（mirrorモード時、非rsyncプロトコル用） */
  deleteFiles?: string[];
}

/** サーバの状態 */
export interface ServerState extends UploaderState {
  /** 解決用のPromise resolve関数 */
  resolve: (result: DiffViewerResult) => void;
  /** サーバのAbortController */
  abortController: AbortController;
  /** WebSocket接続 */
  socket: WebSocket | null;
  /** Git diff結果 */
  diffResult: GitDiffResult;
  /** ターゲットインデックスごとの変更ファイルリスト（remote diffモード時のみ） */
  changedFilesByTarget: Map<number, string[]>;
  /** ターゲットインデックスごとの差分キャッシュ */
  diffCacheByTarget: Map<number, CachedTargetDiff>;
  /** 全ターゲットのチェックが完了したか */
  allTargetsChecked: boolean;
  /** 遅延読み込みモードが有効か */
  lazyLoading: boolean;
  /** アイドルチェックタイマー */
  idleCheckTimer: number | null;
  /** 全ファイルの差分チェックが完了したか */
  diffCheckCompleted: boolean;
  /** 差分があるファイルが存在するか */
  hasChangesToUpload: boolean;
}

/**
 * サーバ状態を初期化
 */
export function createServerState(
  resolve: (result: DiffViewerResult) => void,
  diffResult: GitDiffResult,
  options: DiffViewerOptions,
): ServerState {
  // 遅延読み込みを使用するかどうかを判定
  const useLazyLoading = shouldUseLazyLoading(
    diffResult.files.length,
    LAZY_LOADING_THRESHOLD,
  );

  return {
    resolve,
    abortController: new AbortController(),
    socket: null,
    diffResult,
    options,
    uploader: null,
    connectionError: null,
    changedFilesByTarget: new Map(),
    diffCacheByTarget: new Map(),
    allTargetsChecked: false,
    lazyLoading: useLazyLoading,
    currentTargetIndex: 0,
    uploaderLastUsed: 0,
    idleCheckTimer: null,
    diffCheckCompleted: false,
    hasChangesToUpload: false,
  };
}

/**
 * 進捗コントローラーを作成
 */
export function createProgressController(
  socket: WebSocket,
  state: ServerState,
): DiffViewerProgressController {
  return {
    sendProgress(event: TransferProgressEvent): void {
      sendJsonMessage(socket, { type: "progress", data: event });
    },
    sendComplete(result: UploadResult): void {
      sendJsonMessage(socket, {
        type: "complete",
        data: {
          successTargets: result.successTargets,
          failedTargets: result.failedTargets,
          totalFiles: result.totalFiles,
          totalSize: result.totalSize,
          totalDuration: result.totalDuration,
        },
      });
    },
    sendError(message: string): void {
      sendJsonMessage(socket, { type: "error", message });
    },
    close(): void {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      state.abortController.abort();
    },
  };
}

/**
 * アイドルチェックタイマーを開始
 */
export function startIdleCheckTimer(state: ServerState): void {
  const timeout = state.options.uploaderIdleTimeout ??
    DEFAULT_UPLOADER_IDLE_TIMEOUT;

  // タイムアウトが0以下なら無効
  if (timeout <= 0) {
    debugLog("[IdleCheck] Uploader idle timeout is disabled");
    return;
  }

  // 30秒ごとにチェック
  const checkInterval = 30 * 1000;
  state.idleCheckTimer = setInterval(async () => {
    await checkUploaderIdle(state, timeout);
  }, checkInterval);

  debugLog(`[IdleCheck] Started idle check timer (timeout: ${timeout}s)`);
}

/**
 * アイドルチェックタイマーを停止
 */
export function stopIdleCheckTimer(state: ServerState): void {
  if (state.idleCheckTimer !== null) {
    clearInterval(state.idleCheckTimer);
    state.idleCheckTimer = null;
    debugLog("[IdleCheck] Stopped idle check timer");
  }
}

/**
 * WebSocketメッセージを処理
 */
export async function handleWebSocketMessage(
  socket: WebSocket,
  message: WsClientMessage,
  state: ServerState,
): Promise<void> {
  switch (message.type) {
    case "file_request": {
      // リクエストタイプを取得（常にremote）
      const requestType = "remote" as const;

      await handleFileRequest(socket, message.path, requestType, state);
      break;
    }

    case "confirm": {
      // アップロード確認 - Uploaderを切断（リモート比較用）
      await disconnectUploader(state);
      // WebSocket接続は維持し、進捗コントローラーを作成して返却
      // state.socketはnullにしない（oncloseでの誤検知を防ぐ）
      const progressController = createProgressController(socket, state);
      state.resolve({
        confirmed: true,
        progressController,
        changedFilesByTarget: state.changedFilesByTarget.size > 0
          ? state.changedFilesByTarget
          : undefined,
      });
      break;
    }

    case "cancel": {
      // キャンセル - Uploaderを切断
      await disconnectUploader(state);
      state.socket = null;
      socket.close();
      state.abortController.abort();
      state.resolve({ confirmed: false, cancelReason: "user_cancel" });
      break;
    }

    case "expand_directory": {
      // ディレクトリ展開リクエスト
      await handleExpandDirectory(socket, message.path, state);
      break;
    }

    case "switch_target": {
      // ターゲット切り替え
      await handleSwitchTarget(socket, message.targetIndex, state);
      break;
    }
  }
}

// 再エクスポート（後方互換性のため）
export { sendInitMessage } from "./ws-init-handler.ts";
export {
  checkAllTargetsDiff,
  hasAnyTargetChanges,
  startBackgroundDiffCheck,
} from "./ws-target-checker.ts";
