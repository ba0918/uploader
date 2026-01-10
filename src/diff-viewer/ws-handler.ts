/**
 * diff-viewer WebSocket ハンドラ
 *
 * WebSocket メッセージの処理と進捗管理
 */

import type {
  DiffFile,
  DiffViewerOptions,
  DiffViewerProgressController,
  DiffViewerResult,
  FileRequestType,
  GitDiffResult,
  RsyncDiffResult,
  TargetDiffSummary,
  TransferProgressEvent,
  UploadButtonState,
  UploadResult,
  WsClientMessage,
  WsDirectoryContentsMessage,
  WsFileResponseMessage,
  WsInitMessage,
  WsLoadingProgressMessage,
  WsUploadStateMessage,
} from "../types/mod.ts";
import { hasDiff } from "../types/mod.ts";
import { createUploader } from "../upload/mod.ts";
import { isVerbose } from "../ui/mod.ts";
import {
  batchAsync,
  buildRootLevelTree,
  getDirectChildren,
  shouldUseLazyLoading,
} from "../utils/mod.ts";
import {
  checkUploaderIdle,
  disconnectUploader,
  getLocalAndRemoteContents,
  type UploaderState,
} from "./file-content.ts";
import {
  extractFilePaths,
  rsyncDiffToFiles,
  rsyncDiffToSummary,
} from "./remote-diff.ts";

/** 遅延読み込みの閾値（この数を超えたら遅延読み込みを有効化） */
const LAZY_LOADING_THRESHOLD = 100;

/** デフォルトのアイドルタイムアウト（秒） */
const DEFAULT_UPLOADER_IDLE_TIMEOUT = 300; // 5分

/** デフォルトの同時ターゲットチェック数 */
const DEFAULT_TARGET_CHECK_CONCURRENCY = 3;

/**
 * デバッグログを出力（verboseモード時のみ）
 */
function debugLog(message: string, ...args: unknown[]): void {
  if (isVerbose()) {
    console.log(message, ...args);
  }
}

/**
 * デバッグエラーを出力（verboseモード時のみ）
 */
function debugError(message: string, ...args: unknown[]): void {
  if (isVerbose()) {
    console.error(message, ...args);
  }
}

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
 * 現在のターゲットの変更ファイルリストを保存
 */
function saveChangedFilesForCurrentTarget(
  state: ServerState,
  files: DiffFile[],
): void {
  state.changedFilesByTarget.set(
    state.currentTargetIndex,
    files.map((f) => f.path),
  );
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

/**
 * 全ターゲットで1つでも変更があるかを判定
 * アップロードボタンの有効/無効判定に使用
 */
export function hasAnyTargetChanges(state: ServerState): boolean {
  // キャッシュがなければfalse
  if (!state.allTargetsChecked || state.diffCacheByTarget.size === 0) {
    return false;
  }

  // いずれかのターゲットに変更があればtrue
  for (const cached of state.diffCacheByTarget.values()) {
    if (!cached.error && cached.summary.total > 0) {
      return true;
    }
  }

  return false;
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
 * バックグラウンドで全ファイルの差分チェックを実行（遅延読み込みモード用）
 */
export async function startBackgroundDiffCheck(
  socket: WebSocket,
  state: ServerState,
): Promise<void> {
  const { diffResult, options } = state;
  const concurrency = options.concurrency ?? 10;
  const files = diffResult.files; // DiffFileはファイルのみ（ディレクトリは含まない）

  debugLog(
    `[BackgroundCheck] Starting diff check for ${files.length} files (concurrency: ${concurrency})...`,
  );

  let hasChanges = false;

  try {
    await batchAsync(
      files,
      async (file) => {
        try {
          const { remoteStatus } = await getLocalAndRemoteContents(
            file.path,
            state,
          );
          if (remoteStatus.hasChanges) {
            hasChanges = true;
          }
        } catch (_err) {
          // エラーの場合は差分ありとして扱う
          hasChanges = true;
        }
      },
      concurrency,
    );

    state.diffCheckCompleted = true;
    state.hasChangesToUpload = hasChanges;

    // 接続エラーが発生していないか再確認
    if (state.connectionError) {
      sendUploadStateMessage(socket, {
        disabled: true,
        reason: "connection_error",
        message: state.connectionError,
      });
    } else if (!hasChanges) {
      sendUploadStateMessage(socket, {
        disabled: true,
        reason: "no_changes",
        message: "No changes to upload",
      });
    } else {
      sendUploadStateMessage(socket, { disabled: false });
    }

    debugLog(`[BackgroundCheck] Completed. hasChanges=${hasChanges}`);
  } catch (error) {
    debugError(`[BackgroundCheck] Error:`, error);
    state.diffCheckCompleted = true;
    state.hasChangesToUpload = true; // エラー時は差分ありとして扱う
    sendUploadStateMessage(socket, { disabled: false });
  }
}


/**
 * rsync getDiff()の結果を使ってファイル一覧をフィルタリング
 */
function filterFilesByRsyncDiff(
  _files: DiffFile[],
  rsyncDiff: RsyncDiffResult,
): {
  files: DiffFile[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
    total: number;
  };
} {
  // 共通モジュールを使用してrsync結果をDiffFileとサマリーに変換
  const filteredFiles = rsyncDiffToFiles(rsyncDiff);
  const summary = rsyncDiffToSummary(rsyncDiff);

  // デバッグ: 結果を表示
  debugLog(
    `[filterFilesByRsyncDiff] rsyncDiff.entries=${rsyncDiff.entries.length} -> filteredFiles=${filteredFiles.length}`,
  );
  if (filteredFiles.length > 0 && filteredFiles.length <= 5) {
    debugLog(
      `[filterFilesByRsyncDiff] Filtered paths: ${filteredFiles.map((f) => f.path).join(", ")}`,
    );
  }

  return { files: filteredFiles, summary };
}

/**
 * 単一ターゲットの差分をチェック
 */
async function checkSingleTargetDiff(
  targetIndex: number,
  state: ServerState,
): Promise<CachedTargetDiff> {
  const { options, diffResult } = state;
  const target = options.targets?.[targetIndex];

  if (!target) {
    return {
      rsyncDiff: null,
      changedFiles: [],
      summary: { added: 0, modified: 0, deleted: 0, total: 0 },
      error: "Target not found",
    };
  }

  // localDirがない場合はスキップ
  if (!options.localDir) {
    // ファイルモード以外は全ファイルを対象
    const total = diffResult.added + diffResult.modified + diffResult.deleted +
      diffResult.renamed;
    return {
      rsyncDiff: null,
      changedFiles: diffResult.files.map((f) => f.path),
      summary: {
        added: diffResult.added,
        modified: diffResult.modified,
        deleted: diffResult.deleted,
        total,
      },
    };
  }

  try {
    // ターゲット用のUploaderを作成
    const uploader = createUploader(target);
    await uploader.connect();

    try {
      // getDiff()がサポートされているか確認
      if (!hasDiff(uploader)) {
        debugLog(
          `[CheckTarget ${targetIndex}] Uploader does not support getDiff()`,
        );
        const total = diffResult.added + diffResult.modified +
          diffResult.deleted + diffResult.renamed;
        return {
          rsyncDiff: null,
          changedFiles: diffResult.files.map((f) => f.path),
          summary: {
            added: diffResult.added,
            modified: diffResult.modified,
            deleted: diffResult.deleted,
            total,
          },
        };
      }

      // uploadFilesの相対パスリストを取得
      const filePaths = options.uploadFiles
        ? extractFilePaths(options.uploadFiles)
        : [];

      debugLog(
        `[CheckTarget ${targetIndex}] Running rsync getDiff() for ${target.host}...`,
      );

      // rsync dry-runで差分を取得
      const rsyncDiff = await uploader.getDiff(options.localDir, filePaths, {
        checksum: options.checksum,
      });

      debugLog(
        `[CheckTarget ${targetIndex}] Found ${rsyncDiff.entries.length} changed files`,
      );

      // 結果を変換
      const { files, summary } = filterFilesByRsyncDiff(
        diffResult.files,
        rsyncDiff,
      );

      return {
        rsyncDiff,
        changedFiles: files.map((f) => f.path),
        summary: {
          added: summary.added,
          modified: summary.modified,
          deleted: summary.deleted,
          total: summary.total,
        },
      };
    } finally {
      await uploader.disconnect();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    debugError(`[CheckTarget ${targetIndex}] Failed: ${errorMsg}`);
    return {
      rsyncDiff: null,
      changedFiles: [],
      summary: { added: 0, modified: 0, deleted: 0, total: 0 },
      error: errorMsg,
    };
  }
}

/**
 * 全ターゲットの差分を並列チェック
 */
export async function checkAllTargetsDiff(
  socket: WebSocket,
  state: ServerState,
): Promise<void> {
  const { options } = state;
  const targets = options.targets ?? [];

  if (targets.length === 0) {
    state.allTargetsChecked = true;
    return;
  }

  const concurrency = options.concurrency ?? DEFAULT_TARGET_CHECK_CONCURRENCY;
  const results: TargetDiffSummary[] = [];
  const checkingTargets: Set<string> = new Set();

  debugLog(
    `[CheckAllTargets] Starting check for ${targets.length} targets (concurrency: ${concurrency})`,
  );

  // 進捗送信関数
  const sendProgress = () => {
    const message: WsLoadingProgressMessage = {
      type: "loading_progress",
      data: {
        checkingTargets: Array.from(checkingTargets),
        completedCount: results.length,
        totalCount: targets.length,
        results: [...results],
      },
    };
    sendJsonMessage(socket, message);
  };

  // 初期進捗を送信
  sendProgress();

  // 並列でチェック
  await batchAsync(
    targets.map((target, index) => ({ target, index })),
    async ({ target, index }) => {
      const targetName = `${target.host}:${target.dest}`;
      checkingTargets.add(targetName);
      sendProgress();

      const cached = await checkSingleTargetDiff(index, state);

      // キャッシュに保存
      state.diffCacheByTarget.set(index, cached);
      state.changedFilesByTarget.set(index, cached.changedFiles);

      // 結果を追加
      const summary: TargetDiffSummary = {
        targetIndex: index,
        host: target.host,
        dest: target.dest,
        fileCount: cached.summary.total,
        added: cached.summary.added,
        modified: cached.summary.modified,
        deleted: cached.summary.deleted,
        completed: true,
        error: cached.error,
      };
      results.push(summary);

      checkingTargets.delete(targetName);
      sendProgress();

      debugLog(
        `[CheckAllTargets] Target ${index} (${target.host}) completed: ${cached.summary.total} files`,
      );
    },
    concurrency,
  );

  state.allTargetsChecked = true;

  // 差分があるかどうかを判定
  state.hasChangesToUpload = results.some((r) => r.fileCount > 0);
  state.diffCheckCompleted = true;

  debugLog(
    `[CheckAllTargets] All targets checked. hasChanges: ${state.hasChangesToUpload}`,
  );
}

/**
 * 初期データを送信
 */
export async function sendInitMessage(
  socket: WebSocket,
  state: ServerState,
): Promise<void> {
  const { diffResult, options } = state;
  const { lazyLoading } = state;

  // remoteTargets情報を構築
  const remoteTargets = options.targets?.map((t) => ({
    host: t.host,
    dest: t.dest,
  }));

  // remoteモードかつターゲットがある場合は全ターゲット事前チェック
  if (options.targets && options.targets.length > 0 && options.localDir) {
    // 全ターゲットチェックがまだの場合は実行
    if (!state.allTargetsChecked) {
      debugLog("[SendInit] Starting all targets diff check...");
      await checkAllTargetsDiff(socket, state);
    }

    // 現在のターゲットのキャッシュを取得
    const cached = state.diffCacheByTarget.get(state.currentTargetIndex);
    if (cached) {
      debugLog(
        `[SendInit] Using cached diff for target ${state.currentTargetIndex}: ${cached.summary.total} files`,
      );

      // キャッシュから結果を構築
      const files = cached.rsyncDiff
        ? rsyncDiffToFiles(cached.rsyncDiff)
        : diffResult.files.filter((f) => cached.changedFiles.includes(f.path));

      const summary = {
        added: cached.summary.added,
        modified: cached.summary.modified,
        deleted: cached.summary.deleted,
        renamed: 0,
        total: cached.summary.total,
      };

      // uploadButtonStateを決定（全ターゲットで1つでも変更があれば有効）
      const anyChanges = hasAnyTargetChanges(state);
      state.diffCheckCompleted = true;
      state.hasChangesToUpload = anyChanges;

      let uploadButtonState: UploadButtonState;
      if (!anyChanges) {
        uploadButtonState = {
          disabled: true,
          reason: "no_changes",
          message: "No changes to upload on any target",
        };
      } else {
        uploadButtonState = { disabled: false };
      }

      const message: WsInitMessage = {
        type: "init",
        data: {
          base: options.base,
          target: options.target,
          diffMode: options.diffMode,
          files,
          summary,
          remoteTargets,
          lazyLoading: false,
          uploadButtonState,
        },
      };

      socket.send(JSON.stringify(message));
      return;
    }
  }

  // 遅延読み込みモードの場合
  if (lazyLoading) {
    debugLog(
      `[LazyLoading] Enabled for ${diffResult.files.length} files`,
    );

    // ルートレベルのツリー構造を構築
    const tree = buildRootLevelTree(diffResult.files);

    // targetsがある場合のみルートレベルのファイルのステータスをチェック
    if (options.targets && options.targets.length > 0) {
      const concurrency = options.concurrency ?? 10;
      const rootFiles = tree.filter((node) => node.type === "file");

      if (rootFiles.length > 0) {
        debugLog(
          `[LazyLoading] Checking status for ${rootFiles.length} root-level files`,
        );

        await batchAsync(
          rootFiles,
          async (node) => {
            try {
              const { remoteStatus } = await getLocalAndRemoteContents(
                node.path,
                state,
              );
              node.status = remoteStatus.hasChanges
                ? (remoteStatus.exists ? "M" : "A")
                : "U";
            } catch (err) {
              debugLog(
                `[LazyLoading] Status check failed for ${node.path}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
              node.status = "A";
            }
          },
          concurrency,
        );
      }
    }

    // 遅延読み込み時は初期状態でchecking
    let uploadButtonState: UploadButtonState;
    if (state.connectionError) {
      uploadButtonState = {
        disabled: true,
        reason: "connection_error",
        message: state.connectionError,
      };
    } else {
      uploadButtonState = {
        disabled: true,
        reason: "checking",
        message: "Checking for changes...",
      };
    }

    const message: WsInitMessage = {
      type: "init",
      data: {
        base: options.base,
        target: options.target,
        diffMode: options.diffMode,
        files: diffResult.files,
        summary: {
          added: diffResult.added,
          modified: diffResult.modified,
          deleted: diffResult.deleted,
          renamed: diffResult.renamed,
          total: diffResult.files.length,
        },
        remoteTargets,
        tree,
        lazyLoading: true,
        uploadButtonState,
      },
    };

    socket.send(JSON.stringify(message));

    // 接続エラーがあればクライアントに通知
    if (state.connectionError) {
      sendErrorMessage(socket, state.connectionError);
    }

    // バックグラウンドで全ファイルの差分チェックを開始（接続エラーがなければ）
    if (!state.connectionError) {
      startBackgroundDiffCheck(socket, state);
    }
    return;
  }

  // 非遅延読み込みモード（従来の処理）
  let files = diffResult.files;
  let summary = {
    added: diffResult.added,
    modified: diffResult.modified,
    deleted: diffResult.deleted,
    renamed: diffResult.renamed,
    total: diffResult.files.length,
  };

  // targetsがある場合のみremote diffチェックを実行
  if (options.targets && options.targets.length > 0) {
    // 全ファイルのremoteStatusをチェックして差分があるファイルのみを返す
    const concurrency = options.concurrency ?? 10;
    debugLog(
      `[RemoteDiff] Checking remote status for ${files.length} files (concurrency: ${concurrency})...`,
    );

    // 全ファイルのremoteStatusを取得（同時実行数を制限）
    const filesWithStatus = await batchAsync(
      files,
      async (file) => {
        try {
          const { remoteStatus } = await getLocalAndRemoteContents(
            file.path,
            state,
          );
          return { file, remoteStatus };
        } catch (error) {
          debugError(
            `[RemoteDiff] Error checking status for ${file.path}:`,
            error,
          );
          // エラーの場合は差分ありとして扱う
          return { file, remoteStatus: { exists: false, hasChanges: true } };
        }
      },
      concurrency,
    );

    // 差分があるファイルのみをフィルタリング
    const changedFiles = filesWithStatus.filter(
      ({ remoteStatus }) => remoteStatus.hasChanges,
    );

    // サマリーを再計算
    let added = 0;
    let modified = 0;
    changedFiles.forEach(({ remoteStatus }) => {
      if (!remoteStatus.exists) {
        added++;
      } else {
        modified++;
      }
    });

    files = changedFiles.map(({ file, remoteStatus }) => ({
      ...file,
      // remoteStatusに基づいてstatusを更新
      status: remoteStatus.exists ? ("M" as const) : ("A" as const),
    }));

    summary = {
      added,
      modified,
      deleted: 0,
      renamed: 0,
      total: files.length,
    };

    debugLog(
      `[RemoteDiff] Found ${files.length} files with changes (${added} new, ${modified} modified)`,
    );

    // 現在のターゲットの変更ファイルリストを保存
    saveChangedFilesForCurrentTarget(state, files);
  }

  // uploadButtonStateを決定（全ターゲットで1つでも変更があれば有効）
  // 全ターゲットチェック完了時はキャッシュを参照、未完了時は現在のターゲットのみで判定
  const anyChanges = state.allTargetsChecked
    ? hasAnyTargetChanges(state)
    : files.length > 0;
  state.diffCheckCompleted = true;
  state.hasChangesToUpload = anyChanges;

  let uploadButtonState: UploadButtonState;
  if (state.connectionError) {
    uploadButtonState = {
      disabled: true,
      reason: "connection_error",
      message: state.connectionError,
    };
  } else if (!anyChanges) {
    uploadButtonState = {
      disabled: true,
      reason: "no_changes",
      message: "No changes to upload on any target",
    };
  } else {
    uploadButtonState = { disabled: false };
  }

  const message: WsInitMessage = {
    type: "init",
    data: {
      base: options.base,
      target: options.target,
      diffMode: options.diffMode,
      files,
      summary,
      remoteTargets,
      lazyLoading: false,
      uploadButtonState,
    },
  };

  socket.send(JSON.stringify(message));

  // 接続エラーがあればクライアントに通知
  if (state.connectionError) {
    sendErrorMessage(socket, state.connectionError);
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

/**
 * ファイルリクエストを処理
 */
async function handleFileRequest(
  socket: WebSocket,
  path: string,
  requestType: FileRequestType,
  state: ServerState,
): Promise<void> {
  const response: WsFileResponseMessage = {
    type: "file_response",
    path,
    requestType,
  };

  try {
    // ローカルファイルとリモートファイルを取得
    const { local, remote, remoteStatus } = await getLocalAndRemoteContents(
      path,
      state,
    );
    response.local = local;
    response.remote = remote;
    response.remoteStatus = remoteStatus;
  } catch (error) {
    debugError(`Error fetching file contents for ${path}:`, error);
    // エラーでも空の内容を返す
    response.local = response.local ?? { path, content: "", isBinary: false };
    response.remote = response.remote ??
      { path, content: "", isBinary: false };
    response.remoteStatus = { exists: false, hasChanges: true };
  }

  socket.send(JSON.stringify(response));

  // 接続エラーがあればクライアントに通知（catchの外でも確認）
  if (state.connectionError) {
    sendErrorMessage(socket, state.connectionError);
  }
}

/**
 * ディレクトリ展開リクエストを処理
 */
async function handleExpandDirectory(
  socket: WebSocket,
  dirPath: string,
  state: ServerState,
): Promise<void> {
  const { diffResult, options } = state;

  debugLog(`[LazyLoading] Expanding directory: ${dirPath}`);

  // 指定ディレクトリの直下の子ノードを取得
  const children = getDirectChildren(diffResult.files, dirPath);

  // targetsがある場合のみファイルのステータスをチェック
  if (options.targets && options.targets.length > 0) {
    const concurrency = options.concurrency ?? 10;
    const fileNodes = children.filter((node) => node.type === "file");

    if (fileNodes.length > 0) {
      debugLog(
        `[LazyLoading] Checking status for ${fileNodes.length} files in ${dirPath}`,
      );

      await batchAsync(
        fileNodes,
        async (node) => {
          try {
            const { remoteStatus } = await getLocalAndRemoteContents(
              node.path,
              state,
            );
            node.status = remoteStatus.hasChanges
              ? (remoteStatus.exists ? "M" : "A")
              : "U";
          } catch (err) {
            debugLog(
              `[LazyLoading] Status check failed for ${node.path}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            node.status = "A";
          }
        },
        concurrency,
      );
    }
  }

  // レスポンスを送信
  const response: WsDirectoryContentsMessage = {
    type: "directory_contents",
    path: dirPath,
    children,
  };

  socket.send(JSON.stringify(response));

  debugLog(
    `[LazyLoading] Sent ${children.length} children for ${dirPath}`,
  );
}

/**
 * ターゲット切り替えを処理
 */
async function handleSwitchTarget(
  socket: WebSocket,
  targetIndex: number,
  state: ServerState,
): Promise<void> {
  const { targets } = state.options;

  // インデックスが有効かチェック
  if (!targets || targetIndex < 0 || targetIndex >= targets.length) {
    debugLog(
      `[SwitchTarget] Invalid target index: ${targetIndex} (targets: ${
        targets?.length ?? 0
      })`,
    );
    return;
  }

  debugLog(
    `[SwitchTarget] Switching to target ${targetIndex}: ${
      targets[targetIndex].host
    }`,
  );

  // ターゲットインデックスを更新
  state.currentTargetIndex = targetIndex;

  // キャッシュがあればそれを使用（sendInitMessage内で処理）
  if (state.allTargetsChecked && state.diffCacheByTarget.has(targetIndex)) {
    debugLog(`[SwitchTarget] Using cached diff for target ${targetIndex}`);
  } else {
    // キャッシュがない場合は従来の処理（Uploader接続を切断してリセット）
    await disconnectUploader(state);
    state.connectionError = null;
    state.diffCheckCompleted = false;
    state.hasChangesToUpload = false;
  }

  // 新しいターゲットでの差分情報を再送信
  debugLog(`[SwitchTarget] Re-sending init message for new target`);
  await sendInitMessage(socket, state);
}
