/**
 * 結合テスト用ヘルパー関数
 */

import { join, relative } from "@std/path";
import type { Uploader, UploadFile } from "../../src/types/mod.ts";

/** Docker環境の設定 */
export const DOCKER_CONFIG = {
  sftp: {
    host: "localhost",
    port: 2222,
    user: "testuser",
    password: "testpass",
    // atmoz/sftpはchrootを使用するため、パスは/uploadとなる
    // 実際のパス: /home/testuser/upload -> chroot後: /upload
    dest: "/upload",
  },
};

/** Dockerコンテナが起動しているかチェック */
export async function isDockerRunning(): Promise<boolean> {
  try {
    const command = new Deno.Command("docker", {
      args: [
        "compose",
        "-f",
        "docker-compose.test.yml",
        "ps",
        "--format",
        "json",
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout } = await command.output();
    if (code !== 0) return false;

    const output = new TextDecoder().decode(stdout);
    if (!output.trim()) return false;

    // JSONLinesフォーマットで出力される
    const lines = output.trim().split("\n");
    for (const line of lines) {
      try {
        const container = JSON.parse(line);
        if (container.Service === "sftp" && container.State === "running") {
          return true;
        }
      } catch {
        // JSON解析失敗は無視
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** SFTPサーバーに接続可能かチェック */
export async function isSftpReachable(): Promise<boolean> {
  try {
    const command = new Deno.Command("ssh-keyscan", {
      args: ["-p", String(DOCKER_CONFIG.sftp.port), DOCKER_CONFIG.sftp.host],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout } = await command.output();
    const output = new TextDecoder().decode(stdout);
    return code === 0 && output.length > 0;
  } catch {
    return false;
  }
}

/** テスト用の一時ディレクトリを作成 */
export async function createTempDir(prefix: string): Promise<string> {
  return await Deno.makeTempDir({ prefix: `uploader_test_${prefix}_` });
}

/** ディレクトリを再帰的に削除 */
export async function removeTempDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // 削除失敗は無視
  }
}

/** テスト用ファイルを作成 */
export async function createTestFile(
  dir: string,
  name: string,
  content: string,
): Promise<string> {
  const path = `${dir}/${name}`;
  await Deno.writeTextFile(path, content);
  return path;
}

/** ファイル内容を読み取り */
export async function readFileContent(path: string): Promise<string> {
  return await Deno.readTextFile(path);
}

/** テスト用のランダム文字列を生成 */
export function randomString(length: number = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** 待機 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 結合テストをスキップすべきかどうか */
export async function shouldSkipIntegrationTests(): Promise<string | null> {
  // CI環境でなく、Dockerが起動していない場合はスキップ
  const isCI = Deno.env.get("CI") === "true";
  const forceRun = Deno.env.get("RUN_INTEGRATION_TESTS") === "true";

  if (forceRun) {
    return null;
  }

  const dockerRunning = await isDockerRunning();
  if (!dockerRunning) {
    if (isCI) {
      return "Docker is not running in CI environment";
    }
    return "Docker is not running. Start with: docker compose -f docker-compose.test.yml up -d";
  }

  const sftpReachable = await isSftpReachable();
  if (!sftpReachable) {
    return "SFTP server is not reachable. Wait for container to start.";
  }

  return null;
}

// ============================================================
// Mirror mode test helpers (Phase I1)
// ============================================================

/** mirrorテスト用のリモートファイルを準備 */
export async function setupRemoteFiles(
  uploader: Uploader,
  baseDir: string,
  files: Array<{ path: string; content: string }>,
): Promise<void> {
  await uploader.connect();

  try {
    // baseDirを明示的に作成
    await uploader.mkdir(baseDir);

    // 各ファイルをアップロード（baseDir配下に配置）
    for (const file of files) {
      const content = new TextEncoder().encode(file.content);
      const remotePath = `${baseDir}/${file.path}`;

      const uploadFile: UploadFile = {
        relativePath: remotePath,
        size: content.length,
        content,
        isDirectory: false,
        changeType: "add",
      };

      await uploader.upload(uploadFile, remotePath);
    }
  } finally {
    await uploader.disconnect();
  }
}

/** リモートファイルの存在確認 */
export async function verifyRemoteFileExists(
  uploader: Uploader,
  path: string,
): Promise<boolean> {
  await uploader.connect();
  try {
    const result = await uploader.readFile(path);
    return result !== null;
  } catch {
    return false;
  } finally {
    await uploader.disconnect();
  }
}

/** リモートファイルの不存在確認 */
export async function verifyRemoteFileNotExists(
  uploader: Uploader,
  path: string,
): Promise<boolean> {
  const exists = await verifyRemoteFileExists(uploader, path);
  return !exists;
}

/** リモートディレクトリを再帰的に削除 */
export async function cleanupRemoteDir(
  uploader: Uploader,
  baseDir: string,
): Promise<void> {
  await uploader.connect();
  try {
    // baseDirを再帰的に削除
    await uploader.delete(baseDir);
  } catch {
    // 削除失敗は無視（存在しない場合など）
  } finally {
    await uploader.disconnect();
  }
}

/** ローカルディレクトリからUploadFile配列を再帰的に収集 */
export async function collectLocalFiles(
  dir: string,
  baseDir: string = dir,
): Promise<UploadFile[]> {
  const files: UploadFile[] = [];

  for await (const entry of Deno.readDir(dir)) {
    const fullPath = join(dir, entry.name);
    const relativePath = relative(baseDir, fullPath);

    if (entry.isFile) {
      const stat = await Deno.stat(fullPath);
      files.push({
        sourcePath: fullPath,
        relativePath,
        size: stat.size,
        isDirectory: false,
      });
    } else if (entry.isDirectory) {
      // 再帰的に収集
      const subFiles = await collectLocalFiles(fullPath, baseDir);
      files.push(...subFiles);
    }
  }

  return files;
}

/** UploadFile配列を実行（add/modify/delete） */
export async function executeUploadFiles(
  uploader: Uploader,
  files: UploadFile[],
  baseDest: string,
): Promise<void> {
  await uploader.connect();

  try {
    for (const file of files) {
      // baseDest が空文字列の場合は、file.relativePathをそのまま使用
      const remotePath = baseDest
        ? `${baseDest}/${file.relativePath}`
        : file.relativePath;

      if (file.changeType === "delete") {
        // 削除
        await uploader.delete(remotePath);
      } else {
        // アップロード（add/modify）
        await uploader.upload(file, remotePath);
      }
    }
  } finally {
    await uploader.disconnect();
  }
}
