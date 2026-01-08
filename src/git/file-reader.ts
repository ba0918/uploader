/**
 * Git差分ファイルの内容取得モジュール
 *
 * git show <ref>:<path> でファイル内容を取得する
 */

import type { FileContent } from "../types/mod.ts";
import { GitCommandError } from "./diff.ts";

/**
 * Gitコマンドを実行する（バイナリ対応）
 */
async function execGitCommand(
  args: string[],
  cwd?: string,
): Promise<{ stdout: Uint8Array; stderr: Uint8Array; code: number }> {
  const command = new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();
  return { stdout, stderr, code };
}

/**
 * バイナリファイルかどうかを判定
 */
function isBinaryContent(data: Uint8Array): boolean {
  // NULLバイトが含まれているかチェック
  for (let i = 0; i < Math.min(data.length, 8000); i++) {
    if (data[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * 指定したrefのファイル内容を取得
 */
export async function getFileContent(
  ref: string,
  path: string,
  cwd?: string,
): Promise<FileContent> {
  const result = await execGitCommand(["show", `${ref}:${path}`], cwd);

  if (result.code !== 0) {
    const stderrText = new TextDecoder().decode(result.stderr);

    // ファイルが存在しない場合（削除されたファイルのターゲット側など）
    if (
      stderrText.includes("does not exist") ||
      stderrText.includes("exists on disk, but not in")
    ) {
      return {
        path,
        content: null,
        isBinary: false,
      };
    }

    throw new GitCommandError(
      `Failed to get file content: ${ref}:${path}`,
      `git show ${ref}:${path}`,
      stderrText,
      result.code,
    );
  }

  // バイナリファイルかどうかをチェック
  if (isBinaryContent(result.stdout)) {
    return {
      path,
      content: null,
      isBinary: true,
    };
  }

  return {
    path,
    content: new TextDecoder().decode(result.stdout),
    isBinary: false,
  };
}

/**
 * 差分ファイルのベース側とターゲット側の内容を両方取得
 */
export async function getFileDiffContents(
  base: string,
  target: string,
  path: string,
  cwd?: string,
): Promise<{ base: FileContent; target: FileContent }> {
  const [baseContent, targetContent] = await Promise.all([
    getFileContent(base, path, cwd).catch(() => ({
      path,
      content: null,
      isBinary: false,
    })),
    getFileContent(target, path, cwd).catch(() => ({
      path,
      content: null,
      isBinary: false,
    })),
  ]);

  return {
    base: baseContent,
    target: targetContent,
  };
}

/**
 * 複数ファイルの内容を一括取得
 */
export async function getMultipleFileContents(
  ref: string,
  paths: string[],
  cwd?: string,
): Promise<Map<string, FileContent>> {
  const results = new Map<string, FileContent>();

  // 並列で取得
  const promises = paths.map(async (path) => {
    const content = await getFileContent(ref, path, cwd).catch(() => ({
      path,
      content: null,
      isBinary: false,
    }));
    return { path, content };
  });

  const contents = await Promise.all(promises);

  for (const { path, content } of contents) {
    results.set(path, content);
  }

  return results;
}

/**
 * ファイルのバイナリ判定のみを行う
 */
export async function isFileBinary(
  ref: string,
  path: string,
  cwd?: string,
): Promise<boolean> {
  try {
    // git diff --numstat を使ってバイナリ判定
    const command = new Deno.Command("git", {
      args: ["diff", "--numstat", `${ref}~1`, ref, "--", path],
      cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout } = await command.output();
    const output = new TextDecoder().decode(stdout);

    // バイナリファイルの場合は "-\t-\t" で始まる
    return output.startsWith("-\t-\t");
  } catch {
    // エラーの場合はファイル内容を直接チェック
    const content = await getFileContent(ref, path, cwd);
    return content.isBinary;
  }
}

/**
 * ワーキングツリーのファイル内容を取得
 */
export async function getWorkingTreeContent(
  path: string,
  cwd?: string,
): Promise<FileContent> {
  const fullPath = cwd ? `${cwd}/${path}` : path;

  try {
    const data = await Deno.readFile(fullPath);

    if (isBinaryContent(data)) {
      return {
        path,
        content: null,
        isBinary: true,
      };
    }

    return {
      path,
      content: new TextDecoder().decode(data),
      isBinary: false,
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {
        path,
        content: null,
        isBinary: false,
      };
    }
    throw error;
  }
}
