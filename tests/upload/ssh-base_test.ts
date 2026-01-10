/**
 * upload/ssh-base.ts のテスト
 *
 * SshBaseUploaderは抽象クラスなので、テスト用の具象クラスを作成してテストする
 */

import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import {
  type CommandResult,
  SshBaseUploader,
  type SshBaseOptions,
} from "../../src/upload/ssh-base.ts";
import { UploadError } from "../../src/types/mod.ts";
import type { UploadFile } from "../../src/types/mod.ts";

/** テスト用の一時ディレクトリを作成 */
async function createTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "ssh_base_test_" });
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
 * テスト用のSshBaseUploader具象クラス
 * runWithSshpassをオーバーライドしてモックを可能にする
 */
class TestSshUploader extends SshBaseUploader {
  /** モックされたコマンド結果 */
  public mockCommandResults: Map<string, CommandResult> = new Map();
  /** 実行されたコマンドのログ */
  public executedCommands: Array<{ cmd: string; args: string[] }> = [];
  /** sshpassが利用可能かどうかのモック */
  public mockSshpassAvailable = true;
  /** uploadFileFromPathが呼ばれた回数 */
  public uploadFileFromPathCalls: Array<{
    srcPath: string;
    destPath: string;
    size: number;
  }> = [];

  constructor(options: SshBaseOptions) {
    super(options);
  }

  protected get tempDirPrefix(): string {
    return "test_ssh_";
  }

  /**
   * sshpassチェックをモック
   */
  protected override async checkSshpass(): Promise<boolean> {
    await Promise.resolve(); // 非同期処理をシミュレート
    return this.mockSshpassAvailable;
  }

  /**
   * コマンド実行をモック
   */
  protected override runWithSshpass(
    cmd: string,
    args: string[],
  ): Promise<CommandResult> {
    this.executedCommands.push({ cmd, args });

    // コマンドの組み合わせからキーを生成
    const argsStr = args.join(" ");
    const fullStr = `${cmd} ${argsStr}`;

    // 具体的なパターンを先に検索（より長いキーを優先）
    const sortedKeys = [...this.mockCommandResults.keys()].sort(
      (a, b) => b.length - a.length,
    );

    for (const mockKey of sortedKeys) {
      if (mockKey === "*") continue;
      const result = this.mockCommandResults.get(mockKey)!;
      // cmdまたはargsに含まれるかチェック
      if (fullStr.includes(mockKey)) {
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
   * ファイルアップロードをモック
   */
  protected override async uploadFileFromPath(
    srcPath: string,
    destPath: string,
    size: number,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    this.uploadFileFromPathCalls.push({ srcPath, destPath, size });
    onProgress?.(size, size);
    await Promise.resolve();
  }

  /** 成功する接続テストのモックを設定 */
  public mockSuccessfulConnection(): void {
    // testConnectionでは "echo ok" を実行するので、そのパターンでマッチ
    this.mockCommandResults.set("echo ok", {
      code: 0,
      stdout: new TextEncoder().encode("ok"),
      stderr: new TextEncoder().encode(""),
    });
  }

  /** 失敗する接続テストのモックを設定 */
  public mockFailedConnection(errorMsg: string): void {
    // testConnectionでは "echo ok" を実行するので、そのパターンでマッチ
    this.mockCommandResults.set("echo ok", {
      code: 1,
      stdout: new TextEncoder().encode(""),
      stderr: new TextEncoder().encode(errorMsg),
    });
  }

  /** 認証エラーのモックを設定 */
  public mockAuthError(): void {
    // testConnectionでは "echo ok" を実行するので、そのパターンでマッチ
    this.mockCommandResults.set("echo ok", {
      code: 1,
      stdout: new TextEncoder().encode(""),
      stderr: new TextEncoder().encode("Permission denied (publickey)"),
    });
  }

  /** 接続状態を取得（テスト用公開メソッド） */
  public getConnected(): boolean {
    return this.isConnected();
  }

  /** 一時ディレクトリを取得（テスト用公開メソッド） */
  public getTempDir(): string | null {
    return this.tempDir;
  }
}

describe("SshBaseUploader", () => {
  describe("constructor", () => {
    it("オプションを正しく設定できる", () => {
      const options: SshBaseOptions = {
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
        timeout: 30,
        retry: 3,
      };

      const uploader = new TestSshUploader(options);

      assertEquals(uploader.getConnected(), false);
    });
  });

  describe("connect", () => {
    it("正常に接続できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();

      await uploader.connect();

      assertEquals(uploader.getConnected(), true);
    });

    it("リトライ回数内で接続できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        retry: 3,
      });

      let callCount = 0;
      uploader.mockCommandResults.set("ssh", {
        code: 0,
        stdout: new TextEncoder().encode("ok"),
        stderr: new TextEncoder().encode(""),
      });

      // 最初の2回は失敗、3回目で成功するようにオーバーライド
      const originalRunWithSshpass = uploader["runWithSshpass"].bind(uploader);
      uploader["runWithSshpass"] = (cmd: string, args: string[]): Promise<CommandResult> => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            code: 1,
            stdout: new TextEncoder().encode(""),
            stderr: new TextEncoder().encode("Connection refused"),
          });
        }
        return originalRunWithSshpass(cmd, args);
      };

      await uploader.connect();

      assertEquals(uploader.getConnected(), true);
      assertEquals(callCount, 3);
    });

    it("リトライ回数を超えるとエラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        retry: 2,
      });

      uploader.mockFailedConnection("Connection refused");

      await assertRejects(
        () => uploader.connect(),
        UploadError,
        "Failed to connect",
      );
    });

    it("認証エラーを検出できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        retry: 1,
      });

      uploader.mockAuthError();

      await assertRejects(
        () => uploader.connect(),
        UploadError,
      );
    });

    it("パスワード認証でsshpassがない場合エラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        password: "secret",
        retry: 1,
      });

      uploader.mockSshpassAvailable = false;

      // connect()はwithRetryでラップされているため、エラーは"Failed to connect"になる
      // 元のエラーはoriginalErrorに保持されている
      try {
        await uploader.connect();
        throw new Error("Should have thrown");
      } catch (error) {
        assertEquals(error instanceof UploadError, true);
        const uploadError = error as UploadError;
        assertEquals(uploadError.code, "CONNECTION_ERROR");
        // originalErrorにsshpassのエラーが含まれていることを確認
        assertEquals(
          uploadError.originalError?.message.includes("sshpass is required"),
          true,
        );
      }
    });
  });

  describe("disconnect", () => {
    it("正常に切断できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      assertEquals(uploader.getConnected(), true);

      await uploader.disconnect();

      assertEquals(uploader.getConnected(), false);
    });

    it("一時ディレクトリが削除される", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      // 一時ディレクトリを作成（uploadメソッド経由）
      const content = new TextEncoder().encode("test");
      const file: UploadFile = {
        relativePath: "test.txt",
        content,
        size: content.length,
        isDirectory: false,
        changeType: "add",
      };
      await uploader.upload(file, "test.txt");

      await uploader.disconnect();

      assertEquals(uploader.getTempDir(), null);
    });
  });

  describe("mkdir", () => {
    it("ディレクトリを作成できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      await uploader.mkdir("subdir");

      // SSHコマンドが実行されたことを確認
      const mkdirCommand = uploader.executedCommands.find(
        (c) => c.args.some((a) => a.includes("mkdir")),
      );
      assertEquals(mkdirCommand !== undefined, true);
    });

    it("未接続状態ではエラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      await assertRejects(
        () => uploader.mkdir("subdir"),
        UploadError,
        "Not connected",
      );
    });

    it("ディレクトリ作成失敗時はエラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      // mkdirコマンドが失敗するように設定
      uploader.mockCommandResults.set("mkdir", {
        code: 1,
        stdout: new TextEncoder().encode(""),
        stderr: new TextEncoder().encode("Permission denied"),
      });

      await assertRejects(
        () => uploader.mkdir("protected"),
        UploadError,
        "Failed to create directory",
      );
    });

    it("sudo付きでディレクトリを作成できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      await uploader.mkdir("subdir", true);

      // sudoが使われていることを確認
      const mkdirCommand = uploader.executedCommands.find(
        (c) => c.args.some((a) => a.includes("sudo mkdir")),
      );
      assertEquals(mkdirCommand !== undefined, true);
    });
  });

  describe("delete", () => {
    it("ファイルを削除できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      await uploader.delete("file.txt");

      // rmコマンドが実行されたことを確認
      const rmCommand = uploader.executedCommands.find(
        (c) => c.args.some((a) => a.includes("rm -rf")),
      );
      assertEquals(rmCommand !== undefined, true);
    });

    it("未接続状態ではエラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      await assertRejects(
        () => uploader.delete("file.txt"),
        UploadError,
        "Not connected",
      );
    });

    it("存在しないファイルの削除は成功扱い", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      // "No such file"エラーを返すように設定
      uploader.mockCommandResults.set("rm", {
        code: 1,
        stdout: new TextEncoder().encode(""),
        stderr: new TextEncoder().encode("No such file or directory"),
      });

      // エラーにならない
      await uploader.delete("nonexistent.txt");
    });

    it("削除失敗時はエラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      // 権限エラーを返すように設定
      uploader.mockCommandResults.set("rm", {
        code: 1,
        stdout: new TextEncoder().encode(""),
        stderr: new TextEncoder().encode("Permission denied"),
      });

      await assertRejects(
        () => uploader.delete("protected.txt"),
        UploadError,
        "Failed to delete",
      );
    });

    it("sudo付きで削除できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      await uploader.delete("file.txt", true);

      // sudoが使われていることを確認
      const rmCommand = uploader.executedCommands.find(
        (c) => c.args.some((a) => a.includes("sudo rm")),
      );
      assertEquals(rmCommand !== undefined, true);
    });
  });

  describe("readFile", () => {
    it("ファイルを読み取れる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      // catコマンドの結果を設定
      const content = "file content";
      uploader.mockCommandResults.set("cat", {
        code: 0,
        stdout: new TextEncoder().encode(content),
        stderr: new TextEncoder().encode(""),
      });

      const result = await uploader.readFile("test.txt");

      assertEquals(result !== null, true);
      assertEquals(new TextDecoder().decode(result!.content), content);
      assertEquals(result!.size, content.length);
    });

    it("未接続状態ではエラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      await assertRejects(
        () => uploader.readFile("test.txt"),
        UploadError,
        "Not connected",
      );
    });

    it("存在しないファイルはnullを返す", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      // "No such file"エラーを返すように設定
      uploader.mockCommandResults.set("cat", {
        code: 1,
        stdout: new TextEncoder().encode(""),
        stderr: new TextEncoder().encode("No such file or directory"),
      });

      const result = await uploader.readFile("nonexistent.txt");

      assertEquals(result, null);
    });

    it("not foundエラーもnullを返す", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      uploader.mockCommandResults.set("cat", {
        code: 1,
        stdout: new TextEncoder().encode(""),
        stderr: new TextEncoder().encode("file not found"),
      });

      const result = await uploader.readFile("missing.txt");

      assertEquals(result, null);
    });

    it("ディレクトリはnullを返す", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      uploader.mockCommandResults.set("cat", {
        code: 1,
        stdout: new TextEncoder().encode(""),
        stderr: new TextEncoder().encode("Is a directory"),
      });

      const result = await uploader.readFile("subdir");

      assertEquals(result, null);
    });

    it("読み取り失敗時はエラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      uploader.mockCommandResults.set("cat", {
        code: 1,
        stdout: new TextEncoder().encode(""),
        stderr: new TextEncoder().encode("Permission denied"),
      });

      await assertRejects(
        () => uploader.readFile("protected.txt"),
        UploadError,
        "Failed to read file",
      );
    });

    it("sudo付きで読み取りできる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      const content = "sudo content";
      uploader.mockCommandResults.set("sudo cat", {
        code: 0,
        stdout: new TextEncoder().encode(content),
        stderr: new TextEncoder().encode(""),
      });

      const result = await uploader.readFile("root.txt", true);

      assertEquals(result !== null, true);

      // sudoが使われていることを確認
      const catCommand = uploader.executedCommands.find(
        (c) => c.args.some((a) => a.includes("sudo cat")),
      );
      assertEquals(catCommand !== undefined, true);
    });
  });

  describe("upload", () => {
    it("バッファからファイルをアップロードできる（gitモード）", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      const content = new TextEncoder().encode("Hello, World!");
      const file: UploadFile = {
        relativePath: "hello.txt",
        content,
        size: content.length,
        isDirectory: false,
        changeType: "add",
      };

      let progressCalled = false;
      await uploader.upload(file, file.relativePath, (transferred, total) => {
        progressCalled = true;
        assertEquals(transferred, total);
      });

      assertEquals(progressCalled, true);
      assertEquals(uploader.uploadFileFromPathCalls.length, 1);
    });

    it("ローカルファイルからアップロードできる（fileモード）", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new TestSshUploader({
          host: "example.com",
          port: 22,
          user: "testuser",
          dest: "/var/www",
        });

        uploader.mockSuccessfulConnection();
        await uploader.connect();

        const content = "Local file content";
        const srcPath = join(tempDir, "source.txt");
        await Deno.writeTextFile(srcPath, content);

        const file: UploadFile = {
          relativePath: "dest.txt",
          sourcePath: srcPath,
          size: content.length,
          isDirectory: false,
          changeType: "add",
        };

        let progressCalled = false;
        await uploader.upload(file, file.relativePath, () => {
          progressCalled = true;
        });

        assertEquals(progressCalled, true);
        assertEquals(uploader.uploadFileFromPathCalls.length, 1);
        assertStringIncludes(
          uploader.uploadFileFromPathCalls[0].srcPath,
          "source.txt",
        );

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("ディレクトリを作成できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      const file: UploadFile = {
        relativePath: "new_dir",
        size: 0,
        isDirectory: true,
        changeType: "add",
      };

      let progressCalled = false;
      await uploader.upload(file, file.relativePath, () => {
        progressCalled = true;
      });

      assertEquals(progressCalled, true);
      // ディレクトリ作成のmkdirコマンドが実行されたことを確認
      const mkdirCommand = uploader.executedCommands.find(
        (c) => c.args.some((a) => a.includes("mkdir")),
      );
      assertEquals(mkdirCommand !== undefined, true);
    });

    it("未接続状態ではエラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      const file: UploadFile = {
        relativePath: "test.txt",
        content: new TextEncoder().encode("test"),
        size: 4,
        isDirectory: false,
        changeType: "add",
      };

      await assertRejects(
        () => uploader.upload(file, file.relativePath),
        UploadError,
        "Not connected",
      );
    });

    it("contentもsourcePathもない場合はエラー", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      const file: UploadFile = {
        relativePath: "no_source.txt",
        size: 100,
        isDirectory: false,
        changeType: "add",
      };

      await assertRejects(
        () => uploader.upload(file, file.relativePath),
        UploadError,
        "No source",
      );
    });
  });

  describe("buildSshArgsInternal", () => {
    it("SSH引数を正しく構築できる", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 2222,
        user: "testuser",
        dest: "/var/www",
        keyFile: "~/.ssh/id_rsa",
        timeout: 30,
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      // 接続時のSSHコマンドを確認
      const sshCommand = uploader.executedCommands.find((c) => c.cmd === "ssh");
      assertEquals(sshCommand !== undefined, true);

      // ポート指定が含まれていることを確認
      const hasPort = sshCommand!.args.some((a) => a === "-p" || a === "2222");
      assertEquals(hasPort, true);
    });

    it("パスワード認証時はBatchModeなし", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        password: "secret",
      });

      uploader.mockSshpassAvailable = true;
      uploader.mockSuccessfulConnection();
      await uploader.connect();

      // BatchModeが含まれていないことを確認
      const sshCommand = uploader.executedCommands.find((c) => c.cmd === "ssh");
      assertEquals(sshCommand !== undefined, true);
      const hasBatchMode = sshCommand!.args.some((a) =>
        a.includes("BatchMode=yes")
      );
      assertEquals(hasBatchMode, false);
    });

    it("レガシーモードでアルゴリズムが追加される", async () => {
      const uploader = new TestSshUploader({
        host: "example.com",
        port: 22,
        user: "testuser",
        dest: "/var/www",
        legacyMode: true,
      });

      uploader.mockSuccessfulConnection();
      await uploader.connect();

      // レガシーアルゴリズムが含まれていることを確認
      const sshCommand = uploader.executedCommands.find((c) => c.cmd === "ssh");
      assertEquals(sshCommand !== undefined, true);
      const hasLegacyAlgo = sshCommand!.args.some(
        (a) =>
          a.includes("diffie-hellman") ||
          a.includes("ssh-rsa") ||
          a.includes("ssh-dss"),
      );
      assertEquals(hasLegacyAlgo, true);
    });
  });
});
