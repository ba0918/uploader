/**
 * ファイル変換ユーティリティ
 *
 * DiffFile, CollectedFile を UploadFile に変換
 */

import type {
  CollectedFile,
  DiffFile,
  UploadFile,
} from "../types/mod.ts";
import { logVerbose } from "../ui/logger.ts";

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
      } catch (error) {
        // ファイル内容の取得に失敗した場合はスキップ
        const errorMsg = error instanceof Error ? error.message : String(error);
        logVerbose(`Failed to get content for ${file.path}: ${errorMsg}`);
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
