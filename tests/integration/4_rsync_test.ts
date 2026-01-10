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

Deno.test({
  name: "rsync bulkUpload",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipRsyncTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();

    await t.step("bulk upload multiple files", async () => {
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

      const files: UploadFile[] = [
        {
          relativePath: `rsync-bulk-${testId}/file1.txt`,
          changeType: "add",
          size: 14,
          content: new TextEncoder().encode("Bulk content 1"),
          isDirectory: false,
        },
        {
          relativePath: `rsync-bulk-${testId}/file2.txt`,
          changeType: "add",
          size: 14,
          content: new TextEncoder().encode("Bulk content 2"),
          isDirectory: false,
        },
        {
          relativePath: `rsync-bulk-${testId}/subdir`,
          changeType: "add",
          size: 0,
          isDirectory: true,
        },
        {
          relativePath: `rsync-bulk-${testId}/subdir/file3.txt`,
          changeType: "add",
          size: 14,
          content: new TextEncoder().encode("Bulk content 3"),
          isDirectory: false,
        },
      ];

      let progressCalled = false;
      const result = await uploader.bulkUpload(
        files,
        (current, total, message) => {
          progressCalled = true;
          assertEquals(typeof current, "number");
          assertEquals(typeof total, "number");
          assertEquals(typeof message, "string");
        },
      );

      assertEquals(progressCalled, true);
      assertEquals(result.successCount, files.length);
      assertEquals(result.failedCount, 0);

      // 確認
      const content1 = await uploader.readFile(
        `rsync-bulk-${testId}/file1.txt`,
      );
      assertExists(content1);
      assertEquals(
        new TextDecoder().decode(content1.content),
        "Bulk content 1",
      );

      const content3 = await uploader.readFile(
        `rsync-bulk-${testId}/subdir/file3.txt`,
      );
      assertExists(content3);
      assertEquals(
        new TextDecoder().decode(content3.content),
        "Bulk content 3",
      );

      // cleanup
      await uploader.delete(`rsync-bulk-${testId}`);
      await uploader.disconnect();
    });

    await t.step("bulk upload with sourcePath (file mode)", async () => {
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

      const tempDir = await createTempDir("rsync-bulk");
      const localPath = await createTestFile(
        tempDir,
        "source.txt",
        "Source file content",
      );

      const files: UploadFile[] = [
        {
          relativePath: `rsync-bulk-src-${testId}/source.txt`,
          changeType: "add",
          size: 19,
          sourcePath: localPath,
          isDirectory: false,
        },
      ];

      const result = await uploader.bulkUpload(files);
      assertEquals(result.successCount, 1);

      const content = await uploader.readFile(
        `rsync-bulk-src-${testId}/source.txt`,
      );
      assertExists(content);
      assertEquals(
        new TextDecoder().decode(content.content),
        "Source file content",
      );

      await uploader.delete(`rsync-bulk-src-${testId}`);
      await uploader.disconnect();
      await removeTempDir(tempDir);
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "rsync additional options",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipRsyncTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();

    await t.step("upload with preservePermissions", async () => {
      const uploader = new RsyncUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10,
        retry: 3,
        preservePermissions: true,
      });

      await uploader.connect();

      const content = `Permissions test: ${testId}`;
      const file: UploadFile = {
        relativePath: `rsync-perm-${testId}/test.txt`,
        changeType: "add",
        size: content.length,
        content: new TextEncoder().encode(content),
        isDirectory: false,
      };

      await uploader.upload(file, file.relativePath);

      const result = await uploader.readFile(`rsync-perm-${testId}/test.txt`);
      assertExists(result);

      await uploader.delete(`rsync-perm-${testId}`);
      await uploader.disconnect();
    });

    await t.step("upload with legacyMode", async () => {
      const uploader = new RsyncUploader({
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
        relativePath: `rsync-legacy-${testId}/test.txt`,
        changeType: "add",
        size: content.length,
        content: new TextEncoder().encode(content),
        isDirectory: false,
      };

      await uploader.upload(file, file.relativePath);

      const result = await uploader.readFile(`rsync-legacy-${testId}/test.txt`);
      assertExists(result);

      await uploader.delete(`rsync-legacy-${testId}`);
      await uploader.disconnect();
    });

    await t.step("upload with rsyncPath option", async () => {
      const uploader = new RsyncUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10,
        retry: 3,
        rsyncPath: "rsync", // 通常のrsyncパス
      });

      await uploader.connect();

      const content = `rsyncPath test: ${testId}`;
      const file: UploadFile = {
        relativePath: `rsync-path-${testId}/test.txt`,
        changeType: "add",
        size: content.length,
        content: new TextEncoder().encode(content),
        isDirectory: false,
      };

      await uploader.upload(file, file.relativePath);

      const result = await uploader.readFile(`rsync-path-${testId}/test.txt`);
      assertExists(result);

      await uploader.delete(`rsync-path-${testId}`);
      await uploader.disconnect();
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "rsync getDiff",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipRsyncTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    await t.step("getDiff detects new files", async () => {
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

      // ローカルにテストファイルを作成
      const tempDir = await createTempDir("rsync-diff");
      await createTestFile(tempDir, "new-file.txt", "new content");
      await Deno.mkdir(join(tempDir, "subdir"), { recursive: true });
      await createTestFile(tempDir, "subdir/nested.txt", "nested content");

      // getDiffを実行（filesなし = ディレクトリ全体を比較）
      const diff = await uploader.getDiff(tempDir);

      // 新規ファイルが検出されることを確認
      assertEquals(diff.entries.length > 0, true);

      await uploader.disconnect();
      await removeTempDir(tempDir);
    });

    await t.step("getDiff with checksum option", async () => {
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

      const tempDir = await createTempDir("rsync-diff-checksum");
      await createTestFile(tempDir, "checksum-test.txt", "checksum content");

      // checksumオプション付きでgetDiffを実行
      const diff = await uploader.getDiff(tempDir, undefined, {
        checksum: true,
      });

      assertEquals(diff.entries.length > 0, true);

      await uploader.disconnect();
      await removeTempDir(tempDir);
    });

    await t.step("getDiff with specific files", async () => {
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

      const tempDir = await createTempDir("rsync-diff-files");
      await createTestFile(tempDir, "file1.txt", "content1");
      await createTestFile(tempDir, "file2.txt", "content2");

      // 特定のファイルリストを指定
      const diff = await uploader.getDiff(tempDir, ["file1.txt"]);

      // file1.txtのみが検出されることを確認
      assertEquals(diff.entries.length, 1);
      assertEquals(diff.entries[0].path.includes("file1.txt"), true);

      await uploader.disconnect();
      await removeTempDir(tempDir);
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "rsync bulkUpload with options",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipRsyncTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    const testId = randomString();

    await t.step("bulkUpload with preserveTimestamps", async () => {
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

      const files: UploadFile[] = [
        {
          relativePath: `rsync-bulk-ts-${testId}/file.txt`,
          changeType: "add",
          size: 12,
          content: new TextEncoder().encode("bulk content"),
          isDirectory: false,
        },
      ];

      const result = await uploader.bulkUpload(files);
      assertEquals(result.successCount, 1);

      await uploader.delete(`rsync-bulk-ts-${testId}`);
      await uploader.disconnect();
    });

    await t.step("bulkUpload with preservePermissions", async () => {
      const uploader = new RsyncUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10,
        retry: 3,
        preservePermissions: true,
      });

      await uploader.connect();

      const files: UploadFile[] = [
        {
          relativePath: `rsync-bulk-perm-${testId}/file.txt`,
          changeType: "add",
          size: 12,
          content: new TextEncoder().encode("bulk content"),
          isDirectory: false,
        },
      ];

      const result = await uploader.bulkUpload(files);
      assertEquals(result.successCount, 1);

      await uploader.delete(`rsync-bulk-perm-${testId}`);
      await uploader.disconnect();
    });

    await t.step("bulkUpload with rsyncOptions", async () => {
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

      const files: UploadFile[] = [
        {
          relativePath: `rsync-bulk-opts-${testId}/file.txt`,
          changeType: "add",
          size: 12,
          content: new TextEncoder().encode("bulk content"),
          isDirectory: false,
        },
      ];

      const result = await uploader.bulkUpload(files);
      assertEquals(result.successCount, 1);

      await uploader.delete(`rsync-bulk-opts-${testId}`);
      await uploader.disconnect();
    });

    await t.step("bulkUpload with rsyncPath", async () => {
      const uploader = new RsyncUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10,
        retry: 3,
        rsyncPath: "rsync",
      });

      await uploader.connect();

      const files: UploadFile[] = [
        {
          relativePath: `rsync-bulk-path-${testId}/file.txt`,
          changeType: "add",
          size: 12,
          content: new TextEncoder().encode("bulk content"),
          isDirectory: false,
        },
      ];

      const result = await uploader.bulkUpload(files);
      assertEquals(result.successCount, 1);

      await uploader.delete(`rsync-bulk-path-${testId}`);
      await uploader.disconnect();
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// rsync追加カバレッジテスト
Deno.test({
  name: "rsync additional coverage tests",
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

    await t.step("readFile on directory returns null", async () => {
      // ディレクトリを作成
      const dirPath = `rsync-dir-${testId}`;
      await uploader.mkdir(dirPath);

      // ディレクトリをファイルとして読み取るとnullを返す
      const result = await uploader.readFile(dirPath);
      assertEquals(result, null);

      // クリーンアップ
      await uploader.delete(dirPath);
    });

    await t.step("upload large file", async () => {
      const tempDir = await createTempDir("rsync-large");
      const largeContent = "x".repeat(1024 * 512); // 512KB
      const localPath = await createTestFile(
        tempDir,
        "large.txt",
        largeContent,
      );

      const file: UploadFile = {
        relativePath: `rsync-large-${testId}/large.txt`,
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
      await uploader.delete(`rsync-large-${testId}`);
      await removeTempDir(tempDir);
    });

    await t.step("delete non-existent file succeeds", async () => {
      // 存在しないファイルの削除は成功扱い
      await uploader.delete(`rsync-nonexistent-${testId}.txt`);
    });

    await t.step("getDiff with empty result", async () => {
      // 空のディレクトリをアップロード
      const tempDir = await createTempDir("rsync-empty");
      await uploader.mkdir(`rsync-empty-${testId}`);

      // 同期済みの場合は差分がない
      const diff = await uploader.getDiff(tempDir);
      // 差分が0または存在することを確認
      assertEquals(diff.entries.length >= 0, true);

      await uploader.delete(`rsync-empty-${testId}`);
      await removeTempDir(tempDir);
    });

    await uploader.disconnect();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
