/**
 * diff-viewer/mod.ts のテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { isDiffViewerSupported } from "../../src/diff-viewer/mod.ts";

describe("isDiffViewerSupported", () => {
  it("Deno環境では常にtrueを返す", () => {
    const result = isDiffViewerSupported();
    assertEquals(result, true);
  });
});

// startDiffViewer の詳細なテストは server_test.ts と browser_test.ts でカバー
// mod.ts は主に統合モジュールとして機能するため、
// 個別の機能テストは各モジュールで行う
