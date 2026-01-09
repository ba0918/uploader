/**
 * SCP転送
 *
 * 外部scpコマンドを使用して転送を行う
 */

import { UploadError } from "../types/mod.ts";
import { buildSshArgs, isSshAuthError } from "../utils/mod.ts";
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
   * 一時ディレクトリのプレフィックス
   */
  protected get tempDirPrefix(): string {
    return "uploader_scp_";
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
    // SCP引数を構築（共通モジュールを使用）
    // SCPはポートオプションが -P（大文字）で、keyFileを先頭に配置
    const args = buildSshArgs(
      {
        password: this.options.password,
        keyFile: this.options.keyFile,
        port: this.options.port,
        timeout: this.options.timeout,
        legacyMode: this.options.legacyMode,
      },
      { portFlag: "-P", keyFileFirst: true },
    );

    if (this.options.preserveTimestamps) {
      args.push("-p");
    }

    args.push(srcPath, `${this.options.user}@${this.options.host}:${destPath}`);

    // 進捗表示のため、開始と終了で通知
    onProgress?.(0, size);

    const { code, stderr } = await this.runWithSshpass("scp", args);

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      if (isSshAuthError(errorMsg)) {
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
