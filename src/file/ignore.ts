/**
 * Ignoreパターンマッチングモジュール
 *
 * glob形式のパターンでファイルを除外するための機能を提供
 */

import { globToRegExp } from "@std/path";

/**
 * Ignoreパターンマッチャー
 *
 * 複数のglobパターンをコンパイルして効率的にマッチングを行う
 */
export class IgnoreMatcher {
  private readonly patterns: Array<{
    pattern: string;
    regex: RegExp;
    isDirectory: boolean;
  }>;

  /**
   * @param patterns glob形式の除外パターン配列
   */
  constructor(patterns: string[]) {
    this.patterns = patterns.map((pattern) => this.compilePattern(pattern));
  }

  /**
   * パターンをコンパイルする
   */
  private compilePattern(pattern: string): {
    pattern: string;
    regex: RegExp;
    isDirectory: boolean;
  } {
    // ディレクトリパターンかどうか
    const isDirectory = pattern.endsWith("/");
    // 末尾のスラッシュを除去
    const normalizedPattern = isDirectory ? pattern.slice(0, -1) : pattern;

    // パターンをRegExpに変換
    let regex: RegExp;

    // ** を含むパターン（任意のディレクトリ深さにマッチ）
    if (normalizedPattern.includes("**")) {
      regex = globToRegExp(normalizedPattern, {
        extended: true,
        globstar: true,
      });
    } else if (
      normalizedPattern.includes("*") || normalizedPattern.includes("?")
    ) {
      // シンプルなワイルドカードパターン
      regex = globToRegExp(normalizedPattern, {
        extended: true,
        globstar: false,
      });
    } else {
      // 固定文字列パターン
      // ディレクトリの場合は、そのディレクトリ配下のすべてにマッチ
      if (isDirectory) {
        regex = new RegExp(
          `^${escapeRegExp(normalizedPattern)}(/|$)`,
        );
      } else {
        // ファイル名の完全一致、またはパスの末尾にマッチ
        regex = new RegExp(
          `(^|/)${escapeRegExp(normalizedPattern)}$`,
        );
      }
    }

    return {
      pattern,
      regex,
      isDirectory,
    };
  }

  /**
   * 指定されたパスがいずれかのignoreパターンにマッチするかチェック
   *
   * @param filePath チェック対象のファイルパス（相対パス）
   * @returns マッチする場合はtrue
   */
  matches(filePath: string): boolean {
    // パスを正規化（先頭のスラッシュを除去、バックスラッシュをスラッシュに変換）
    const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\//, "");

    for (const { regex, isDirectory, pattern } of this.patterns) {
      // ディレクトリパターンの場合は、パスの先頭部分にマッチするか確認
      if (isDirectory) {
        // パスがディレクトリで始まるか、パス自体がディレクトリ名と一致するか
        if (regex.test(normalizedPath)) {
          return true;
        }
        // パスの一部としてディレクトリが含まれているかもチェック
        const parts = normalizedPath.split("/");
        for (let i = 0; i < parts.length; i++) {
          const partialPath = parts.slice(0, i + 1).join("/");
          if (regex.test(partialPath)) {
            return true;
          }
        }
      } else {
        // ファイルパターンの場合
        // globToRegExpで生成されたパターンでマッチ
        if (regex.test(normalizedPath)) {
          return true;
        }

        // パスの末尾のファイル名だけでもマッチを試みる（*.ext パターン用）
        if (pattern.startsWith("*")) {
          const fileName = normalizedPath.split("/").pop() || "";
          if (regex.test(fileName)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 複数のパスをフィルタリングして、ignoreパターンにマッチしないものだけを返す
   *
   * @param paths フィルタリング対象のパス配列
   * @returns ignoreパターンにマッチしないパスの配列
   */
  filter<T extends string | { path: string }>(paths: T[]): T[] {
    return paths.filter((item) => {
      const path = typeof item === "string" ? item : item.path;
      return !this.matches(path);
    });
  }

  /**
   * パターン数を取得
   */
  get count(): number {
    return this.patterns.length;
  }
}

/**
 * 正規表現の特殊文字をエスケープ
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 単一のパスがパターン配列にマッチするかチェック（簡易版）
 *
 * @param filePath チェック対象のファイルパス
 * @param patterns glob形式の除外パターン配列
 * @returns マッチする場合はtrue
 */
export function matchesIgnorePattern(
  filePath: string,
  patterns: string[],
): boolean {
  const matcher = new IgnoreMatcher(patterns);
  return matcher.matches(filePath);
}

/**
 * デフォルトのignoreパターン
 */
export const DEFAULT_IGNORE_PATTERNS = [
  ".git/",
  ".svn/",
  ".hg/",
  "node_modules/",
  ".DS_Store",
  "Thumbs.db",
  "*.swp",
  "*.swo",
  "*~",
];
