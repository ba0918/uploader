/**
 * リモート差分取得の共通ロジック
 *
 * CUIモード（browser.ts）とGUIモード（server.ts）で共通利用
 */

import type {
  DiffFile,
  ResolvedTargetConfig,
  RsyncDiffEntry,
  RsyncDiffResult,
  UploadFile,
  Uploader,
} from "../types/mod.ts";
import { hasDiff, hasListRemoteFiles } from "../types/mod.ts";
import { createUploader } from "../upload/mod.ts";
import { applyIgnoreFilter } from "../upload/filter.ts";
import { detectBaseDirectory } from "../upload/mirror.ts";
import { logVerbose } from "../ui/mod.ts";
import { batchAsync } from "../utils/mod.ts";

/** ターゲットごとの差分結果 */
export interface TargetDiffInfo {
  target: ResolvedTargetConfig;
  diff: RsyncDiffResult | null;
  error?: string;
  unsupported?: boolean;
}

/**
 * アップロードファイル一覧からrsync用のファイルパスリストを抽出
 *
 * ディレクトリと削除ファイルは除外する：
 * - ディレクトリ: rsyncがディレクトリ内の全ファイルを比較してしまい、
 *   ignore設定で除外されたファイルまで差分として検出されてしまうため
 * - 削除ファイル: ローカルに存在しないため、--files-fromに含めるとエラーになる
 */
export function extractFilePaths(uploadFiles: UploadFile[]): string[] {
  return uploadFiles
    .filter((f) => !f.isDirectory && f.changeType !== "delete")
    .map((f) => f.relativePath);
}

/**
 * rsync差分結果をDiffFile配列に変換
 */
export function rsyncDiffToFiles(rsyncDiff: RsyncDiffResult): DiffFile[] {
  return rsyncDiff.entries.map((entry) => ({
    path: entry.path,
    status: entry.changeType,
  }));
}

/**
 * rsync差分結果からサマリーを生成
 */
export function rsyncDiffToSummary(rsyncDiff: RsyncDiffResult): {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  total: number;
} {
  return {
    added: rsyncDiff.added,
    modified: rsyncDiff.modified,
    deleted: rsyncDiff.deleted,
    renamed: 0,
    total: rsyncDiff.entries.length,
  };
}

/**
 * 単一ターゲットに対してrsync diffを取得
 */
export async function getRsyncDiffForTarget(
  target: ResolvedTargetConfig,
  localDir: string,
  filePaths: string[],
  options?: { checksum?: boolean; ignorePatterns?: string[]; uploadFiles?: UploadFile[]; concurrency?: number },
): Promise<TargetDiffInfo> {
  // rsync以外のプロトコルはマニュアル差分取得を試みる
  if (target.protocol !== "rsync") {
    // uploadFilesがある場合はマニュアル差分取得を実行
    if (options?.uploadFiles) {
      try {
        const diff = await getManualDiffForTarget(
          target,
          options.uploadFiles,
          localDir,
          {
            concurrency: options.concurrency,
            ignorePatterns: options.ignorePatterns ?? target.ignore,
          },
        );
        return { target, diff };
      } catch (error) {
        return {
          target,
          diff: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    // uploadFilesがない場合は未サポート
    return {
      target,
      diff: null,
      unsupported: true,
    };
  }

  try {
    const uploader = createUploader(target);
    await uploader.connect();

    try {
      if (!hasDiff(uploader)) {
        return { target, diff: null, unsupported: true };
      }

      // mirrorモードの場合、ベースディレクトリを考慮してlocalDirとremoteDirを調整
      let adjustedLocalDir = localDir;
      let adjustedRemoteDir: string | undefined = undefined;
      let adjustedFilePaths = filePaths;
      const isMirrorMode = target.sync_mode === "mirror";

      if (isMirrorMode && options?.uploadFiles) {
        const baseDir = detectBaseDirectory(options.uploadFiles);
        if (baseDir) {
          // パス結合: 末尾のスラッシュを考慮
          const localBase = localDir.endsWith("/")
            ? localDir
            : `${localDir}/`;
          adjustedLocalDir = `${localBase}${baseDir}`;

          // リモートパス: destの末尾スラッシュを考慮
          const destBase = target.dest.endsWith("/")
            ? target.dest
            : `${target.dest}/`;
          adjustedRemoteDir = `${destBase}${baseDir}`;

          // filePathsを空にして、--deleteを有効化
          adjustedFilePaths = [];

          logVerbose(
            `[getRsyncDiffForTarget] Adjusted for mirror mode: localDir=${adjustedLocalDir}, remoteDir=${adjustedRemoteDir}`,
          );
        }
      }

      const diff = await uploader.getDiff(adjustedLocalDir, adjustedFilePaths, {
        checksum: options?.checksum,
        ignorePatterns: options?.ignorePatterns ?? target.ignore,
        remoteDir: adjustedRemoteDir,
      });

      // mirrorモードでベースディレクトリを調整した場合、diffのパスにbaseDirを追加
      if (isMirrorMode && options?.uploadFiles) {
        const baseDir = detectBaseDirectory(options.uploadFiles);
        if (baseDir) {
          // rsyncDiff.entriesのパスにbaseDirを追加
          const adjustedDiff = {
            ...diff,
            entries: diff.entries.map((entry) => ({
              ...entry,
              path: `${baseDir}${entry.path}`,
            })),
          };
          return { target, diff: adjustedDiff };
        }
      }

      return { target, diff };
    } finally {
      await uploader.disconnect();
    }
  } catch (error) {
    return {
      target,
      diff: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 複数ターゲットに対してrsync diffを取得
 */
export async function getRemoteDiffs(
  targets: ResolvedTargetConfig[],
  uploadFiles: UploadFile[],
  localDir: string,
  options?: { checksum?: boolean; ignorePatterns?: string[]; concurrency?: number },
): Promise<TargetDiffInfo[]> {
  const filePaths = extractFilePaths(uploadFiles);

  logVerbose(
    `[getRemoteDiffs] localDir: ${localDir}, files: ${filePaths.length}, checksum: ${
      options?.checksum ?? false
    }, concurrency: ${options?.concurrency ?? 10}`,
  );
  logVerbose(
    `[getRemoteDiffs] First 5 file paths: ${filePaths.slice(0, 5).join(", ")}`,
  );

  const results: TargetDiffInfo[] = [];

  for (const target of targets) {
    const result = await getRsyncDiffForTarget(
      target,
      localDir,
      filePaths,
      {
        ...options,
        uploadFiles, // uploadFilesを渡してベースディレクトリ検出に使用
      },
    );
    results.push(result);
  }

  return results;
}

/**
 * TargetDiffInfo配列からターゲットごとの変更ファイルマップを抽出
 */
export function collectChangedFilesByTarget(
  targetDiffs: TargetDiffInfo[],
): Map<number, string[]> {
  const result = new Map<number, string[]>();

  for (let i = 0; i < targetDiffs.length; i++) {
    const info = targetDiffs[i];
    if (info.diff) {
      const files = info.diff.entries.map((entry) => entry.path);
      result.set(i, files);
    } else if (info.unsupported || info.error) {
      // 未サポートまたはエラーの場合は空配列（全ファイルをアップロード対象とする）
      // この場合、main.ts側でfilesByTargetに登録されないため、全ファイルが対象になる
    }
  }

  return result;
}

/**
 * TargetDiffInfo配列に変更があるかチェック
 */
export function hasRemoteChanges(targetDiffs: TargetDiffInfo[]): boolean {
  return targetDiffs.some((info) => {
    if (info.diff) {
      return info.diff.added > 0 || info.diff.modified > 0 ||
        info.diff.deleted > 0;
    }
    // エラーの場合は変更ありとして扱う（安全側に倒す）
    if (info.error !== undefined) {
      return true;
    }
    // 未サポートの場合は false（差分判定できない）
    // Note: 呼び出し元で uploadFiles の変更を別途チェックする必要がある
    return false;
  });
}

/**
 * 2つのUint8Array配列が等しいかチェック
 */
function areBuffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * getDiff未サポートプロトコル向けのマニュアル差分取得
 *
 * 各ファイルを個別にリモートと比較して差分を検出する。
 * scp/sftp/localなど、rsync getDiff()をサポートしないプロトコルで使用する。
 *
 * @param target 対象ターゲット設定
 * @param uploadFiles アップロードファイル一覧
 * @param localDir ローカルディレクトリパス
 * @param options オプション（並列実行数、アップローダーインスタンスなど）
 * @returns rsync差分結果と互換性のある形式
 */
export async function getManualDiffForTarget(
  target: ResolvedTargetConfig,
  uploadFiles: UploadFile[],
  _localDir: string,
  options?: { concurrency?: number; ignorePatterns?: string[]; uploader?: Uploader },
): Promise<RsyncDiffResult> {
  const uploader = options?.uploader ?? createUploader(target);
  const shouldDisconnect = !options?.uploader;

  if (shouldDisconnect) {
    await uploader.connect();
  }

  try {
    const concurrency = options?.concurrency ?? 10;
    const ignorePatterns = options?.ignorePatterns ?? [];
    const entries: RsyncDiffEntry[] = [];
    let added = 0;
    let modified = 0;
    let deleted = 0;

    // mirror モードの場合、ターゲット固有の削除ファイルを検出
    const isMirrorMode = target.sync_mode === "mirror";
    if (isMirrorMode && hasListRemoteFiles(uploader)) {
      try {
        const remoteFiles = await uploader.listRemoteFiles();
        logVerbose(
          `[getManualDiffForTarget] Found ${remoteFiles.length} remote files for ${target.host}:${target.dest}`,
        );

        // ignoreパターンを適用（リモートファイルにも適用）
        const remoteUploadFiles: UploadFile[] = remoteFiles.map((path) => ({
          relativePath: path,
          size: 0,
          isDirectory: false,
        }));

        const filteredRemoteFiles = applyIgnoreFilter(
          remoteUploadFiles,
          ignorePatterns,
        );
        logVerbose(
          `[getManualDiffForTarget] ${filteredRemoteFiles.length} files after applying ignore patterns`,
        );

        // ローカルファイルのパスセットを作成
        const localPaths = new Set(
          uploadFiles
            .filter((f) => f.changeType !== "delete" && !f.isDirectory)
            .map((f) => f.relativePath),
        );

        // リモートにのみ存在するファイルを削除対象とする
        for (const file of filteredRemoteFiles) {
          if (!localPaths.has(file.relativePath)) {
            deleted++;
            entries.push({
              path: file.relativePath,
              changeType: "D",
            });
          }
        }

        logVerbose(
          `[getManualDiffForTarget] Detected ${deleted} files to delete for ${target.host}:${target.dest}`,
        );
      } catch (error) {
        logVerbose(
          `[getManualDiffForTarget] Failed to list remote files: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // エラー時は削除ファイル検出をスキップ
      }
    }

    // 通常ファイル（追加/変更）を並列チェック
    const normalFiles = uploadFiles.filter(
      (f) => !f.isDirectory && f.changeType !== "delete",
    );

    logVerbose(
      `[getManualDiffForTarget] Checking ${normalFiles.length} files for ${target.host}:${target.dest} (concurrency: ${concurrency})`,
    );

    // バッチ処理で並列実行
    const results = await batchAsync(
      normalFiles,
      async (file) => {
        try {
          // sourcePathがない場合はスキップ（変更ありとして扱う）
          if (!file.sourcePath) {
            logVerbose(
              `Skipping ${file.relativePath}: no sourcePath`,
            );
            return { file, changeType: "M" as const };
          }

          // ローカルファイルを読み込み
          const localContent = await Deno.readFile(file.sourcePath);

          // リモートファイルを読み込み
          const remoteFile = await uploader.readFile(file.relativePath);

          if (!remoteFile) {
            // リモートに存在しない = 追加
            return { file, changeType: "A" as const };
          }

          // バイト比較
          const remoteContent = remoteFile.content;
          if (!areBuffersEqual(localContent, remoteContent)) {
            // 内容が異なる = 変更
            return { file, changeType: "M" as const };
          }

          // 変更なし
          return { file, changeType: null };
        } catch (error) {
          // エラー時は変更ありとして扱う
          logVerbose(
            `Error checking ${file.relativePath}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { file, changeType: "M" as const };
        }
      },
      concurrency,
    );

    // 結果を集計
    for (const result of results) {
      if (result.changeType === "A") {
        added++;
        entries.push({
          path: result.file.relativePath,
          changeType: "A",
        });
      } else if (result.changeType === "M") {
        modified++;
        entries.push({
          path: result.file.relativePath,
          changeType: "M",
        });
      }
      // changeType === null の場合は変更なしなので何もしない
    }

    logVerbose(
      `[getManualDiffForTarget] Result: ${added} added, ${modified} modified, ${deleted} deleted`,
    );

    return {
      added,
      modified,
      deleted,
      entries,
    };
  } finally {
    if (shouldDisconnect) {
      await uploader.disconnect();
    }
  }
}
