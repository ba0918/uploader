/**
 * mirrorモード処理モジュール
 *
 * リモートにのみ存在するファイルを削除対象として検出する機能を提供
 */

import type { Uploader, UploadFile } from "../types/mod.ts";
import { hasListRemoteFiles } from "../types/mod.ts";
import { applyIgnoreFilter } from "./filter.ts";
import { logVerbose, logWarning } from "../ui/logger.ts";

/**
 * mirrorモード用の同期準備を行う
 *
 * リモートにのみ存在するファイル（削除対象）を検出し、uploadFiles配列に追加する。
 *
 * @param uploader アップローダー（ListRemoteFilesCapable対応が必要）
 * @param uploadFiles アップロード予定のファイル配列（ローカル→リモート）
 * @param ignorePatterns ignoreパターン配列
 * @returns 削除対象ファイルを追加したUploadFile配列
 *
 * @example
 * ```typescript
 * const uploader = new SftpUploader(config);
 * await uploader.connect();
 *
 * const uploadFiles = [
 *   { relativePath: "src/new.ts", size: 100, isDirectory: false, changeType: "add" }
 * ];
 *
 * // mirrorモード: リモートの old.js が削除対象として追加される
 * const files = await prepareMirrorSync(uploader, uploadFiles, ["*.log"]);
 * // => [...uploadFiles, { relativePath: "src/old.js", changeType: "delete", ... }]
 * ```
 */
export async function prepareMirrorSync(
  uploader: Uploader,
  uploadFiles: UploadFile[],
  ignorePatterns: string[],
): Promise<UploadFile[]> {
  // アップローダーがリモートファイル一覧取得に対応していない場合は何もしない
  if (!hasListRemoteFiles(uploader)) {
    logVerbose(
      "Uploader does not support listRemoteFiles(). Skipping mirror sync preparation.",
    );
    return uploadFiles;
  }

  try {
    logVerbose("Fetching remote file list for mirror sync...");

    // リモートファイル一覧を取得
    const remoteFiles = await uploader.listRemoteFiles();
    logVerbose(`Found ${remoteFiles.length} files on remote`);

    // ignoreパターンを適用（リモートファイルにも適用）
    const remoteUploadFiles: UploadFile[] = remoteFiles.map((path) => ({
      relativePath: path,
      size: 0,
      isDirectory: false,
    }));

    const filteredRemoteFiles = applyIgnoreFilter(
      remoteUploadFiles,
      ignorePatterns,
    );
    logVerbose(
      `${filteredRemoteFiles.length} files after applying ignore patterns`,
    );

    // ローカルファイルのパスをSetに変換（高速検索用）
    const localPaths = new Set(
      uploadFiles
        .filter((f) => f.changeType !== "delete")
        .map((f) => f.relativePath),
    );

    // uploadFiles に既に含まれているパス（削除予定も含む）
    const uploadFilePaths = new Set(uploadFiles.map((f) => f.relativePath));

    // リモートにのみ存在するファイルを削除対象として追加
    const filesToDelete: UploadFile[] = [];
    for (const remoteFile of filteredRemoteFiles) {
      // ローカルに存在せず、かつ既にuploadFilesに含まれていないファイル
      if (
        !localPaths.has(remoteFile.relativePath) &&
        !uploadFilePaths.has(remoteFile.relativePath)
      ) {
        filesToDelete.push({
          relativePath: remoteFile.relativePath,
          size: 0,
          isDirectory: false,
          changeType: "delete",
        });
      }
    }

    if (filesToDelete.length > 0) {
      logVerbose(
        `Found ${filesToDelete.length} files to delete for mirror sync`,
      );
    }

    // 削除対象ファイルを追加して返す
    return [...uploadFiles, ...filesToDelete];
  } catch (error) {
    // リモートファイル一覧取得に失敗した場合は警告を出して続行
    const errorMsg = error instanceof Error ? error.message : String(error);
    logWarning(
      `Failed to fetch remote file list for mirror sync: ${errorMsg}`,
    );
    logWarning(
      "Continuing without mirror sync (remote-only files will not be deleted)",
    );

    return uploadFiles;
  }
}
