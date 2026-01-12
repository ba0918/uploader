/**
 * アップロード実行
 *
 * 単一/複数ターゲットへのアップロード処理
 */

import type {
  ResolvedTargetConfig,
  TransferProgressCallback,
  UploadFile,
  UploadOptions,
  UploadResult,
} from "../types/mod.ts";
import { hasBulkUpload } from "../types/mod.ts";
import { logVerbose } from "../ui/logger.ts";
import { getTargetId } from "../utils/mod.ts";
import { createUploader } from "./factory.ts";
import { TransferProgressManager } from "./progress.ts";

/**
 * 単一ターゲットへアップロード
 */
export async function uploadToTarget(
  target: ResolvedTargetConfig,
  files: UploadFile[],
  options: UploadOptions,
  progressManager: TransferProgressManager,
): Promise<void> {
  progressManager.initTarget(target);
  await uploadToTargetWithoutInit(target, files, options, progressManager);
}

/**
 * 単一ターゲットへアップロード（初期化済み前提）
 * 並列アップロード時に使用
 */
async function uploadToTargetWithoutInit(
  target: ResolvedTargetConfig,
  files: UploadFile[],
  options: UploadOptions,
  progressManager: TransferProgressManager,
): Promise<void> {
  const uploader = createUploader(target);
  const { host, dest } = target;

  logVerbose(
    `[${host}] Connecting to ${host}:${
      target.port ?? 22
    } via ${target.protocol}...`,
  );
  progressManager.startTargetConnection(host, dest);

  try {
    // 接続
    const connectStart = Date.now();
    await uploader.connect();
    const connectTime = Date.now() - connectStart;
    logVerbose(`[${host}] Connected in ${connectTime}ms`);
    progressManager.startTargetUpload(host, dest);

    // ファイルをアップロード
    const filesToUpload = files.filter((f) => f.changeType !== "delete");
    const filesToDelete = files.filter((f) => f.changeType === "delete");

    // 削除同期が有効な場合のみ削除を実行
    if (options.deleteRemote && target.sync_mode === "mirror") {
      logVerbose(
        `[${host}] Deleting ${filesToDelete.length} file(s) (mirror mode)`,
      );
      for (const file of filesToDelete) {
        try {
          logVerbose(`[${host}] Deleting: ${file.relativePath}`);
          await uploader.delete(file.relativePath);
          progressManager.recordFileResult(host, {
            path: file.relativePath,
            status: "completed",
            size: 0,
          }, dest);
        } catch (error) {
          progressManager.recordFileResult(host, {
            path: file.relativePath,
            status: "failed",
            size: 0,
            error: error instanceof Error ? error.message : String(error),
          }, dest);

          if (options.strict) {
            throw error;
          }
        }
      }
    }

    // bulkUploadが利用可能な場合は一括アップロード
    if (hasBulkUpload(uploader) && filesToUpload.length > 0) {
      logVerbose(
        `[${host}] Using bulk upload for ${filesToUpload.length} file(s)`,
      );
      const startTime = Date.now();

      // 一括アップロードの進捗通知
      progressManager.updateFileProgress(
        host,
        0,
        filesToUpload.length,
        "Bulk upload starting...",
        0,
        0,
        "uploading",
        dest,
      );

      const result = await uploader.bulkUpload(
        filesToUpload,
        (completed, total, currentFile) => {
          progressManager.updateFileProgress(
            host,
            completed,
            total,
            currentFile ?? "Transferring...",
            0,
            0,
            "uploading",
            dest,
          );
        },
      );

      // 結果を記録
      const bulkDuration = Date.now() - startTime;
      logVerbose(
        `[${host}] Bulk upload completed in ${bulkDuration}ms: ${result.successCount} succeeded, ${result.failedCount} failed`,
      );
      if (result.successCount > 0) {
        for (const file of filesToUpload) {
          progressManager.recordFileResult(host, {
            path: file.relativePath,
            status: "completed",
            size: file.size,
            duration: result.duration / filesToUpload.length,
          }, dest);
        }
      } else if (result.failedCount > 0) {
        for (const file of filesToUpload) {
          progressManager.recordFileResult(host, {
            path: file.relativePath,
            status: "failed",
            size: file.size,
            duration: Date.now() - startTime,
            error: "Bulk upload failed",
          }, dest);
        }
        if (options.strict) {
          throw new Error("Bulk upload failed");
        }
      }
    } else {
      // 従来の1ファイルずつアップロード
      logVerbose(
        `[${host}] Uploading ${filesToUpload.length} file(s) one by one`,
      );
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const startTime = Date.now();
        logVerbose(
          `[${host}] Uploading (${
            i + 1
          }/${filesToUpload.length}): ${file.relativePath} (${file.size} bytes)`,
        );

        progressManager.updateFileProgress(
          host,
          i,
          filesToUpload.length,
          file.relativePath,
          0,
          file.size,
          "uploading",
          dest,
        );

        try {
          await uploader.upload(
            file,
            file.relativePath,
            (transferred: number, total: number) => {
              progressManager.updateFileProgress(
                host,
                i,
                filesToUpload.length,
                file.relativePath,
                transferred,
                total,
                "uploading",
                dest,
              );
            },
          );

          progressManager.recordFileResult(host, {
            path: file.relativePath,
            status: "completed",
            size: file.size,
            duration: Date.now() - startTime,
          }, dest);
        } catch (error) {
          progressManager.recordFileResult(host, {
            path: file.relativePath,
            status: "failed",
            size: file.size,
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
          }, dest);

          if (options.strict) {
            throw error;
          }
        }
      }
    }

    progressManager.completeTarget(host, undefined, dest);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    progressManager.failTargetConnection(host, errorMsg, dest);
    throw error;
  } finally {
    await uploader.disconnect();
  }
}

/**
 * 複数ターゲットへアップロード
 */
export async function uploadToTargets(
  targets: ResolvedTargetConfig[],
  files: UploadFile[],
  options: UploadOptions,
  onProgress?: TransferProgressCallback,
): Promise<UploadResult> {
  const progressManager = new TransferProgressManager(onProgress);
  progressManager.start();

  if (options.parallel && targets.length > 1) {
    // 並列アップロード
    // 全ターゲットを先に初期化（インデックス順序を保証）
    for (const target of targets) {
      progressManager.initTarget(target);
    }

    const uploadPromises = targets.map(async (target) => {
      // filesByTargetが設定されている場合、Mapに登録されていないターゲットは空配列
      // 設定されていない場合は従来通りfilesを使用
      const targetId = getTargetId(target);
      const targetFiles = options.filesByTarget
        ? (options.filesByTarget.get(targetId) ?? [])
        : files;
      try {
        await uploadToTargetWithoutInit(
          target,
          targetFiles,
          options,
          progressManager,
        );
        return { target, success: true };
      } catch (error) {
        // エラーは記録済み
        return { target, success: false, error };
      }
    });

    const results = await Promise.all(uploadPromises);

    // strictモードで失敗があれば早期終了
    if (options.strict) {
      const failed = results.find((r) => !r.success);
      if (failed) {
        return progressManager.getResult();
      }
    }
  } else {
    // 順次アップロード
    for (const target of targets) {
      // filesByTargetが設定されている場合、Mapに登録されていないターゲットは空配列
      // 設定されていない場合は従来通りfilesを使用
      const targetId = getTargetId(target);
      const targetFiles = options.filesByTarget
        ? (options.filesByTarget.get(targetId) ?? [])
        : files;
      try {
        await uploadToTarget(target, targetFiles, options, progressManager);
      } catch {
        // エラーは記録済みなので、strictモード以外は続行
        if (options.strict) {
          return progressManager.getResult();
        }
      }
    }
  }

  return progressManager.getResult();
}
