/**
 * upload/filter.ts のテスト
 */

import { assertEquals } from "@std/assert";
import { applyIgnoreFilter } from "../../src/upload/filter.ts";
import type { UploadFile } from "../../src/types/mod.ts";

Deno.test("applyIgnoreFilter - パターンが空の場合はすべてのファイルを返す", () => {
  const files: UploadFile[] = [
    { relativePath: "src/index.ts", size: 100, isDirectory: false },
    { relativePath: "src/utils.ts", size: 200, isDirectory: false },
  ];

  const result = applyIgnoreFilter(files, []);

  assertEquals(result, files);
});

Deno.test("applyIgnoreFilter - *.log パターンでログファイルを除外", () => {
  const files: UploadFile[] = [
    { relativePath: "src/index.ts", size: 100, isDirectory: false },
    { relativePath: "debug.log", size: 200, isDirectory: false },
    { relativePath: "logs/error.log", size: 300, isDirectory: false },
    { relativePath: "src/logger.ts", size: 400, isDirectory: false },
  ];

  const result = applyIgnoreFilter(files, ["*.log"]);

  assertEquals(result.length, 2);
  assertEquals(result[0].relativePath, "src/index.ts");
  assertEquals(result[1].relativePath, "src/logger.ts");
});

Deno.test("applyIgnoreFilter - node_modules/ パターンでディレクトリを除外", () => {
  const files: UploadFile[] = [
    { relativePath: "src/index.ts", size: 100, isDirectory: false },
    {
      relativePath: "node_modules/foo/index.js",
      size: 200,
      isDirectory: false,
    },
    {
      relativePath: "node_modules/bar/lib/utils.js",
      size: 300,
      isDirectory: false,
    },
    { relativePath: "package.json", size: 400, isDirectory: false },
  ];

  const result = applyIgnoreFilter(files, ["node_modules/"]);

  assertEquals(result.length, 2);
  assertEquals(result[0].relativePath, "src/index.ts");
  assertEquals(result[1].relativePath, "package.json");
});

Deno.test("applyIgnoreFilter - **/*.map パターンで .map ファイルを再帰的に除外", () => {
  const files: UploadFile[] = [
    { relativePath: "src/index.js", size: 100, isDirectory: false },
    { relativePath: "src/index.js.map", size: 200, isDirectory: false },
    { relativePath: "dist/bundle.js", size: 300, isDirectory: false },
    { relativePath: "dist/bundle.js.map", size: 400, isDirectory: false },
    {
      relativePath: "dist/vendor/lib.js.map",
      size: 500,
      isDirectory: false,
    },
  ];

  const result = applyIgnoreFilter(files, ["**/*.map"]);

  assertEquals(result.length, 2);
  assertEquals(result[0].relativePath, "src/index.js");
  assertEquals(result[1].relativePath, "dist/bundle.js");
});

Deno.test("applyIgnoreFilter - .git/ パターンで .git ディレクトリを除外", () => {
  const files: UploadFile[] = [
    { relativePath: "src/index.ts", size: 100, isDirectory: false },
    { relativePath: ".git/config", size: 200, isDirectory: false },
    { relativePath: ".git/HEAD", size: 300, isDirectory: false },
    { relativePath: ".gitignore", size: 400, isDirectory: false },
  ];

  const result = applyIgnoreFilter(files, [".git/"]);

  assertEquals(result.length, 2);
  assertEquals(result[0].relativePath, "src/index.ts");
  assertEquals(result[1].relativePath, ".gitignore");
});

Deno.test("applyIgnoreFilter - 複数パターンの組み合わせ", () => {
  const files: UploadFile[] = [
    { relativePath: "src/index.ts", size: 100, isDirectory: false },
    { relativePath: "src/index.js", size: 150, isDirectory: false },
    { relativePath: "debug.log", size: 200, isDirectory: false },
    {
      relativePath: "node_modules/foo/index.js",
      size: 300,
      isDirectory: false,
    },
    { relativePath: "dist/bundle.js.map", size: 400, isDirectory: false },
    { relativePath: "dist/bundle.js", size: 500, isDirectory: false },
    { relativePath: ".git/config", size: 600, isDirectory: false },
  ];

  const result = applyIgnoreFilter(files, [
    "*.log",
    "node_modules/",
    "**/*.map",
    ".git/",
  ]);

  assertEquals(result.length, 3);
  assertEquals(result[0].relativePath, "src/index.ts");
  assertEquals(result[1].relativePath, "src/index.js");
  assertEquals(result[2].relativePath, "dist/bundle.js");
});

Deno.test("applyIgnoreFilter - ディレクトリエントリも正しく除外", () => {
  const files: UploadFile[] = [
    { relativePath: "src", size: 0, isDirectory: true },
    { relativePath: "src/index.ts", size: 100, isDirectory: false },
    { relativePath: "node_modules", size: 0, isDirectory: true },
    {
      relativePath: "node_modules/foo",
      size: 0,
      isDirectory: true,
    },
    {
      relativePath: "node_modules/foo/index.js",
      size: 200,
      isDirectory: false,
    },
  ];

  const result = applyIgnoreFilter(files, ["node_modules/"]);

  assertEquals(result.length, 2);
  assertEquals(result[0].relativePath, "src");
  assertEquals(result[1].relativePath, "src/index.ts");
});

Deno.test("applyIgnoreFilter - changeType が delete のファイルも正しく処理", () => {
  const files: UploadFile[] = [
    {
      relativePath: "src/index.ts",
      size: 100,
      isDirectory: false,
      changeType: "add",
    },
    {
      relativePath: "debug.log",
      size: 0,
      isDirectory: false,
      changeType: "delete",
    },
    {
      relativePath: "src/old.ts",
      size: 0,
      isDirectory: false,
      changeType: "delete",
    },
  ];

  const result = applyIgnoreFilter(files, ["*.log"]);

  assertEquals(result.length, 2);
  assertEquals(result[0].relativePath, "src/index.ts");
  assertEquals(result[1].relativePath, "src/old.ts");
});

Deno.test("applyIgnoreFilter - content プロパティを持つファイルも正しく処理", () => {
  const files: UploadFile[] = [
    {
      relativePath: "src/index.ts",
      content: new Uint8Array([1, 2, 3]),
      size: 3,
      isDirectory: false,
      changeType: "add",
    },
    {
      relativePath: "debug.log",
      content: new Uint8Array([4, 5, 6]),
      size: 3,
      isDirectory: false,
      changeType: "add",
    },
  ];

  const result = applyIgnoreFilter(files, ["*.log"]);

  assertEquals(result.length, 1);
  assertEquals(result[0].relativePath, "src/index.ts");
});

Deno.test("applyIgnoreFilter - 空の配列を渡すと空の配列を返す", () => {
  const result = applyIgnoreFilter([], ["*.log", "node_modules/"]);

  assertEquals(result, []);
});
