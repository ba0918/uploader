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
import { logVerbose, logWarning } from "../ui/mod.ts";
import {
  buildSshCommand,
  isConnectionRefusedError,
  isSshAuthError,
  parseItemizeChanges,
} from "../utils/mod.ts";
import { type SshBaseOptions, SshBaseUploader } from "./ssh-base.ts";
import { detectBaseDirectory } from "./mirror.ts";

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
  private buildSshCommandInternal(): string {
    return buildSshCommand({
      password: this.options.password,
      keyFile: this.options.keyFile,
      port: this.options.port,
      timeout: this.options.timeout,
      legacyMode: this.options.legacyMode,
    });
  }

  /**
   * 一時ディレクトリのプレフィックス
   */
  protected get tempDirPrefix(): string {
    return "uploader_rsync_";
  }

  /**
   * ファイルをアップロード
   */
  protected async uploadFileFromPath(
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
    args.push("-rlKDO"); // recursive, links, keep-dirlinks, devices/specials, omit-dir-times

    // タイムスタンプ保持
    if (this.options.preserveTimestamps) {
      args.push("-t");
    }

    // パーミッション保持
    if (this.options.preservePermissions) {
      args.push("-p");
    }

    // SSH経由で接続
    args.push("-e", this.buildSshCommandInternal());

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
      if (isSshAuthError(errorMsg)) {
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

    // mirrorモード時のベースディレクトリ調整
    let adjustedDest: string | undefined = undefined;
    const baseDir = detectBaseDirectory(files);
    if (baseDir) {
      const destBase = this.options.dest.endsWith("/")
        ? this.options.dest
        : `${this.options.dest}/`;
      adjustedDest = `${destBase}${baseDir}`;
      logVerbose(
        `[RsyncUploader.bulkUpload] Adjusted dest for mirror mode: ${adjustedDest}`,
      );
    }

    // ステージングディレクトリを作成
    const stagingDir = await Deno.makeTempDir({ prefix: "uploader_bulk_" });

    try {
      // 全ファイルをステージングディレクトリに配置
      let totalSize = 0;
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        // ベースディレクトリがある場合は、relativePathからベースディレクトリを除去
        let stagingPath = file.relativePath;
        if (baseDir && file.relativePath.startsWith(baseDir)) {
          stagingPath = file.relativePath.substring(baseDir.length);
        }
        const destPath = join(stagingDir, stagingPath);

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

          // mirror mode時はタイムスタンプを保持（getDiffとの整合性のため）
          if (baseDir) {
            try {
              const stat = await Deno.stat(file.sourcePath);
              if (stat.mtime) {
                await Deno.utime(destPath, stat.atime || stat.mtime, stat.mtime);
              }
            } catch (err) {
              logVerbose(
                `Failed to preserve timestamp for ${file.sourcePath}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            }
          }
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
      const result = await this.runBulkRsync(stagingDir, totalSize, adjustedDest);

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
    destOverride?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const args: string[] = [];

    // 基本オプション
    args.push("-r"); // recursive
    args.push("-l"); // symlinks
    args.push("-K"); // keep-dirlinks: リモート側のシンボリックリンクディレクトリを保持
    args.push("-D"); // devices/specials
    args.push("-O"); // omit-dir-times: ディレクトリのタイムスタンプを更新しない

    // タイムスタンプ保持
    // mirror mode（destOverrideあり）の場合は常に有効化
    // 理由: getDiffとの整合性を保ち、正確な完全同期を実現するため
    if (destOverride || this.options.preserveTimestamps) {
      args.push("-t");
    }

    // パーミッション保持
    if (this.options.preservePermissions) {
      args.push("-p");
    }

    // SSH経由で接続
    args.push("-e", this.buildSshCommandInternal());

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

    // 宛先（destOverrideがあればそれを使用、なければthis.options.dest）
    const dest = destOverride ?? this.options.dest;
    const destPath = dest.endsWith("/") ? dest : `${dest}/`;
    args.push(
      `${this.options.user}@${this.options.host}:${destPath}`,
    );

    // コマンドをログ出力
    logVerbose(
      `[RsyncUploader.bulkUpload] Command: rsync ${args.join(" ")}`,
    );

    const { code, stdout, stderr } = await this.runWithSshpass("rsync", args);
    const errorMsg = new TextDecoder().decode(stderr);
    const stdoutMsg = new TextDecoder().decode(stdout);

    // 結果をログ出力
    logVerbose(
      `[RsyncUploader.bulkUpload] Exit code: ${code}, stdout lines: ${
        stdoutMsg.split("\n").length
      }, stderr: ${errorMsg.length > 0 ? errorMsg.substring(0, 200) : "(empty)"}`,
    );

    // rsync終了コード:
    // 0: 成功
    // 23: 一部ファイル/属性が転送できなかった（ファイル自体は転送済みの場合が多い）
    // 24: 一部ファイルが転送中に消えた（警告、成功扱い）
    // その他: エラー
    const warningCodes = [23, 24];
    if (code !== 0 && !warningCodes.includes(code)) {
      logVerbose(`[rsync] Exit code: ${code}, stderr: ${errorMsg}`);
      if (isSshAuthError(errorMsg)) {
        throw new UploadError(
          `Authentication failed: ${this.options.host}`,
          "AUTH_ERROR",
        );
      }
      return { success: false, error: errorMsg || stdoutMsg };
    }

    if (code === 23) {
      logWarning(
        `rsync: 一部の属性を設定できませんでした（ファイル転送は成功）`,
      );
      logVerbose(`[rsync] Details: ${errorMsg}`);
    } else if (code === 24) {
      logWarning(`rsync: 転送中に一部ファイルが消えました`);
    }

    return { success: true };
  }

  /**
   * rsync dry-runでローカルとリモートの差分を取得
   *
   * @param localDir ローカルディレクトリのパス
   * @param files 比較対象のファイルパス（相対パス）のリスト。省略時はディレクトリ全体を比較
   * @param options オプション（checksum: trueでハッシュ比較を使用、ignorePatterns: 除外パターン）
   * @returns 差分結果
   */
  async getDiff(
    localDir: string,
    files?: string[],
    options?: { checksum?: boolean; ignorePatterns?: string[]; remoteDir?: string },
  ): Promise<RsyncDiffResult> {
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

      // checksumモード（内容比較）
      if (options?.checksum) {
        args.push("--checksum");
      }

      // ignoreパターンを適用
      if (options?.ignorePatterns && options.ignorePatterns.length > 0) {
        for (const pattern of options.ignorePatterns) {
          // rsyncの--excludeオプションでパターンを除外
          args.push(`--exclude=${pattern}`);
        }
      }

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
      args.push("-e", this.buildSshCommandInternal());

      // リモート側のrsyncパス（sudo対応）
      if (this.options.rsyncPath) {
        args.push(`--rsync-path=${this.options.rsyncPath}`);
      }

      // ソース（末尾に/を付けてディレクトリの中身を比較）
      const srcDir = localDir.endsWith("/") ? localDir : `${localDir}/`;
      args.push(srcDir);

      // 宛先（remoteDirが指定されていればそれを使用）
      const destDir = options?.remoteDir || this.options.dest;
      const destPath = destDir.endsWith("/") ? destDir : `${destDir}/`;
      args.push(
        `${this.options.user}@${this.options.host}:${destPath}`,
      );

      // デバッグ: rsync引数をログ出力
      logVerbose(
        `[RsyncUploader.getDiff] Command: rsync ${args.join(" ")}`,
      );
      logVerbose(
        `[RsyncUploader.getDiff] Target: ${this.options.user}@${this.options.host}:${this.options.dest}/`,
      );
      logVerbose(
        `[RsyncUploader.getDiff] LocalDir: ${srcDir}, Files: ${
          files?.length ?? "all"
        }, IgnorePatterns: ${options?.ignorePatterns?.length ?? 0}`,
      );

      const { code, stdout, stderr } = await this.runWithSshpass("rsync", args);

      // デバッグ: rsync出力をログ
      const stdoutText = new TextDecoder().decode(stdout);
      const stderrText = new TextDecoder().decode(stderr);
      logVerbose(
        `[RsyncUploader.getDiff] Exit code: ${code}, stdout lines: ${
          stdoutText.split("\n").length
        }, stderr: ${
          stderrText.length > 0 ? stderrText.substring(0, 200) : "(empty)"
        }`,
      );

      if (code !== 0) {
        const errorMsg = new TextDecoder().decode(stderr);
        // 接続/認証エラーの場合は例外をスロー
        if (isSshAuthError(errorMsg)) {
          throw new UploadError(
            `Authentication failed: ${this.options.host}`,
            "AUTH_ERROR",
          );
        }
        if (isConnectionRefusedError(errorMsg)) {
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
