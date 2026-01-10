/**
 * upload/converters.ts のテスト
 */

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  collectedFilesToUploadFiles,
  diffFilesToUploadFiles,
} from "../../src/upload/converters.ts";
import type { CollectedFile } from "../../src/types/file.ts";
import type { DiffFile } from "../../src/types/git.ts";

describe("collectedFilesToUploadFiles", () => {
  it("空の配列を変換できる", () => {
    const result = collectedFilesToUploadFiles([]);
    assertEquals(result, []);
  });

  it("単一のファイルを変換できる", () => {
    const files: CollectedFile[] = [
      {
        sourcePath: "/home/user/project/src/main.ts",
        relativePath: "src/main.ts",
        size: 1024,
        mtime: new Date("2024-01-01"),
        isDirectory: false,
      },
    ];

    const result = collectedFilesToUploadFiles(files);

    assertEquals(result.length, 1);
    assertEquals(result[0].sourcePath, "/home/user/project/src/main.ts");
    assertEquals(result[0].relativePath, "src/main.ts");
    assertEquals(result[0].size, 1024);
    assertEquals(result[0].isDirectory, false);
    assertEquals(result[0].changeType, "add");
  });

  it("複数のファイルを変換できる", () => {
    const files: CollectedFile[] = [
      {
        sourcePath: "/home/user/project/src/main.ts",
        relativePath: "src/main.ts",
        size: 1024,
        mtime: new Date("2024-01-01"),
        isDirectory: false,
      },
      {
        sourcePath: "/home/user/project/src/utils.ts",
        relativePath: "src/utils.ts",
        size: 512,
        mtime: new Date("2024-01-02"),
        isDirectory: false,
      },
      {
        sourcePath: "/home/user/project/README.md",
        relativePath: "README.md",
        size: 256,
        mtime: null,
        isDirectory: false,
      },
    ];

    const result = collectedFilesToUploadFiles(files);

    assertEquals(result.length, 3);

    assertEquals(result[0].relativePath, "src/main.ts");
    assertEquals(result[0].size, 1024);

    assertEquals(result[1].relativePath, "src/utils.ts");
    assertEquals(result[1].size, 512);

    assertEquals(result[2].relativePath, "README.md");
    assertEquals(result[2].size, 256);
  });

  it("ディレクトリを変換できる", () => {
    const files: CollectedFile[] = [
      {
        sourcePath: "/home/user/project/src",
        relativePath: "src",
        size: 0,
        mtime: new Date("2024-01-01"),
        isDirectory: true,
      },
    ];

    const result = collectedFilesToUploadFiles(files);

    assertEquals(result.length, 1);
    assertEquals(result[0].relativePath, "src");
    assertEquals(result[0].isDirectory, true);
    assertEquals(result[0].changeType, "add");
  });

  it("ファイルとディレクトリを混合して変換できる", () => {
    const files: CollectedFile[] = [
      {
        sourcePath: "/home/user/project/src",
        relativePath: "src",
        size: 0,
        mtime: new Date("2024-01-01"),
        isDirectory: true,
      },
      {
        sourcePath: "/home/user/project/src/main.ts",
        relativePath: "src/main.ts",
        size: 1024,
        mtime: new Date("2024-01-01"),
        isDirectory: false,
      },
    ];

    const result = collectedFilesToUploadFiles(files);

    assertEquals(result.length, 2);
    assertEquals(result[0].isDirectory, true);
    assertEquals(result[1].isDirectory, false);
  });

  it("すべてのchangeTypeがaddになる", () => {
    const files: CollectedFile[] = [
      {
        sourcePath: "/path/to/file1.txt",
        relativePath: "file1.txt",
        size: 100,
        mtime: null,
        isDirectory: false,
      },
      {
        sourcePath: "/path/to/file2.txt",
        relativePath: "file2.txt",
        size: 200,
        mtime: null,
        isDirectory: false,
      },
    ];

    const result = collectedFilesToUploadFiles(files);

    for (const file of result) {
      assertEquals(file.changeType, "add");
    }
  });

  it("元のファイル情報が正しく引き継がれる", () => {
    const files: CollectedFile[] = [
      {
        sourcePath: "/very/long/path/to/file.txt",
        relativePath: "deep/nested/file.txt",
        size: 9999,
        mtime: new Date("2024-06-15T12:00:00Z"),
        isDirectory: false,
      },
    ];

    const result = collectedFilesToUploadFiles(files);

    assertExists(result[0].sourcePath);
    assertEquals(result[0].sourcePath, "/very/long/path/to/file.txt");
    assertEquals(result[0].relativePath, "deep/nested/file.txt");
    assertEquals(result[0].size, 9999);
  });
});

describe("diffFilesToUploadFiles", () => {
  // 実際のgitリポジトリを使用してテスト

  it("空の配列を変換できる", async () => {
    const result = await diffFilesToUploadFiles([], "HEAD");
    assertEquals(result, []);
  });

  it("削除ステータスのファイルを変換できる", async () => {
    const files: DiffFile[] = [
      { path: "deleted_file.txt", status: "D" },
    ];

    const result = await diffFilesToUploadFiles(files, "HEAD");

    assertEquals(result.length, 1);
    assertEquals(result[0].relativePath, "deleted_file.txt");
    assertEquals(result[0].changeType, "delete");
    assertEquals(result[0].size, 0);
    assertEquals(result[0].isDirectory, false);
  });

  it("複数の削除ファイルを変換できる", async () => {
    const files: DiffFile[] = [
      { path: "file1.txt", status: "D" },
      { path: "file2.txt", status: "D" },
      { path: "dir/file3.txt", status: "D" },
    ];

    const result = await diffFilesToUploadFiles(files, "HEAD");

    assertEquals(result.length, 3);
    for (const file of result) {
      assertEquals(file.changeType, "delete");
      assertEquals(file.size, 0);
    }
  });

  it("追加されたファイルはaddとして変換される", async () => {
    // 実際に存在するファイルを使用
    const files: DiffFile[] = [
      { path: "README.md", status: "A" },
    ];

    const result = await diffFilesToUploadFiles(files, "HEAD");

    // ファイルが存在するのでcontentが取得される
    assertEquals(result.length, 1);
    assertEquals(result[0].relativePath, "README.md");
    assertEquals(result[0].changeType, "add");
    assertExists(result[0].content);
    assertEquals(result[0].size > 0, true);
  });

  it("変更されたファイルはmodifyとして変換される", async () => {
    // 実際に存在するファイルを使用
    const files: DiffFile[] = [
      { path: "main.ts", status: "M" },
    ];

    const result = await diffFilesToUploadFiles(files, "HEAD");

    assertEquals(result.length, 1);
    assertEquals(result[0].relativePath, "main.ts");
    assertEquals(result[0].changeType, "modify");
    assertExists(result[0].content);
  });

  it("存在しないファイルはスキップされる", async () => {
    const files: DiffFile[] = [
      { path: "nonexistent_file_12345.txt", status: "A" },
    ];

    const result = await diffFilesToUploadFiles(files, "HEAD");

    // ファイルが存在しないのでスキップされる
    assertEquals(result.length, 0);
  });

  it("混合ステータスのファイルを正しく処理する", async () => {
    const files: DiffFile[] = [
      { path: "deleted.txt", status: "D" },
      { path: "README.md", status: "M" },
      { path: "deno.json", status: "A" },
    ];

    const result = await diffFilesToUploadFiles(files, "HEAD");

    // 削除ファイルは必ず含まれる
    const deleted = result.find((f) => f.relativePath === "deleted.txt");
    assertExists(deleted);
    assertEquals(deleted.changeType, "delete");

    // 存在するファイルも含まれる
    const modified = result.find((f) => f.relativePath === "README.md");
    assertExists(modified);
    assertEquals(modified.changeType, "modify");

    const added = result.find((f) => f.relativePath === "deno.json");
    assertExists(added);
    assertEquals(added.changeType, "add");
  });

  it("ignoreパターンを適用してファイルをフィルタリング", async () => {
    const files: DiffFile[] = [
      { path: "src/index.ts", status: "A" },
      { path: "debug.log", status: "A" },
      { path: "node_modules/foo/index.js", status: "A" },
    ];

    // ignoreパターンを適用
    const result = await diffFilesToUploadFiles(files, "HEAD", [
      "*.log",
      "node_modules/",
    ]);

    // debug.log と node_modules/ 配下が除外される
    // src/index.ts が存在しない場合はスキップされるため、結果は空か1つ
    const logFile = result.find((f) => f.relativePath === "debug.log");
    assertEquals(logFile, undefined);

    const nodeModulesFile = result.find((f) =>
      f.relativePath.startsWith("node_modules/")
    );
    assertEquals(nodeModulesFile, undefined);
  });

  it("ignoreパターンが空の場合は全てのファイルを処理", async () => {
    const files: DiffFile[] = [
      { path: "deleted1.txt", status: "D" },
      { path: "deleted2.txt", status: "D" },
    ];

    const result = await diffFilesToUploadFiles(files, "HEAD", []);

    assertEquals(result.length, 2);
    assertEquals(result[0].relativePath, "deleted1.txt");
    assertEquals(result[1].relativePath, "deleted2.txt");
  });

  it("ignoreパターンを省略した場合はフィルタリングなし", async () => {
    const files: DiffFile[] = [
      { path: "file1.txt", status: "D" },
      { path: "file2.txt", status: "D" },
    ];

    // ignorePatterns を省略
    const result = await diffFilesToUploadFiles(files, "HEAD");

    assertEquals(result.length, 2);
  });

  it("削除ファイルもignoreパターンで除外される", async () => {
    const files: DiffFile[] = [
      { path: "src/index.ts", status: "D" },
      { path: "debug.log", status: "D" },
      { path: "node_modules/foo/index.js", status: "D" },
    ];

    const result = await diffFilesToUploadFiles(files, "HEAD", [
      "*.log",
      "node_modules/",
    ]);

    // src/index.ts のみ残る
    assertEquals(result.length, 1);
    assertEquals(result[0].relativePath, "src/index.ts");
  });
});
