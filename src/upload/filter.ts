/**
 * アップロードファイルのフィルタリングモジュール
 *
 * ignoreパターンによるファイルフィルタリング機能を提供
 */

import type { UploadFile } from "../types/mod.ts";
import { IgnoreMatcher } from "../file/ignore.ts";

/**
 * ignoreパターンに基づいてUploadFileをフィルタリング
 *
 * @param files フィルタリング対象のUploadFile配列
 * @param patterns glob形式のignoreパターン配列
 * @returns フィルタリング後のUploadFile配列（ignoreパターンにマッチしないファイルのみ）
 *
 * @example
 * ```typescript
 * const files: UploadFile[] = [
 *   { relativePath: "src/index.ts", size: 100, isDirectory: false },
 *   { relativePath: "node_modules/foo/index.js", size: 200, isDirectory: false },
 *   { relativePath: "dist/bundle.js.map", size: 300, isDirectory: false },
 * ];
 *
 * const filtered = applyIgnoreFilter(files, ["node_modules/", "*.map"]);
 * // => [{ relativePath: "src/index.ts", ... }]
 * ```
 */
export function applyIgnoreFilter(
  files: UploadFile[],
  patterns: string[],
): UploadFile[] {
  // パターンが空の場合は何もフィルタリングしない
  if (patterns.length === 0) {
    return files;
  }

  const matcher = new IgnoreMatcher(patterns);

  return files.filter((file) => {
    // ignoreパターンにマッチしないファイルのみを残す
    return !matcher.matches(file.relativePath);
  });
}
