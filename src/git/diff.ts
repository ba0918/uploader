/**
 * Git差分取得モジュール
 *
 * git diff --name-status を実行して差分ファイル一覧を取得する
 */

import type { DiffFile, FileChangeType, GitDiffResult } from "../types/mod.ts";

/** Gitコマンド実行エラー */
export class GitCommandError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

/** Git diffの実行オプション */
export interface GitDiffOptions {
  /** 作業ディレクトリ */
  cwd?: string;
  /** 除外パターン */
  excludePatterns?: string[];
}

/**
 * Gitコマンドを実行する
 */
async function execGitCommand(
  args: string[],
  cwd?: string,
): Promise<string> {
  const command = new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const stderrText = new TextDecoder().decode(stderr);
    throw new GitCommandError(
      `Git command failed: git ${args.join(" ")}`,
      `git ${args.join(" ")}`,
      stderrText,
      code,
    );
  }

  return new TextDecoder().decode(stdout);
}

/**
 * 指定したrefが存在するかチェック
 */
export async function refExists(ref: string, cwd?: string): Promise<boolean> {
  try {
    await execGitCommand(["rev-parse", "--verify", ref], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * 現在のブランチ名を取得
 */
export async function getCurrentBranch(cwd?: string): Promise<string> {
  const output = await execGitCommand(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd,
  );
  return output.trim();
}

/**
 * git diff --name-status の出力をパースする
 */
function parseDiffOutput(output: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = output.trim().split("\n").filter((line) => line.length > 0);

  for (const line of lines) {
    const file = parseDiffLine(line);
    if (file) {
      files.push(file);
    }
  }

  return files;
}

/**
 * git diff --name-status の1行をパースする
 */
function parseDiffLine(line: string): DiffFile | null {
  // フォーマット: STATUS\tPATH または STATUS\tOLD_PATH\tNEW_PATH (リネーム/コピー)
  // リネームの場合: R100\toldpath\tnewpath

  const parts = line.split("\t");
  if (parts.length < 2) {
    return null;
  }

  const statusPart = parts[0];
  const status = statusPart[0] as FileChangeType;

  // 有効なステータスかチェック
  if (!["A", "M", "D", "R", "C", "T", "U", "X"].includes(status)) {
    return null;
  }

  // リネームやコピーの場合は類似度と元パスがある
  if (status === "R" || status === "C") {
    if (parts.length < 3) {
      return null;
    }
    const similarity = parseInt(statusPart.slice(1), 10) || undefined;
    return {
      path: parts[2],
      status,
      oldPath: parts[1],
      similarity,
    };
  }

  return {
    path: parts[1],
    status,
  };
}

/**
 * 除外パターンにマッチするかチェック
 */
function matchesExcludePattern(
  filePath: string,
  patterns: string[],
): boolean {
  for (const pattern of patterns) {
    // 末尾の / を除去してディレクトリパターンを処理
    const normalizedPattern = pattern.endsWith("/")
      ? pattern.slice(0, -1)
      : pattern;

    // シンプルなglobマッチング
    // *.ext パターン
    if (normalizedPattern.startsWith("*")) {
      const ext = normalizedPattern.slice(1);
      if (filePath.endsWith(ext)) {
        return true;
      }
    }

    // ディレクトリパターン（パスに含まれているか）
    if (
      filePath.startsWith(normalizedPattern + "/") ||
      filePath === normalizedPattern
    ) {
      return true;
    }

    // パスの一部としてディレクトリが含まれているか
    if (filePath.includes("/" + normalizedPattern + "/")) {
      return true;
    }
  }

  return false;
}

/**
 * 差分ファイル一覧を取得する
 */
export async function getDiff(
  base: string,
  target: string,
  options: GitDiffOptions = {},
): Promise<GitDiffResult> {
  const { cwd, excludePatterns = [] } = options;

  // refが存在するかチェック
  const baseExists = await refExists(base, cwd);
  if (!baseExists) {
    throw new GitCommandError(
      `Base ref does not exist: ${base}`,
      `git rev-parse --verify ${base}`,
      `fatal: Needed a single revision\n`,
      128,
    );
  }

  const targetExists = await refExists(target, cwd);
  if (!targetExists) {
    throw new GitCommandError(
      `Target ref does not exist: ${target}`,
      `git rev-parse --verify ${target}`,
      `fatal: Needed a single revision\n`,
      128,
    );
  }

  // git diff --name-status を実行
  const output = await execGitCommand(
    ["diff", "--name-status", `${base}...${target}`],
    cwd,
  );

  // 出力をパース
  let files = parseDiffOutput(output);

  // 除外パターンでフィルタリング
  if (excludePatterns.length > 0) {
    files = files.filter(
      (file) => !matchesExcludePattern(file.path, excludePatterns),
    );
  }

  // 統計を計算
  const added = files.filter((f) => f.status === "A").length;
  const modified = files.filter((f) => f.status === "M").length;
  const deleted = files.filter((f) => f.status === "D").length;
  const renamed = files.filter((f) => f.status === "R").length;

  return {
    files,
    added,
    modified,
    deleted,
    renamed,
    base,
    target,
  };
}

/**
 * 未追跡ファイルの一覧を取得
 */
export async function getUntrackedFiles(cwd?: string): Promise<string[]> {
  const output = await execGitCommand(
    ["ls-files", "--others", "--exclude-standard"],
    cwd,
  );

  return output.trim().split("\n").filter((line) => line.length > 0);
}

/**
 * ステージングされた変更の差分を取得
 */
export async function getStagedDiff(
  options: GitDiffOptions = {},
): Promise<GitDiffResult> {
  const { cwd, excludePatterns = [] } = options;

  const output = await execGitCommand(
    ["diff", "--name-status", "--cached"],
    cwd,
  );

  let files = parseDiffOutput(output);

  if (excludePatterns.length > 0) {
    files = files.filter(
      (file) => !matchesExcludePattern(file.path, excludePatterns),
    );
  }

  const added = files.filter((f) => f.status === "A").length;
  const modified = files.filter((f) => f.status === "M").length;
  const deleted = files.filter((f) => f.status === "D").length;
  const renamed = files.filter((f) => f.status === "R").length;

  return {
    files,
    added,
    modified,
    deleted,
    renamed,
    base: "HEAD",
    target: "staged",
  };
}
