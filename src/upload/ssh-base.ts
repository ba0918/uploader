/**
 * SSHベースアップローダーの共通基底クラス
 *
 * SCP/Rsyncで共通するSSH接続処理を抽象化
 */

import { join } from "@std/path";
import type { RemoteFileContent, Uploader, UploadFile } from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";
import { logVerbose } from "../ui/mod.ts";

/**
 * SSHベースアップローダーの共通オプション
 */
export interface SshBaseOptions {
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
  /** 古いSSHサーバー向けのレガシーアルゴリズムを有効化 */
  legacyMode?: boolean;
}

/**
 * コマンド実行結果
 */
export interface CommandResult {
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

/**
 * SSHベースアップローダーの抽象基底クラス
 *
 * SCP/Rsyncで共通するSSH接続処理を提供する。
 * 各サブクラスはupload()メソッドを実装する必要がある。
 */
export abstract class SshBaseUploader implements Uploader {
  protected options: SshBaseOptions;
  protected connected: boolean = false;
  protected tempDir: string | null = null;
  private sshpassAvailable: boolean | null = null;

  constructor(options: SshBaseOptions) {
    this.options = options;
  }

  /**
   * sshpassが利用可能かチェック
   */
  protected async checkSshpass(): Promise<boolean> {
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
    } catch (err) {
      logVerbose(
        `Failed to check sshpass availability: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.sshpassAvailable = false;
      return false;
    }
  }

  /**
   * sshpassでラップしたコマンドを実行
   */
  protected async runWithSshpass(
    cmd: string,
    args: string[],
  ): Promise<CommandResult> {
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
   * SSH共通引数を構築
   */
  protected buildSshArgs(): string[] {
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
        "KexAlgorithms=+diffie-hellman-group-exchange-sha1,diffie-hellman-group14-sha1,diffie-hellman-group1-sha1",
        "-o",
        "HostKeyAlgorithms=+ssh-rsa,ssh-dss",
        "-o",
        "PubkeyAcceptedAlgorithms=+ssh-rsa",
      );
    }

    return args;
  }

  /**
   * 接続テスト
   */
  protected async testConnection(): Promise<void> {
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
   * 接続（リトライ付き）
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
   * 切断
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    // 一時ディレクトリの削除
    if (this.tempDir) {
      try {
        await Deno.remove(this.tempDir, { recursive: true });
      } catch (err) {
        logVerbose(
          `Failed to remove temp directory ${this.tempDir}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      this.tempDir = null;
    }
  }

  /**
   * リモートディレクトリ作成
   * @param remotePath リモートパス（dest相対）
   * @param useSudo sudoを使用するか（rsync用）
   */
  async mkdir(remotePath: string, useSudo = false): Promise<void> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = join(this.options.dest, remotePath);
    const mkdirCmd = useSudo
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
   * ファイル削除
   * @param remotePath リモートパス（dest相対）
   * @param useSudo sudoを使用するか（rsync用）
   */
  async delete(remotePath: string, useSudo = false): Promise<void> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = join(this.options.dest, remotePath);
    const rmCmd = useSudo
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
   * @param remotePath リモートパス（dest相対）
   * @param useSudo sudoを使用するか（rsync用）
   */
  async readFile(
    remotePath: string,
    useSudo = false,
  ): Promise<RemoteFileContent | null> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = join(this.options.dest, remotePath);
    const catCmd = useSudo ? `sudo cat "${fullPath}"` : `cat "${fullPath}"`;

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

  /**
   * 接続状態を取得
   */
  protected isConnected(): boolean {
    return this.connected;
  }

  /**
   * 一時ディレクトリを取得または作成
   */
  protected async getOrCreateTempDir(prefix: string): Promise<string> {
    if (!this.tempDir) {
      this.tempDir = await Deno.makeTempDir({ prefix });
    }
    return this.tempDir;
  }

  /**
   * ファイルアップロード（サブクラスで実装）
   */
  abstract upload(
    file: UploadFile,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void>;
}
