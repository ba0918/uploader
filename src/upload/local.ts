/**
 * ローカルコピー
 */

import { join, relative } from "@std/path";
import { ensureDir, walk } from "@std/fs";
import type {
  ListRemoteFilesCapable,
  RemoteFileContent,
  Uploader,
  UploadFile,
} from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";
import {
  ensureParentDir,
  ERROR_MESSAGES,
  FILE_TRANSFER,
} from "../utils/mod.ts";

/**
 * ローカルコピーオプション
 */
export interface LocalCopyOptions {
  /** コピー先ディレクトリ */
  dest: string;
  /** パーミッションを保持するか */
  preservePermissions?: boolean;
  /** タイムスタンプを保持するか */
  preserveTimestamps?: boolean;
}

/**
 * ローカルコピーアップローダー
 */
export class LocalUploader implements Uploader, ListRemoteFilesCapable {
  private options: LocalCopyOptions;
  private connected: boolean = false;

  constructor(options: LocalCopyOptions) {
    this.options = options;
  }

  /**
   * 接続（ローカルなので何もしない）
   */
  async connect(): Promise<void> {
    // 出力先ディレクトリの存在確認
    try {
      const stat = await Deno.stat(this.options.dest);
      if (!stat.isDirectory) {
        throw new UploadError(
          `Destination is not a directory: ${this.options.dest}`,
          "PERMISSION_ERROR",
        );
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // ディレクトリを作成
        await ensureDir(this.options.dest);
      } else if (error instanceof UploadError) {
        throw error;
      } else {
        throw new UploadError(
          `Failed to access destination: ${this.options.dest}`,
          "CONNECTION_ERROR",
          error instanceof Error ? error : undefined,
        );
      }
    }
    this.connected = true;
  }

  /**
   * 切断（ローカルなので何もしない）
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    await Promise.resolve();
  }

  /**
   * ディレクトリ作成
   */
  async mkdir(remotePath: string): Promise<void> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = join(this.options.dest, remotePath);
    try {
      await ensureDir(fullPath);
    } catch (error) {
      throw new UploadError(
        `Failed to create directory: ${fullPath}`,
        "PERMISSION_ERROR",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * ファイルアップロード（ローカルコピー）
   */
  async upload(
    file: UploadFile,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const destPath = join(this.options.dest, remotePath);

    // ディレクトリの場合は作成のみ
    if (file.isDirectory) {
      await this.mkdir(remotePath);
      onProgress?.(0, 0);
      return;
    }

    // 親ディレクトリを確保
    await ensureParentDir(remotePath, (path) => this.mkdir(path));

    try {
      if (file.content) {
        // Gitモードの場合: バイト配列から書き込み
        await Deno.writeFile(destPath, file.content);
        onProgress?.(file.size, file.size);
      } else if (file.sourcePath) {
        // ファイルモードの場合: ファイルコピー
        await this.copyFile(file.sourcePath, destPath, file.size, onProgress);
      } else {
        throw new UploadError(
          ERROR_MESSAGES.NO_SOURCE_FOR_FILE_UPLOAD,
          "TRANSFER_ERROR",
        );
      }

      // タイムスタンプの保持
      if (this.options.preserveTimestamps && file.sourcePath) {
        try {
          const stat = await Deno.stat(file.sourcePath);
          if (stat.mtime) {
            await Deno.utime(destPath, stat.atime ?? new Date(), stat.mtime);
          }
        } catch {
          // タイムスタンプの設定失敗は無視
        }
      }
    } catch (error) {
      if (error instanceof UploadError) {
        throw error;
      }
      throw new UploadError(
        `Failed to copy file: ${file.relativePath}`,
        "TRANSFER_ERROR",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * ファイル削除
   */
  async delete(remotePath: string): Promise<void> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = join(this.options.dest, remotePath);
    try {
      await Deno.remove(fullPath, { recursive: true });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // ファイルが存在しない場合は成功扱い
        return;
      }
      throw new UploadError(
        `Failed to delete: ${fullPath}`,
        "PERMISSION_ERROR",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * ファイルをコピー（進捗付き）
   */
  private async copyFile(
    src: string,
    dest: string,
    size: number,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const srcFile = await Deno.open(src, { read: true });
    const destFile = await Deno.open(dest, {
      write: true,
      create: true,
      truncate: true,
    });

    try {
      let transferred = 0;
      const buffer = new Uint8Array(FILE_TRANSFER.CHUNK_SIZE);

      while (true) {
        const bytesRead = await srcFile.read(buffer);
        if (bytesRead === null) break;

        await destFile.write(buffer.subarray(0, bytesRead));
        transferred += bytesRead;
        onProgress?.(transferred, size);
      }
    } finally {
      srcFile.close();
      destFile.close();
    }
  }

  /**
   * リモートファイル読み取り（ローカルなので単純なファイル読み取り）
   */
  async readFile(remotePath: string): Promise<RemoteFileContent | null> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = join(this.options.dest, remotePath);
    try {
      const stat = await Deno.stat(fullPath);
      // ディレクトリの場合はnullを返す
      if (stat.isDirectory) {
        return null;
      }

      const content = await Deno.readFile(fullPath);
      return {
        content,
        size: content.length,
      };
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      throw new UploadError(
        `Failed to read file: ${fullPath}`,
        "TRANSFER_ERROR",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * リモートディレクトリのファイル一覧を再帰的に取得
   * @returns ファイルパス（相対パス）の配列
   */
  async listRemoteFiles(): Promise<string[]> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const files: string[] = [];
    try {
      for await (
        const entry of walk(this.options.dest, { includeDirs: false })
      ) {
        const relativePath = relative(this.options.dest, entry.path);
        // 空文字列は除外（destディレクトリ自体）
        if (relativePath) {
          files.push(relativePath);
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // ディレクトリが存在しない場合は空配列を返す
        return [];
      }
      throw new UploadError(
        `Failed to list remote files: ${this.options.dest}`,
        "TRANSFER_ERROR",
        error instanceof Error ? error : undefined,
      );
    }
    return files;
  }
}
