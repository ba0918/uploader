/**
 * SCP転送
 *
 * 外部scpコマンドを使用して転送を行う
 */

import { dirname, join } from "@std/path";
import type { UploadFile } from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";
import { type SshBaseOptions, SshBaseUploader } from "./ssh-base.ts";

/**
 * SCP接続オプション
 */
export type ScpOptions = SshBaseOptions;

/**
 * SCPアップローダー
 *
 * 外部のscpコマンドを使用してファイルを転送する。
 * パスワード認証はsshpass経由でサポート。
 */
export class ScpUploader extends SshBaseUploader {
  constructor(options: ScpOptions) {
    super(options);
  }

  /**
   * ファイルアップロード
   */
  async upload(
    file: UploadFile,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    if (!this.isConnected()) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    // ディレクトリの場合は作成のみ
    if (file.isDirectory) {
      await this.mkdir(remotePath);
      onProgress?.(0, 0);
      return;
    }

    // 親ディレクトリを確保
    const parentDir = dirname(remotePath);
    if (parentDir && parentDir !== ".") {
      await this.mkdir(parentDir);
    }

    const destPath = join(this.options.dest, remotePath);

    if (file.content) {
      // Gitモードの場合: 一時ファイルに書き込んでからアップロード
      await this.uploadBuffer(file.content, destPath, file.size, onProgress);
    } else if (file.sourcePath) {
      // ファイルモードの場合: 直接アップロード
      await this.uploadFile(file.sourcePath, destPath, file.size, onProgress);
    } else {
      throw new UploadError(
        "No source for file upload",
        "TRANSFER_ERROR",
      );
    }
  }

  /**
   * バッファをファイルとしてアップロード
   */
  private async uploadBuffer(
    buffer: Uint8Array,
    destPath: string,
    size: number,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const tempDir = await this.getOrCreateTempDir("uploader_");

    // 一時ファイルに書き込み
    const tempFile = join(tempDir, crypto.randomUUID());
    await Deno.writeFile(tempFile, buffer);

    try {
      await this.uploadFile(tempFile, destPath, size, onProgress);
    } finally {
      // 一時ファイルを削除
      try {
        await Deno.remove(tempFile);
      } catch {
        // 削除失敗は無視
      }
    }
  }

  /**
   * ファイルをアップロード
   */
  private async uploadFile(
    srcPath: string,
    destPath: string,
    size: number,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const args: string[] = [];

    // SCP引数を構築
    if (this.options.keyFile) {
      args.push("-i", this.options.keyFile);
    }

    // パスワード認証時はBatchModeを使わない（sshpassと互換性がない）
    if (!this.options.password) {
      args.push("-o", "BatchMode=yes");
    }

    args.push(
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      `ConnectTimeout=${this.options.timeout ?? 30}`,
      "-P",
      String(this.options.port),
    );

    // レガシーモード: 古いSSHサーバー向けのアルゴリズムを有効化
    if (this.options.legacyMode) {
      args.push(
        "-o",
        "KexAlgorithms=+diffie-hellman-group14-sha1,diffie-hellman-group1-sha1",
        "-o",
        "HostKeyAlgorithms=+ssh-rsa",
        "-o",
        "PubkeyAcceptedAlgorithms=+ssh-rsa",
      );
    }

    if (this.options.preserveTimestamps) {
      args.push("-p");
    }

    args.push(srcPath, `${this.options.user}@${this.options.host}:${destPath}`);

    // 進捗表示のため、開始と終了で通知
    onProgress?.(0, size);

    const { code, stderr } = await this.runWithSshpass("scp", args);

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      if (
        errorMsg.includes("Permission denied") ||
        errorMsg.includes("publickey")
      ) {
        throw new UploadError(
          `Authentication failed: ${this.options.host}`,
          "AUTH_ERROR",
        );
      }
      throw new UploadError(
        `Failed to upload file: ${srcPath}: ${errorMsg}`,
        "TRANSFER_ERROR",
      );
    }

    // 完了を通知
    onProgress?.(size, size);
  }
}
