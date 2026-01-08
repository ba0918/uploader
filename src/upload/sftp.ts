/**
 * SFTP転送
 */

import { Client, type SFTPWrapper } from "ssh2";
import { dirname } from "@std/path";
import { join as posixJoin } from "@std/path/posix";
import { Buffer } from "node:buffer";
import type { RemoteFileContent, Uploader, UploadFile } from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";

/**
 * SFTP接続オプション
 */
export interface SftpOptions {
  /** ホスト名 */
  host: string;
  /** ポート番号 */
  port: number;
  /** ユーザー名 */
  user: string;
  /** 認証方式 */
  authType: "ssh_key" | "password";
  /** 秘密鍵ファイルパス */
  keyFile?: string;
  /** パスワード */
  password?: string;
  /** コピー先ディレクトリ */
  dest: string;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** リトライ回数 */
  retry?: number;
  /** パーミッションを保持するか */
  preservePermissions?: boolean;
  /** タイムスタンプを保持するか */
  preserveTimestamps?: boolean;
}

/**
 * SFTPアップローダー
 */
export class SftpUploader implements Uploader {
  private options: SftpOptions;
  private client: Client | null = null;
  private sftp: SFTPWrapper | null = null;
  private createdDirs: Set<string> = new Set();

  constructor(options: SftpOptions) {
    this.options = options;
  }

  /**
   * 接続
   */
  async connect(): Promise<void> {
    const maxRetries = this.options.retry ?? 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.tryConnect();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          // 指数バックオフでリトライ
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
   * 接続を試行
   */
  private tryConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const client = new Client();

      const timeout = setTimeout(() => {
        client.end();
        reject(
          new UploadError(
            `Connection timeout: ${this.options.host}`,
            "TIMEOUT_ERROR",
          ),
        );
      }, this.options.timeout ?? 30000);

      client.on("ready", () => {
        clearTimeout(timeout);
        client.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
          if (err) {
            client.end();
            reject(
              new UploadError(
                `Failed to start SFTP session: ${err.message}`,
                "CONNECTION_ERROR",
                err,
              ),
            );
            return;
          }
          this.client = client;
          this.sftp = sftp;
          this.createdDirs.clear();
          resolve();
        });
      });

      client.on("error", (err: Error) => {
        clearTimeout(timeout);
        if (
          err.message.includes("authentication") ||
          err.message.includes("publickey") ||
          err.message.includes("password")
        ) {
          reject(
            new UploadError(
              `Authentication failed: ${this.options.host}`,
              "AUTH_ERROR",
              err,
            ),
          );
        } else {
          reject(
            new UploadError(
              `Connection failed: ${err.message}`,
              "CONNECTION_ERROR",
              err,
            ),
          );
        }
      });

      // 接続設定
      this.buildConnectConfig().then((config) => {
        client.connect(config);
      }).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * 接続設定を構築
   */
  private async buildConnectConfig(): Promise<Record<string, unknown>> {
    const config: Record<string, unknown> = {
      host: this.options.host,
      port: this.options.port,
      username: this.options.user,
      readyTimeout: this.options.timeout ?? 30000,
      // Denoのcrypto互換性のため、AES-GCMを避けてAES-CTRを使用
      algorithms: {
        cipher: [
          "aes128-ctr",
          "aes192-ctr",
          "aes256-ctr",
        ],
      },
    };

    if (this.options.authType === "ssh_key") {
      if (!this.options.keyFile) {
        throw new UploadError(
          "SSH key file not specified",
          "AUTH_ERROR",
        );
      }
      try {
        const keyContent = await Deno.readTextFile(this.options.keyFile);
        config.privateKey = keyContent;
      } catch (error) {
        throw new UploadError(
          `Failed to read SSH key file: ${this.options.keyFile}`,
          "AUTH_ERROR",
          error instanceof Error ? error : undefined,
        );
      }
    } else {
      config.password = this.options.password;
    }

    return config;
  }

  /**
   * 切断
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.sftp = null;
    }
    await Promise.resolve();
  }

  /**
   * ディレクトリ作成
   */
  async mkdir(remotePath: string): Promise<void> {
    if (!this.sftp) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const fullPath = posixJoin(this.options.dest, remotePath);

    // 既に作成済みならスキップ
    if (this.createdDirs.has(fullPath)) {
      return;
    }

    // destディレクトリは既存として扱う（接続時にチェック済みのはず）
    const destParts = this.options.dest.split("/").filter((p: string) => p);
    const destPath = "/" + destParts.join("/");
    this.createdDirs.add(destPath);

    // fullPathからdest以降の部分のみ作成
    const fullParts = fullPath.split("/").filter((p: string) => p);

    // destの部分は既存なのでスキップし、その後のパスのみ作成
    let currentPath = destPath;

    for (let i = destParts.length; i < fullParts.length; i++) {
      currentPath = `${currentPath}/${fullParts[i]}`;

      if (this.createdDirs.has(currentPath)) {
        continue;
      }

      await this.mkdirSingle(currentPath);
      this.createdDirs.add(currentPath);
    }
  }

  /**
   * 単一ディレクトリ作成
   */
  private mkdirSingle(path: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.sftp) {
        reject(new UploadError("Not connected", "CONNECTION_ERROR"));
        return;
      }

      this.sftp.mkdir(path, (err: Error & { code?: number } | undefined) => {
        if (err) {
          // SSH_FX_FAILURE (4): 一般的な失敗（ディレクトリ既存を含む）
          // SSH_FX_PERMISSION_DENIED (3): 権限エラー
          // SSH_FX_NO_SUCH_FILE (2): 親ディレクトリが存在しない
          // ディレクトリが既に存在する場合はエラーを無視
          if (err.code === 4 || err.message.includes("already exists")) {
            resolve();
            return;
          }
          // ファイルが存在する（ディレクトリとして存在する可能性）
          if (err.code === 3) {
            resolve();
            return;
          }
          reject(
            new UploadError(
              `Failed to create directory: ${path}`,
              "PERMISSION_ERROR",
              err,
            ),
          );
          return;
        }
        resolve();
      });
    });
  }

  /**
   * ファイルアップロード
   */
  async upload(
    file: UploadFile,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    if (!this.sftp) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const destPath = posixJoin(this.options.dest, remotePath);

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

    if (file.content) {
      // Gitモードの場合: バイト配列から書き込み
      await this.writeBuffer(destPath, file.content, onProgress);
    } else if (file.sourcePath) {
      // ファイルモードの場合: ファイルアップロード
      await this.uploadFile(file.sourcePath, destPath, file.size, onProgress);
    } else {
      throw new UploadError(
        "No source for file upload",
        "TRANSFER_ERROR",
      );
    }
  }

  /**
   * バッファをファイルに書き込み
   */
  private writeBuffer(
    destPath: string,
    data: Uint8Array,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.sftp) {
        reject(new UploadError("Not connected", "CONNECTION_ERROR"));
        return;
      }

      const writeStream = this.sftp.createWriteStream(destPath);

      writeStream.on("error", (err: Error) => {
        reject(
          new UploadError(
            `Failed to write file: ${destPath}`,
            "TRANSFER_ERROR",
            err,
          ),
        );
      });

      writeStream.on("close", () => {
        onProgress?.(data.length, data.length);
        resolve();
      });

      writeStream.end(Buffer.from(data));
    });
  }

  /**
   * ファイルをアップロード
   */
  private uploadFile(
    srcPath: string,
    destPath: string,
    size: number,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.sftp) {
        reject(new UploadError("Not connected", "CONNECTION_ERROR"));
        return;
      }

      const CHUNK_SIZE = 64 * 1024;
      const writeStream = this.sftp.createWriteStream(destPath);

      let transferred = 0;

      writeStream.on("error", (err: Error) => {
        reject(
          new UploadError(
            `Failed to upload file: ${destPath}`,
            "TRANSFER_ERROR",
            err,
          ),
        );
      });

      writeStream.on("close", () => {
        resolve();
      });

      // ソースファイルを読み込んでストリームに書き込む
      (async () => {
        try {
          const srcFile = await Deno.open(srcPath, { read: true });
          const readBuffer = new Uint8Array(CHUNK_SIZE);

          try {
            while (true) {
              const bytesRead = await srcFile.read(readBuffer);
              if (bytesRead === null) break;

              const chunk = readBuffer.subarray(0, bytesRead);
              const canContinue = writeStream.write(Buffer.from(chunk));

              transferred += bytesRead;
              onProgress?.(transferred, size);

              if (!canContinue) {
                await new Promise<void>((res) =>
                  writeStream.once("drain", res)
                );
              }
            }
          } finally {
            srcFile.close();
          }

          writeStream.end();
        } catch (err) {
          writeStream.destroy();
          reject(
            new UploadError(
              `Failed to read source file: ${srcPath}`,
              "TRANSFER_ERROR",
              err instanceof Error ? err : undefined,
            ),
          );
        }
      })();
    });
  }

  /**
   * ファイル削除
   */
  delete(remotePath: string): Promise<void> {
    if (!this.sftp) {
      return Promise.reject(
        new UploadError("Not connected", "CONNECTION_ERROR"),
      );
    }

    const fullPath = posixJoin(this.options.dest, remotePath);

    return new Promise<void>((resolve, reject) => {
      if (!this.sftp) {
        reject(new UploadError("Not connected", "CONNECTION_ERROR"));
        return;
      }

      // まずファイルとして削除を試みる
      this.sftp.unlink(
        fullPath,
        (err: Error & { code?: number } | undefined) => {
          if (!err) {
            resolve();
            return;
          }

          // ディレクトリとして削除を試みる
          this.sftp!.rmdir(fullPath, (rmdirErr: Error | undefined) => {
            if (!rmdirErr) {
              resolve();
              return;
            }

            // 存在しない場合は成功扱い
            if (err.code === 2) {
              resolve();
              return;
            }

            reject(
              new UploadError(
                `Failed to delete: ${fullPath}`,
                "PERMISSION_ERROR",
                err,
              ),
            );
          });
        },
      );
    });
  }

  /**
   * リモートファイル読み取り
   */
  readFile(remotePath: string): Promise<RemoteFileContent | null> {
    if (!this.sftp) {
      return Promise.reject(
        new UploadError("Not connected", "CONNECTION_ERROR"),
      );
    }

    const fullPath = posixJoin(this.options.dest, remotePath);

    return new Promise<RemoteFileContent | null>((resolve, reject) => {
      if (!this.sftp) {
        reject(new UploadError("Not connected", "CONNECTION_ERROR"));
        return;
      }

      // ファイルの存在確認とサイズ取得
      this.sftp.stat(
        fullPath,
        (
          statErr: Error & { code?: number } | undefined,
          stats: { mode: number; size: number },
        ) => {
          if (statErr) {
            // ファイルが存在しない場合はnullを返す
            if (statErr.code === 2) {
              resolve(null);
              return;
            }
            reject(
              new UploadError(
                `Failed to stat file: ${fullPath}`,
                "TRANSFER_ERROR",
                statErr,
              ),
            );
            return;
          }

          // ディレクトリの場合はnullを返す
          if ((stats.mode & 0o170000) === 0o040000) {
            resolve(null);
            return;
          }

          const size = stats.size;
          const chunks: Buffer[] = [];

          const readStream = this.sftp!.createReadStream(fullPath);

          readStream.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });

          readStream.on("error", (err: Error & { code?: number }) => {
            // ファイルが存在しない場合はnullを返す
            if (err.code === 2) {
              resolve(null);
              return;
            }
            reject(
              new UploadError(
                `Failed to read file: ${fullPath}`,
                "TRANSFER_ERROR",
                err,
              ),
            );
          });

          readStream.on("end", () => {
            const content = new Uint8Array(Buffer.concat(chunks));
            resolve({ content, size });
          });
        },
      );
    });
  }
}
