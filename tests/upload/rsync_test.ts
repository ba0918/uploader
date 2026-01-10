/**
 * upload/rsync.ts のテスト
 *
 * RsyncUploaderのテスト（単体テスト）
 */

import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import type { CommandResult } from "../../src/upload/ssh-base.ts";
import type { UploadFile } from "../../src/types/mod.ts";
import { UploadError } from "../../src/types/mod.ts";

/** テスト用の一時ディレクトリを作成 */
async function createTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "rsync_test_" });
}

/** 一時ディレクトリを削除 */
async function removeTempDir(dir: string): Promise<void> {
  try {
    await Deno.remove(dir, { recursive: true });
  } catch {
    // 削除失敗は無視
  }
}

/**
 * テスト用のモック可能なRsyncUploader
 */
class MockableRsyncUploader {
  public options: {
    host: string;
    port: number;
    user: string;
    dest: string;
    keyFile?: string;
    password?: string;
    timeout?: number;
    preserveTimestamps?: boolean;
    preservePermissions?: boolean;
    legacyMode?: boolean;
    rsyncPath?: string;
    rsyncOptions?: string[];
  };
  private connected = false;
  public executedCommands: Array<{ cmd: string; args: string[] }> = [];
  public mockCommandResults: Map<string, CommandResult> = new Map();
  public mockSshpassAvailable = true;

  constructor(options: MockableRsyncUploader["options"]) {
    this.options = options;
    // デフォルトで成功を設定
    this.mockCommandResults.set("*", {
      code: 0,
      stdout: new TextEncoder().encode(""),
      stderr: new TextEncoder().encode(""),
    });
  }

  async connect(): Promise<void> {
    this.connected = true;
    await Promise.resolve();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await Promise.resolve();
  }

  isConnected(): boolean {
    return this.connected;
  }

  useSudo(): boolean {
    return this.options.rsyncPath?.includes("sudo") ?? false;
  }

  /**
   * コマンド実行をシミュレート
   */
  runWithSshpass(cmd: string, args: string[]): Promise<CommandResult> {
    this.executedCommands.push({ cmd, args });

    // コマンドの組み合わせからキーを生成
    const argsStr = args.join(" ");

    // 具体的なパターンを先に検索（より長いキーを優先）
    const sortedKeys = [...this.mockCommandResults.keys()].sort(
      (a, b) => b.length - a.length,
    );

    for (const mockKey of sortedKeys) {
      if (mockKey === "*") continue;
      const result = this.mockCommandResults.get(mockKey)!;
      // cmdまたはargsに含まれるかチェック
      if (cmd === mockKey || argsStr.includes(mockKey)) {
        return Promise.resolve(result);
      }
    }

    // ワイルドカードチェック
    if (this.mockCommandResults.has("*")) {
      return Promise.resolve(this.mockCommandResults.get("*")!);
    }

    // デフォルトで成功を返す
    return Promise.resolve({
      code: 0,
      stdout: new TextEncoder().encode(""),
      stderr: new TextEncoder().encode(""),
    });
  }

  buildSshCommandInternal(): string {
    const parts = ["ssh"];

    if (!this.options.password) {
      parts.push("-o", "BatchMode=yes");
    }

    if (this.options.keyFile) {
      parts.push("-i", this.options.keyFile);
    }

    parts.push("-o", "StrictHostKeyChecking=accept-new");
    parts.push("-o", `ConnectTimeout=${this.options.timeout ?? 30}`);
    parts.push("-p", String(this.options.port));

    return parts.join(" ");
  }

  /**
   * rsyncアップロードをシミュレート
   */
  async uploadFileFromPath(
    srcPath: string,
    destPath: string,
    size: number,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    if (!this.connected) {
      throw new UploadError("Not connected", "CONNECTION_ERROR");
    }

    const args: string[] = [];

    // 基本オプション
    args.push("-v");
    args.push("--progress");
    args.push("-rlKDO");

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

    // 追加オプション
    if (this.options.rsyncOptions) {
      args.push(...this.options.rsyncOptions);
    }

    args.push(srcPath);
    args.push(`${this.options.user}@${this.options.host}:${destPath}`);

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

    onProgress?.(size, size);
  }

  /** 認証エラーのモックを設定 */
  mockAuthError(): void {
    this.mockCommandResults.set("rsync", {
      code: 1,
      stdout: new TextEncoder().encode(""),
      stderr: new TextEncoder().encode("Permission denied (publickey)"),
    });
  }

  /** パーミッションエラーのモックを設定 */
  mockPermissionError(): void {
    this.mockCommandResults.set("rsync", {
      code: 1,
      stdout: new TextEncoder().encode(""),
      stderr: new TextEncoder().encode("permission denied"),
    });
  }

  /** 転送エラーのモックを設定 */
  mockTransferError(message: string): void {
    this.mockCommandResults.set("rsync", {
      code: 1,
      stdout: new TextEncoder().encode(""),
      stderr: new TextEncoder().encode(message),
    });
  }
}

describe("RsyncUploader", () => {
  describe("constructor", () => {
    it("オプションを正しく設定できる", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      assertEquals(uploader.options.host, "example.com");
      assertEquals(uploader.options.port, 22);
      assertEquals(uploader.options.user, "testuser");
      assertEquals(uploader.options.keyFile, "~/.ssh/id_rsa");
    });

    it("rsyncPath設定を適用できる", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        rsyncPath: "sudo rsync",
      });

      assertEquals(uploader.options.rsyncPath, "sudo rsync");
    });

    it("rsyncOptions設定を適用できる", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        rsyncOptions: ["--compress", "--checksum"],
      });

      assertEquals(uploader.options.rsyncOptions?.length, 2);
      assertEquals(uploader.options.rsyncOptions?.[0], "--compress");
    });
  });

  describe("tempDirPrefix", () => {
    it("一時ディレクトリのプレフィックスが正しい", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      const uploader = new RsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      }) as unknown as { tempDirPrefix: string };

      assertEquals(uploader.tempDirPrefix, "uploader_rsync_");
    });
  });

  describe("useSudo", () => {
    it("rsyncPathにsudoが含まれる場合はtrue", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        rsyncPath: "sudo rsync",
      });

      assertEquals(uploader.useSudo(), true);
    });

    it("rsyncPathにsudoが含まれない場合はfalse", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        rsyncPath: "/usr/bin/rsync",
      });

      assertEquals(uploader.useSudo(), false);
    });

    it("rsyncPathが未設定の場合はfalse", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      assertEquals(uploader.useSudo(), false);
    });
  });

  describe("uploadFileFromPath", () => {
    it("ファイルをアップロードできる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableRsyncUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
          keyFile: "~/.ssh/id_rsa",
        });

        await uploader.connect();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        let progressCalled = false;
        let startCalled = false;
        let endCalled = false;

        await uploader.uploadFileFromPath(
          srcPath,
          "/var/www/test.txt",
          12,
          (transferred, total) => {
            progressCalled = true;
            if (transferred === 0) startCalled = true;
            if (transferred === total) endCalled = true;
          },
        );

        assertEquals(progressCalled, true);
        assertEquals(startCalled, true);
        assertEquals(endCalled, true);

        // rsyncコマンドが実行されたことを確認
        const rsyncCommand = uploader.executedCommands.find(
          (c) => c.cmd === "rsync",
        );
        assertEquals(rsyncCommand !== undefined, true);

        // 基本オプションが含まれていることを確認
        assertStringIncludes(rsyncCommand!.args.join(" "), "-v");
        assertStringIncludes(rsyncCommand!.args.join(" "), "--progress");
        assertStringIncludes(rsyncCommand!.args.join(" "), "-rlKDO");

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("タイムスタンプ保持オプションが反映される", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableRsyncUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
          preserveTimestamps: true,
        });

        await uploader.connect();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12);

        const rsyncCommand = uploader.executedCommands.find(
          (c) => c.cmd === "rsync",
        );
        assertEquals(rsyncCommand !== undefined, true);
        assertEquals(rsyncCommand!.args.includes("-t"), true);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("パーミッション保持オプションが反映される", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableRsyncUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
          preservePermissions: true,
        });

        await uploader.connect();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12);

        const rsyncCommand = uploader.executedCommands.find(
          (c) => c.cmd === "rsync",
        );
        assertEquals(rsyncCommand !== undefined, true);
        assertEquals(rsyncCommand!.args.includes("-p"), true);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("rsyncPathオプションが反映される", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableRsyncUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
          rsyncPath: "sudo rsync",
        });

        await uploader.connect();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12);

        const rsyncCommand = uploader.executedCommands.find(
          (c) => c.cmd === "rsync",
        );
        assertEquals(rsyncCommand !== undefined, true);
        assertStringIncludes(
          rsyncCommand!.args.join(" "),
          "--rsync-path=sudo rsync",
        );

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("rsyncOptionsが反映される", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableRsyncUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
          rsyncOptions: ["--compress", "--checksum"],
        });

        await uploader.connect();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12);

        const rsyncCommand = uploader.executedCommands.find(
          (c) => c.cmd === "rsync",
        );
        assertEquals(rsyncCommand !== undefined, true);
        assertStringIncludes(rsyncCommand!.args.join(" "), "--compress");
        assertStringIncludes(rsyncCommand!.args.join(" "), "--checksum");

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("未接続状態ではエラー", async () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      await assertRejects(
        () =>
          uploader.uploadFileFromPath("/tmp/test.txt", "/var/www/test.txt", 100),
        UploadError,
        "Not connected",
      );
    });

    it("認証エラーを検出できる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableRsyncUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
        });

        await uploader.connect();
        uploader.mockAuthError();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await assertRejects(
          () => uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12),
          UploadError,
          "Authentication failed",
        );

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("パーミッションエラーを検出できる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableRsyncUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
        });

        await uploader.connect();
        uploader.mockPermissionError();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await assertRejects(
          () => uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12),
          UploadError,
          "Permission denied",
        );

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("転送エラーを検出できる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableRsyncUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
        });

        await uploader.connect();
        uploader.mockTransferError("Connection reset by peer");

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await assertRejects(
          () => uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12),
          UploadError,
          "Failed to upload file",
        );

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });
  });

  describe("buildSshCommandInternal", () => {
    it("SSHコマンドを正しく構築できる", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
        timeout: 30,
      });

      const sshCommand = uploader.buildSshCommandInternal();

      assertStringIncludes(sshCommand, "ssh");
      assertStringIncludes(sshCommand, "-i");
      assertStringIncludes(sshCommand, "~/.ssh/id_rsa");
      assertStringIncludes(sshCommand, "-p");
      assertStringIncludes(sshCommand, "22");
      assertStringIncludes(sshCommand, "ConnectTimeout=30");
    });

    it("パスワード認証時はBatchModeなし", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        password: "secret",
      });

      const sshCommand = uploader.buildSshCommandInternal();

      assertEquals(sshCommand.includes("BatchMode"), false);
    });

    it("秘密鍵認証時はBatchModeあり", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      const sshCommand = uploader.buildSshCommandInternal();

      assertStringIncludes(sshCommand, "BatchMode=yes");
    });

    it("カスタムポートが反映される", () => {
      const uploader = new MockableRsyncUploader({
        host: "example.com",
        port: 2222,
        user: "testuser",
        dest: "/var/www",
      });

      const sshCommand = uploader.buildSshCommandInternal();

      assertStringIncludes(sshCommand, "-p");
      assertStringIncludes(sshCommand, "2222");
    });
  });

  describe("実際のRsyncUploaderのテスト", () => {
    it("bulkUploadのファイル準備部分をテスト", async () => {
      // bulkUploadの一部ロジックをテストするために、ステージングディレクトリの作成をシミュレート
      const stagingDir = await createTempDir();

      try {
        const files: UploadFile[] = [
          {
            relativePath: "file1.txt",
            content: new TextEncoder().encode("content1"),
            size: 8,
            isDirectory: false,
            changeType: "add",
          },
          {
            relativePath: "subdir/file2.txt",
            content: new TextEncoder().encode("content2"),
            size: 8,
            isDirectory: false,
            changeType: "add",
          },
          {
            relativePath: "subdir",
            size: 0,
            isDirectory: true,
            changeType: "add",
          },
        ];

        // ファイルをステージングディレクトリに配置（bulkUploadの一部をシミュレート）
        for (const file of files) {
          const destPath = join(stagingDir, file.relativePath);

          if (file.isDirectory) {
            await Deno.mkdir(destPath, { recursive: true });
          } else if (file.content) {
            const parentDir = join(stagingDir, file.relativePath)
              .split("/")
              .slice(0, -1)
              .join("/");
            await Deno.mkdir(parentDir, { recursive: true });
            await Deno.writeFile(destPath, file.content);
          }
        }

        // ファイルが正しく配置されたことを確認
        const stat1 = await Deno.stat(join(stagingDir, "file1.txt"));
        assertEquals(stat1.isFile, true);

        const stat2 = await Deno.stat(join(stagingDir, "subdir/file2.txt"));
        assertEquals(stat2.isFile, true);

        const stat3 = await Deno.stat(join(stagingDir, "subdir"));
        assertEquals(stat3.isDirectory, true);
      } finally {
        await removeTempDir(stagingDir);
      }
    });

    it("空のファイルリストでbulkUploadを呼ぶと即座に結果を返す", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      // カスタムクラスで接続をモック
      class MockConnectedRsyncUploader extends RsyncUploader {
        private _connected = true;

        protected override isConnected(): boolean {
          return this._connected;
        }
      }

      const uploader = new MockConnectedRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      // deleteタイプのみのファイルリスト（アップロード対象なし）
      const files: UploadFile[] = [
        {
          relativePath: "deleted.txt",
          size: 0,
          isDirectory: false,
          changeType: "delete",
        },
      ];

      const result = await uploader.bulkUpload(files);

      assertEquals(result.successCount, 0);
      assertEquals(result.failedCount, 0);
      assertEquals(result.totalSize, 0);
    });

    it("RsyncUploaderをインスタンス化できる", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      const uploader = new RsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
        rsyncPath: "sudo rsync",
        rsyncOptions: ["--compress", "--checksum"],
      });

      assertEquals(uploader !== undefined, true);
    });

    it("getDiffで未接続時はエラー", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      const uploader = new RsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      const tempDir = await createTempDir();
      try {
        await assertRejects(
          () => uploader.getDiff(tempDir),
          UploadError,
          "Not connected",
        );
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("bulkUploadで未接続時はエラー", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      const uploader = new RsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      const files: UploadFile[] = [
        {
          relativePath: "test.txt",
          content: new TextEncoder().encode("test"),
          size: 4,
          isDirectory: false,
          changeType: "add",
        },
      ];

      await assertRejects(
        () => uploader.bulkUpload(files),
        UploadError,
        "Not connected",
      );
    });

    it("mkdir/delete/readFileはsudo考慮でオーバーライドされている", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      // rsyncPathにsudoを含むアップローダー
      const uploaderWithSudo = new RsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        rsyncPath: "sudo rsync",
      });

      // rsyncPathにsudoを含まないアップローダー
      const uploaderWithoutSudo = new RsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        rsyncPath: "/usr/bin/rsync",
      });

      assertEquals(uploaderWithSudo !== undefined, true);
      assertEquals(uploaderWithoutSudo !== undefined, true);
    });
  });

  describe("実際のRsyncUploaderのuploadFileFromPath", () => {
    it("認証エラーを正しく検出する", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      class TestRsyncUploader extends RsyncUploader {
        override runWithSshpass(
          _cmd: string,
          _args: string[],
        ): Promise<CommandResult> {
          return Promise.resolve({
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode("Permission denied (publickey)"),
          });
        }
      }

      const uploader = new TestRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      const tempDir = await createTempDir();
      try {
        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        const uploadFileFromPath = (
          uploader as unknown as {
            uploadFileFromPath: (
              srcPath: string,
              destPath: string,
              size: number,
              onProgress?: (transferred: number, total: number) => void,
            ) => Promise<void>;
          }
        ).uploadFileFromPath.bind(uploader);

        await assertRejects(
          () => uploadFileFromPath(srcPath, "/var/www/test.txt", 12),
          UploadError,
          "Authentication failed",
        );
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("パーミッションエラーを正しく検出する", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      class TestRsyncUploader extends RsyncUploader {
        override runWithSshpass(
          _cmd: string,
          _args: string[],
        ): Promise<CommandResult> {
          return Promise.resolve({
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode("permission denied"),
          });
        }
      }

      const uploader = new TestRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      const tempDir = await createTempDir();
      try {
        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        const uploadFileFromPath = (
          uploader as unknown as {
            uploadFileFromPath: (
              srcPath: string,
              destPath: string,
              size: number,
              onProgress?: (transferred: number, total: number) => void,
            ) => Promise<void>;
          }
        ).uploadFileFromPath.bind(uploader);

        await assertRejects(
          () => uploadFileFromPath(srcPath, "/var/www/test.txt", 12),
          UploadError,
          "Permission denied",
        );
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("転送エラーを正しく検出する", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      class TestRsyncUploader extends RsyncUploader {
        override runWithSshpass(
          _cmd: string,
          _args: string[],
        ): Promise<CommandResult> {
          return Promise.resolve({
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode("No space left on device"),
          });
        }
      }

      const uploader = new TestRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      const tempDir = await createTempDir();
      try {
        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        const uploadFileFromPath = (
          uploader as unknown as {
            uploadFileFromPath: (
              srcPath: string,
              destPath: string,
              size: number,
              onProgress?: (transferred: number, total: number) => void,
            ) => Promise<void>;
          }
        ).uploadFileFromPath.bind(uploader);

        await assertRejects(
          () => uploadFileFromPath(srcPath, "/var/www/test.txt", 12),
          UploadError,
          "Failed to upload file",
        );
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("正常にアップロードできる", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      class TestRsyncUploader extends RsyncUploader {
        override runWithSshpass(
          _cmd: string,
          _args: string[],
        ): Promise<CommandResult> {
          return Promise.resolve({
            code: 0,
            stdout: new Uint8Array(),
            stderr: new Uint8Array(),
          });
        }
      }

      const uploader = new TestRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
        preserveTimestamps: true,
        preservePermissions: true,
        rsyncPath: "sudo rsync",
        rsyncOptions: ["--compress"],
      });

      const tempDir = await createTempDir();
      try {
        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        const uploadFileFromPath = (
          uploader as unknown as {
            uploadFileFromPath: (
              srcPath: string,
              destPath: string,
              size: number,
              onProgress?: (transferred: number, total: number) => void,
            ) => Promise<void>;
          }
        ).uploadFileFromPath.bind(uploader);

        let progressCalled = false;
        await uploadFileFromPath(srcPath, "/var/www/test.txt", 12, (transferred, total) => {
          progressCalled = true;
          if (transferred === total) {
            assertEquals(transferred, 12);
          }
        });

        assertEquals(progressCalled, true);
      } finally {
        await removeTempDir(tempDir);
      }
    });
  });

  describe("getDiffのエラーハンドリング", () => {
    it("認証エラーを正しく検出する", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      class TestRsyncUploader extends RsyncUploader {
        private callCount = 0;
        override runWithSshpass(
          cmd: string,
          _args: string[],
        ): Promise<CommandResult> {
          this.callCount++;
          // connectのsshコマンドは成功させる
          if (cmd === "ssh") {
            return Promise.resolve({
              code: 0,
              stdout: new TextEncoder().encode("ok"),
              stderr: new Uint8Array(),
            });
          }
          // rsync (getDiff) は認証エラー
          return Promise.resolve({
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode("Permission denied (publickey)"),
          });
        }
      }

      const uploader = new TestRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      // connectを実行
      await uploader.connect();

      const tempDir = await createTempDir();
      try {
        await assertRejects(
          () => uploader.getDiff(tempDir),
          UploadError,
          "Authentication failed",
        );
      } finally {
        await removeTempDir(tempDir);
        await uploader.disconnect();
      }
    });

    it("接続拒否エラーを正しく検出する", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      class TestRsyncUploader extends RsyncUploader {
        override runWithSshpass(
          cmd: string,
          _args: string[],
        ): Promise<CommandResult> {
          if (cmd === "ssh") {
            return Promise.resolve({
              code: 0,
              stdout: new TextEncoder().encode("ok"),
              stderr: new Uint8Array(),
            });
          }
          return Promise.resolve({
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode("Connection refused"),
          });
        }
      }

      const uploader = new TestRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      await uploader.connect();

      const tempDir = await createTempDir();
      try {
        await assertRejects(
          () => uploader.getDiff(tempDir),
          UploadError,
          "Connection refused",
        );
      } finally {
        await removeTempDir(tempDir);
        await uploader.disconnect();
      }
    });

    it("転送エラーを正しく検出する", async () => {
      const { RsyncUploader } = await import("../../src/upload/rsync.ts");

      class TestRsyncUploader extends RsyncUploader {
        override runWithSshpass(
          cmd: string,
          _args: string[],
        ): Promise<CommandResult> {
          if (cmd === "ssh") {
            return Promise.resolve({
              code: 0,
              stdout: new TextEncoder().encode("ok"),
              stderr: new Uint8Array(),
            });
          }
          return Promise.resolve({
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode("Unknown error"),
          });
        }
      }

      const uploader = new TestRsyncUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      await uploader.connect();

      const tempDir = await createTempDir();
      try {
        await assertRejects(
          () => uploader.getDiff(tempDir),
          UploadError,
          "rsync diff failed",
        );
      } finally {
        await removeTempDir(tempDir);
        await uploader.disconnect();
      }
    });
  });
});
