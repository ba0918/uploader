/**
 * git/file-reader.ts のテスト
 *
 * 実際のgitリポジトリを使用してテスト
 */

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  getFileContent,
  getFileDiffContents,
  getMultipleFileContents,
  getWorkingTreeContent,
  isFileBinary,
} from "../../src/git/file-reader.ts";

// このテストは実際のgitリポジトリ（現在のプロジェクト）を使用する
const cwd = Deno.cwd();

describe("getFileContent", () => {
  it("HEADから既存ファイルの内容を取得できる", async () => {
    // このプロジェクトのREADME.mdを取得
    const result = await getFileContent("HEAD", "README.md", cwd);

    assertExists(result);
    assertEquals(result.path, "README.md");
    assertEquals(result.isBinary, false);
    assertExists(result.content);
    assertEquals(typeof result.content, "string");
  });

  it("存在しないファイルはcontent: nullを返す", async () => {
    const result = await getFileContent(
      "HEAD",
      "nonexistent_file_12345.txt",
      cwd,
    );

    assertEquals(result.path, "nonexistent_file_12345.txt");
    assertEquals(result.content, null);
  });

  it("TypeScriptファイルを正しく取得できる", async () => {
    const result = await getFileContent("HEAD", "main.ts", cwd);

    assertExists(result);
    assertEquals(result.isBinary, false);
    assertExists(result.content);
    // TypeScriptファイルの内容確認
    assertEquals(result.content?.includes("import"), true);
  });

  it("特定のコミットからファイルを取得できる", async () => {
    // HEADから取得（存在するはず）
    const result = await getFileContent("HEAD", "deno.json", cwd);

    assertExists(result);
    assertEquals(result.isBinary, false);
    assertExists(result.content);
    // deno.jsonはJSON形式
    assertEquals(result.content?.includes("{"), true);
  });
});

describe("getFileDiffContents", () => {
  it("ベースとターゲットの両方のファイル内容を取得できる", async () => {
    // HEAD~1とHEADの差分を取得（コミットがある前提）
    const result = await getFileDiffContents(
      "HEAD~1",
      "HEAD",
      "README.md",
      cwd,
    );

    assertExists(result.base);
    assertExists(result.target);
    assertEquals(result.base.path, "README.md");
    assertEquals(result.target.path, "README.md");
  });

  it("ファイルが存在しない場合はnullを返す", async () => {
    const result = await getFileDiffContents(
      "HEAD~1",
      "HEAD",
      "nonexistent_12345.txt",
      cwd,
    );

    assertEquals(result.base.content, null);
    assertEquals(result.target.content, null);
  });
});

describe("getMultipleFileContents", () => {
  it("複数ファイルの内容を一括取得できる", async () => {
    const paths = ["README.md", "deno.json", "main.ts"];
    const results = await getMultipleFileContents("HEAD", paths, cwd);

    assertEquals(results.size, 3);

    for (const path of paths) {
      const content = results.get(path);
      assertExists(content);
      assertEquals(content.path, path);
    }
  });

  it("存在しないファイルはnullコンテンツで返す", async () => {
    const paths = ["README.md", "nonexistent_12345.txt"];
    const results = await getMultipleFileContents("HEAD", paths, cwd);

    assertEquals(results.size, 2);

    const readme = results.get("README.md");
    assertExists(readme?.content);

    const nonexistent = results.get("nonexistent_12345.txt");
    assertEquals(nonexistent?.content, null);
  });

  it("空の配列を渡すと空のMapを返す", async () => {
    const results = await getMultipleFileContents("HEAD", [], cwd);

    assertEquals(results.size, 0);
  });
});

describe("isFileBinary", () => {
  it("テキストファイルはfalseを返す", async () => {
    const result = await isFileBinary("HEAD", "README.md", cwd);

    assertEquals(result, false);
  });

  it("TypeScriptファイルはfalseを返す", async () => {
    const result = await isFileBinary("HEAD", "main.ts", cwd);

    assertEquals(result, false);
  });

  it("JSONファイルはfalseを返す", async () => {
    const result = await isFileBinary("HEAD", "deno.json", cwd);

    assertEquals(result, false);
  });
});

describe("getWorkingTreeContent", () => {
  it("ワーキングツリーのファイルを読み取れる", async () => {
    const result = await getWorkingTreeContent("README.md", cwd);

    assertExists(result);
    assertEquals(result.path, "README.md");
    assertEquals(result.isBinary, false);
    assertExists(result.content);
  });

  it("存在しないファイルはcontent: nullを返す", async () => {
    const result = await getWorkingTreeContent(
      "nonexistent_file_12345.txt",
      cwd,
    );

    assertEquals(result.path, "nonexistent_file_12345.txt");
    assertEquals(result.content, null);
    assertEquals(result.isBinary, false);
  });

  it("TypeScriptファイルを正しく読み取れる", async () => {
    const result = await getWorkingTreeContent("main.ts", cwd);

    assertExists(result);
    assertEquals(result.isBinary, false);
    assertExists(result.content);
    assertEquals(result.content?.includes("import"), true);
  });
});
