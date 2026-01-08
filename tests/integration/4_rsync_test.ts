/**
 * rsync転送結合テスト
 *
 * 事前準備:
 * 1. tests/integration/scripts/setup-ssh-keys.sh
 * 2. docker compose -f docker-compose.test.yml up -d
 * 3. rsyncコマンドがインストールされていること
 */

import { assertEquals, assertExists } from "@std/assert";
import { RsyncUploader } from "../../src/upload/rsync.ts";
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

/** rsyncコマンドが利用可能かチェック */
async function isRsyncAvailable(): Promise<boolean> {
  try {
    const command = new Deno.Command("rsync", {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    });
    const { code } = await command.output();
    return code === 0;
  } catch {
    return false;
  }
}

/** rsync接続可能かチェック（SSH鍵認証） */
async function isRsyncReachable(): Promise<boolean> {
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

/** リモート側にrsyncがインストールされているかチェック */
async function isRemoteRsyncAvailable(): Promise<boolean> {
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
        "which",
        "rsync",
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

/** rsyncテスト用の前提条件チェック */
async function shouldSkipRsyncTests(): Promise<string | null> {
  const integrationSkip = await shouldSkipIntegrationTests();
  if (integrationSkip) {
    return integrationSkip;
  }

  if (!(await isRsyncAvailable())) {
    return "rsync command not found locally. Install rsync first.";
  }

  if (!(await sshKeyExists())) {
    return `SSH key not found. Run: tests/integration/scripts/setup-ssh-keys.sh`;
  }

  if (!(await isRsyncReachable())) {
    return "rsync connection failed. Check SSH key is authorized in container.";
  }

  if (!(await isRemoteRsyncAvailable())) {
    return "rsync not installed on remote server. Install rsync in the Docker container.";
  }

  return null;
}

Deno.test({
  name: "rsync Integration Tests",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipRsyncTests();
    if (skipReason) {
      console.log(`Skipping rsync integration tests: ${skipReason}`);
      return;
    }

    const testId = randomString();
    let uploader: RsyncUploader;

    await t.step("connect via rsync (SSH key auth)", async () => {
      uploader = new RsyncUploader({
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
      const dirPath = `rsync-test-${testId}`;
      await uploader.mkdir(dirPath);
    });

    await t.step("upload file from buffer (git mode)", async () => {
      const content = `Hello rsync! Test ID: ${testId}`;
      const file: UploadFile = {
        relativePath: `rsync-test-${testId}/hello.txt`,
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
      const tempDir = await createTempDir("rsync");
      const content = `Local file via rsync: ${testId}`;
      const localPath = await createTestFile(tempDir, "local.txt", content);

      const file: UploadFile = {
        relativePath: `rsync-test-${testId}/local.txt`,
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
      const result = await uploader.readFile(`rsync-test-${testId}/hello.txt`);

      assertExists(result);
      const content = new TextDecoder().decode(result.content);
      assertEquals(content, `Hello rsync! Test ID: ${testId}`);
    });

    await t.step("read non-existent file returns null", async () => {
      const result = await uploader.readFile(
        `rsync-test-${testId}/nonexistent.txt`,
      );
      assertEquals(result, null);
    });

    await t.step("delete file", async () => {
      await uploader.delete(`rsync-test-${testId}/hello.txt`);

      // 削除後に読み取ると null になる
      const result = await uploader.readFile(`rsync-test-${testId}/hello.txt`);
      assertEquals(result, null);
    });

    await t.step("delete directory", async () => {
      await uploader.delete(`rsync-test-${testId}/local.txt`);
      await uploader.delete(`rsync-test-${testId}`);
    });

    await t.step("disconnect", async () => {
      await uploader.disconnect();
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "rsync multiple file upload",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipRsyncTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();
    const uploader = new RsyncUploader({
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
        { name: "file1.txt", content: "rsync Content 1" },
        { name: "file2.txt", content: "rsync Content 2" },
        { name: "subdir/file3.txt", content: "rsync Content 3" },
      ];

      for (const { name, content } of files) {
        const file: UploadFile = {
          relativePath: `rsync-multi-${testId}/${name}`,
          changeType: "add",
          size: content.length,
          content: new TextEncoder().encode(content),
          isDirectory: false,
        };
        await uploader.upload(file, file.relativePath);
      }

      // 確認
      for (const { name, content } of files) {
        const result = await uploader.readFile(`rsync-multi-${testId}/${name}`);
        assertExists(result);
        assertEquals(new TextDecoder().decode(result.content), content);
      }
    });

    await t.step("cleanup", async () => {
      await uploader.delete(`rsync-multi-${testId}`);
    });

    await uploader.disconnect();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "rsync with options",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipRsyncTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();

    await t.step("upload with preserveTimestamps", async () => {
      const uploader = new RsyncUploader({
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

      const content = `Timestamp test: ${testId}`;
      const file: UploadFile = {
        relativePath: `rsync-opts-${testId}/timestamp.txt`,
        changeType: "add",
        size: content.length,
        content: new TextEncoder().encode(content),
        isDirectory: false,
      };

      await uploader.upload(file, file.relativePath);

      // 確認
      const result = await uploader.readFile(
        `rsync-opts-${testId}/timestamp.txt`,
      );
      assertExists(result);
      assertEquals(new TextDecoder().decode(result.content), content);

      // cleanup
      await uploader.delete(`rsync-opts-${testId}`);
      await uploader.disconnect();
    });

    await t.step("upload with rsync_options", async () => {
      const uploader = new RsyncUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10,
        retry: 3,
        rsyncOptions: ["--compress"],
      });

      await uploader.connect();

      const content = `Compress test: ${testId}`;
      const file: UploadFile = {
        relativePath: `rsync-compress-${testId}/compress.txt`,
        changeType: "add",
        size: content.length,
        content: new TextEncoder().encode(content),
        isDirectory: false,
      };

      await uploader.upload(file, file.relativePath);

      // 確認
      const result = await uploader.readFile(
        `rsync-compress-${testId}/compress.txt`,
      );
      assertExists(result);
      assertEquals(new TextDecoder().decode(result.content), content);

      // cleanup
      await uploader.delete(`rsync-compress-${testId}`);
      await uploader.disconnect();
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
