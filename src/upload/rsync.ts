/**
 * rsync転送
 *
 * 外部rsyncコマンドを使用して転送を行う
 * sudo対応、差分転送、permission/owner指定が可能
 */

import { dirname, join } from "@std/path";
import type { RemoteFileContent, Uploader, UploadFile } from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";

/**
 * rsync接続オプション
 */
export interface RsyncOptions {
  /** ホスト名 */
  host: string;
  /** ポート番号 */
  port: number;
  /** ユーザー名 */
  user: string;
  /** 秘密鍵ファイルパス */
  keyFile?: string;
  /** パスワード（sshpass経由で使用） */
  password?: string;
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
  /** リモート側で実行するrsyncコマンドパス（例: "sudo rsync"） */
  rsyncPath?: string;
  /** 追加オプション（例: ["--chmod=D755,F644", "--chown=www-data:www-data"]） */
  rsyncOptions?: string[];
  /** 古いSSHサーバー向けのレガシーアルゴリズムを有効化 */
  legacyMode?: boolean;
}

/**
 * rsyncアップローダー
 *
 * 外部のrsyncコマンドを使用してファイルを転送する。
 * パスワード認証はsshpass経由でサポート。
 *
 * 主な特徴:
 * - --rsync-path="sudo rsync" でリモート側でsudo実行可能
 * - --chmod でパーミッション指定可能
 * - --chown でオーナー指定可能（sudo必要）
 * - 差分転送で高速
 */
export class RsyncUploader implements Uploader {
  private options: RsyncOptions;
  private connected: boolean = false;
  private tempDir: string | null = null;
  private sshpassAvailable: boolean | null = null;

  constructor(options: RsyncOptions) {
    this.options = options;
  }

  /**
   * sshpassが利用可能かチェック
   */
  private async checkSshpass(): Promise<boolean> {
    if (this.sshpassAvailable !== null) {
      return this.sshpassAvailable;
    }
    try {
      const command = new Deno.Command("which", {
        args: ["sshpass"],
        stdout: "piped",
        stderr: "piped",
      });
      const { code } = await command.output();
      this.sshpassAvailable = code === 0;
      return this.sshpassAvailable;
    } catch {
      this.sshpassAvailable = false;
      return false;
    }
  }

  /**
   * sshpassでラップしたコマンドを実行
   */
  private async runWithSshpass(
    cmd: string,
    args: string[],
  ): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }> {
    let finalCmd = cmd;
    let finalArgs = args;

    // パスワードが指定されていてsshpassが利用可能な場合
    if (this.options.password && await this.checkSshpass()) {
      finalCmd = "sshpass";
      finalArgs = ["-p", this.options.password, cmd, ...args];
    }

    const command = new Deno.Command(finalCmd, {
      args: finalArgs,
      stdout: "piped",
      stderr: "piped",
    });

    return await command.output();
  }

  /**
   * 接続（rsyncなので接続確認のみ）
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
    // パスワード認証でsshpassが必要な場合、事前にチェック
    if (this.options.password && !this.options.keyFile) {
      const hasSshpass = await this.checkSshpass();
      if (!hasSshpass) {
        throw new UploadError(
          "sshpass is required for password authentication. Install it with: apt install sshpass",
          "AUTH_ERROR",
        );
      }
    }

    const args = this.buildSshArgs();
    args.push(`${this.options.user}@${this.options.host}`, "echo", "ok");

    const { code, stderr } = await this.runWithSshpass("ssh", args);

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
    const args: string[] = [];

    // パスワード認証時はBatchModeを使わない（sshpassと互換性がない）
    if (!this.options.password) {
      args.push("-o", "BatchMode=yes");
    }

    args.push(
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      `ConnectTimeout=${this.options.timeout ?? 30}`,
      "-p",
      String(this.options.port),
    );

    if (this.options.keyFile) {
      args.push("-i", this.options.keyFile);
    }

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

    return args;
  }

  /**
   * rsync用のSSH接続オプションを構築
   */
  private buildSshCommand(): string {
    const parts: string[] = ["ssh"];

    // パスワード認証時はBatchModeを使わない（sshpassと互換性がない）
    if (!this.options.password) {
      parts.push("-o", "BatchMode=yes");
    }

    parts.push("-o", "StrictHostKeyChecking=accept-new");
    parts.push("-o", `ConnectTimeout=${this.options.timeout ?? 30}`);
    parts.push("-p", String(this.options.port));

    if (this.options.keyFile) {
      parts.push("-i", this.options.keyFile);
    }

    // レガシーモード: 古いSSHサーバー向けのアルゴリズムを有効化
    if (this.options.legacyMode) {
      parts.push(
        "-o",
        "KexAlgorithms=+diffie-hellman-group14-sha1,diffie-hellman-group1-sha1",
      );
      parts.push("-o", "HostKeyAlgorithms=+ssh-rsa");
      parts.push("-o", "PubkeyAcceptedAlgorithms=+ssh-rsa");
    }

    return parts.join(" ");
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

    // rsync_pathが指定されている場合はsudoを考慮
    const mkdirCmd = this.options.rsyncPath?.includes("sudo")
      ? `sudo mkdir -p "${fullPath}"`
      : `mkdir -p "${fullPath}"`;

    const args = this.buildSshArgs();
    args.push(`${this.options.user}@${this.options.host}`, mkdirCmd);

    const { code, stderr } = await this.runWithSshpass("ssh", args);

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
      this.tempDir = await Deno.makeTempDir({ prefix: "uploader_rsync_" });
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

    // 基本オプション
    args.push("-v"); // 詳細表示
    args.push("--progress"); // 進捗表示

    // アーカイブモードの代わりに個別指定（-aは使わない）
    args.push("-rlD"); // recursive, links, devices/specials

    // タイムスタンプ保持
    if (this.options.preserveTimestamps) {
      args.push("-t");
    }

    // パーミッション保持
    if (this.options.preservePermissions) {
      args.push("-p");
    }

    // SSH経由で接続
    args.push("-e", this.buildSshCommand());

    // リモート側のrsyncパス（sudo対応）
    if (this.options.rsyncPath) {
      args.push(`--rsync-path=${this.options.rsyncPath}`);
    }

    // 追加オプション（--chmod, --chown等）
    if (this.options.rsyncOptions) {
      args.push(...this.options.rsyncOptions);
    }

    // ソースと宛先
    args.push(srcPath);
    args.push(`${this.options.user}@${this.options.host}:${destPath}`);

    // 進捗表示のため、開始と終了で通知
    onProgress?.(0, size);

    const { code, stderr } = await this.runWithSshpass("rsync", args);

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
      if (
        errorMsg.includes("permission denied") ||
        errorMsg.includes("Permission denied")
      ) {
        throw new UploadError(
          `Permission denied: ${destPath}: ${errorMsg}`,
          "PERMISSION_ERROR",
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

    // rsync_pathが指定されている場合はsudoを考慮
    const rmCmd = this.options.rsyncPath?.includes("sudo")
      ? `sudo rm -rf "${fullPath}"`
      : `rm -rf "${fullPath}"`;

    const args = this.buildSshArgs();
    args.push(`${this.options.user}@${this.options.host}`, rmCmd);

    const { code, stderr } = await this.runWithSshpass("ssh", args);

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

    // rsync_pathが指定されている場合はsudoを考慮
    const catCmd = this.options.rsyncPath?.includes("sudo")
      ? `sudo cat "${fullPath}"`
      : `cat "${fullPath}"`;

    const args = this.buildSshArgs();
    args.push(`${this.options.user}@${this.options.host}`, catCmd);

    const { code, stdout, stderr } = await this.runWithSshpass("ssh", args);

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
