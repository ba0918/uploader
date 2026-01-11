/**
 * Mirror Mode Integration Tests (Phase I1)
 *
 * 事前準備:
 * 1. tests/integration/scripts/setup-ssh-keys.sh
 * 2. docker compose -f docker-compose.test.yml up -d
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { RsyncUploader } from "../../src/upload/rsync.ts";
import { SftpUploader } from "../../src/upload/sftp.ts";
import { ScpUploader } from "../../src/upload/scp.ts";
import { LocalUploader } from "../../src/upload/local.ts";
import {
  cleanupRemoteDir,
  collectLocalFiles,
  createTempDir,
  createTestFile,
  DOCKER_CONFIG,
  executeUploadFiles,
  randomString,
  removeTempDir,
  setupRemoteFiles,
  shouldSkipIntegrationTests,
  verifyRemoteFileExists,
  verifyRemoteFileNotExists,
} from "./helpers.ts";
import { prepareMirrorSync } from "../../src/upload/mirror.ts";

/** SSH鍵ファイルのパス */
const SSH_KEY_PATH = join(
  Deno.cwd(),
  "tests/integration/fixtures/ssh-keys/test_key",
);

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

Deno.test({
  name: "Mirror Mode Integration Tests",
  ignore: false,
  fn: async (t) => {
    const skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping mirror mode tests: ${skipReason}`);
      return;
    }

    // =================================================================
    // Scenario 1: rsync + mirror + ignore (CUI)
    // =================================================================
    await t.step("rsync + mirror + ignore (CUI)", async () => {
      // rsyncが利用可能かチェック
      if (!(await isRsyncAvailable())) {
        console.log("Skipping rsync test: rsync command not found");
        return;
      }

      const testId = randomString();
      const baseDir = `mirror-test-${testId}`;

      // 1. リモートに初期ファイルを準備
      const rsyncUploader = new RsyncUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10000,
        retry: 3,
      });

      await setupRemoteFiles(rsyncUploader, baseDir, [
        { path: "file1.txt", content: "File 1 (exists in local)" },
        { path: "old.txt", content: "Old file (should be deleted)" },
        { path: "debug.log", content: "Debug log (should NOT be deleted)" },
        { path: "test.log", content: "Test log (should NOT be deleted)" },
      ]);

      // 2. ローカルに新しいファイルを準備
      const tempDir = await createTempDir("mirror-rsync");
      await createTestFile(tempDir, "file1.txt", "File 1 updated");
      await createTestFile(tempDir, "file2.txt", "File 2 (new file)");

      // 3. ローカルファイルを収集
      let localFiles = await collectLocalFiles(tempDir);

      // relativePathにbaseDirを追加（dest配下の相対パスにする）
      localFiles = localFiles.map((file) => ({
        ...file,
        relativePath: `${baseDir}/${file.relativePath}`,
      }));

      // 4. ignoreパターンを定義（*.log は削除しない）
      const ignorePatterns = ["*.log"];

      // 5. prepareMirrorSync()を呼び出して削除対象を検出
      // prepareMirrorSync()はlistRemoteFiles()を呼び出すため、事前に接続が必要
      await rsyncUploader.connect();
      try {
        const uploadFiles = await prepareMirrorSync(
          rsyncUploader,
          localFiles,
          ignorePatterns,
        );
        await rsyncUploader.disconnect();

        // 6. アップロード/削除を実行
        // relativePathは既にbaseDir含みなので、baseDest は空文字列
        await executeUploadFiles(rsyncUploader, uploadFiles, "");
      } finally {
        // 確実に切断
        try {
          await rsyncUploader.disconnect();
        } catch {
          // 切断失敗は無視
        }
      }

      // 7. 検証: リモートのファイル状態を確認
      // file1.txt: 更新されている（存在する）
      const file1Exists = await verifyRemoteFileExists(
        rsyncUploader,
        `${baseDir}/file1.txt`,
      );
      assertEquals(file1Exists, true, "file1.txt should exist (updated)");

      // file2.txt: 新規追加されている（存在する）
      const file2Exists = await verifyRemoteFileExists(
        rsyncUploader,
        `${baseDir}/file2.txt`,
      );
      assertEquals(file2Exists, true, "file2.txt should exist (newly added)");

      // old.txt: 削除されている（存在しない）
      const oldExists = await verifyRemoteFileNotExists(
        rsyncUploader,
        `${baseDir}/old.txt`,
      );
      assertEquals(oldExists, true, "old.txt should NOT exist (deleted)");

      // debug.log: ignoreパターンで削除されない（存在する）
      const debugLogExists = await verifyRemoteFileExists(
        rsyncUploader,
        `${baseDir}/debug.log`,
      );
      assertEquals(
        debugLogExists,
        true,
        "debug.log should exist (ignored by pattern)",
      );

      // test.log: ignoreパターンで削除されない（存在する）
      const testLogExists = await verifyRemoteFileExists(
        rsyncUploader,
        `${baseDir}/test.log`,
      );
      assertEquals(
        testLogExists,
        true,
        "test.log should exist (ignored by pattern)",
      );

      // 8. クリーンアップ
      await cleanupRemoteDir(rsyncUploader, baseDir);
      await removeTempDir(tempDir);
    });

    // =================================================================
    // Scenario 2: sftp + mirror + ignore (GUI)
    // =================================================================
    await t.step("sftp + mirror + ignore (GUI)", async () => {
      const testId = randomString();
      const baseDir = `mirror-test-${testId}`;

      // 1. リモートに初期ファイルを準備
      const sftpUploader = new SftpUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        authType: "password",
        password: DOCKER_CONFIG.sftp.password,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10000,
        retry: 3,
      });

      await setupRemoteFiles(sftpUploader, baseDir, [
        { path: "src/index.ts", content: "index" },
        { path: "src/old.ts", content: "old (should be deleted)" },
        { path: "node_modules/foo/index.js", content: "foo" },
        { path: "dist/bundle.js", content: "bundle" },
      ]);

      // 2. ローカルに新しいファイルを準備
      const tempDir = await createTempDir("mirror-sftp");
      await Deno.mkdir(join(tempDir, "src"), { recursive: true });
      await createTestFile(tempDir, "src/index.ts", "index updated");
      await createTestFile(tempDir, "src/new.ts", "new file");

      // 3. ローカルファイルを収集
      let localFiles = await collectLocalFiles(tempDir);

      // relativePathにbaseDirを追加（dest配下の相対パスにする）
      localFiles = localFiles.map((file) => ({
        ...file,
        relativePath: `${baseDir}/${file.relativePath}`,
      }));

      // 4. ignoreパターンを定義（node_modules, dist は削除しない）
      // relativePathにはbaseDirが含まれているので、パターンも調整する
      const ignorePatterns = [
        `${baseDir}/node_modules/**`,
        `${baseDir}/dist/**`,
      ];

      // 5. prepareMirrorSync()を呼び出して削除対象を検出
      // prepareMirrorSync()はlistRemoteFiles()を呼び出すため、事前に接続が必要
      await sftpUploader.connect();
      try {
        const uploadFiles = await prepareMirrorSync(
          sftpUploader,
          localFiles,
          ignorePatterns,
        );
        await sftpUploader.disconnect();

        // 6. アップロード/削除を実行
        // relativePathは既にbaseDir含みなので、baseDest は空文字列
        await executeUploadFiles(sftpUploader, uploadFiles, "");
      } finally {
        // 確実に切断
        try {
          await sftpUploader.disconnect();
        } catch {
          // 切断失敗は無視
        }
      }

      // 7. 検証: リモートのファイル状態を確認
      // src/index.ts: 更新されている（存在する）
      const indexExists = await verifyRemoteFileExists(
        sftpUploader,
        `${baseDir}/src/index.ts`,
      );
      assertEquals(indexExists, true, "src/index.ts should exist (updated)");

      // src/new.ts: 新規追加されている（存在する）
      const newExists = await verifyRemoteFileExists(
        sftpUploader,
        `${baseDir}/src/new.ts`,
      );
      assertEquals(newExists, true, "src/new.ts should exist (newly added)");

      // src/old.ts: 削除されている（存在しない）
      const oldExists = await verifyRemoteFileNotExists(
        sftpUploader,
        `${baseDir}/src/old.ts`,
      );
      assertEquals(oldExists, true, "src/old.ts should NOT exist (deleted)");

      // node_modules/foo/index.js: ignoreパターンで削除されない（存在する）
      const nodeModulesExists = await verifyRemoteFileExists(
        sftpUploader,
        `${baseDir}/node_modules/foo/index.js`,
      );
      assertEquals(
        nodeModulesExists,
        true,
        "node_modules/foo/index.js should exist (ignored by pattern)",
      );

      // dist/bundle.js: ignoreパターンで削除されない（存在する）
      const distExists = await verifyRemoteFileExists(
        sftpUploader,
        `${baseDir}/dist/bundle.js`,
      );
      assertEquals(
        distExists,
        true,
        "dist/bundle.js should exist (ignored by pattern)",
      );

      // 8. クリーンアップ
      await cleanupRemoteDir(sftpUploader, baseDir);
      await removeTempDir(tempDir);
    });

    // =================================================================
    // Scenario 3: scp + mirror (no ignore)
    // =================================================================
    await t.step("scp + mirror (no ignore)", async () => {
      const testId = randomString();
      const baseDir = `mirror-test-${testId}`;

      // 1. リモートに初期ファイルを準備
      const scpUploader = new ScpUploader({
        host: DOCKER_CONFIG.sftp.host,
        port: DOCKER_CONFIG.sftp.port,
        user: DOCKER_CONFIG.sftp.user,
        keyFile: SSH_KEY_PATH,
        dest: DOCKER_CONFIG.sftp.dest,
        timeout: 10000,
        retry: 3,
      });

      await setupRemoteFiles(scpUploader, baseDir, [
        { path: "app.js", content: "app" },
        { path: "old1.js", content: "old1 (should be deleted)" },
        { path: "old2.js", content: "old2 (should be deleted)" },
        { path: "legacy.txt", content: "legacy (should be deleted)" },
      ]);

      // 2. ローカルに新しいファイルを準備
      const tempDir = await createTempDir("mirror-scp");
      await createTestFile(tempDir, "app.js", "app updated");

      // 3. ローカルファイルを収集
      let localFiles = await collectLocalFiles(tempDir);

      // relativePathにbaseDirを追加（dest配下の相対パスにする）
      localFiles = localFiles.map((file) => ({
        ...file,
        relativePath: `${baseDir}/${file.relativePath}`,
      }));

      // 4. ignoreパターン: なし（全リモート専用ファイルを削除）
      const ignorePatterns: string[] = [];

      // 5. prepareMirrorSync()を呼び出して削除対象を検出
      // prepareMirrorSync()はlistRemoteFiles()を呼び出すため、事前に接続が必要
      await scpUploader.connect();
      try {
        const uploadFiles = await prepareMirrorSync(
          scpUploader,
          localFiles,
          ignorePatterns,
        );
        await scpUploader.disconnect();

        // 6. アップロード/削除を実行
        // relativePathは既にbaseDir含みなので、baseDest は空文字列
        await executeUploadFiles(scpUploader, uploadFiles, "");
      } finally {
        // 確実に切断
        try {
          await scpUploader.disconnect();
        } catch {
          // 切断失敗は無視
        }
      }

      // 7. 検証: リモートのファイル状態を確認
      // app.js: 更新されている（存在する）
      const appExists = await verifyRemoteFileExists(
        scpUploader,
        `${baseDir}/app.js`,
      );
      assertEquals(appExists, true, "app.js should exist (updated)");

      // old1.js: 削除されている（存在しない）
      const old1Exists = await verifyRemoteFileNotExists(
        scpUploader,
        `${baseDir}/old1.js`,
      );
      assertEquals(old1Exists, true, "old1.js should NOT exist (deleted)");

      // old2.js: 削除されている（存在しない）
      const old2Exists = await verifyRemoteFileNotExists(
        scpUploader,
        `${baseDir}/old2.js`,
      );
      assertEquals(old2Exists, true, "old2.js should NOT exist (deleted)");

      // legacy.txt: 削除されている（存在しない）
      const legacyExists = await verifyRemoteFileNotExists(
        scpUploader,
        `${baseDir}/legacy.txt`,
      );
      assertEquals(legacyExists, true, "legacy.txt should NOT exist (deleted)");

      // 8. クリーンアップ
      await cleanupRemoteDir(scpUploader, baseDir);
      await removeTempDir(tempDir);
    });

    // =================================================================
    // Scenario 4: local + mirror + ignore
    // =================================================================
    await t.step("local + mirror + ignore", async () => {
      // 1. ソースディレクトリを作成
      const sourceDir = await createTempDir("mirror-local-src");
      await createTestFile(sourceDir, "index.html", "<html>index</html>");
      await createTestFile(sourceDir, "style.css", "body {}");

      // 2. デスティネーションディレクトリを作成（初期ファイル配置）
      const destDir = await createTempDir("mirror-local-dest");
      await createTestFile(destDir, "index.html", "<html>old index</html>");
      await createTestFile(destDir, "old.html", "<html>old</html>");
      await Deno.mkdir(join(destDir, ".git"), { recursive: true });
      await createTestFile(
        destDir,
        ".git/config",
        "[core]\nrepositoryformatversion = 0",
      );
      await createTestFile(destDir, ".DS_Store", "binary data");

      // 3. LocalUploaderを作成
      const localUploader = new LocalUploader({
        dest: destDir,
      });

      // 4. ローカルファイルを収集
      const localFiles = await collectLocalFiles(sourceDir);

      // 5. ignoreパターンを定義（.git/**, .DS_Store は削除しない）
      const ignorePatterns = [".git/**", ".DS_Store"];

      // 6. prepareMirrorSync()を呼び出して削除対象を検出
      // prepareMirrorSync()はlistRemoteFiles()を呼び出すため、事前に接続が必要
      await localUploader.connect();
      try {
        const uploadFiles = await prepareMirrorSync(
          localUploader,
          localFiles,
          ignorePatterns,
        );
        await localUploader.disconnect();

        // 7. アップロード/削除を実行
        // LocalUploaderの場合、baseDest は空文字列（destがベースディレクトリ）
        await executeUploadFiles(localUploader, uploadFiles, "");
      } finally {
        // 確実に切断
        try {
          await localUploader.disconnect();
        } catch {
          // 切断失敗は無視
        }
      }

      // 8. 検証: デスティネーションのファイル状態を確認
      // index.html: 更新されている（存在する）
      const indexExists = await Deno.stat(join(destDir, "index.html"))
        .then(() => true)
        .catch(() => false);
      assertEquals(indexExists, true, "index.html should exist (updated)");

      // style.css: 新規追加されている（存在する）
      const styleExists = await Deno.stat(join(destDir, "style.css"))
        .then(() => true)
        .catch(() => false);
      assertEquals(styleExists, true, "style.css should exist (newly added)");

      // old.html: 削除されている（存在しない）
      const oldExists = await Deno.stat(join(destDir, "old.html"))
        .then(() => false)
        .catch(() => true);
      assertEquals(oldExists, true, "old.html should NOT exist (deleted)");

      // .git/config: ignoreパターンで削除されない（存在する）
      const gitExists = await Deno.stat(join(destDir, ".git/config"))
        .then(() => true)
        .catch(() => false);
      assertEquals(
        gitExists,
        true,
        ".git/config should exist (ignored by pattern)",
      );

      // .DS_Store: ignoreパターンで削除されない（存在する）
      const dsStoreExists = await Deno.stat(join(destDir, ".DS_Store"))
        .then(() => true)
        .catch(() => false);
      assertEquals(
        dsStoreExists,
        true,
        ".DS_Store should exist (ignored by pattern)",
      );

      // 9. クリーンアップ
      await removeTempDir(sourceDir);
      await removeTempDir(destDir);
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
