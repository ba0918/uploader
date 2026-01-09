/**
 * SSHベースアップローダーの共通基底クラス
 *
 * SCP/Rsyncで共通するSSH接続処理を抽象化
 */

import { join } from "@std/path";
import type { RemoteFileContent, Uploader, UploadFile } from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";
import { logVerbose } from "../ui/mod.ts";
import { buildSshArgs, escapeShellArg, toError, withRetry } from "../utils/mod.ts";

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
  protected buildSshArgsInternal(): string[] {
    return buildSshArgs({
      password: this.options.password,
      keyFile: this.options.keyFile,
      port: this.options.port,
      timeout: this.options.timeout,
      legacyMode: this.options.legacyMode,
    });
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

    const args = this.buildSshArgsInternal();
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

    try {
      await withRetry(
        async () => {
          await this.testConnection();
          this.connected = true;
        },
        { maxRetries },
      );
    } catch (error) {
      throw new UploadError(
        `Failed to connect to ${this.options.host} after ${maxRetries} attempts`,
        "CONNECTION_ERROR",
        toError(error),
      );
    }
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
    const escapedPath = escapeShellArg(fullPath);
    const mkdirCmd = useSudo
      ? `sudo mkdir -p ${escapedPath}`
      : `mkdir -p ${escapedPath}`;

    const args = this.buildSshArgsInternal();
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
    const escapedPath = escapeShellArg(fullPath);
    const rmCmd = useSudo
      ? `sudo rm -rf ${escapedPath}`
      : `rm -rf ${escapedPath}`;

    const args = this.buildSshArgsInternal();
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
    const escapedPath = escapeShellArg(fullPath);
    const catCmd = useSudo ? `sudo cat ${escapedPath}` : `cat ${escapedPath}`;

    const args = this.buildSshArgsInternal();
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
   * ローカルファイルパスからリモートへアップロード（サブクラスで実装）
   */
  protected abstract uploadFileFromPath(
    srcPath: string,
    destPath: string,
    size: number,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void>;

  /**
   * バッファから一時ファイルを作成してアップロード
   *
   * @param buffer アップロードするデータ
   * @param destPath リモートの宛先パス
   * @param size ファイルサイズ
   * @param tempDirPrefix 一時ディレクトリのプレフィックス
   * @param onProgress 進捗コールバック
   */
  protected async uploadBuffer(
    buffer: Uint8Array,
    destPath: string,
    size: number,
    tempDirPrefix: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const tempDir = await this.getOrCreateTempDir(tempDirPrefix);

    // 一時ファイルに書き込み
    const tempFile = join(tempDir, crypto.randomUUID());
    await Deno.writeFile(tempFile, buffer);

    try {
      await this.uploadFileFromPath(tempFile, destPath, size, onProgress);
    } finally {
      // 一時ファイルを削除
      try {
        await Deno.remove(tempFile);
      } catch (err) {
        logVerbose(
          `Failed to remove temp file ${tempFile}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
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
