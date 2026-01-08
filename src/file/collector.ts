/**
 * ファイル収集モジュール
 *
 * 指定されたソースパスからファイルを収集する
 * - glob パターン対応
 * - 末尾 `/` の処理（中身のみ vs ディレクトリごと）
 */

import { expandGlob } from "@std/fs";
import { basename, isAbsolute, join, normalize, relative } from "@std/path";
import type {
  CollectedFile,
  FileCollectOptions,
  FileCollectResult,
} from "../types/mod.ts";
import { IgnoreMatcher } from "./ignore.ts";

/** ファイル収集エラー */
export class FileCollectError extends Error {
  public readonly source: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    source: string,
    originalError?: Error,
  ) {
    super(message);
    this.name = "FileCollectError";
    this.source = source;
    this.originalError = originalError;
  }
}

/**
 * 単一のソースパスからファイルを収集する
 *
 * @param source ソースパス（ファイル、ディレクトリ、またはglobパターン）
 * @param baseDir 基準ディレクトリ
 * @param ignoreMatcher ignoreパターンマッチャー
 * @param followSymlinks シンボリックリンクを追跡するか
 */
async function collectFromSource(
  source: string,
  baseDir: string,
  ignoreMatcher: IgnoreMatcher,
  followSymlinks: boolean,
): Promise<CollectedFile[]> {
  const files: CollectedFile[] = [];

  // 末尾が / で終わるかどうかで挙動を変える
  // "dist/" → dist ディレクトリの中身のみ（dest直下に展開）
  // "dist"  → dist ディレクトリごと（dest/dist/ として作成）
  const trailingSlash = source.endsWith("/");
  const normalizedSource = trailingSlash ? source.slice(0, -1) : source;

  // 絶対パスに変換
  const sourcePath = isAbsolute(normalizedSource)
    ? normalizedSource
    : join(baseDir, normalizedSource);

  // globパターンを含むかチェック
  const hasGlob = /[*?[\]{}]/.test(normalizedSource);

  if (hasGlob) {
    // globパターンの場合
    const globPattern = isAbsolute(normalizedSource)
      ? normalizedSource
      : join(baseDir, normalizedSource);

    for await (
      const entry of expandGlob(globPattern, {
        root: baseDir,
        followSymlinks,
      })
    ) {
      const relativePath = relative(baseDir, entry.path);

      // ignoreパターンにマッチする場合はスキップ
      if (ignoreMatcher.matches(relativePath)) {
        continue;
      }

      if (entry.isFile) {
        const stat = await Deno.stat(entry.path);
        files.push({
          sourcePath: entry.path,
          relativePath,
          size: stat.size,
          mtime: stat.mtime,
          isDirectory: false,
        });
      } else if (entry.isDirectory) {
        // ディレクトリの場合は再帰的に収集
        const subFiles = await collectDirectory(
          entry.path,
          relativePath,
          ignoreMatcher,
          followSymlinks,
        );
        files.push(...subFiles);
      }
    }
  } else {
    // 通常のパスの場合
    try {
      const stat = await Deno.stat(sourcePath);

      if (stat.isFile) {
        // ファイルの場合
        const relativePath = basename(sourcePath);

        if (!ignoreMatcher.matches(relativePath)) {
          files.push({
            sourcePath,
            relativePath,
            size: stat.size,
            mtime: stat.mtime,
            isDirectory: false,
          });
        }
      } else if (stat.isDirectory) {
        // ディレクトリの場合
        let relativeBase: string;

        if (trailingSlash) {
          // "dist/" の場合: 中身のみをdest直下に展開
          relativeBase = "";
        } else {
          // "dist" の場合: dest/dist/ として展開
          relativeBase = basename(sourcePath);
        }

        const subFiles = await collectDirectory(
          sourcePath,
          relativeBase,
          ignoreMatcher,
          followSymlinks,
        );
        files.push(...subFiles);
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new FileCollectError(
          `Source not found: ${source}`,
          source,
          error,
        );
      }
      throw new FileCollectError(
        `Failed to access source: ${source}`,
        source,
        error instanceof Error ? error : undefined,
      );
    }
  }

  return files;
}

/**
 * ディレクトリを再帰的に走査してファイルを収集する
 *
 * @param dirPath ディレクトリの絶対パス
 * @param relativeBase 相対パスのベース
 * @param ignoreMatcher ignoreパターンマッチャー
 * @param followSymlinks シンボリックリンクを追跡するか
 */
async function collectDirectory(
  dirPath: string,
  relativeBase: string,
  ignoreMatcher: IgnoreMatcher,
  followSymlinks: boolean,
): Promise<CollectedFile[]> {
  const files: CollectedFile[] = [];

  for await (const entry of Deno.readDir(dirPath)) {
    const entryPath = join(dirPath, entry.name);
    const relativePath = relativeBase
      ? join(relativeBase, entry.name)
      : entry.name;

    // パスを正規化（バックスラッシュをスラッシュに変換）
    const normalizedRelativePath = normalize(relativePath).replace(/\\/g, "/");

    // ignoreパターンにマッチする場合はスキップ
    if (ignoreMatcher.matches(normalizedRelativePath)) {
      continue;
    }

    if (entry.isFile) {
      const stat = await Deno.stat(entryPath);
      files.push({
        sourcePath: entryPath,
        relativePath: normalizedRelativePath,
        size: stat.size,
        mtime: stat.mtime,
        isDirectory: false,
      });
    } else if (entry.isDirectory) {
      // ディレクトリ自体も記録（空ディレクトリ対応）
      files.push({
        sourcePath: entryPath,
        relativePath: normalizedRelativePath,
        size: 0,
        mtime: null,
        isDirectory: true,
      });

      // 再帰的に収集
      const subFiles = await collectDirectory(
        entryPath,
        normalizedRelativePath,
        ignoreMatcher,
        followSymlinks,
      );
      files.push(...subFiles);
    } else if (entry.isSymlink && followSymlinks) {
      // シンボリックリンクを追跡する場合
      const realPath = await Deno.realPath(entryPath);
      const stat = await Deno.stat(realPath);

      if (stat.isFile) {
        files.push({
          sourcePath: entryPath,
          relativePath: normalizedRelativePath,
          size: stat.size,
          mtime: stat.mtime,
          isDirectory: false,
        });
      } else if (stat.isDirectory) {
        const subFiles = await collectDirectory(
          realPath,
          normalizedRelativePath,
          ignoreMatcher,
          followSymlinks,
        );
        files.push(...subFiles);
      }
    }
  }

  return files;
}

/**
 * 指定されたソースパス配列からファイルを収集する
 *
 * @param sources ソースパス配列（ファイル、ディレクトリ、またはglobパターン）
 * @param options 収集オプション
 * @returns 収集結果
 *
 * @example
 * ```typescript
 * // 基本的な使用
 * const result = await collectFiles(["src/", "public/assets/"]);
 *
 * // ignoreパターン付き
 * const result = await collectFiles(["dist/"], {
 *   ignorePatterns: ["*.map", "*.d.ts"],
 * });
 *
 * // 末尾スラッシュの挙動
 * // "dist/" → dist の中身のみをアップロード
 * // "dist"  → dist ディレクトリごとアップロード
 * ```
 */
export async function collectFiles(
  sources: string[],
  options: FileCollectOptions = {},
): Promise<FileCollectResult> {
  const {
    baseDir = Deno.cwd(),
    ignorePatterns = [],
    followSymlinks = false,
  } = options;

  const ignoreMatcher = new IgnoreMatcher(ignorePatterns);
  const allFiles: CollectedFile[] = [];

  for (const source of sources) {
    const files = await collectFromSource(
      source,
      baseDir,
      ignoreMatcher,
      followSymlinks,
    );
    allFiles.push(...files);
  }

  // 重複を除去（同じrelativePathを持つファイル）
  const uniqueFiles = new Map<string, CollectedFile>();
  for (const file of allFiles) {
    // 既存のエントリがある場合、ファイルを優先（ディレクトリより）
    const existing = uniqueFiles.get(file.relativePath);
    if (!existing || (!file.isDirectory && existing.isDirectory)) {
      uniqueFiles.set(file.relativePath, file);
    }
  }

  const files = Array.from(uniqueFiles.values());

  // 統計を計算
  const fileCount = files.filter((f) => !f.isDirectory).length;
  const directoryCount = files.filter((f) => f.isDirectory).length;
  const totalSize = files.reduce(
    (sum, f) => sum + (f.isDirectory ? 0 : f.size),
    0,
  );

  return {
    files,
    fileCount,
    directoryCount,
    totalSize,
    sources,
  };
}

/**
 * ファイルサイズを人間が読みやすい形式にフォーマット
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  if (unitIndex === 0) {
    return `${size} ${units[unitIndex]}`;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
