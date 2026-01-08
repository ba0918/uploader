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
import { UploadError } from "../types/mod.ts";
import { LocalUploader } from "./local.ts";
import { SftpUploader } from "./sftp.ts";
import { ScpUploader } from "./scp.ts";
import { TransferProgressManager } from "./progress.ts";

// Re-exports
export { LocalUploader } from "./local.ts";
export { SftpUploader } from "./sftp.ts";
export { ScpUploader } from "./scp.ts";
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
        authType: target.auth_type ?? "ssh_key",
        keyFile: target.key_file,
        password: target.password,
        dest: target.dest,
        timeout: (target.timeout ?? 30) * 1000,
        retry: target.retry ?? 3,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
      });

    case "scp":
      return new ScpUploader({
        host: target.host,
        port: target.port ?? 22,
        user: target.user,
        keyFile: target.key_file,
        dest: target.dest,
        timeout: target.timeout ?? 30,
        retry: target.retry ?? 3,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
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
        console.error(`Failed to get content for: ${file.path}`);
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
  const uploader = createUploader(target);

  progressManager.initTarget(target);
  progressManager.startTargetConnection(target.host);

  try {
    // 接続
    await uploader.connect();
    progressManager.startTargetUpload(target.host);

    // ファイルをアップロード
    const filesToUpload = files.filter((f) => f.changeType !== "delete");
    const filesToDelete = files.filter((f) => f.changeType === "delete");

    // 削除同期が有効な場合のみ削除を実行
    if (options.deleteRemote && target.sync_mode === "mirror") {
      for (const file of filesToDelete) {
        try {
          await uploader.delete(file.relativePath);
          progressManager.recordFileResult(target.host, {
            path: file.relativePath,
            status: "completed",
            size: 0,
          });
        } catch (error) {
          progressManager.recordFileResult(target.host, {
            path: file.relativePath,
            status: "failed",
            size: 0,
            error: error instanceof Error ? error.message : String(error),
          });

          if (options.strict) {
            throw error;
          }
        }
      }
    }

    // ファイルをアップロード
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      const startTime = Date.now();

      progressManager.updateFileProgress(
        target.host,
        i,
        filesToUpload.length,
        file.relativePath,
        0,
        file.size,
        "uploading",
      );

      try {
        await uploader.upload(
          file,
          file.relativePath,
          (transferred: number, total: number) => {
            progressManager.updateFileProgress(
              target.host,
              i,
              filesToUpload.length,
              file.relativePath,
              transferred,
              total,
              "uploading",
            );
          },
        );

        progressManager.recordFileResult(target.host, {
          path: file.relativePath,
          status: "completed",
          size: file.size,
          duration: Date.now() - startTime,
        });
      } catch (error) {
        progressManager.recordFileResult(target.host, {
          path: file.relativePath,
          status: "failed",
          size: file.size,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });

        if (options.strict) {
          throw error;
        }
      }
    }

    progressManager.completeTarget(target.host);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    progressManager.failTargetConnection(target.host, errorMsg);
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

  // 順次アップロード（将来的には並列アップロードのオプションを追加）
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

  return progressManager.getResult();
}
