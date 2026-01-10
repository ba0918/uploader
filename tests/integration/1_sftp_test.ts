/**
 * SFTP転送結合テスト
 *
 * 事前準備:
 * docker compose -f docker-compose.test.yml up -d
 */

import { assertEquals, assertExists } from "@std/assert";
import { SftpUploader } from "../../src/upload/sftp.ts";
import type { UploadFile } from "../../src/types/mod.ts";
import {
  createTempDir,
  createTestFile,
  DOCKER_CONFIG,
  randomString,
  removeTempDir,
  shouldSkipIntegrationTests,
} from "./helpers.ts";

Deno.test({
  name: "SFTP Integration Tests",
  ignore: false,
  fn: async (t) => {
    // 結合テスト実行可能かチェック
    const skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping SFTP integration tests: ${skipReason}`);
      return;
    }

    const testId = randomString();
    let uploader: SftpUploader;

    await t.step("connect to SFTP server", async () => {
      uploader = new SftpUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        authType: "password",
        password: DOCKER_CONFIG.sftp.password,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10000,
        retry: 3,
      });

      await uploader.connect();
    });

    await t.step("create directory", async () => {
      const dirPath = `test-${testId}`;
      await uploader.mkdir(dirPath);

      // ディレクトリが作成されたことを確認（再度作成してもエラーにならない）
      await uploader.mkdir(dirPath);
    });

    await t.step("upload file from buffer (git mode)", async () => {
      const content = `Hello SFTP! Test ID: ${testId}`;
      const file: UploadFile = {
        relativePath: `test-${testId}/hello.txt`,
        changeType: "add",
        size: content.length,
        content: new TextEncoder().encode(content),
        isDirectory: false,
      };

      let progressCalled = false;
      await uploader.upload(file, file.relativePath, (_transferred, total) => {
        progressCalled = true;
        assertEquals(total, content.length);
      });

      assertEquals(progressCalled, true);
    });

    await t.step("upload file from local path (file mode)", async () => {
      const tempDir = await createTempDir("sftp");
      const content = `Local file content: ${testId}`;
      const localPath = await createTestFile(tempDir, "local.txt", content);

      const file: UploadFile = {
        relativePath: `test-${testId}/local.txt`,
        changeType: "add",
        size: content.length,
        sourcePath: localPath,
        isDirectory: false,
      };

      let progressCalled = false;
      await uploader.upload(file, file.relativePath, (_transferred, _total) => {
        progressCalled = true;
      });

      assertEquals(progressCalled, true);

      await removeTempDir(tempDir);
    });

    await t.step("read uploaded file", async () => {
      const result = await uploader.readFile(`test-${testId}/hello.txt`);

      assertExists(result);
      const content = new TextDecoder().decode(result.content);
      assertEquals(content, `Hello SFTP! Test ID: ${testId}`);
    });

    await t.step("read non-existent file returns null", async () => {
      const result = await uploader.readFile(`test-${testId}/nonexistent.txt`);
      assertEquals(result, null);
    });

    await t.step("delete file", async () => {
      await uploader.delete(`test-${testId}/hello.txt`);

      // 削除後に読み取ると null になる
      const result = await uploader.readFile(`test-${testId}/hello.txt`);
      assertEquals(result, null);
    });

    await t.step("delete directory", async () => {
      // ディレクトリ内のファイルを削除
      await uploader.delete(`test-${testId}/local.txt`);
      // ディレクトリ自体を削除
      await uploader.delete(`test-${testId}`);
    });

    await t.step("disconnect from SFTP server", async () => {
      await uploader.disconnect();
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "SFTP multiple file upload",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();
    const uploader = new SftpUploader({
      host: DOCKER_CONFIG.sftp.host,
      port: DOCKER_CONFIG.sftp.port,
      user: DOCKER_CONFIG.sftp.user,
      authType: "password",
      password: DOCKER_CONFIG.sftp.password,
      dest: DOCKER_CONFIG.sftp.dest,
      timeout: 10000,
      retry: 3,
    });

    await uploader.connect();

    await t.step("upload multiple files", async () => {
      const files = [
        { name: "file1.txt", content: "Content 1" },
        { name: "file2.txt", content: "Content 2" },
        { name: "subdir/file3.txt", content: "Content 3" },
      ];

      for (const { name, content } of files) {
        const file: UploadFile = {
          relativePath: `multi-${testId}/${name}`,
          changeType: "add",
          size: content.length,
          content: new TextEncoder().encode(content),
          isDirectory: false,
        };
        await uploader.upload(file, file.relativePath);
      }

      // 確認
      for (const { name, content } of files) {
        const result = await uploader.readFile(`multi-${testId}/${name}`);
        assertExists(result);
        assertEquals(new TextDecoder().decode(result.content), content);
      }
    });

    await t.step("cleanup", async () => {
      await uploader.delete(`multi-${testId}/file1.txt`);
      await uploader.delete(`multi-${testId}/file2.txt`);
      await uploader.delete(`multi-${testId}/subdir/file3.txt`);
      await uploader.delete(`multi-${testId}/subdir`);
      await uploader.delete(`multi-${testId}`);
    });

    await uploader.disconnect();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
// 接続失敗テストは9_failure_test.tsに統合

import { join } from "@std/path";

/** SSH鍵ファイルのパス */
const SSH_KEY_PATH = join(
  Deno.cwd(),
  "tests/integration/fixtures/ssh-keys/test_key",
);

/** SSH鍵が存在するかチェック */
async function sshKeyExists(): Promise<boolean> {
  try {
    await Deno.stat(SSH_KEY_PATH);
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  name: "SFTP with SSH key authentication",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    if (!(await sshKeyExists())) {
      console.log("Skipping: SSH key not found");
      return;
    }

    const testId = randomString();

    await t.step("connect with SSH key", async () => {
      const uploader = new SftpUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        authType: "ssh_key",
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10000,
        retry: 3,
      });

      await uploader.connect();

      const content = `SSH key auth test: ${testId}`;
      const file: UploadFile = {
        relativePath: `sftp-key-${testId}/test.txt`,
        changeType: "add",
        size: content.length,
        content: new TextEncoder().encode(content),
        isDirectory: false,
      };

      await uploader.upload(file, file.relativePath);

      const result = await uploader.readFile(`sftp-key-${testId}/test.txt`);
      assertExists(result);
      assertEquals(new TextDecoder().decode(result.content), content);

      // ファイルを先に削除してからディレクトリを削除
      await uploader.delete(`sftp-key-${testId}/test.txt`);
      await uploader.delete(`sftp-key-${testId}`);
      await uploader.disconnect();
    });

    // Note: legacyModeのテストはサーバーがレガシーアルゴリズムをサポートしていないためスキップ
    // await t.step("connect with legacyMode", async () => { ... });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// SFTP追加カバレッジテスト
Deno.test({
  name: "SFTP additional coverage tests",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();
    const uploader = new SftpUploader({
      host: DOCKER_CONFIG.sftp.host,
      port: DOCKER_CONFIG.sftp.port,
      user: DOCKER_CONFIG.sftp.user,
      authType: "password",
      password: DOCKER_CONFIG.sftp.password,
      dest: DOCKER_CONFIG.sftp.dest,
      timeout: 10000,
      retry: 3,
    });

    await uploader.connect();

    await t.step("readFile on directory returns null", async () => {
      // ディレクトリを作成
      const dirPath = `dir-test-${testId}`;
      await uploader.mkdir(dirPath);

      // ディレクトリをファイルとして読み取るとnullを返す
      const result = await uploader.readFile(dirPath);
      assertEquals(result, null);

      // クリーンアップ
      await uploader.delete(dirPath);
    });

    await t.step("upload large file triggers drain event", async () => {
      // 大きなファイル（1MB以上）でdrainイベントをトリガー
      const tempDir = await createTempDir("sftp-large");
      const largeContent = "x".repeat(1024 * 1024 * 2); // 2MB
      const localPath = await createTestFile(tempDir, "large.txt", largeContent);

      const file: UploadFile = {
        relativePath: `large-${testId}/large.txt`,
        changeType: "add",
        size: largeContent.length,
        sourcePath: localPath,
        isDirectory: false,
      };

      let lastProgress = 0;
      await uploader.upload(file, file.relativePath, (transferred, _total) => {
        lastProgress = transferred;
      });

      // 全てのバイトが転送されたことを確認
      assertEquals(lastProgress, largeContent.length);

      // クリーンアップ
      await uploader.delete(`large-${testId}/large.txt`);
      await uploader.delete(`large-${testId}`);
      await removeTempDir(tempDir);
    });

    await t.step("delete non-existent file succeeds", async () => {
      // 存在しないファイルの削除は成功扱い
      await uploader.delete(`nonexistent-${testId}.txt`);
    });

    await t.step("mkdir creates nested directories", async () => {
      const nestedPath = `nested-${testId}/a/b/c`;
      await uploader.mkdir(nestedPath);

      // ファイルをアップロードして検証
      const content = "test";
      const file: UploadFile = {
        relativePath: `${nestedPath}/test.txt`,
        changeType: "add",
        size: content.length,
        content: new TextEncoder().encode(content),
        isDirectory: false,
      };
      await uploader.upload(file, file.relativePath);

      // 読み取り確認
      const result = await uploader.readFile(`${nestedPath}/test.txt`);
      assertExists(result);

      // クリーンアップ
      await uploader.delete(`${nestedPath}/test.txt`);
      await uploader.delete(`${nestedPath}`);
      await uploader.delete(`nested-${testId}/a/b`);
      await uploader.delete(`nested-${testId}/a`);
      await uploader.delete(`nested-${testId}`);
    });

    await uploader.disconnect();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
