/**
 * アップロードモジュール
 */

import type {
  CollectedFile,
  DiffFile,
  ResolvedTargetConfig,
  TransferProgressCallback,
  Uploader,
  UploadFile,
  UploadOptions,
  UploadResult,
} from "../types/mod.ts";
import { hasBulkUpload, UploadError } from "../types/mod.ts";
import { logVerbose } from "../ui/logger.ts";
import { LocalUploader } from "./local.ts";
import { SftpUploader } from "./sftp.ts";
import { ScpUploader } from "./scp.ts";
import { RsyncUploader } from "./rsync.ts";
import { TransferProgressManager } from "./progress.ts";

// Re-exports
export { LocalUploader } from "./local.ts";
export { SftpUploader } from "./sftp.ts";
export { ScpUploader } from "./scp.ts";
export { RsyncUploader } from "./rsync.ts";
export { calculateSpeed, TransferProgressManager } from "./progress.ts";

/**
 * アップローダーを作成
 */
export function createUploader(target: ResolvedTargetConfig): Uploader {
  switch (target.protocol) {
    case "local":
      return new LocalUploader({
        dest: target.dest,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
      });

    case "sftp":
      return new SftpUploader({
        host: target.host,
        port: target.port ?? 22,
        user: target.user,
        // password指定かつkey_file未指定なら自動的にpassword認証
        authType: target.auth_type ??
          (target.password && !target.key_file ? "password" : "ssh_key"),
        keyFile: target.key_file,
        password: target.password,
        dest: target.dest,
        timeout: (target.timeout ?? 30) * 1000,
        retry: target.retry ?? 3,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
        legacyMode: target.legacy_mode,
      });

    case "scp":
      return new ScpUploader({
        host: target.host,
        port: target.port ?? 22,
        user: target.user,
        keyFile: target.key_file,
        password: target.password,
        dest: target.dest,
        timeout: target.timeout ?? 30,
        retry: target.retry ?? 3,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
        legacyMode: target.legacy_mode,
      });

    case "rsync":
      return new RsyncUploader({
        host: target.host,
        port: target.port ?? 22,
        user: target.user,
        keyFile: target.key_file,
        password: target.password,
        dest: target.dest,
        timeout: target.timeout ?? 30,
        retry: target.retry ?? 3,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
        rsyncPath: target.rsync_path,
        rsyncOptions: target.rsync_options,
        legacyMode: target.legacy_mode,
      });

    default:
      throw new UploadError(
        `Unsupported protocol: ${target.protocol}`,
        "CONNECTION_ERROR",
      );
  }
}

/**
 * Git差分ファイルをUploadFileに変換
 */
export async function diffFilesToUploadFiles(
  files: DiffFile[],
  targetRef: string,
): Promise<UploadFile[]> {
  const uploadFiles: UploadFile[] = [];

  for (const file of files) {
    if (file.status === "D") {
      // 削除されたファイル
      uploadFiles.push({
        relativePath: file.path,
        size: 0,
        isDirectory: false,
        changeType: "delete",
      });
    } else {
      // 追加・変更されたファイル
      try {
        const content = await getGitFileContent(targetRef, file.path);
        uploadFiles.push({
          relativePath: file.path,
          content,
          size: content.length,
          isDirectory: false,
          changeType: file.status === "A" ? "add" : "modify",
        });
      } catch {
        // ファイル内容の取得に失敗した場合はスキップ
        logVerbose(`Failed to get content for: ${file.path}`);
      }
    }
  }

  return uploadFiles;
}

/**
 * Gitからファイル内容を取得
 */
async function getGitFileContent(
  ref: string,
  path: string,
): Promise<Uint8Array> {
  const command = new Deno.Command("git", {
    args: ["show", `${ref}:${path}`],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const errorMsg = new TextDecoder().decode(stderr);
    throw new Error(`Failed to get file content: ${errorMsg}`);
  }

  return stdout;
}

/**
 * 収集されたファイルをUploadFileに変換
 */
export function collectedFilesToUploadFiles(
  files: CollectedFile[],
): UploadFile[] {
  return files.map((file) => ({
    sourcePath: file.sourcePath,
    relativePath: file.relativePath,
    size: file.size,
    isDirectory: file.isDirectory,
    changeType: "add" as const,
  }));
}

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
      try {
        await uploadToTargetWithoutInit(
          target,
          files,
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
      try {
        await uploadToTarget(target, files, options, progressManager);
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
