/**
 * 接続失敗テスト
 *
 * このテストはSFTP/SCPの接続失敗（認証エラー、無効なホストなど）をテストする。
 *
 * 注意: custom-cont-init.d/10-rate-limit.shでPerSourcePenalties=noを設定することで、
 * OpenSSH 9.7+の認証失敗ペナルティを無効化している。これにより、テスト間で
 * レート制限が発生することを防いでいる。
 */

import { assertEquals, assertExists } from "@std/assert";
import { SftpUploader } from "../../src/upload/sftp.ts";
import { ScpUploader } from "../../src/upload/scp.ts";
import { RsyncUploader } from "../../src/upload/rsync.ts";
import { DOCKER_CONFIG, shouldSkipIntegrationTests } from "./helpers.ts";
import { join } from "@std/path";

/** SSH鍵ファイルのパス */
const SSH_KEY_PATH = join(
  Deno.cwd(),
  "tests/integration/fixtures/ssh-keys/test_key",
);

// SFTP接続失敗テスト
Deno.test({
  name: "SFTP connection failure handling",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    await t.step("fails with invalid host", async () => {
      const uploader = new SftpUploader({
        host: "invalid.host.local",
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        authType: "password",
        password: DOCKER_CONFIG.sftp.password,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 2000,
        retry: 1,
      });

      let error: Error | null = null;
      try {
        await uploader.connect();
      } catch (e) {
        error = e as Error;
      } finally {
        await uploader.disconnect();
      }

      assertExists(error);
      assertEquals(error.message.includes("Failed to connect"), true);
    });

    await t.step("fails with wrong password", async () => {
      const uploader = new SftpUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        authType: "password",
        password: "wrongpassword",
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 5000,
        retry: 1,
      });

      let error: Error | null = null;
      try {
        await uploader.connect();
      } catch (e) {
        error = e as Error;
      } finally {
        await uploader.disconnect();
      }

      assertExists(error);
      assertEquals(
        error.message.includes("Authentication failed") ||
          error.message.includes("Failed to connect"),
        true,
      );
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// SCP接続失敗テスト
Deno.test({
  name: "SCP connection failure handling",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    await t.step("fails with invalid host", async () => {
      const uploader = new ScpUploader({
        host: "invalid.host.local",
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 2,
        retry: 1,
      });

      let error: Error | null = null;
      try {
        await uploader.connect();
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
      assertEquals(error.message.includes("Failed to connect"), true);
    });

    await t.step("fails with non-existent key file", async () => {
      const uploader = new ScpUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: "/nonexistent/key",
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 5,
        retry: 1,
      });

      let error: Error | null = null;
      try {
        await uploader.connect();
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// rsync接続失敗テスト
Deno.test({
  name: "rsync connection failure handling",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping: ${skipReason}`);
      return;
    }

    await t.step("fails with invalid host", async () => {
      const uploader = new RsyncUploader({
        host: "invalid.host.local",
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 2,
        retry: 1,
      });

      let error: Error | null = null;
      try {
        await uploader.connect();
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
      assertEquals(error.message.includes("Failed to connect"), true);
    });

    await t.step("fails with non-existent key file", async () => {
      const uploader = new RsyncUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: "/nonexistent/key",
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 5,
        retry: 1,
      });

      let error: Error | null = null;
      try {
        await uploader.connect();
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
