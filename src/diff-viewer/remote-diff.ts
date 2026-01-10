/**
 * リモート差分取得の共通ロジック
 *
 * CUIモード（browser.ts）とGUIモード（server.ts）で共通利用
 */

import type {
  DiffFile,
  ResolvedTargetConfig,
  RsyncDiffResult,
  UploadFile,
} from "../types/mod.ts";
import { hasDiff } from "../types/mod.ts";
import { createUploader } from "../upload/mod.ts";
import { logVerbose } from "../ui/mod.ts";

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
 * ディレクトリは除外する（rsyncがディレクトリ内の全ファイルを比較してしまい、
 * ignore設定で除外されたファイルまで差分として検出されてしまうため）
 */
export function extractFilePaths(uploadFiles: UploadFile[]): string[] {
  return uploadFiles
    .filter((f) => !f.isDirectory)
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
  options?: { checksum?: boolean },
): Promise<TargetDiffInfo> {
  // rsync以外のプロトコルはgetDiff未サポート
  if (target.protocol !== "rsync") {
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

      const diff = await uploader.getDiff(localDir, filePaths, {
        checksum: options?.checksum,
      });
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
  options?: { checksum?: boolean },
): Promise<TargetDiffInfo[]> {
  const filePaths = extractFilePaths(uploadFiles);

  logVerbose(
    `[getRemoteDiffs] localDir: ${localDir}, files: ${filePaths.length}, checksum: ${
      options?.checksum ?? false
    }`,
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
      options,
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
    // エラーや未サポートの場合は変更ありとして扱う（安全側に倒す）
    return info.error !== undefined || info.unsupported;
  });
}
