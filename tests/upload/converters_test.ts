/**
 * upload/converters.ts のテスト
 */

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { collectedFilesToUploadFiles } from "../../src/upload/converters.ts";
import type { CollectedFile } from "../../src/types/file.ts";

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
