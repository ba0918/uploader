/**
 * 実Git操作の結合テスト
 *
 * 実際の一時Gitリポジトリを作成してテストを行う
 */

import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import {
  getCurrentBranch,
  getDiff,
  getStagedDiff,
  getUntrackedFiles,
  GitCommandError,
  refExists,
} from "../../src/git/diff.ts";
import { getFileContent } from "../../src/git/file-reader.ts";
import { createTempDir, removeTempDir } from "./helpers.ts";

/** Gitコマンドを実行するヘルパー */
async function gitCmd(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const command = new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

/** テスト用Gitリポジトリを初期化 */
async function initTestRepo(tempDir: string): Promise<void> {
  await gitCmd(["init"], tempDir);
  await gitCmd(["config", "user.email", "test@example.com"], tempDir);
  await gitCmd(["config", "user.name", "Test User"], tempDir);
}

/** ファイルを作成してコミット */
async function createAndCommit(
  tempDir: string,
  filename: string,
  content: string,
  message: string,
): Promise<void> {
  const filePath = join(tempDir, filename);
  const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));

  // サブディレクトリがある場合は作成
  if (dirPath !== tempDir && filename.includes("/")) {
    await Deno.mkdir(dirPath, { recursive: true });
  }

  await Deno.writeTextFile(filePath, content);
  await gitCmd(["add", filename], tempDir);
  await gitCmd(["commit", "-m", message], tempDir);
}

Deno.test({
  name: "Git Integration - getDiff with real repository",
  fn: async (t) => {
    const tempDir = await createTempDir("git");

    try {
      await initTestRepo(tempDir);

      await t.step("setup initial commit", async () => {
        await createAndCommit(
          tempDir,
          "initial.txt",
          "Initial content",
          "Initial commit",
        );
      });

      await t.step("create feature branch with changes", async () => {
        await gitCmd(["checkout", "-b", "feature"], tempDir);
        await createAndCommit(
          tempDir,
          "new-file.txt",
          "New file content",
          "Add new file",
        );
        await createAndCommit(
          tempDir,
          "another.txt",
          "Another file",
          "Add another file",
        );

        // ファイル変更
        await Deno.writeTextFile(
          join(tempDir, "initial.txt"),
          "Modified content",
        );
        await gitCmd(["add", "initial.txt"], tempDir);
        await gitCmd(["commit", "-m", "Modify initial file"], tempDir);
      });

      await t.step("getDiff returns correct files", async () => {
        const result = await getDiff("main", "feature", { cwd: tempDir });

        assertEquals(result.base, "main");
        assertEquals(result.target, "feature");
        assertEquals(result.files.length, 3);
        assertEquals(result.added, 2); // new-file.txt, another.txt
        assertEquals(result.modified, 1); // initial.txt
        assertEquals(result.deleted, 0);

        // ファイルパスを確認
        const paths = result.files.map((f) => f.path).sort();
        assertEquals(paths, ["another.txt", "initial.txt", "new-file.txt"]);
      });

      await t.step("getDiff with excludePatterns", async () => {
        const result = await getDiff("main", "feature", {
          cwd: tempDir,
          excludePatterns: ["*.txt"],
        });

        assertEquals(result.files.length, 0);
      });

      await t.step("refExists returns correct values", async () => {
        assertEquals(await refExists("main", tempDir), true);
        assertEquals(await refExists("feature", tempDir), true);
        assertEquals(await refExists("nonexistent", tempDir), false);
      });

      await t.step("getCurrentBranch returns current branch", async () => {
        const branch = await getCurrentBranch(tempDir);
        assertEquals(branch, "feature");

        await gitCmd(["checkout", "main"], tempDir);
        const mainBranch = await getCurrentBranch(tempDir);
        assertEquals(mainBranch, "main");
      });
    } finally {
      await removeTempDir(tempDir);
    }
  },
});

Deno.test({
  name: "Git Integration - getFileContent with real repository",
  fn: async (t) => {
    const tempDir = await createTempDir("git-content");

    try {
      await initTestRepo(tempDir);

      await t.step("setup repository with files", async () => {
        await createAndCommit(
          tempDir,
          "text.txt",
          "Hello, World!",
          "Add text file",
        );
        await createAndCommit(
          tempDir,
          "binary.bin",
          "\x00\x01\x02\x03",
          "Add binary file",
        );
        await createAndCommit(
          tempDir,
          "subdir/nested.txt",
          "Nested content",
          "Add nested file",
        );
      });

      await t.step("getFileContent reads text file", async () => {
        const result = await getFileContent("HEAD", "text.txt", tempDir);
        assertExists(result.content);
        assertEquals(result.content, "Hello, World!");
        assertEquals(result.isBinary, false);
      });

      await t.step("getFileContent reads nested file", async () => {
        const result = await getFileContent(
          "HEAD",
          "subdir/nested.txt",
          tempDir,
        );
        assertExists(result.content);
        assertEquals(result.content, "Nested content");
      });

      await t.step(
        "getFileContent returns null content for non-existent file",
        async () => {
          const result = await getFileContent(
            "HEAD",
            "nonexistent.txt",
            tempDir,
          );
          assertEquals(result.content, null);
        },
      );

      await t.step("getFileContent reads from specific ref", async () => {
        // 新しいブランチでファイル変更
        await gitCmd(["checkout", "-b", "modified"], tempDir);
        await Deno.writeTextFile(join(tempDir, "text.txt"), "Modified!");
        await gitCmd(["add", "text.txt"], tempDir);
        await gitCmd(["commit", "-m", "Modify text"], tempDir);

        // 各refからの内容を確認
        const mainResult = await getFileContent("main", "text.txt", tempDir);
        assertEquals(mainResult.content, "Hello, World!");

        const modifiedResult = await getFileContent(
          "modified",
          "text.txt",
          tempDir,
        );
        assertEquals(modifiedResult.content, "Modified!");
      });
    } finally {
      await removeTempDir(tempDir);
    }
  },
});

Deno.test({
  name: "Git Integration - getStagedDiff",
  fn: async (t) => {
    const tempDir = await createTempDir("git-staged");

    try {
      await initTestRepo(tempDir);
      await createAndCommit(tempDir, "existing.txt", "Existing", "Initial");

      await t.step("getStagedDiff with staged changes", async () => {
        // ステージングされた変更を作成
        await Deno.writeTextFile(join(tempDir, "staged.txt"), "Staged content");
        await gitCmd(["add", "staged.txt"], tempDir);

        await Deno.writeTextFile(
          join(tempDir, "existing.txt"),
          "Modified existing",
        );
        await gitCmd(["add", "existing.txt"], tempDir);

        const result = await getStagedDiff({ cwd: tempDir });

        assertEquals(result.files.length, 2);
        assertEquals(result.added, 1);
        assertEquals(result.modified, 1);
      });

      await t.step("getStagedDiff with no staged changes", async () => {
        await gitCmd(["reset", "HEAD"], tempDir);
        const result = await getStagedDiff({ cwd: tempDir });
        assertEquals(result.files.length, 0);
      });
    } finally {
      await removeTempDir(tempDir);
    }
  },
});

Deno.test({
  name: "Git Integration - getUntrackedFiles",
  fn: async (t) => {
    const tempDir = await createTempDir("git-untracked");

    try {
      await initTestRepo(tempDir);
      await createAndCommit(tempDir, "tracked.txt", "Tracked", "Initial");

      await t.step("getUntrackedFiles lists untracked files", async () => {
        // 未追跡ファイルを作成
        await Deno.writeTextFile(
          join(tempDir, "untracked1.txt"),
          "Untracked 1",
        );
        await Deno.writeTextFile(
          join(tempDir, "untracked2.txt"),
          "Untracked 2",
        );

        const untracked = await getUntrackedFiles(tempDir);

        assertEquals(untracked.length, 2);
        assertEquals(untracked.sort(), ["untracked1.txt", "untracked2.txt"]);
      });

      await t.step("getUntrackedFiles respects gitignore", async () => {
        await Deno.writeTextFile(join(tempDir, ".gitignore"), "*.log\n");
        await gitCmd(["add", ".gitignore"], tempDir);
        await gitCmd(["commit", "-m", "Add gitignore"], tempDir);

        await Deno.writeTextFile(
          join(tempDir, "ignored.log"),
          "Should be ignored",
        );

        const untracked = await getUntrackedFiles(tempDir);

        assertEquals(untracked.includes("ignored.log"), false);
      });
    } finally {
      await removeTempDir(tempDir);
    }
  },
});

Deno.test({
  name: "Git Integration - error handling",
  fn: async (t) => {
    const tempDir = await createTempDir("git-error");

    try {
      await t.step("getDiff throws for non-git directory", async () => {
        let error: Error | null = null;
        try {
          await getDiff("main", "feature", { cwd: tempDir });
        } catch (e) {
          error = e as Error;
        }

        assertExists(error);
        assertEquals(error instanceof GitCommandError, true);
      });

      await initTestRepo(tempDir);
      await createAndCommit(tempDir, "file.txt", "content", "Initial");

      await t.step("getDiff throws for non-existent ref", async () => {
        let error: Error | null = null;
        try {
          await getDiff("main", "nonexistent-branch", { cwd: tempDir });
        } catch (e) {
          error = e as Error;
        }

        assertExists(error);
        assertEquals(error instanceof GitCommandError, true);
        assertEquals(
          (error as GitCommandError).message.includes("does not exist"),
          true,
        );
      });
    } finally {
      await removeTempDir(tempDir);
    }
  },
});

Deno.test({
  name: "Git Integration - rename detection",
  fn: async (t) => {
    const tempDir = await createTempDir("git-rename");

    try {
      await initTestRepo(tempDir);

      await t.step("setup and detect rename", async () => {
        await createAndCommit(tempDir, "original.txt", "Content", "Add file");

        await gitCmd(["checkout", "-b", "rename-branch"], tempDir);
        await gitCmd(["mv", "original.txt", "renamed.txt"], tempDir);
        await gitCmd(["commit", "-m", "Rename file"], tempDir);

        const result = await getDiff("main", "rename-branch", { cwd: tempDir });

        assertEquals(result.renamed, 1);

        const renamedFile = result.files.find((f) => f.status === "R");
        assertExists(renamedFile);
        assertEquals(renamedFile.path, "renamed.txt");
        assertEquals(renamedFile.oldPath, "original.txt");
      });
    } finally {
      await removeTempDir(tempDir);
    }
  },
});
