/**
 * ツリー構造変換ユーティリティのテスト
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals } from "jsr:@std/assert";
import type { DiffFile } from "../../src/types/mod.ts";
import {
  buildRootLevelTree,
  buildTree,
  getDirectChildren,
  shouldUseLazyLoading,
} from "../../src/utils/tree.ts";

describe("buildTree", () => {
  it("空の配列から空のツリーを生成する", () => {
    const files: DiffFile[] = [];
    const result = buildTree(files);
    assertEquals(result, []);
  });

  it("ルートレベルのファイルを正しく処理する", () => {
    const files: DiffFile[] = [
      { path: "file1.ts", status: "A" },
      { path: "file2.ts", status: "M" },
    ];
    const result = buildTree(files);

    assertEquals(result.length, 2);
    assertEquals(result[0].name, "file1.ts");
    assertEquals(result[0].type, "file");
    assertEquals(result[0].status, "A");
    assertEquals(result[1].name, "file2.ts");
    assertEquals(result[1].type, "file");
    assertEquals(result[1].status, "M");
  });

  it("ディレクトリ構造を正しく構築する", () => {
    const files: DiffFile[] = [
      { path: "src/index.ts", status: "A" },
      { path: "src/utils/helper.ts", status: "M" },
    ];
    const result = buildTree(files);

    assertEquals(result.length, 1);
    assertEquals(result[0].name, "src");
    assertEquals(result[0].type, "directory");
    assertEquals(result[0].fileCount, 2);
    assertEquals(result[0].children?.length, 2);
  });

  it("ディレクトリを優先してソートする", () => {
    const files: DiffFile[] = [
      { path: "b.ts", status: "A" },
      { path: "a/file.ts", status: "A" },
    ];
    const result = buildTree(files);

    assertEquals(result.length, 2);
    assertEquals(result[0].type, "directory"); // ディレクトリが先
    assertEquals(result[0].name, "a");
    assertEquals(result[1].type, "file"); // ファイルが後
    assertEquals(result[1].name, "b.ts");
  });

  it("同じタイプ内では名前順にソートする", () => {
    const files: DiffFile[] = [
      { path: "z.ts", status: "A" },
      { path: "a.ts", status: "M" },
      { path: "m.ts", status: "D" },
    ];
    const result = buildTree(files);

    assertEquals(result[0].name, "a.ts");
    assertEquals(result[1].name, "m.ts");
    assertEquals(result[2].name, "z.ts");
  });
});

describe("buildRootLevelTree", () => {
  it("空の配列から空のツリーを生成する", () => {
    const files: DiffFile[] = [];
    const result = buildRootLevelTree(files);
    assertEquals(result, []);
  });

  it("ルートレベルのファイルのみを返す", () => {
    const files: DiffFile[] = [
      { path: "file.ts", status: "A" },
    ];
    const result = buildRootLevelTree(files);

    assertEquals(result.length, 1);
    assertEquals(result[0].name, "file.ts");
    assertEquals(result[0].type, "file");
    assertEquals(result[0].loaded, undefined);
  });

  it("ルートレベルのディレクトリは未読み込み状態", () => {
    const files: DiffFile[] = [
      { path: "src/index.ts", status: "A" },
      { path: "src/utils/helper.ts", status: "M" },
    ];
    const result = buildRootLevelTree(files);

    assertEquals(result.length, 1);
    assertEquals(result[0].name, "src");
    assertEquals(result[0].type, "directory");
    assertEquals(result[0].loaded, false);
    assertEquals(result[0].children, []);
    assertEquals(result[0].fileCount, 2);
  });

  it("複数のルートレベルアイテムを処理する", () => {
    const files: DiffFile[] = [
      { path: "config.json", status: "M" },
      { path: "src/index.ts", status: "A" },
      { path: "tests/test.ts", status: "A" },
    ];
    const result = buildRootLevelTree(files);

    assertEquals(result.length, 3);
    // ディレクトリが先、ファイルが後
    assertEquals(result[0].name, "src");
    assertEquals(result[0].type, "directory");
    assertEquals(result[1].name, "tests");
    assertEquals(result[1].type, "directory");
    assertEquals(result[2].name, "config.json");
    assertEquals(result[2].type, "file");
  });
});

describe("getDirectChildren", () => {
  it("空の配列から空の結果を返す", () => {
    const files: DiffFile[] = [];
    const result = getDirectChildren(files, "src");
    assertEquals(result, []);
  });

  it("該当するファイルがない場合は空を返す", () => {
    const files: DiffFile[] = [
      { path: "other/file.ts", status: "A" },
    ];
    const result = getDirectChildren(files, "src");
    assertEquals(result, []);
  });

  it("直下のファイルを取得する", () => {
    const files: DiffFile[] = [
      { path: "src/index.ts", status: "A" },
      { path: "src/app.ts", status: "M" },
    ];
    const result = getDirectChildren(files, "src");

    assertEquals(result.length, 2);
    assertEquals(result[0].name, "app.ts");
    assertEquals(result[0].type, "file");
    assertEquals(result[1].name, "index.ts");
    assertEquals(result[1].type, "file");
  });

  it("直下のディレクトリを取得する", () => {
    const files: DiffFile[] = [
      { path: "src/utils/helper.ts", status: "A" },
      { path: "src/utils/format.ts", status: "M" },
    ];
    const result = getDirectChildren(files, "src");

    assertEquals(result.length, 1);
    assertEquals(result[0].name, "utils");
    assertEquals(result[0].type, "directory");
    assertEquals(result[0].loaded, false);
    assertEquals(result[0].fileCount, 2);
  });

  it("ネストされたディレクトリの子を取得する", () => {
    const files: DiffFile[] = [
      { path: "src/utils/helper.ts", status: "A" },
      { path: "src/utils/format/date.ts", status: "M" },
    ];
    const result = getDirectChildren(files, "src/utils");

    assertEquals(result.length, 2);
    assertEquals(result[0].name, "format");
    assertEquals(result[0].type, "directory");
    assertEquals(result[1].name, "helper.ts");
    assertEquals(result[1].type, "file");
  });

  it("ファイルとディレクトリが混在する場合を処理する", () => {
    const files: DiffFile[] = [
      { path: "src/index.ts", status: "A" },
      { path: "src/utils/helper.ts", status: "M" },
      { path: "src/types/mod.ts", status: "A" },
    ];
    const result = getDirectChildren(files, "src");

    assertEquals(result.length, 3);
    // ディレクトリが先
    assertEquals(result[0].name, "types");
    assertEquals(result[0].type, "directory");
    assertEquals(result[1].name, "utils");
    assertEquals(result[1].type, "directory");
    // ファイルが後
    assertEquals(result[2].name, "index.ts");
    assertEquals(result[2].type, "file");
  });
});

describe("shouldUseLazyLoading", () => {
  it("閾値以下の場合はfalseを返す", () => {
    assertEquals(shouldUseLazyLoading(50), false);
    assertEquals(shouldUseLazyLoading(100), false);
  });

  it("閾値を超える場合はtrueを返す", () => {
    assertEquals(shouldUseLazyLoading(101), true);
    assertEquals(shouldUseLazyLoading(1000), true);
  });

  it("カスタム閾値を指定できる", () => {
    assertEquals(shouldUseLazyLoading(50, 30), true);
    assertEquals(shouldUseLazyLoading(50, 100), false);
  });

  it("0は閾値以下と判定される", () => {
    assertEquals(shouldUseLazyLoading(0), false);
  });
});
