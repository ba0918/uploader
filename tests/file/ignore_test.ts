/**
 * file/ignore.ts のテスト
 */

import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  DEFAULT_IGNORE_PATTERNS,
  IgnoreMatcher,
  matchesIgnorePattern,
} from "../../src/file/ignore.ts";

describe("IgnoreMatcher", () => {
  describe("コンストラクタ", () => {
    it("空のパターン配列で初期化できる", () => {
      const matcher = new IgnoreMatcher([]);
      assertEquals(matcher.count, 0);
    });

    it("パターン配列で初期化できる", () => {
      const matcher = new IgnoreMatcher(["*.log", ".git/"]);
      assertEquals(matcher.count, 2);
    });
  });

  describe("拡張子パターン (*.ext)", () => {
    const matcher = new IgnoreMatcher(["*.log", "*.tmp", "*.swp"]);

    it("拡張子にマッチするファイルを検出できる", () => {
      assertEquals(matcher.matches("error.log"), true);
      assertEquals(matcher.matches("debug.tmp"), true);
      assertEquals(matcher.matches(".file.swp"), true);
    });

    it("サブディレクトリ内のファイルも検出できる", () => {
      assertEquals(matcher.matches("logs/error.log"), true);
      assertEquals(matcher.matches("deep/nested/path/file.tmp"), true);
    });

    it("マッチしない拡張子はfalse", () => {
      assertEquals(matcher.matches("file.txt"), false);
      assertEquals(matcher.matches("file.log.bak"), false);
    });
  });

  describe("ディレクトリパターン (dir/)", () => {
    const matcher = new IgnoreMatcher([".git/", "node_modules/", ".cache/"]);

    it("ディレクトリ自体にマッチする", () => {
      assertEquals(matcher.matches(".git"), true);
      assertEquals(matcher.matches("node_modules"), true);
    });

    it("ディレクトリ内のファイルにマッチする", () => {
      assertEquals(matcher.matches(".git/config"), true);
      assertEquals(matcher.matches(".git/objects/pack/file"), true);
      assertEquals(matcher.matches("node_modules/lodash/index.js"), true);
    });

    it("サブディレクトリ内のディレクトリにはマッチしない（先頭一致のみ）", () => {
      // 注: 現在の実装では、ディレクトリパターンは先頭からのマッチのみ
      // project/.git/ のような中間パスにはマッチしない
      assertEquals(matcher.matches("project/.git/config"), false);
      assertEquals(matcher.matches("packages/app/node_modules/lodash"), false);
    });

    it("部分一致ではマッチしない", () => {
      assertEquals(matcher.matches(".github/workflows/ci.yml"), false);
      assertEquals(matcher.matches("node_modules_backup/file"), false);
    });
  });

  describe("固定文字列パターン", () => {
    const matcher = new IgnoreMatcher([".DS_Store", "Thumbs.db", ".env"]);

    it("完全一致するファイルを検出できる", () => {
      assertEquals(matcher.matches(".DS_Store"), true);
      assertEquals(matcher.matches("Thumbs.db"), true);
      assertEquals(matcher.matches(".env"), true);
    });

    it("サブディレクトリ内のファイルも検出できる", () => {
      assertEquals(matcher.matches("folder/.DS_Store"), true);
      assertEquals(matcher.matches("deep/path/Thumbs.db"), true);
    });

    it("部分一致ではマッチしない", () => {
      assertEquals(matcher.matches(".DS_Store.bak"), false);
      assertEquals(matcher.matches("my.env.local"), false);
    });
  });

  describe("グロブスターパターン (**)", () => {
    const matcher = new IgnoreMatcher(["**/build/**", "**/*.min.js"]);

    it("任意の深さにマッチする", () => {
      assertEquals(matcher.matches("build/output.js"), true);
      assertEquals(matcher.matches("src/build/file.txt"), true);
      assertEquals(matcher.matches("a/b/c/build/d/e/file"), true);
    });

    it("拡張子パターンと組み合わせられる", () => {
      assertEquals(matcher.matches("dist/app.min.js"), true);
      assertEquals(matcher.matches("vendor/jquery.min.js"), true);
    });
  });

  describe("チルダパターン (*~)", () => {
    const matcher = new IgnoreMatcher(["*~"]);

    it("バックアップファイルを検出できる", () => {
      assertEquals(matcher.matches("file~"), true);
      assertEquals(matcher.matches("document.txt~"), true);
    });

    it("サブディレクトリ内も検出できる", () => {
      assertEquals(matcher.matches("folder/file~"), true);
    });
  });

  describe("matches メソッド - パス正規化", () => {
    const matcher = new IgnoreMatcher(["*.log"]);

    it("先頭のスラッシュを除去して比較する", () => {
      assertEquals(matcher.matches("/error.log"), true);
    });

    it("バックスラッシュをスラッシュに変換する", () => {
      assertEquals(matcher.matches("path\\to\\error.log"), true);
    });
  });

  describe("filter メソッド", () => {
    const matcher = new IgnoreMatcher(["*.log", "*.tmp", ".git/"]);

    it("文字列配列をフィルタリングできる", () => {
      const paths = [
        "src/index.ts",
        "error.log",
        "src/app.ts",
        "debug.tmp",
        ".git/config",
      ];
      const result = matcher.filter(paths);
      assertEquals(result, ["src/index.ts", "src/app.ts"]);
    });

    it("オブジェクト配列をフィルタリングできる", () => {
      const files = [
        { path: "src/index.ts", size: 100 },
        { path: "error.log", size: 50 },
        { path: "src/app.ts", size: 200 },
      ];
      const result = matcher.filter(files);
      assertEquals(result.length, 2);
      assertEquals(result[0].path, "src/index.ts");
      assertEquals(result[1].path, "src/app.ts");
    });

    it("空の配列は空の配列を返す", () => {
      assertEquals(matcher.filter([]), []);
    });

    it("全てマッチする場合は空の配列を返す", () => {
      const paths = ["error.log", "debug.tmp"];
      assertEquals(matcher.filter(paths), []);
    });

    it("何もマッチしない場合は元の配列を返す", () => {
      const paths = ["src/index.ts", "src/app.ts"];
      const result = matcher.filter(paths);
      assertEquals(result, paths);
    });
  });

  describe("count プロパティ", () => {
    it("パターン数を正しく返す", () => {
      assertEquals(new IgnoreMatcher([]).count, 0);
      assertEquals(new IgnoreMatcher(["*.log"]).count, 1);
      assertEquals(new IgnoreMatcher(["*.log", ".git/", "*.tmp"]).count, 3);
    });
  });
});

describe("matchesIgnorePattern", () => {
  it("パターン配列に対してマッチをチェックできる", () => {
    const patterns = ["*.log", ".git/"];
    assertEquals(matchesIgnorePattern("error.log", patterns), true);
    assertEquals(matchesIgnorePattern(".git/config", patterns), true);
    assertEquals(matchesIgnorePattern("src/index.ts", patterns), false);
  });

  it("空のパターン配列は常にfalse", () => {
    assertEquals(matchesIgnorePattern("any/file.txt", []), false);
  });
});

describe("DEFAULT_IGNORE_PATTERNS", () => {
  it("デフォルトパターンが定義されている", () => {
    assertEquals(Array.isArray(DEFAULT_IGNORE_PATTERNS), true);
    assertEquals(DEFAULT_IGNORE_PATTERNS.length > 0, true);
  });

  it(".git/ が含まれている", () => {
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes(".git/"), true);
  });

  it("node_modules/ が含まれている", () => {
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes("node_modules/"), true);
  });

  it(".DS_Store が含まれている", () => {
    assertEquals(DEFAULT_IGNORE_PATTERNS.includes(".DS_Store"), true);
  });

  it("デフォルトパターンで IgnoreMatcher を作成できる", () => {
    const matcher = new IgnoreMatcher(DEFAULT_IGNORE_PATTERNS);
    assertEquals(matcher.matches(".git/config"), true);
    assertEquals(matcher.matches("node_modules/lodash/index.js"), true);
    assertEquals(matcher.matches(".DS_Store"), true);
    assertEquals(matcher.matches("file.swp"), true);
  });
});

describe("複合パターンテスト", () => {
  const matcher = new IgnoreMatcher([
    // ディレクトリ
    ".git/",
    "node_modules/",
    "dist/",
    // 拡張子
    "*.log",
    "*.tmp",
    "*.swp",
    // 固定ファイル
    ".DS_Store",
    ".env",
    // グロブスター
    "**/*.min.js",
  ]);

  describe("典型的なプロジェクト構造", () => {
    it("ソースファイルは通過する", () => {
      assertEquals(matcher.matches("src/index.ts"), false);
      assertEquals(matcher.matches("src/components/Button.tsx"), false);
      assertEquals(matcher.matches("package.json"), false);
      assertEquals(matcher.matches("README.md"), false);
    });

    it("ビルド成果物は除外される", () => {
      assertEquals(matcher.matches("dist/bundle.js"), true);
      assertEquals(matcher.matches("dist/index.html"), true);
    });

    it("依存関係は除外される", () => {
      assertEquals(matcher.matches("node_modules/react/index.js"), true);
      assertEquals(matcher.matches("node_modules/.bin/tsc"), true);
    });

    it("バージョン管理は除外される", () => {
      assertEquals(matcher.matches(".git/HEAD"), true);
      assertEquals(matcher.matches(".git/objects/pack/pack-abc.pack"), true);
    });

    it("一時ファイルは除外される", () => {
      assertEquals(matcher.matches("error.log"), true);
      assertEquals(matcher.matches("session.tmp"), true);
      assertEquals(matcher.matches(".index.ts.swp"), true);
    });

    it("環境ファイルは除外される", () => {
      assertEquals(matcher.matches(".env"), true);
      assertEquals(matcher.matches(".DS_Store"), true);
    });

    it("minifyされたファイルは除外される", () => {
      assertEquals(matcher.matches("assets/app.min.js"), true);
      assertEquals(matcher.matches("vendor/jquery.min.js"), true);
    });
  });
});
