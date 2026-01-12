/**
 * diff-viewer ファイルコンテンツ取得
 *
 * ローカル/リモートファイルの読み込みとUploader管理
 */

import type { DiffViewerOptions, FileContent, Uploader } from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";
import { createUploader } from "../upload/mod.ts";
import { isVerbose } from "../ui/mod.ts";
import { BINARY_CHECK } from "../utils/mod.ts";

/**
 * デバッグログを出力（verboseモード時のみ）
 */
function debugLog(message: string, ...args: unknown[]): void {
  if (isVerbose()) {
    console.log(message, ...args);
  }
}

/**
 * デバッグエラーを出力（verboseモード時のみ）
 */
function debugError(message: string, ...args: unknown[]): void {
  if (isVerbose()) {
    console.error(message, ...args);
  }
}

/** Uploaderの状態 */
export interface UploaderState {
  /** リモートファイル取得用のUploader（キャッシュ） */
  uploader: Uploader | null;
  /** 接続エラー（発生した場合） */
  connectionError: string | null;
  /** 現在選択中のターゲットインデックス */
  currentTargetIndex: number;
  /** Uploaderの最終使用時刻 */
  uploaderLastUsed: number;
  /** オプション */
  options: DiffViewerOptions;
}

/**
 * ローカルファイルとリモートファイルの内容を取得
 */
export async function getLocalAndRemoteContents(
  path: string,
  state: UploaderState,
  uploader?: Uploader,
): Promise<{
  local: FileContent;
  remote: FileContent;
  remoteStatus: { exists: boolean; hasChanges: boolean };
}> {
  const textDecoder = new TextDecoder();

  // ローカルファイル内容を取得
  const localContent = await getLocalFileContent(path, state);

  // リモートファイル内容を取得
  const remoteContent = await getRemoteFileContent(path, state, uploader);

  // リモートファイルが存在するかどうか
  const remoteExists = remoteContent !== null && remoteContent.length > 0;

  // バイナリ判定とコンテンツ変換
  const localIsBinary = isBinaryContent(localContent);
  const remoteIsBinary = remoteContent ? isBinaryContent(remoteContent) : false;

  const local: FileContent = {
    path,
    content: localIsBinary ? null : textDecoder.decode(localContent),
    isBinary: localIsBinary,
  };

  const remote: FileContent = remoteContent
    ? {
      path,
      content: remoteIsBinary ? null : textDecoder.decode(remoteContent),
      isBinary: remoteIsBinary,
    }
    : {
      path,
      content: "",
      isBinary: false,
    };

  // 差分があるかどうかを判定
  const hasChanges = !remoteExists ||
    local.content !== remote.content ||
    local.isBinary !== remote.isBinary;

  debugLog(
    `[RemoteDiff] Status for ${path}: exists=${remoteExists}, hasChanges=${hasChanges}`,
  );

  return {
    local,
    remote,
    remoteStatus: { exists: remoteExists, hasChanges },
  };
}

/**
 * ローカルファイルの内容を取得
 */
export async function getLocalFileContent(
  path: string,
  state: UploaderState,
): Promise<Uint8Array> {
  const { uploadFiles } = state.options;

  // uploadFilesから対象ファイルを探す
  const file = uploadFiles?.find((f) => f.relativePath === path);

  if (!file) {
    // ファイルが見つからない場合は空のバイト配列を返す
    debugLog(`[RemoteDiff] Local file not found in uploadFiles: ${path}`);
    return new Uint8Array(0);
  }

  if (file.content) {
    // Gitモードの場合: contentプロパティから取得
    debugLog(
      `[RemoteDiff] Local file from git content: ${path} (${file.content.length} bytes)`,
    );
    return file.content;
  } else if (file.sourcePath) {
    // ファイルモードの場合: ファイルを読み込み
    try {
      const content = await Deno.readFile(file.sourcePath);
      debugLog(
        `[RemoteDiff] Local file from disk: ${path} (${content.length} bytes)`,
      );
      return content;
    } catch (error) {
      debugError(`[RemoteDiff] Error reading local file ${path}:`, error);
      return new Uint8Array(0);
    }
  }

  debugLog(`[RemoteDiff] Local file has no content or sourcePath: ${path}`);
  return new Uint8Array(0);
}

/**
 * リモートファイルの内容を取得
 */
export async function getRemoteFileContent(
  path: string,
  state: UploaderState,
  uploader?: Uploader,
): Promise<Uint8Array | null> {
  const { targets } = state.options;

  // ターゲットが設定されていない場合はnullを返す
  if (!targets || targets.length === 0) {
    debugLog(`[RemoteDiff] No targets configured for path: ${path}`);
    return null;
  }

  try {
    // Uploaderを取得または作成（uploaderが渡されている場合はそれを使用）
    debugLog(`[RemoteDiff] Fetching remote file: ${path}`);
    const targetUploader = uploader || await getOrCreateUploader(state);

    // リモートファイルを読み取り
    const remoteFile = await targetUploader.readFile(path);

    if (!remoteFile) {
      // ファイルが存在しない場合
      debugLog(`[RemoteDiff] Remote file not found: ${path}`);
      return null;
    }

    debugLog(
      `[RemoteDiff] Remote file fetched: ${path} (${remoteFile.size} bytes)`,
    );
    return remoteFile.content;
  } catch (error) {
    debugError(`[RemoteDiff] Error fetching remote file ${path}:`, error);
    return null;
  }
}

/**
 * Uploaderを取得または作成
 */
export async function getOrCreateUploader(
  state: UploaderState,
): Promise<Uploader> {
  // 既に接続エラーが発生している場合は再試行しない
  if (state.connectionError) {
    throw new UploadError(state.connectionError, "CONNECTION_ERROR");
  }

  // 既にUploaderが存在する場合はそれを返す
  if (state.uploader) {
    debugLog("[RemoteDiff] Using cached uploader connection");
    updateUploaderLastUsed(state);
    return state.uploader;
  }

  const { targets } = state.options;

  if (!targets || targets.length === 0) {
    const error = "No targets configured for remote file fetching";
    state.connectionError = error;
    throw new UploadError(error, "CONNECTION_ERROR");
  }

  // 現在選択中のターゲットを使用
  const targetIndex = state.currentTargetIndex;
  const target = targets[targetIndex] || targets[0];
  debugLog(
    `[RemoteDiff] Creating new uploader for ${target.host}:${target.dest} (index: ${targetIndex})`,
  );
  const uploader = createUploader(target);

  // 接続
  debugLog(`[RemoteDiff] Connecting to ${target.host}...`);
  try {
    await uploader.connect();
    debugLog(`[RemoteDiff] Connected to ${target.host}`);
    state.uploader = uploader;
    updateUploaderLastUsed(state);
    return uploader;
  } catch (error) {
    // 接続エラーを記録
    const errorMessage = `Failed to connect to ${target.host}: ${
      error instanceof Error ? error.message : String(error)
    }`;
    state.connectionError = errorMessage;
    debugError(`[RemoteDiff] ${errorMessage}`);
    throw new UploadError(
      errorMessage,
      "CONNECTION_ERROR",
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Uploaderを切断
 */
export async function disconnectUploader(state: UploaderState): Promise<void> {
  if (state.uploader) {
    try {
      await state.uploader.disconnect();
    } catch (err) {
      debugLog(
        `[RemoteDiff] Uploader disconnect failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    state.uploader = null;
  }
}

/**
 * Uploaderの最終使用時刻を更新
 */
export function updateUploaderLastUsed(state: UploaderState): void {
  state.uploaderLastUsed = Date.now();
}

/**
 * Uploaderのアイドル状態をチェック
 */
export async function checkUploaderIdle(
  state: UploaderState,
  timeoutSeconds: number,
): Promise<void> {
  if (!state.uploader || state.uploaderLastUsed === 0) {
    return;
  }

  const now = Date.now();
  const idleMs = now - state.uploaderLastUsed;
  const timeoutMs = timeoutSeconds * 1000;

  if (idleMs >= timeoutMs) {
    debugLog(
      `[IdleCheck] Uploader idle for ${
        Math.floor(idleMs / 1000)
      }s, disconnecting...`,
    );
    await disconnectUploader(state);
    debugLog("[IdleCheck] Uploader disconnected due to idle timeout");
  }
}

/**
 * バイナリコンテンツかどうかを判定
 */
export function isBinaryContent(content: Uint8Array): boolean {
  // 最初の一定バイト数をチェック
  const checkLength = Math.min(content.length, BINARY_CHECK.CHECK_LENGTH);
  for (let i = 0; i < checkLength; i++) {
    // NULLバイトがあればバイナリ
    if (content[i] === 0) {
      return true;
    }
  }
  return false;
}
