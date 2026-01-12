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
  Uploader,
  UploadFile,
} from "../types/mod.ts";
import { hasDiff, hasListRemoteFiles } from "../types/mod.ts";
import { createUploader } from "../upload/mod.ts";
import { applyIgnoreFilter } from "../upload/filter.ts";
import { detectBaseDirectory } from "../upload/mirror.ts";
import { logVerbose, logWarning } from "../ui/mod.ts";
import { batchAsync } from "../utils/mod.ts";
import { classifyError } from "../utils/error.ts";

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
 *
 * rsyncプロトコルの場合: ディレクトリ単位での差分取得（`--delete`オプション使用）
 * - mirrorモード時にbaseDirectoryを検出し、localDir/remoteDirを調整
 * - rsyncコマンドがディレクトリ単位で動作するため、パス調整が必須
 * - 例: uploadFiles = ["src/foo.ts", "src/bar.ts"] の場合
 *   - baseDir = "src/" を検出
 *   - localDir: "/project/" → "/project/src/"
 *   - remoteDir: "/upload/" → "/upload/src/"
 *   - rsyncは /project/src/ と /upload/src/ を比較
 *   - 結果のパスに "src/" を追加して正規化（uploadFilesと一致させる）
 *
 * その他のプロトコル（scp/sftp/local）: ファイル単位での1対1比較
 * - getManualDiffForTarget()にフォールバック
 * - baseDirectory調整は不要（uploadFilesのrelativePathを直接使用）
 *
 * 詳細: docs/implementation/mirror-mode-protocols.md
 */
export async function getRsyncDiffForTarget(
  target: ResolvedTargetConfig,
  localDir: string,
  filePaths: string[],
  options?: {
    checksum?: boolean;
    ignorePatterns?: string[];
    uploadFiles?: UploadFile[];
    concurrency?: number;
  },
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
      //
      // rsyncはディレクトリ単位で動作するため、uploadFilesから共通のbaseDirectoryを検出し、
      // そのディレクトリに対して差分取得を実行する必要がある。
      //
      // 例: uploadFiles = ["src/foo.ts", "src/bar.ts"] の場合
      //   1. detectBaseDirectory() → "src/" を検出
      //   2. localDir/remoteDirを調整: "/project/" → "/project/src/"
      //   3. rsyncは "/project/src/" と "/remote/dest/src/" を比較
      //   4. filePathsを空にして --delete を有効化（ディレクトリ全体を同期）
      //   5. 結果のパスに "src/" を追加（後述の処理で実行）
      //
      // この調整により、rsyncがuploadFilesの範囲内でのみ削除を実行するようになる。
      // baseDirectory調整なしの場合、localDir配下の全ファイルが対象になってしまう。
      //
      // Note: manual diff（scp/sftp/local）はファイル単位で比較するため、
      // この調整は不要。詳細は docs/implementation/mirror-mode-protocols.md を参照。
      let adjustedLocalDir = localDir;
      let adjustedRemoteDir: string | undefined = undefined;
      let adjustedFilePaths = filePaths;
      const isMirrorMode = target.sync_mode === "mirror";

      if (isMirrorMode && options?.uploadFiles) {
        const baseDir = detectBaseDirectory(options.uploadFiles);
        if (baseDir) {
          // パス結合: 末尾のスラッシュを考慮
          const localBase = localDir.endsWith("/") ? localDir : `${localDir}/`;
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
      //
      // rsyncは調整済みのlocalDir/remoteDirで比較を実行したため、
      // 結果のパスはbaseDir除外（"foo.ts", "bar.ts"）になっている。
      // これを元のパス形式（"src/foo.ts", "src/bar.ts"）に復元することで、
      // uploadFilesと一致する形式で返却する。
      //
      // 例: uploadFiles = ["src/foo.ts", "src/bar.ts"] の場合
      //   - rsyncの結果: ["foo.ts", "bar.ts"] (baseDir除外)
      //   - baseDirを追加: ["src/foo.ts", "src/bar.ts"] (uploadFilesと一致)
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
  options?: {
    checksum?: boolean;
    ignorePatterns?: string[];
    concurrency?: number;
  },
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
 * rsyncとの主な違い:
 * - ファイル単位での1対1比較（ディレクトリ単位ではない）
 * - uploadFilesのrelativePathを直接使用してリモートファイルにアクセス
 * - baseDirectory調整は不要（パスが既に完全な形式）
 *
 * 動作:
 * 1. mirrorモード時: listRemoteFiles()でリモートファイル一覧を取得
 * 2. リモートにのみ存在するファイルを削除対象として検出
 * 3. 各uploadFilesを個別に読み込んでバイト比較
 * 4. 追加/変更されたファイルを検出
 *
 * 例: uploadFiles = ["src/foo.ts", "src/bar.ts"] の場合
 *   - uploader.readFile("src/foo.ts") → リモートの /remote/dest/src/foo.ts を読み込み
 *   - uploader.readFile("src/bar.ts") → リモートの /remote/dest/src/bar.ts を読み込み
 *   - パス変換やディレクトリ調整は一切不要
 *
 * 詳細: docs/implementation/mirror-mode-protocols.md
 *
 * @param target 対象ターゲット設定
 * @param uploadFiles アップロードファイル一覧
 * @param _localDir ローカルディレクトリパス（未使用、アンダースコア付き）
 * @param options オプション（並列実行数、アップローダーインスタンスなど）
 * @returns rsync差分結果と互換性のある形式
 */
export async function getManualDiffForTarget(
  target: ResolvedTargetConfig,
  uploadFiles: UploadFile[],
  _localDir: string,
  options?: {
    concurrency?: number;
    ignorePatterns?: string[];
    uploader?: Uploader;
  },
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
        const errorType = classifyError(error);
        logWarning(
          `Failed to list remote files (${errorType}): mirror mode deletion detection skipped`,
        );
        logVerbose(
          `  Error detail: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
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
          // エラー種別を判定
          const errorType = classifyError(error);

          // エラーログ出力（種別に応じて）
          switch (errorType) {
            case "NotFound":
              // ファイル不在はverboseモードでのみ記録
              logVerbose(
                `[getManualDiffForTarget] File not found (will be treated as added): ${file.relativePath}`,
              );
              return { file, changeType: "A" as const };

            case "PermissionDenied":
              logWarning(
                `Permission denied when reading file: ${file.relativePath} (will be treated as modified)`,
              );
              logVerbose(
                `  Error detail: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
              return { file, changeType: "M" as const };

            case "NetworkError":
              logWarning(
                `Network error when reading file: ${file.relativePath} (will be treated as modified)`,
              );
              logVerbose(
                `  Error detail: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
              return { file, changeType: "M" as const };

            case "UnknownError":
              logWarning(
                `Error checking file: ${file.relativePath} (will be treated as modified)`,
              );
              logVerbose(
                `  Error detail: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
              return { file, changeType: "M" as const };
          }
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
