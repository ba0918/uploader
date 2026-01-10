/**
 * diff-viewer/ws-handler.ts のテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  type CachedTargetDiff,
  hasAnyTargetChanges,
  type ServerState,
} from "../../src/diff-viewer/ws-handler.ts";

// hasAnyTargetChangesが参照するフィールドのみを持つPartial ServerState
type PartialServerState = Pick<
  ServerState,
  "allTargetsChecked" | "diffCacheByTarget"
>;

describe("hasAnyTargetChanges", () => {
  it("キャッシュが空の場合はfalseを返す", () => {
    const state: PartialServerState = {
      allTargetsChecked: true,
      diffCacheByTarget: new Map(),
    };

    assertEquals(hasAnyTargetChanges(state as ServerState), false);
  });

  it("allTargetsCheckedがfalseの場合はfalseを返す", () => {
    const state: PartialServerState = {
      allTargetsChecked: false,
      diffCacheByTarget: new Map<number, CachedTargetDiff>([
        [0, {
          rsyncDiff: null,
          changedFiles: ["file1.ts"],
          summary: { added: 1, modified: 0, deleted: 0, total: 1 },
        }],
      ]),
    };

    assertEquals(hasAnyTargetChanges(state as ServerState), false);
  });

  it("変更があるターゲットがあればtrueを返す", () => {
    const state: PartialServerState = {
      allTargetsChecked: true,
      diffCacheByTarget: new Map<number, CachedTargetDiff>([
        [0, {
          rsyncDiff: null,
          changedFiles: ["file1.ts"],
          summary: { added: 1, modified: 0, deleted: 0, total: 1 },
        }],
      ]),
    };

    assertEquals(hasAnyTargetChanges(state as ServerState), true);
  });

  it("複数ターゲットで1つでも変更があればtrueを返す", () => {
    const state: PartialServerState = {
      allTargetsChecked: true,
      diffCacheByTarget: new Map<number, CachedTargetDiff>([
        [0, {
          rsyncDiff: null,
          changedFiles: [],
          summary: { added: 0, modified: 0, deleted: 0, total: 0 },
        }],
        [1, {
          rsyncDiff: null,
          changedFiles: ["file1.ts"],
          summary: { added: 1, modified: 0, deleted: 0, total: 1 },
        }],
        [2, {
          rsyncDiff: null,
          changedFiles: [],
          summary: { added: 0, modified: 0, deleted: 0, total: 0 },
        }],
      ]),
    };

    assertEquals(hasAnyTargetChanges(state as ServerState), true);
  });

  it("すべてのターゲットで変更がない場合はfalseを返す", () => {
    const state: PartialServerState = {
      allTargetsChecked: true,
      diffCacheByTarget: new Map<number, CachedTargetDiff>([
        [0, {
          rsyncDiff: null,
          changedFiles: [],
          summary: { added: 0, modified: 0, deleted: 0, total: 0 },
        }],
        [1, {
          rsyncDiff: null,
          changedFiles: [],
          summary: { added: 0, modified: 0, deleted: 0, total: 0 },
        }],
      ]),
    };

    assertEquals(hasAnyTargetChanges(state as ServerState), false);
  });

  it("エラーがあるターゲットは変更なしとして扱う", () => {
    const state: PartialServerState = {
      allTargetsChecked: true,
      diffCacheByTarget: new Map<number, CachedTargetDiff>([
        [0, {
          rsyncDiff: null,
          changedFiles: [],
          summary: { added: 0, modified: 0, deleted: 0, total: 0 },
          error: "Connection refused",
        }],
      ]),
    };

    assertEquals(hasAnyTargetChanges(state as ServerState), false);
  });

  it("エラーがあるターゲットと変更があるターゲットが混在する場合はtrueを返す", () => {
    const state: PartialServerState = {
      allTargetsChecked: true,
      diffCacheByTarget: new Map<number, CachedTargetDiff>([
        [0, {
          rsyncDiff: null,
          changedFiles: [],
          summary: { added: 0, modified: 0, deleted: 0, total: 0 },
          error: "Connection refused",
        }],
        [1, {
          rsyncDiff: null,
          changedFiles: ["file1.ts", "file2.ts"],
          summary: { added: 1, modified: 1, deleted: 0, total: 2 },
        }],
      ]),
    };

    assertEquals(hasAnyTargetChanges(state as ServerState), true);
  });

  it("変更種別が混在している場合もカウントされる", () => {
    const state: PartialServerState = {
      allTargetsChecked: true,
      diffCacheByTarget: new Map<number, CachedTargetDiff>([
        [0, {
          rsyncDiff: null,
          changedFiles: ["new.ts", "modified.ts", "deleted.ts"],
          summary: { added: 1, modified: 1, deleted: 1, total: 3 },
        }],
      ]),
    };

    assertEquals(hasAnyTargetChanges(state as ServerState), true);
  });
});
