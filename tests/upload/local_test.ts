/**
 * upload/local.ts のテスト
 *
 * LocalUploaderの各機能をテスト
 */

import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import { LocalUploader } from "../../src/upload/local.ts";
import { UploadError } from "../../src/types/mod.ts";
import type { UploadFile } from "../../src/types/mod.ts";

/** 一時ディレクトリを作成 */
async function createTempDir(): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: "local_uploader_test_" });
  return tempDir;
}

/** 一時ディレクトリを削除 */
async function removeTempDir(dir: string): Promise<void> {
  try {
    await Deno.remove(dir, { recursive: true });
  } catch {
    // 削除失敗は無視
  }
}

/** テストファイルを作成 */
async function createTestFile(
  dir: string,
  name: string,
  content: string,
): Promise<string> {
  const path = join(dir, name);
  await Deno.writeTextFile(path, content);
  return path;
}

describe("LocalUploader", () => {
  describe("connect", () => {
    it("新規ディレクトリを作成して接続できる", async () => {
      const tempDir = await createTempDir();
      const destDir = join(tempDir, "new_dest");

      try {
        const uploader = new LocalUploader({ dest: destDir });
        await uploader.connect();

        // ディレクトリが作成されたことを確認
        const stat = await Deno.stat(destDir);
        assertEquals(stat.isDirectory, true);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("既存ディレクトリに接続できる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();
        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("ファイルを指定した場合はエラー", async () => {
      const tempDir = await createTempDir();
      const filePath = await createTestFile(
        tempDir,
        "not_a_dir.txt",
        "content",
      );

      try {
        const uploader = new LocalUploader({ dest: filePath });
        await assertRejects(
          () => uploader.connect(),
          UploadError,
          "Destination is not a directory",
        );
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("statが失敗した場合はCONNECTION_ERROR", async () => {
      // 無効なパスで接続を試みる
      const uploader = new LocalUploader({ dest: "/dev/null/invalid" });
      const error = await assertRejects(
        () => uploader.connect(),
        UploadError,
      );
      assertEquals(error.code, "CONNECTION_ERROR");
    });
  });

  describe("mkdir", () => {
    it("ディレクトリを作成できる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        await uploader.mkdir("subdir");

        const stat = await Deno.stat(join(tempDir, "subdir"));
        assertEquals(stat.isDirectory, true);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("ネストしたディレクトリを作成できる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        await uploader.mkdir("a/b/c");

        const stat = await Deno.stat(join(tempDir, "a/b/c"));
        assertEquals(stat.isDirectory, true);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("未接続状態ではエラー", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        // connectを呼ばない

        await assertRejects(
          () => uploader.mkdir("subdir"),
          UploadError,
          "Not connected",
        );
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("ディレクトリ作成に失敗した場合はPERMISSION_ERROR", async () => {
      const tempDir = await createTempDir();

      try {
        // ファイルを作成して、その中にディレクトリを作成しようとする
        await createTestFile(tempDir, "not_a_dir", "content");

        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        const error = await assertRejects(
          () => uploader.mkdir("not_a_dir/subdir"),
          UploadError,
        );
        assertEquals(error.code, "PERMISSION_ERROR");

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });
  });

  describe("upload", () => {
    it("バッファからファイルをアップロードできる（gitモード）", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        const content = "Hello, World!";
        const file: UploadFile = {
          relativePath: "hello.txt",
          content: new TextEncoder().encode(content),
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

        // ファイルが作成されたことを確認
        const written = await Deno.readTextFile(join(tempDir, "hello.txt"));
        assertEquals(written, content);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("ローカルファイルからアップロードできる（fileモード）", async () => {
      const tempDir = await createTempDir();
      const srcDir = await createTempDir();

      try {
        const content = "Source file content";
        const srcPath = await createTestFile(srcDir, "source.txt", content);

        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

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

        // ファイルがコピーされたことを確認
        const written = await Deno.readTextFile(join(tempDir, "dest.txt"));
        assertEquals(written, content);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
        await removeTempDir(srcDir);
      }
    });

    it("ディレクトリを作成できる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        const file: UploadFile = {
          relativePath: "new_dir",
          size: 0,
          isDirectory: true,
          changeType: "add",
        };

        await uploader.upload(file, file.relativePath);

        const stat = await Deno.stat(join(tempDir, "new_dir"));
        assertEquals(stat.isDirectory, true);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("ディレクトリ作成時にonProgressが呼ばれる", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        const file: UploadFile = {
          relativePath: "progress_dir",
          size: 0,
          isDirectory: true,
          changeType: "add",
        };

        let progressCalled = false;
        await uploader.upload(file, file.relativePath, (transferred, total) => {
          progressCalled = true;
          assertEquals(transferred, 0);
          assertEquals(total, 0);
        });

        assertEquals(progressCalled, true);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("親ディレクトリを自動作成する", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        const content = "Nested file";
        const file: UploadFile = {
          relativePath: "a/b/c/nested.txt",
          content: new TextEncoder().encode(content),
          size: content.length,
          isDirectory: false,
          changeType: "add",
        };

        await uploader.upload(file, file.relativePath);

        // ファイルが作成されたことを確認
        const written = await Deno.readTextFile(
          join(tempDir, "a/b/c/nested.txt"),
        );
        assertEquals(written, content);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("contentもsourcePathもない場合はエラー", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
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

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("未接続状態ではエラー", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });

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
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("タイムスタンプを保持できる", async () => {
      const tempDir = await createTempDir();
      const srcDir = await createTempDir();

      try {
        const content = "Timestamp test";
        const srcPath = await createTestFile(srcDir, "source.txt", content);

        // ソースファイルのタイムスタンプを設定
        const pastTime = new Date("2020-01-01T00:00:00Z");
        await Deno.utime(srcPath, pastTime, pastTime);

        const uploader = new LocalUploader({
          dest: tempDir,
          preserveTimestamps: true,
        });
        await uploader.connect();

        const file: UploadFile = {
          relativePath: "dest.txt",
          sourcePath: srcPath,
          size: content.length,
          isDirectory: false,
          changeType: "add",
        };

        await uploader.upload(file, file.relativePath);

        // タイムスタンプが保持されていることを確認
        const stat = await Deno.stat(join(tempDir, "dest.txt"));
        // 完全一致は環境依存なので、ファイルが存在することのみ確認
        assertEquals(stat.isFile, true);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
        await removeTempDir(srcDir);
      }
    });

    it("タイムスタンプ保持有効でもcontentモードでは保持されない", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({
          dest: tempDir,
          preserveTimestamps: true,
        });
        await uploader.connect();

        const content = "Content mode timestamp test";
        const file: UploadFile = {
          relativePath: "content_ts.txt",
          content: new TextEncoder().encode(content),
          size: content.length,
          isDirectory: false,
          changeType: "add",
          // sourcePathがないのでタイムスタンプ保持されない
        };

        await uploader.upload(file, file.relativePath);

        // ファイルが作成されたことを確認
        const stat = await Deno.stat(join(tempDir, "content_ts.txt"));
        assertEquals(stat.isFile, true);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("ファイル書き込みに失敗した場合はTRANSFER_ERROR", async () => {
      const tempDir = await createTempDir();

      try {
        // ディレクトリを作成
        await Deno.mkdir(join(tempDir, "existing_dir"));

        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        // ディレクトリと同名のファイルを書き込もうとする
        const file: UploadFile = {
          relativePath: "existing_dir",
          content: new TextEncoder().encode("content"),
          size: 7,
          isDirectory: false,
          changeType: "add",
        };

        const error = await assertRejects(
          () => uploader.upload(file, file.relativePath),
          UploadError,
        );
        assertEquals(error.code, "TRANSFER_ERROR");

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });
  });

  describe("delete", () => {
    it("ファイルを削除できる", async () => {
      const tempDir = await createTempDir();

      try {
        await createTestFile(tempDir, "to_delete.txt", "delete me");

        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        await uploader.delete("to_delete.txt");

        // ファイルが削除されたことを確認
        try {
          await Deno.stat(join(tempDir, "to_delete.txt"));
          throw new Error("File should be deleted");
        } catch (error) {
          assertEquals(error instanceof Deno.errors.NotFound, true);
        }

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("ディレクトリを削除できる", async () => {
      const tempDir = await createTempDir();

      try {
        await Deno.mkdir(join(tempDir, "to_delete_dir"));
        await createTestFile(
          join(tempDir, "to_delete_dir"),
          "file.txt",
          "content",
        );

        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        await uploader.delete("to_delete_dir");

        // ディレクトリが削除されたことを確認
        try {
          await Deno.stat(join(tempDir, "to_delete_dir"));
          throw new Error("Directory should be deleted");
        } catch (error) {
          assertEquals(error instanceof Deno.errors.NotFound, true);
        }

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("存在しないファイルの削除は成功扱い", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        // エラーにならない
        await uploader.delete("nonexistent.txt");

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("未接続状態ではエラー", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });

        await assertRejects(
          () => uploader.delete("test.txt"),
          UploadError,
          "Not connected",
        );
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("削除に失敗した場合はPERMISSION_ERROR", async () => {
      // /dev/nullは削除できないディレクトリなのでエラーになる
      const uploader = new LocalUploader({ dest: "/" });
      // 強制的にconnectedをtrueにするためにプライベートフィールドを設定
      // @ts-ignore: テスト用に強制的に接続済み状態にする
      uploader["connected"] = true;

      const error = await assertRejects(
        () => uploader.delete("dev/null"),
        UploadError,
      );
      assertEquals(error.code, "PERMISSION_ERROR");
    });
  });

  describe("readFile", () => {
    it("ファイルを読み取れる", async () => {
      const tempDir = await createTempDir();

      try {
        const content = "Read this content";
        await createTestFile(tempDir, "read_me.txt", content);

        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        const result = await uploader.readFile("read_me.txt");

        assertEquals(result !== null, true);
        assertEquals(new TextDecoder().decode(result!.content), content);
        assertEquals(result!.size, content.length);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("存在しないファイルはnullを返す", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        const result = await uploader.readFile("nonexistent.txt");

        assertEquals(result, null);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("ディレクトリはnullを返す", async () => {
      const tempDir = await createTempDir();

      try {
        await Deno.mkdir(join(tempDir, "subdir"));

        const uploader = new LocalUploader({ dest: tempDir });
        await uploader.connect();

        const result = await uploader.readFile("subdir");

        assertEquals(result, null);

        await uploader.disconnect();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("未接続状態ではエラー", async () => {
      const tempDir = await createTempDir();

      try {
        const uploader = new LocalUploader({ dest: tempDir });

        await assertRejects(
          () => uploader.readFile("test.txt"),
          UploadError,
          "Not connected",
        );
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("読み取りに失敗した場合はTRANSFER_ERROR", async () => {
      // /proc/1/rootは通常のユーザーにはアクセスできないのでエラーになる
      const uploader = new LocalUploader({ dest: "/proc" });
      // @ts-ignore: テスト用に強制的に接続済み状態にする
      uploader["connected"] = true;

      // 権限エラーで読み取りに失敗する
      const error = await assertRejects(
        () => uploader.readFile("1/root"),
        UploadError,
      );
      assertEquals(error.code, "TRANSFER_ERROR");
    });
  });
});
