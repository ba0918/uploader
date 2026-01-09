/**
 * ディレクトリユーティリティのテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ensureParentDir, getParentDir } from "../../src/utils/directory.ts";

describe("getParentDir", () => {
  it("ネストされたパスから親ディレクトリを取得する", () => {
    assertEquals(getParentDir("foo/bar/baz.txt"), "foo/bar");
  });

  it("単一階層のパスから親ディレクトリを取得する", () => {
    assertEquals(getParentDir("foo/bar.txt"), "foo");
  });

  it("ルートレベルのファイルはnullを返す", () => {
    assertEquals(getParentDir("file.txt"), null);
  });

  it("'.'のパスはnullを返す", () => {
    assertEquals(getParentDir("."), null);
  });

  it("空文字列はnullを返す", () => {
    assertEquals(getParentDir(""), null);
  });

  it("絶対パスから親ディレクトリを取得する", () => {
    assertEquals(getParentDir("/home/user/file.txt"), "/home/user");
  });

  it("ディレクトリパスから親ディレクトリを取得する", () => {
    // dirname("foo/bar/") は "foo" を返す（末尾のスラッシュが取り除かれ、"foo/bar" の親）
    assertEquals(getParentDir("foo/bar/"), "foo");
  });
});

describe("ensureParentDir", () => {
  it("親ディレクトリが存在する場合はmkdirを呼び出す", async () => {
    const createdPaths: string[] = [];
    const mockMkdir = (path: string): Promise<void> => {
      createdPaths.push(path);
      return Promise.resolve();
    };

    await ensureParentDir("foo/bar/baz.txt", mockMkdir);
    assertEquals(createdPaths, ["foo/bar"]);
  });

  it("単一階層の場合は親ディレクトリを作成する", async () => {
    const createdPaths: string[] = [];
    const mockMkdir = (path: string): Promise<void> => {
      createdPaths.push(path);
      return Promise.resolve();
    };

    await ensureParentDir("foo/bar.txt", mockMkdir);
    assertEquals(createdPaths, ["foo"]);
  });

  it("ルートレベルのファイルの場合はmkdirを呼び出さない", async () => {
    const createdPaths: string[] = [];
    const mockMkdir = (path: string): Promise<void> => {
      createdPaths.push(path);
      return Promise.resolve();
    };

    await ensureParentDir("file.txt", mockMkdir);
    assertEquals(createdPaths, []);
  });

  it("'.'の場合はmkdirを呼び出さない", async () => {
    const createdPaths: string[] = [];
    const mockMkdir = (path: string): Promise<void> => {
      createdPaths.push(path);
      return Promise.resolve();
    };

    await ensureParentDir(".", mockMkdir);
    assertEquals(createdPaths, []);
  });

  it("空文字列の場合はmkdirを呼び出さない", async () => {
    const createdPaths: string[] = [];
    const mockMkdir = (path: string): Promise<void> => {
      createdPaths.push(path);
      return Promise.resolve();
    };

    await ensureParentDir("", mockMkdir);
    assertEquals(createdPaths, []);
  });

  it("深いネストの場合も親ディレクトリのみを作成する", async () => {
    const createdPaths: string[] = [];
    const mockMkdir = (path: string): Promise<void> => {
      createdPaths.push(path);
      return Promise.resolve();
    };

    await ensureParentDir("a/b/c/d/file.txt", mockMkdir);
    assertEquals(createdPaths, ["a/b/c/d"]);
  });
});
