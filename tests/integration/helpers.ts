/**
 * 結合テスト用ヘルパー関数
 */

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
