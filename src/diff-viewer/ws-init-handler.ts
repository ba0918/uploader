/**
 * diff-viewer 初期化・メッセージ送信ハンドラ
 *
 * WebSocket 初期化とファイル/ディレクトリリクエスト処理
 */

import type {
  DiffFile,
  FileRequestType,
  UploadButtonState,
  WsDirectoryContentsMessage,
  WsFileResponseMessage,
  WsInitMessage,
} from "../types/mod.ts";
import {
  batchAsync,
  buildRootLevelTree,
  getDirectChildren,
} from "../utils/mod.ts";
import {
  disconnectUploader,
  getLocalAndRemoteContents,
} from "./file-content.ts";
import { rsyncDiffToFiles } from "./remote-diff.ts";
import {
  checkAllTargetsDiff,
  hasAnyTargetChanges,
  startBackgroundDiffCheck,
} from "./ws-target-checker.ts";
import type { ServerState } from "./ws-handler.ts";
import { debugError, debugLog, sendErrorMessage } from "./ws-utils.ts";

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
 * ファイルリクエストを処理
 */
export async function handleFileRequest(
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
export async function handleExpandDirectory(
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
export async function handleSwitchTarget(
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
