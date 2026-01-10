/**
 * diff-viewer ターゲット差分チェック
 *
 * 各ターゲットへの差分チェック機能
 */

import type {
  DiffFile,
  RsyncDiffResult,
  TargetDiffSummary,
  UploadButtonState,
  WsLoadingProgressMessage,
} from "../types/mod.ts";
import { hasDiff, hasListRemoteFiles } from "../types/mod.ts";
import { IgnoreMatcher } from "../file/ignore.ts";
import { createUploader } from "../upload/mod.ts";
import { prepareMirrorSync } from "../upload/mirror.ts";
import { batchAsync } from "../utils/mod.ts";
import { getLocalAndRemoteContents } from "./file-content.ts";
import {
  extractFilePaths,
  rsyncDiffToFiles,
  rsyncDiffToSummary,
} from "./remote-diff.ts";
import { DEFAULT_TARGET_CHECK_CONCURRENCY } from "./ws-constants.ts";
import type { CachedTargetDiff, ServerState } from "./ws-handler.ts";
import {
  debugError,
  debugLog,
  sendJsonMessage,
  sendUploadStateMessage,
} from "./ws-utils.ts";

/**
 * rsync getDiff()の結果を使ってファイル一覧をフィルタリング
 */
export function filterFilesByRsyncDiff(
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
      `[filterFilesByRsyncDiff] Filtered paths: ${
        filteredFiles.map((f) => f.path).join(", ")
      }`,
    );
  }

  return { files: filteredFiles, summary };
}

/**
 * 単一ターゲットの差分をチェック
 */
export async function checkSingleTargetDiff(
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

  // mirrorモードかどうかを判定
  const isMirrorMode = target.sync_mode === "mirror";

  try {
    // ターゲット用のUploaderを作成
    const uploader = createUploader(target);
    await uploader.connect();

    try {
      // getDiff()がサポートされているか確認（rsync）
      if (hasDiff(uploader)) {
        // mirrorモード時はfilePathsを空にして--deleteを有効化
        // これによりリモートのみに存在するファイルも検出される
        const filePaths = isMirrorMode
          ? []
          : (options.uploadFiles ? extractFilePaths(options.uploadFiles) : []);

        debugLog(
          `[CheckTarget ${targetIndex}] Running rsync getDiff() for ${target.host}... (mirror: ${isMirrorMode})`,
        );

        // rsync dry-runで差分を取得
        const rsyncDiff = await uploader.getDiff(options.localDir, filePaths, {
          checksum: options.checksum,
        });

        debugLog(
          `[CheckTarget ${targetIndex}] Found ${rsyncDiff.entries.length} changed files`,
        );

        // 結果を変換
        let { files, summary } = filterFilesByRsyncDiff(
          diffResult.files,
          rsyncDiff,
        );

        // mirrorモード時はignoreパターンでフィルタリング（除外対象は削除しない）
        if (isMirrorMode && target.ignore && target.ignore.length > 0) {
          const ignoreMatcher = new IgnoreMatcher(target.ignore);
          const filteredFiles = files.filter(
            (f) => !ignoreMatcher.matches(f.path),
          );

          // サマリーを再計算
          const deleted = filteredFiles.filter((f) => f.status === "D").length;
          const added = filteredFiles.filter((f) => f.status === "A").length;
          const modified = filteredFiles.filter((f) => f.status === "M").length;

          debugLog(
            `[CheckTarget ${targetIndex}] After ignore filter: ${filteredFiles.length} files (was ${files.length})`,
          );

          files = filteredFiles;
          summary = {
            added,
            modified,
            deleted,
            renamed: 0,
            total: filteredFiles.length,
          };
        }

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
      }

      // getDiff()をサポートしていない場合（sftp/scp/local）
      debugLog(
        `[CheckTarget ${targetIndex}] Uploader does not support getDiff()`,
      );

      // mirrorモードかつlistRemoteFiles()をサポートしている場合
      // リモートファイル一覧を取得して削除対象を特定
      if (isMirrorMode && hasListRemoteFiles(uploader)) {
        debugLog(
          `[CheckTarget ${targetIndex}] Mirror mode: using prepareMirrorSync()...`,
        );

        // uploadFilesを使ってmirror同期準備
        const uploadFiles = options.uploadFiles ?? [];
        const ignorePatterns = target.ignore ?? [];

        const syncedFiles = await prepareMirrorSync(
          uploader,
          uploadFiles,
          ignorePatterns,
        );

        // 削除対象ファイルのみ抽出
        const deleteFiles = syncedFiles
          .filter((f) => f.changeType === "delete")
          .map((f) => f.relativePath);

        debugLog(
          `[CheckTarget ${targetIndex}] Found ${deleteFiles.length} files to delete`,
        );

        // diffResultのファイルと削除対象を統合
        const changedFiles = [
          ...diffResult.files.map((f) => f.path),
          ...deleteFiles,
        ];

        const deleted = deleteFiles.length;
        const total = diffResult.added + diffResult.modified + deleted +
          diffResult.renamed;

        return {
          rsyncDiff: null,
          changedFiles,
          summary: {
            added: diffResult.added,
            modified: diffResult.modified,
            deleted,
            total,
          },
          deleteFiles, // 削除対象ファイルリストを追加
        };
      }

      // 非mirrorモードまたはlistRemoteFiles()をサポートしていない場合
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
    let uploadButtonState: UploadButtonState;
    if (state.connectionError) {
      uploadButtonState = {
        disabled: true,
        reason: "connection_error",
        message: state.connectionError,
      };
    } else if (!hasChanges) {
      uploadButtonState = {
        disabled: true,
        reason: "no_changes",
        message: "No changes to upload",
      };
    } else {
      uploadButtonState = { disabled: false };
    }
    sendUploadStateMessage(socket, uploadButtonState);

    debugLog(`[BackgroundCheck] Completed. hasChanges=${hasChanges}`);
  } catch (error) {
    debugError(`[BackgroundCheck] Error:`, error);
    state.diffCheckCompleted = true;
    state.hasChangesToUpload = true; // エラー時は差分ありとして扱う
    sendUploadStateMessage(socket, { disabled: false });
  }
}
