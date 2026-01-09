/**
 * rsync転送
 *
 * 外部rsyncコマンドを使用して転送を行う
 * sudo対応、差分転送、permission/owner指定が可能
 */

import { dirname, join } from "@std/path";
import type {
  BulkUploadProgressCallback,
  BulkUploadResult,
  RsyncDiffResult,
  UploadFile,
} from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";
import { logVerbose } from "../ui/mod.ts";
import { parseItemizeChanges } from "../utils/mod.ts";
import { type SshBaseOptions, SshBaseUploader } from "./ssh-base.ts";

/**
 * rsync接続オプション
 */
export interface RsyncOptions extends SshBaseOptions {
  /** リモート側で実行するrsyncコマンドパス（例: "sudo rsync"） */
  rsyncPath?: string;
  /** 追加オプション（例: ["--chmod=D755,F644", "--chown=www-data:www-data"]） */
  rsyncOptions?: string[];
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
export class RsyncUploader extends SshBaseUploader {
  protected override options: RsyncOptions;

  constructor(options: RsyncOptions) {
    super(options);
    this.options = options;
  }

  /**
   * sudoを使うか判定
   */
  private useSudo(): boolean {
    return this.options.rsyncPath?.includes("sudo") ?? false;
  }

  /**
   * mkdir（rsync用：sudo考慮）
   */
  override mkdir(remotePath: string): Promise<void> {
    return super.mkdir(remotePath, this.useSudo());
  }

  /**
   * delete（rsync用：sudo考慮）
   */
  override delete(remotePath: string): Promise<void> {
    return super.delete(remotePath, this.useSudo());
  }

  /**
   * readFile（rsync用：sudo考慮）
   */
  override readFile(remotePath: string) {
    return super.readFile(remotePath, this.useSudo());
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
    const tempDir = await this.getOrCreateTempDir("uploader_rsync_");

    // 一時ファイルに書き込み
    const tempFile = join(tempDir, crypto.randomUUID());
    await Deno.writeFile(tempFile, buffer);

    try {
      await this.uploadFile(tempFile, destPath, size, onProgress);
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
   * 一括アップロード（rsync最適化版）
   *
   * 全ファイルを一度のrsyncコマンドで転送する。
   * 数千ファイルでも高速に転送可能。
   */
  async bulkUpload(
    files: UploadFile[],
    onProgress?: BulkUploadProgressCallback,
  ): Promise<BulkUploadResult> {
    if (!this.isConnected()) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const startTime = Date.now();
    const filesToUpload = files.filter((f) => f.changeType !== "delete");

    if (filesToUpload.length === 0) {
      return {
        successCount: 0,
        failedCount: 0,
        totalSize: 0,
        duration: Date.now() - startTime,
      };
    }

    // ステージングディレクトリを作成
    const stagingDir = await Deno.makeTempDir({ prefix: "uploader_bulk_" });

    try {
      // 全ファイルをステージングディレクトリに配置
      let totalSize = 0;
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const destPath = join(stagingDir, file.relativePath);

        // 親ディレクトリを作成
        const parentDir = dirname(destPath);
        await Deno.mkdir(parentDir, { recursive: true });

        if (file.isDirectory) {
          await Deno.mkdir(destPath, { recursive: true });
        } else if (file.content) {
          // Gitモード: contentをファイルに書き込み
          await Deno.writeFile(destPath, file.content);
          totalSize += file.size;
        } else if (file.sourcePath) {
          // ファイルモード: ソースファイルをコピー
          await Deno.copyFile(file.sourcePath, destPath);
          totalSize += file.size;
        }

        // 進捗通知（ステージング準備）
        if (onProgress && i % 100 === 0) {
          onProgress(
            i,
            filesToUpload.length,
            `Preparing: ${file.relativePath}`,
          );
        }
      }

      // 0-based indexとして渡す（main.tsで+1されるため、length-1を渡す）
      onProgress?.(
        Math.max(0, filesToUpload.length - 1),
        filesToUpload.length,
        "Transferring...",
      );

      // rsyncで一括転送
      const result = await this.runBulkRsync(stagingDir, totalSize);

      return {
        successCount: result.success ? filesToUpload.length : 0,
        failedCount: result.success ? 0 : filesToUpload.length,
        totalSize,
        duration: Date.now() - startTime,
      };
    } finally {
      // ステージングディレクトリを削除
      try {
        await Deno.remove(stagingDir, { recursive: true });
      } catch (err) {
        logVerbose(
          `Failed to remove staging directory ${stagingDir}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * ステージングディレクトリからrsync一括転送
   */
  private async runBulkRsync(
    stagingDir: string,
    _totalSize: number,
  ): Promise<{ success: boolean; error?: string }> {
    const args: string[] = [];

    // 基本オプション
    args.push("-r"); // recursive
    args.push("-l"); // symlinks
    args.push("-D"); // devices/specials

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

    // ソース（末尾に/を付けてディレクトリの中身を転送）
    args.push(`${stagingDir}/`);

    // 宛先
    args.push(
      `${this.options.user}@${this.options.host}:${this.options.dest}/`,
    );

    const { code, stdout, stderr } = await this.runWithSshpass("rsync", args);

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      const stdoutMsg = new TextDecoder().decode(stdout);
      if (
        errorMsg.includes("Permission denied") ||
        errorMsg.includes("publickey")
      ) {
        throw new UploadError(
          `Authentication failed: ${this.options.host}`,
          "AUTH_ERROR",
        );
      }
      return { success: false, error: errorMsg || stdoutMsg };
    }

    return { success: true };
  }

  /**
   * rsync dry-runでローカルとリモートの差分を取得
   *
   * @param localDir ローカルディレクトリのパス
   * @param files 比較対象のファイルパス（相対パス）のリスト。省略時はディレクトリ全体を比較
   * @returns 差分結果
   */
  async getDiff(localDir: string, files?: string[]): Promise<RsyncDiffResult> {
    if (!this.isConnected()) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    let filesFromPath: string | null = null;

    try {
      const args: string[] = [];

      // dry-runモード
      args.push("-n");
      args.push("--itemize-changes");
      args.push("-r");

      // filesが指定されている場合は--files-fromを使用
      // 指定されていない場合のみ--deleteを使用（ディレクトリ全体比較時のみ削除検出）
      if (files && files.length > 0) {
        // ディレクトリを除外（rsyncはディレクトリを自動的に作成する）
        const fileList = files.filter((f) => !f.endsWith("/")).join("\n");
        filesFromPath = await Deno.makeTempFile({ prefix: "rsync_files_" });
        await Deno.writeTextFile(filesFromPath, fileList);
        args.push(`--files-from=${filesFromPath}`);
      } else {
        args.push("--delete"); // 削除対象も検出
      }

      // SSH経由で接続
      args.push("-e", this.buildSshCommand());

      // リモート側のrsyncパス（sudo対応）
      if (this.options.rsyncPath) {
        args.push(`--rsync-path=${this.options.rsyncPath}`);
      }

      // ソース（末尾に/を付けてディレクトリの中身を比較）
      const srcDir = localDir.endsWith("/") ? localDir : `${localDir}/`;
      args.push(srcDir);

      // 宛先
      args.push(
        `${this.options.user}@${this.options.host}:${this.options.dest}/`,
      );

      const { code, stdout, stderr } = await this.runWithSshpass("rsync", args);

      if (code !== 0) {
        const errorMsg = new TextDecoder().decode(stderr);
        // 接続/認証エラーの場合は例外をスロー
        if (
          errorMsg.includes("Permission denied") ||
          errorMsg.includes("publickey")
        ) {
          throw new UploadError(
            `Authentication failed: ${this.options.host}`,
            "AUTH_ERROR",
          );
        }
        if (errorMsg.includes("Connection refused")) {
          throw new UploadError(
            `Connection refused: ${this.options.host}`,
            "CONNECTION_ERROR",
          );
        }
        throw new UploadError(
          `rsync diff failed: ${errorMsg}`,
          "TRANSFER_ERROR",
        );
      }

      // 出力をパース
      return parseItemizeChanges(stdout);
    } finally {
      // 一時ファイルを削除
      if (filesFromPath) {
        try {
          await Deno.remove(filesFromPath);
        } catch (err) {
          logVerbose(
            `Failed to remove temp file ${filesFromPath}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }
  }
}
