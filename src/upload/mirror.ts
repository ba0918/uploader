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
 * uploadFilesの共通ベースディレクトリを検出
 *
 * uploadFilesの全てのファイルパスの共通プレフィックスを検出する。
 * 共通プレフィックスがない場合は空文字列を返す。
 *
 * @param uploadFiles アップロードファイル配列
 * @returns ベースディレクトリパス（末尾スラッシュあり）または空文字列
 *
 * @example
 * ```typescript
 * detectBaseDirectory([
 *   { relativePath: "example/a.txt", ... },
 *   { relativePath: "example/dir1/b.txt", ... }
 * ])
 * // => "example/"
 * ```
 */
export function detectBaseDirectory(uploadFiles: UploadFile[]): string {
  if (uploadFiles.length === 0) {
    return "";
  }

  // 削除ファイルは除外
  const paths = uploadFiles
    .filter((f) => f.changeType !== "delete")
    .map((f) => f.relativePath);

  if (paths.length === 0) {
    return "";
  }

  // 最初のパスをベースにする
  const firstPath = paths[0];
  const firstDir = firstPath.includes("/")
    ? firstPath.substring(0, firstPath.indexOf("/") + 1)
    : "";

  // 全てのパスが同じディレクトリから始まるか確認
  if (firstDir && paths.every((p) => p.startsWith(firstDir))) {
    return firstDir;
  }

  return "";
}

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
    if (remoteFiles.length > 0 && remoteFiles.length <= 20) {
      logVerbose(`Remote files: ${remoteFiles.join(", ")}`);
    }

    // uploadFilesの共通プレフィックス（ベースディレクトリ）を検出
    const baseDir = detectBaseDirectory(uploadFiles);
    logVerbose(`Detected base directory: ${baseDir || "(root)"}`);

    // uploadFilesのパスを確認（デバッグ用）
    const uploadPaths = uploadFiles
      .filter((f) => f.changeType !== "delete")
      .map((f) => f.relativePath);
    if (uploadPaths.length > 0 && uploadPaths.length <= 20) {
      logVerbose(`Upload file paths: ${uploadPaths.join(", ")}`);
    }

    // リモートファイルをベースディレクトリでフィルタリング
    const filteredByBase = baseDir
      ? remoteFiles.filter((path) => path.startsWith(baseDir))
      : remoteFiles;
    logVerbose(
      `${filteredByBase.length} files after base directory filtering`,
    );
    if (filteredByBase.length > 0 && filteredByBase.length <= 20) {
      logVerbose(`Filtered remote files: ${filteredByBase.join(", ")}`);
    }

    // ignoreパターンを適用（リモートファイルにも適用）
    const remoteUploadFiles: UploadFile[] = filteredByBase.map((path) => ({
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
