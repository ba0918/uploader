/**
 * upload/scp.ts のテスト
 *
 * ScpUploaderのテスト
 */

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import type { CommandResult } from "../../src/upload/ssh-base.ts";
import { UploadError } from "../../src/types/mod.ts";

/** テスト用の一時ディレクトリを作成 */
async function createTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "scp_test_" });
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
 * テスト用のモック可能なScpUploader
 *
 * ScpUploaderはSshBaseUploaderを継承しているため、
 * SshBaseUploaderのメソッドをオーバーライドしてモックを可能にする
 */
class MockableScpUploader {
  public options: {
    host: string;
    port: number;
    user: string;
    dest: string;
    keyFile?: string;
    password?: string;
    timeout?: number;
    preserveTimestamps?: boolean;
    legacyMode?: boolean;
  };
  private connected = false;
  public executedCommands: Array<{ cmd: string; args: string[] }> = [];
  public mockCommandResults: Map<string, CommandResult> = new Map();
  public mockSshpassAvailable = true;

  constructor(options: MockableScpUploader["options"]) {
    this.options = options;
    // デフォルトで成功を設定
    this.mockCommandResults.set("*", {
      code: 0,
      stdout: new TextEncoder().encode("ok"),
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

  /**
   * SCPアップロードをシミュレート
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

    // SCP引数を構築
    const args: string[] = [];

    // ポート指定
    args.push("-P", String(this.options.port));

    // 秘密鍵指定
    if (this.options.keyFile) {
      args.push("-i", this.options.keyFile);
    }

    // タイムスタンプ保持
    if (this.options.preserveTimestamps) {
      args.push("-p");
    }

    args.push(srcPath);
    args.push(`${this.options.user}@${this.options.host}:${destPath}`);

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

    onProgress?.(size, size);
  }

  /** 認証エラーのモックを設定 */
  mockAuthError(): void {
    this.mockCommandResults.set("scp", {
      code: 1,
      stdout: new TextEncoder().encode(""),
      stderr: new TextEncoder().encode("Permission denied (publickey)"),
    });
  }

  /** 転送エラーのモックを設定 */
  mockTransferError(message: string): void {
    this.mockCommandResults.set("scp", {
      code: 1,
      stdout: new TextEncoder().encode(""),
      stderr: new TextEncoder().encode(message),
    });
  }
}

describe("ScpUploader", () => {
  describe("constructor", () => {
    it("オプションを正しく設定できる", () => {
      const uploader = new MockableScpUploader({
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

    it("パスワード認証のオプションを設定できる", () => {
      const uploader = new MockableScpUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        password: "secret",
      });

      assertEquals(uploader.options.password, "secret");
    });
  });

  describe("tempDirPrefix", () => {
    it("一時ディレクトリのプレフィックスが正しい", async () => {
      // ScpUploaderの実際のtempDirPrefixをテスト
      const { ScpUploader } = await import("../../src/upload/scp.ts");

      // プライベートプロパティにアクセスするためにanyにキャスト
      const uploader = new ScpUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      }) as unknown as { tempDirPrefix: string };

      assertEquals(uploader.tempDirPrefix, "uploader_scp_");
    });
  });

  describe("uploadFileFromPath", () => {
    it("ファイルをアップロードできる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableScpUploader({
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

        // SCPコマンドが実行されたことを確認
        const scpCommand = uploader.executedCommands.find(
          (c) => c.cmd === "scp",
        );
        assertEquals(scpCommand !== undefined, true);

        // ポート指定が含まれていることを確認
        assertStringIncludes(scpCommand!.args.join(" "), "-P");
        assertStringIncludes(scpCommand!.args.join(" "), "22");

        // 秘密鍵が含まれていることを確認
        assertStringIncludes(scpCommand!.args.join(" "), "-i");
        assertStringIncludes(scpCommand!.args.join(" "), "~/.ssh/id_rsa");

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("タイムスタンプ保持オプションが反映される", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableScpUploader({
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

        // -pオプションが含まれていることを確認
        const scpCommand = uploader.executedCommands.find(
          (c) => c.cmd === "scp",
        );
        assertEquals(scpCommand !== undefined, true);
        assertStringIncludes(scpCommand!.args.join(" "), " -p ");

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("未接続状態ではエラー", async () => {
      const uploader = new MockableScpUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      // connectを呼ばない

      await assertRejects(
        () => uploader.uploadFileFromPath("/tmp/test.txt", "/var/www/test.txt", 100),
        UploadError,
        "Not connected",
      );
    });

    it("認証エラーを検出できる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableScpUploader({
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

    it("転送エラーを検出できる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableScpUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
        });

        await uploader.connect();
        uploader.mockTransferError("Disk quota exceeded");

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

    it("カスタムポートが反映される", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableScpUploader({
          host: "example.com",
          port: 2222,
          user: "testuser",
          dest: "/var/www",
        });

        await uploader.connect();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12);

        // カスタムポートが含まれていることを確認
        const scpCommand = uploader.executedCommands.find(
          (c) => c.cmd === "scp",
        );
        assertEquals(scpCommand !== undefined, true);
        assertStringIncludes(scpCommand!.args.join(" "), "2222");

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("宛先フォーマットが正しい", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableScpUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
        });

        await uploader.connect();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12);

        // 宛先フォーマットが正しいことを確認
        const scpCommand = uploader.executedCommands.find(
          (c) => c.cmd === "scp",
        );
        assertEquals(scpCommand !== undefined, true);
        assertStringIncludes(
          scpCommand!.args.join(" "),
          "testuser@example.com:/var/www/test.txt",
        );

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });
  });

  describe("SCP引数構築", () => {
    it("SCPはポートオプションが-P（大文字）", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new MockableScpUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
        });

        await uploader.connect();

        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        await uploader.uploadFileFromPath(srcPath, "/var/www/test.txt", 12);

        // -P（大文字）が使われていることを確認
        const scpCommand = uploader.executedCommands.find(
          (c) => c.cmd === "scp",
        );
        assertEquals(scpCommand !== undefined, true);
        assertEquals(scpCommand!.args.includes("-P"), true);
        // -p（小文字）はタイムスタンプ保持用なので含まれていないはず
        assertEquals(
          scpCommand!.args.filter((a) => a === "-p").length,
          0,
        );

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });
  });

  describe("実際のScpUploaderクラスのテスト", () => {
    it("ScpUploaderをインスタンス化できる", async () => {
      const { ScpUploader } = await import("../../src/upload/scp.ts");

      const uploader = new ScpUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      // インスタンスが正しく作成されたことを確認
      assertEquals(uploader !== undefined, true);
    });

    it("legacyModeオプションが設定できる", async () => {
      const { ScpUploader } = await import("../../src/upload/scp.ts");

      const uploader = new ScpUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        legacyMode: true,
      });

      assertEquals(uploader !== undefined, true);
    });

    it("パスワードオプションが設定できる", async () => {
      const { ScpUploader } = await import("../../src/upload/scp.ts");

      const uploader = new ScpUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        password: "secret",
      });

      assertEquals(uploader !== undefined, true);
    });

    it("preserveTimestampsオプションが設定できる", async () => {
      const { ScpUploader } = await import("../../src/upload/scp.ts");

      const uploader = new ScpUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        preserveTimestamps: true,
      });

      assertEquals(uploader !== undefined, true);
    });
  });

  describe("実際のScpUploaderのuploadFileFromPath", () => {
    it("認証エラーを正しく検出する", async () => {
      const { ScpUploader } = await import("../../src/upload/scp.ts");

      // ScpUploaderを拡張してrunWithSshpassをモック
      class TestScpUploader extends ScpUploader {
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

      const uploader = new TestScpUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
      });

      // connectは呼ばない（uploadFileFromPathを直接テスト）

      const tempDir = await createTempDir();
      try {
        const srcPath = join(tempDir, "test.txt");
        await Deno.writeTextFile(srcPath, "test content");

        // プライベートメソッドにアクセス
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

    it("転送エラーを正しく検出する", async () => {
      const { ScpUploader } = await import("../../src/upload/scp.ts");

      class TestScpUploader extends ScpUploader {
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

      const uploader = new TestScpUploader({
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
      const { ScpUploader } = await import("../../src/upload/scp.ts");

      class TestScpUploader extends ScpUploader {
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

      const uploader = new TestScpUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
        preserveTimestamps: true,
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
});
