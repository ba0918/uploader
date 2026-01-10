/**
 * SCP転送結合テスト
 *
 * 事前準備:
 * 1. tests/integration/scripts/setup-ssh-keys.sh
 * 2. docker compose -f docker-compose.test.yml up -d
 */

import { assertEquals, assertExists } from "@std/assert";
import { ScpUploader } from "../../src/upload/scp.ts";
import type { UploadFile } from "../../src/types/mod.ts";
import {
  createTempDir,
  createTestFile,
  DOCKER_CONFIG,
  randomString,
  removeTempDir,
  shouldSkipIntegrationTests,
} from "./helpers.ts";
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

/** SCP接続可能かチェック（SSH鍵認証） */
async function isScpReachable(): Promise<boolean> {
  try {
    const command = new Deno.Command("ssh", {
      args: [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=5",
        "-p",
        String(DOCKER_CONFIG.sftp.port),
        "-i",
        SSH_KEY_PATH,
        `${DOCKER_CONFIG.sftp.user}@${DOCKER_CONFIG.sftp.host}`,
        "echo",
        "ok",
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const { code } = await command.output();
    return code === 0;
  } catch {
    return false;
  }
}

/** SCPテスト用の前提条件チェック */
async function shouldSkipScpTests(): Promise<string | null> {
  const integrationSkip = await shouldSkipIntegrationTests();
  if (integrationSkip) {
    return integrationSkip;
  }

  if (!(await sshKeyExists())) {
    return `SSH key not found. Run: tests/integration/scripts/setup-ssh-keys.sh`;
  }

  if (!(await isScpReachable())) {
    return "SCP connection failed. Check SSH key is authorized in container.";
  }

  return null;
}

Deno.test({
  name: "SCP Integration Tests",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipScpTests();
    if (skipReason) {
      console.log(`Skipping SCP integration tests: ${skipReason}`);
      return;
    }

    const testId = randomString();
    let uploader: ScpUploader;

    await t.step("connect via SCP (SSH key auth)", async () => {
      uploader = new ScpUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10,
        retry: 3,
      });

      await uploader.connect();
    });

    await t.step("create directory", async () => {
      const dirPath = `scp-test-${testId}`;
      await uploader.mkdir(dirPath);
    });

    await t.step("upload file from buffer (git mode)", async () => {
      const content = `Hello SCP! Test ID: ${testId}`;
      const file: UploadFile = {
        relativePath: `scp-test-${testId}/hello.txt`,
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
      const tempDir = await createTempDir("scp");
      const content = `Local file via SCP: ${testId}`;
      const localPath = await createTestFile(tempDir, "local.txt", content);

      const file: UploadFile = {
        relativePath: `scp-test-${testId}/local.txt`,
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
      const result = await uploader.readFile(`scp-test-${testId}/hello.txt`);

      assertExists(result);
      const content = new TextDecoder().decode(result.content);
      assertEquals(content, `Hello SCP! Test ID: ${testId}`);
    });

    await t.step("read non-existent file returns null", async () => {
      const result = await uploader.readFile(
        `scp-test-${testId}/nonexistent.txt`,
      );
      assertEquals(result, null);
    });

    await t.step("delete file", async () => {
      await uploader.delete(`scp-test-${testId}/hello.txt`);

      // 削除後に読み取ると null になる
      const result = await uploader.readFile(`scp-test-${testId}/hello.txt`);
      assertEquals(result, null);
    });

    await t.step("delete directory", async () => {
      await uploader.delete(`scp-test-${testId}/local.txt`);
      await uploader.delete(`scp-test-${testId}`);
    });

    await t.step("disconnect", async () => {
      await uploader.disconnect();
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "SCP multiple file upload",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipScpTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();
    const uploader = new ScpUploader({
      host: DOCKER_CONFIG.sftp.host,
      port: DOCKER_CONFIG.sftp.port,
      user: DOCKER_CONFIG.sftp.user,
      keyFile: SSH_KEY_PATH,
      dest: DOCKER_CONFIG.sftp.dest,
      timeout: 10,
      retry: 3,
    });

    await uploader.connect();

    await t.step("upload multiple files with subdirectory", async () => {
      const files = [
        { name: "file1.txt", content: "SCP Content 1" },
        { name: "file2.txt", content: "SCP Content 2" },
        { name: "subdir/file3.txt", content: "SCP Content 3" },
      ];

      for (const { name, content } of files) {
        const file: UploadFile = {
          relativePath: `scp-multi-${testId}/${name}`,
          changeType: "add",
          size: content.length,
          content: new TextEncoder().encode(content),
          isDirectory: false,
        };
        await uploader.upload(file, file.relativePath);
      }

      // 確認
      for (const { name, content } of files) {
        const result = await uploader.readFile(`scp-multi-${testId}/${name}`);
        assertExists(result);
        assertEquals(new TextDecoder().decode(result.content), content);
      }
    });

    await t.step("cleanup", async () => {
      await uploader.delete(`scp-multi-${testId}`);
    });

    await uploader.disconnect();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// 接続失敗テストは 9_failure_test.ts に移動済み

Deno.test({
  name: "SCP with options",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipScpTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();

    await t.step("upload with preserveTimestamps", async () => {
      const uploader = new ScpUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10,
        retry: 3,
        preserveTimestamps: true,
      });

      await uploader.connect();

      const tempDir = await createTempDir("scp-ts");
      const content = `Timestamp test: ${testId}`;
      const localPath = await createTestFile(tempDir, "timestamp.txt", content);

      // 過去のタイムスタンプを設定
      const pastTime = new Date("2020-06-15T12:00:00Z");
      await Deno.utime(localPath, pastTime, pastTime);

      const file: UploadFile = {
        relativePath: `scp-ts-${testId}/timestamp.txt`,
        changeType: "add",
        size: content.length,
        sourcePath: localPath,
        isDirectory: false,
      };

      await uploader.upload(file, file.relativePath);

      // ファイルがアップロードされたことを確認
      const result = await uploader.readFile(`scp-ts-${testId}/timestamp.txt`);
      assertExists(result);
      assertEquals(new TextDecoder().decode(result.content), content);

      // クリーンアップ
      await uploader.delete(`scp-ts-${testId}`);
      await uploader.disconnect();
      await removeTempDir(tempDir);
    });

    await t.step("upload with legacyMode", async () => {
      const uploader = new ScpUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10,
        retry: 3,
        legacyMode: true,
      });

      await uploader.connect();

      const content = `Legacy mode test: ${testId}`;
      const file: UploadFile = {
        relativePath: `scp-legacy-${testId}/test.txt`,
        changeType: "add",
        size: content.length,
        content: new TextEncoder().encode(content),
        isDirectory: false,
      };

      await uploader.upload(file, file.relativePath);

      const result = await uploader.readFile(`scp-legacy-${testId}/test.txt`);
      assertExists(result);

      await uploader.delete(`scp-legacy-${testId}`);
      await uploader.disconnect();
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// SCP追加カバレッジテスト
Deno.test({
  name: "SCP additional coverage tests",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipScpTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();
    const uploader = new ScpUploader({
      host: DOCKER_CONFIG.sftp.host,
      port: DOCKER_CONFIG.sftp.port,
      user: DOCKER_CONFIG.sftp.user,
      keyFile: SSH_KEY_PATH,
      dest: DOCKER_CONFIG.sftp.dest,
      timeout: 10,
      retry: 3,
    });

    await uploader.connect();

    await t.step("readFile on directory returns null", async () => {
      // ディレクトリを作成
      const dirPath = `scp-dir-${testId}`;
      await uploader.mkdir(dirPath);

      // ディレクトリをファイルとして読み取るとnullを返す
      const result = await uploader.readFile(dirPath);
      assertEquals(result, null);

      // クリーンアップ
      await uploader.delete(dirPath);
    });

    await t.step("upload large file", async () => {
      const tempDir = await createTempDir("scp-large");
      const largeContent = "x".repeat(1024 * 512); // 512KB
      const localPath = await createTestFile(
        tempDir,
        "large.txt",
        largeContent,
      );

      const file: UploadFile = {
        relativePath: `scp-large-${testId}/large.txt`,
        changeType: "add",
        size: largeContent.length,
        sourcePath: localPath,
        isDirectory: false,
      };

      let lastProgress = 0;
      await uploader.upload(file, file.relativePath, (transferred, _total) => {
        lastProgress = transferred;
      });

      // 転送が完了したことを確認
      assertEquals(lastProgress > 0, true);

      // クリーンアップ
      await uploader.delete(`scp-large-${testId}`);
      await removeTempDir(tempDir);
    });

    await t.step("delete non-existent file succeeds", async () => {
      // 存在しないファイルの削除は成功扱い
      await uploader.delete(`scp-nonexistent-${testId}.txt`);
    });

    await uploader.disconnect();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
