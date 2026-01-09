/**
 * ディレクトリ操作のユーティリティ
 */

import { dirname } from "@std/path";

/**
 * 親ディレクトリのパスを取得
 *
 * パスが "." または空の場合は null を返す
 *
 * @param path パス
 * @returns 親ディレクトリのパス、または null
 */
export function getParentDir(path: string): string | null {
  const parent = dirname(path);
  if (!parent || parent === ".") {
    return null;
  }
  return parent;
}

/**
 * 親ディレクトリを確保する
 *
 * 指定されたパスの親ディレクトリが存在しない場合に作成する。
 * 親ディレクトリのパスが "." または空の場合は何もしない。
 *
 * @param remotePath リモートパス（相対パス）
 * @param mkdir ディレクトリ作成関数
 */
export async function ensureParentDir(
  remotePath: string,
  mkdir: (path: string) => Promise<void>,
): Promise<void> {
  const parentDir = getParentDir(remotePath);
  if (parentDir) {
    await mkdir(parentDir);
  }
}
