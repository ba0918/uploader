/**
 * git/diff.ts のテスト
 */

import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { CommandExecutor, CommandResult } from "../../src/types/mod.ts";
import {
  getCurrentBranch,
  getDiff,
  getStagedDiff,
  getUntrackedFiles,
  GitCommandError,
  matchesExcludePattern,
  parseDiffOutput,
  refExists,
} from "../../src/git/diff.ts";

/** モックエグゼキュータを作成 */
function createMockExecutor(
  responses: Map<string, CommandResult>,
): CommandExecutor {
  return {
    execute(
      command: string,
      args: string[],
    ): Promise<CommandResult> {
      const key = `${command} ${args.join(" ")}`;

      // 完全一致を試みる
      if (responses.has(key)) {
        return Promise.resolve(responses.get(key)!);
      }

      // 部分一致を試みる（diff --name-status など）
      for (const [pattern, result] of responses) {
        if (key.includes(pattern) || pattern.includes(key)) {
          return Promise.resolve(result);
        }
      }

      // デフォルトはエラー
      return Promise.resolve({
        code: 1,
        stdout: new Uint8Array(),
        stderr: new TextEncoder().encode(`Command not found: ${key}`),
      });
    },
  };
}

/** 成功レスポンスを作成 */
function successResponse(output: string): CommandResult {
  return {
    code: 0,
    stdout: new TextEncoder().encode(output),
    stderr: new Uint8Array(),
  };
}

/** 失敗レスポンスを作成 */
function errorResponse(stderr: string, code = 1): CommandResult {
  return {
    code,
    stdout: new Uint8Array(),
    stderr: new TextEncoder().encode(stderr),
  };
}

describe("parseDiffOutput", () => {
  it("空の出力は空配列を返す", () => {
    const result = parseDiffOutput("");
    assertEquals(result, []);
  });

  it("追加されたファイルをパースできる", () => {
    const result = parseDiffOutput("A\tsrc/new-file.ts");
    assertEquals(result.length, 1);
    assertEquals(result[0].status, "A");
    assertEquals(result[0].path, "src/new-file.ts");
  });

  it("変更されたファイルをパースできる", () => {
    const result = parseDiffOutput("M\tsrc/modified.ts");
    assertEquals(result.length, 1);
    assertEquals(result[0].status, "M");
    assertEquals(result[0].path, "src/modified.ts");
  });

  it("削除されたファイルをパースできる", () => {
    const result = parseDiffOutput("D\tsrc/deleted.ts");
    assertEquals(result.length, 1);
    assertEquals(result[0].status, "D");
    assertEquals(result[0].path, "src/deleted.ts");
  });

  it("リネームされたファイルをパースできる", () => {
    const result = parseDiffOutput("R100\told-name.ts\tnew-name.ts");
    assertEquals(result.length, 1);
    assertEquals(result[0].status, "R");
    assertEquals(result[0].path, "new-name.ts");
    assertEquals(result[0].oldPath, "old-name.ts");
    assertEquals(result[0].similarity, 100);
  });

  it("複数ファイルをパースできる", () => {
    const output = `A\tsrc/new.ts
M\tsrc/modified.ts
D\tsrc/deleted.ts`;
    const result = parseDiffOutput(output);
    assertEquals(result.length, 3);
    assertEquals(result[0].status, "A");
    assertEquals(result[1].status, "M");
    assertEquals(result[2].status, "D");
  });

  it("無効な行はスキップされる", () => {
    const output = `A\tvalid.ts
invalid line
M\tanother.ts`;
    const result = parseDiffOutput(output);
    assertEquals(result.length, 2);
  });
});

describe("matchesExcludePattern", () => {
  it("拡張子パターンにマッチする", () => {
    assertEquals(matchesExcludePattern("file.log", ["*.log"]), true);
    assertEquals(matchesExcludePattern("path/to/file.log", ["*.log"]), true);
    assertEquals(matchesExcludePattern("file.txt", ["*.log"]), false);
  });

  it("ディレクトリパターンにマッチする", () => {
    assertEquals(
      matchesExcludePattern("node_modules/pkg/index.js", ["node_modules/"]),
      true,
    );
    assertEquals(
      matchesExcludePattern("node_modules", ["node_modules/"]),
      true,
    );
    assertEquals(
      matchesExcludePattern("src/node_modules/file.js", ["node_modules/"]),
      true,
    );
    assertEquals(
      matchesExcludePattern("src/file.js", ["node_modules/"]),
      false,
    );
  });

  it("複数パターンのいずれかにマッチする", () => {
    const patterns = ["*.log", "node_modules/", ".git/"];
    assertEquals(matchesExcludePattern("error.log", patterns), true);
    assertEquals(matchesExcludePattern("node_modules/pkg.js", patterns), true);
    assertEquals(matchesExcludePattern(".git/config", patterns), true);
    assertEquals(matchesExcludePattern("src/index.ts", patterns), false);
  });

  it("空のパターン配列はマッチしない", () => {
    assertEquals(matchesExcludePattern("any/file.ts", []), false);
  });
});

describe("refExists", () => {
  it("存在するrefはtrueを返す", async () => {
    const executor = createMockExecutor(
      new Map([
        ["git rev-parse --verify HEAD", successResponse("abc123\n")],
      ]),
    );
    const result = await refExists("HEAD", undefined, executor);
    assertEquals(result, true);
  });

  it("存在しないrefはfalseを返す", async () => {
    const executor = createMockExecutor(
      new Map([
        [
          "git rev-parse --verify nonexistent",
          errorResponse("fatal: Needed a single revision", 128),
        ],
      ]),
    );
    const result = await refExists("nonexistent", undefined, executor);
    assertEquals(result, false);
  });
});

describe("getCurrentBranch", () => {
  it("現在のブランチ名を取得できる", async () => {
    const executor = createMockExecutor(
      new Map([
        ["git rev-parse --abbrev-ref HEAD", successResponse("main\n")],
      ]),
    );
    const result = await getCurrentBranch(undefined, executor);
    assertEquals(result, "main");
  });

  it("featureブランチ名を取得できる", async () => {
    const executor = createMockExecutor(
      new Map([
        [
          "git rev-parse --abbrev-ref HEAD",
          successResponse("feature/new-feature\n"),
        ],
      ]),
    );
    const result = await getCurrentBranch(undefined, executor);
    assertEquals(result, "feature/new-feature");
  });
});

describe("getDiff", () => {
  it("差分ファイル一覧を取得できる", async () => {
    const executor = createMockExecutor(
      new Map([
        ["git rev-parse --verify main", successResponse("abc123\n")],
        ["git rev-parse --verify HEAD", successResponse("def456\n")],
        [
          "git diff --name-status main...HEAD",
          successResponse(`A\tsrc/new.ts
M\tsrc/modified.ts
D\tsrc/deleted.ts
`),
        ],
      ]),
    );

    const result = await getDiff("main", "HEAD", { executor });
    assertEquals(result.files.length, 3);
    assertEquals(result.added, 1);
    assertEquals(result.modified, 1);
    assertEquals(result.deleted, 1);
    assertEquals(result.base, "main");
    assertEquals(result.target, "HEAD");
  });

  it("除外パターンでフィルタリングできる", async () => {
    const executor = createMockExecutor(
      new Map([
        ["git rev-parse --verify main", successResponse("abc123\n")],
        ["git rev-parse --verify HEAD", successResponse("def456\n")],
        [
          "git diff --name-status main...HEAD",
          successResponse(`A\tsrc/new.ts
A\terror.log
M\tnode_modules/pkg/index.js
`),
        ],
      ]),
    );

    const result = await getDiff("main", "HEAD", {
      executor,
      excludePatterns: ["*.log", "node_modules/"],
    });
    assertEquals(result.files.length, 1);
    assertEquals(result.files[0].path, "src/new.ts");
  });

  it("存在しないbaseでエラーを投げる", async () => {
    const executor = createMockExecutor(
      new Map([
        [
          "git rev-parse --verify nonexistent",
          errorResponse("fatal: Needed a single revision", 128),
        ],
      ]),
    );

    await assertRejects(
      () => getDiff("nonexistent", "HEAD", { executor }),
      GitCommandError,
      "Base ref does not exist",
    );
  });

  it("存在しないtargetでエラーを投げる", async () => {
    const executor = createMockExecutor(
      new Map([
        ["git rev-parse --verify main", successResponse("abc123\n")],
        [
          "git rev-parse --verify nonexistent",
          errorResponse("fatal: Needed a single revision", 128),
        ],
      ]),
    );

    await assertRejects(
      () => getDiff("main", "nonexistent", { executor }),
      GitCommandError,
      "Target ref does not exist",
    );
  });
});

describe("getUntrackedFiles", () => {
  it("未追跡ファイル一覧を取得できる", async () => {
    const executor = createMockExecutor(
      new Map([
        [
          "git ls-files --others --exclude-standard",
          successResponse(`new-file.ts
another-file.ts
`),
        ],
      ]),
    );

    const result = await getUntrackedFiles(undefined, executor);
    assertEquals(result.length, 2);
    assertEquals(result[0], "new-file.ts");
    assertEquals(result[1], "another-file.ts");
  });

  it("未追跡ファイルがない場合は空配列を返す", async () => {
    const executor = createMockExecutor(
      new Map([
        ["git ls-files --others --exclude-standard", successResponse("")],
      ]),
    );

    const result = await getUntrackedFiles(undefined, executor);
    assertEquals(result.length, 0);
  });
});

describe("getStagedDiff", () => {
  it("ステージされた差分を取得できる", async () => {
    const executor = createMockExecutor(
      new Map([
        [
          "git diff --name-status --cached",
          successResponse(`A\tstaged-new.ts
M\tstaged-modified.ts
`),
        ],
      ]),
    );

    const result = await getStagedDiff({ executor });
    assertEquals(result.files.length, 2);
    assertEquals(result.added, 1);
    assertEquals(result.modified, 1);
    assertEquals(result.base, "HEAD");
    assertEquals(result.target, "staged");
  });

  it("除外パターンでフィルタリングできる", async () => {
    const executor = createMockExecutor(
      new Map([
        [
          "git diff --name-status --cached",
          successResponse(`A\tsrc/file.ts
A\terror.log
`),
        ],
      ]),
    );

    const result = await getStagedDiff({
      executor,
      excludePatterns: ["*.log"],
    });
    assertEquals(result.files.length, 1);
    assertEquals(result.files[0].path, "src/file.ts");
  });
});

describe("GitCommandError", () => {
  it("エラー情報を保持する", () => {
    const error = new GitCommandError(
      "Command failed",
      "git diff",
      "fatal: error",
      128,
    );
    assertEquals(error.name, "GitCommandError");
    assertEquals(error.message, "Command failed");
    assertEquals(error.command, "git diff");
    assertEquals(error.stderr, "fatal: error");
    assertEquals(error.exitCode, 128);
  });
});
