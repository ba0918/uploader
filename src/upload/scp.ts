/**
 * SCP転送
 *
 * 外部scpコマンドを使用して転送を行う
 */

import { dirname, join } from "@std/path";
import type { RemoteFileContent, Uploader, UploadFile } from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";

/**
 * SCP接続オプション
 */
export interface ScpOptions {
  /** ホスト名 */
  host: string;
  /** ポート番号 */
  port: number;
  /** ユーザー名 */
  user: string;
  /** 秘密鍵ファイルパス */
  keyFile?: string;
  /** コピー先ディレクトリ */
  dest: string;
  /** タイムアウト（秒） */
  timeout?: number;
  /** リトライ回数 */
  retry?: number;
  /** パーミッションを保持するか */
  preservePermissions?: boolean;
  /** タイムスタンプを保持するか */
  preserveTimestamps?: boolean;
}

/**
 * SCPアップローダー
 *
 * 外部のscpコマンドを使用してファイルを転送する。
 * パスワード認証はサポートしていない（ssh-agentまたは鍵ファイルが必要）。
 */
export class ScpUploader implements Uploader {
  private options: ScpOptions;
  private connected: boolean = false;
  private tempDir: string | null = null;

  constructor(options: ScpOptions) {
    this.options = options;
  }

  /**
   * 接続（SCPなので接続確認のみ）
   */
  async connect(): Promise<void> {
    const maxRetries = this.options.retry ?? 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.testConnection();
        this.connected = true;
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, attempt - 1))
          );
        }
      }
    }

    throw new UploadError(
      `Failed to connect to ${this.options.host} after ${maxRetries} attempts`,
      "CONNECTION_ERROR",
      lastError,
    );
  }

  /**
   * 接続テスト
   */
  private async testConnection(): Promise<void> {
    const args = this.buildSshArgs();
    args.push(`${this.options.user}@${this.options.host}`, "echo", "ok");

    const command = new Deno.Command("ssh", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stderr } = await command.output();

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
        `Connection test failed: ${errorMsg}`,
        "CONNECTION_ERROR",
      );
    }
  }

  /**
   * SSH共通引数を構築
   */
  private buildSshArgs(): string[] {
    const args: string[] = [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      `ConnectTimeout=${this.options.timeout ?? 30}`,
      "-p",
      String(this.options.port),
    ];

    if (this.options.keyFile) {
      args.push("-i", this.options.keyFile);
    }

    return args;
  }

  /**
   * 切断
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    // 一時ディレクトリの削除
    if (this.tempDir) {
      try {
        await Deno.remove(this.tempDir, { recursive: true });
      } catch {
        // 削除失敗は無視
      }
      this.tempDir = null;
    }
  }

  /**
   * リモートディレクトリ作成
   */
  async mkdir(remotePath: string): Promise<void> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = join(this.options.dest, remotePath);
    const args = this.buildSshArgs();
    args.push(
      `${this.options.user}@${this.options.host}`,
      "mkdir",
      "-p",
      fullPath,
    );

    const command = new Deno.Command("ssh", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stderr } = await command.output();

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      throw new UploadError(
        `Failed to create directory: ${fullPath}: ${errorMsg}`,
        "PERMISSION_ERROR",
      );
    }
  }

  /**
   * ファイルアップロード
   */
  async upload(
    file: UploadFile,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    if (!this.connected) {
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
    // 一時ディレクトリを作成
    if (!this.tempDir) {
      this.tempDir = await Deno.makeTempDir({ prefix: "uploader_" });
    }

    // 一時ファイルに書き込み
    const tempFile = join(this.tempDir, crypto.randomUUID());
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

    args.push(
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      `ConnectTimeout=${this.options.timeout ?? 30}`,
      "-P",
      String(this.options.port),
    );

    if (this.options.preserveTimestamps) {
      args.push("-p");
    }

    args.push(srcPath, `${this.options.user}@${this.options.host}:${destPath}`);

    const command = new Deno.Command("scp", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    // 進捗表示のため、開始と終了で通知
    onProgress?.(0, size);

    const { code, stderr } = await command.output();

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

  /**
   * ファイル削除
   */
  async delete(remotePath: string): Promise<void> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = join(this.options.dest, remotePath);
    const args = this.buildSshArgs();
    args.push(
      `${this.options.user}@${this.options.host}`,
      "rm",
      "-rf",
      fullPath,
    );

    const command = new Deno.Command("ssh", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stderr } = await command.output();

    // ファイルが存在しない場合はエラーにしない
    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      if (!errorMsg.includes("No such file")) {
        throw new UploadError(
          `Failed to delete: ${fullPath}: ${errorMsg}`,
          "PERMISSION_ERROR",
        );
      }
    }
  }

  /**
   * リモートファイル読み取り
   */
  async readFile(remotePath: string): Promise<RemoteFileContent | null> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = join(this.options.dest, remotePath);
    const args = this.buildSshArgs();
    args.push(
      `${this.options.user}@${this.options.host}`,
      "cat",
      fullPath,
    );

    const command = new Deno.Command("ssh", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      // ファイルが存在しない場合はnullを返す
      if (errorMsg.includes("No such file") || errorMsg.includes("not found")) {
        return null;
      }
      // ディレクトリの場合もnullを返す
      if (errorMsg.includes("Is a directory")) {
        return null;
      }
      throw new UploadError(
        `Failed to read file: ${fullPath}: ${errorMsg}`,
        "TRANSFER_ERROR",
      );
    }

    return {
      content: stdout,
      size: stdout.length,
    };
  }
}
