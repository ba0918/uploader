/**
 * diff-viewer HTTP/WebSocket サーバ
 *
 * Deno.serve を使用してHTTPとWebSocketの両方を処理する
 */

import type {
  DiffFile,
  DiffViewerOptions,
  DiffViewerProgressController,
  DiffViewerResult,
  FileContent,
  FileRequestType,
  GitDiffResult,
  RsyncDiffResult,
  TransferProgressEvent,
  Uploader,
  UploadResult,
  WsClientMessage,
  WsDirectoryContentsMessage,
  WsFileResponseMessage,
  WsInitMessage,
} from "../types/mod.ts";
import { getFileDiffContents } from "../git/file-reader.ts";
import { getHtmlContent } from "./static/html.ts";
import { createUploader } from "../upload/mod.ts";
import { isVerbose } from "../ui/mod.ts";
import {
  batchAsync,
  buildRootLevelTree,
  getDirectChildren,
  shouldUseLazyLoading,
} from "../utils/mod.ts";

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

/** 遅延読み込みの閾値（この数を超えたら遅延読み込みを有効化） */
const LAZY_LOADING_THRESHOLD = 100;

/** サーバの状態 */
interface ServerState {
  /** 解決用のPromise resolve関数 */
  resolve: (result: DiffViewerResult) => void;
  /** サーバのAbortController */
  abortController: AbortController;
  /** WebSocket接続 */
  socket: WebSocket | null;
  /** Git diff結果 */
  diffResult: GitDiffResult;
  /** オプション */
  options: DiffViewerOptions;
  /** リモートファイル取得用のUploader（キャッシュ） */
  uploader: Uploader | null;
  /** 接続エラー（発生した場合） */
  connectionError: string | null;
  /** 変更があったファイルのパスリスト（remote diffモード時のみ） */
  changedFiles: string[] | null;
  /** 遅延読み込みモードが有効か */
  lazyLoading: boolean;
  /** rsync getDiff()の結果（キャッシュ、rsyncプロトコル時のみ） */
  rsyncDiffResult: RsyncDiffResult | null;
}

/**
 * WebSocketでエラーメッセージを送信
 */
function sendErrorMessage(socket: WebSocket, message: string): void {
  socket.send(JSON.stringify({
    type: "error",
    message,
  }));
}

/**
 * WebSocketにJSONメッセージを送信（接続中のみ）
 */
function sendJsonMessage(socket: WebSocket, message: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/**
 * 進捗コントローラーを作成
 */
function createProgressController(
  socket: WebSocket,
  state: ServerState,
): DiffViewerProgressController {
  return {
    sendProgress(event: TransferProgressEvent): void {
      sendJsonMessage(socket, { type: "progress", data: event });
    },
    sendComplete(result: UploadResult): void {
      sendJsonMessage(socket, {
        type: "complete",
        data: {
          successTargets: result.successTargets,
          failedTargets: result.failedTargets,
          totalFiles: result.totalFiles,
          totalSize: result.totalSize,
          totalDuration: result.totalDuration,
        },
      });
    },
    sendError(message: string): void {
      sendJsonMessage(socket, { type: "error", message });
    },
    close(): void {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      state.abortController.abort();
    },
  };
}

/**
 * diff-viewer サーバを起動
 */
export function startDiffViewerServer(
  diffResult: GitDiffResult,
  options: DiffViewerOptions,
): Promise<DiffViewerResult> {
  return new Promise((resolve) => {
    const abortController = new AbortController();

    // 遅延読み込みを使用するかどうかを判定
    const useLazyLoading = shouldUseLazyLoading(
      diffResult.files.length,
      LAZY_LOADING_THRESHOLD,
    );

    const state: ServerState = {
      resolve,
      abortController,
      socket: null,
      diffResult,
      options,
      uploader: null,
      connectionError: null,
      changedFiles: null,
      lazyLoading: useLazyLoading,
      rsyncDiffResult: null,
    };

    const server = Deno.serve(
      {
        port: options.port,
        signal: abortController.signal,
        onListen: () => {
          // サーバ起動時のログは呼び出し側で出力
        },
      },
      (req) => handleRequest(req, state),
    );

    // サーバが終了したときの処理
    server.finished.then(() => {
      // 正常終了以外の場合はキャンセル扱い
      if (state.socket === null) {
        resolve({ confirmed: false, cancelReason: "connection_closed" });
      }
    });
  });
}

/**
 * HTTPリクエストを処理
 */
function handleRequest(req: Request, state: ServerState): Response {
  const url = new URL(req.url);

  // WebSocketアップグレード
  if (req.headers.get("upgrade") === "websocket") {
    return handleWebSocketUpgrade(req, state);
  }

  // 静的ファイルの配信
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(getHtmlContent(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 404
  return new Response("Not Found", { status: 404 });
}

/**
 * WebSocketアップグレードを処理
 */
function handleWebSocketUpgrade(req: Request, state: ServerState): Response {
  const { socket, response } = Deno.upgradeWebSocket(req);

  state.socket = socket;

  socket.onopen = async () => {
    // 初期データを送信
    await sendInitMessage(socket, state);
  };

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data) as WsClientMessage;
      await handleWebSocketMessage(socket, message, state);
    } catch (error) {
      debugError("WebSocket message error:", error);
      socket.send(JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  };

  socket.onclose = () => {
    // 接続が閉じられたらサーバを終了
    if (state.socket === socket) {
      state.socket = null;
      state.abortController.abort();
      state.resolve({ confirmed: false, cancelReason: "connection_closed" });
    }
  };

  socket.onerror = (error) => {
    debugError("WebSocket error:", error);
  };

  return response;
}

/**
 * rsync getDiff()を使って変更ファイル一覧を取得
 */
async function tryRsyncGetDiff(
  state: ServerState,
): Promise<RsyncDiffResult | null> {
  const { options } = state;

  // localDirがない場合はスキップ
  if (!options.localDir) {
    debugLog("[RsyncDiff] No localDir specified, skipping rsync getDiff");
    return null;
  }

  // ターゲットがない場合はスキップ
  if (!options.targets || options.targets.length === 0) {
    debugLog("[RsyncDiff] No targets specified, skipping rsync getDiff");
    return null;
  }

  // uploadFilesがない場合はスキップ
  if (!options.uploadFiles || options.uploadFiles.length === 0) {
    debugLog("[RsyncDiff] No uploadFiles specified, skipping rsync getDiff");
    return null;
  }

  try {
    // Uploaderを取得または作成
    const uploader = await getOrCreateUploader(state);

    // getDiff()がサポートされているか確認
    if (!uploader.getDiff) {
      debugLog(
        "[RsyncDiff] Uploader does not support getDiff(), falling back to readFile()",
      );
      return null;
    }

    // uploadFilesの相対パスリストを取得（ディレクトリは除外）
    const filePaths = options.uploadFiles
      .filter((f) => !f.isDirectory)
      .map((f) => f.relativePath);

    debugLog(
      `[RsyncDiff] Running rsync getDiff() on ${options.localDir} for ${filePaths.length} files...`,
    );

    // rsync dry-runで差分を取得（比較対象をuploadFilesに限定）
    const result = await uploader.getDiff(options.localDir, filePaths);

    debugLog(
      `[RsyncDiff] Found ${result.entries.length} changed files (${result.added} new, ${result.modified} modified, ${result.deleted} deleted)`,
    );

    state.rsyncDiffResult = result;
    return result;
  } catch (error) {
    debugError(
      "[RsyncDiff] Failed to get diff via rsync:",
      error instanceof Error ? error.message : String(error),
    );
    // エラーの場合は従来の方式にフォールバック
    return null;
  }
}

/**
 * rsync getDiff()の結果を使ってファイル一覧をフィルタリング
 */
function filterFilesByRsyncDiff(
  files: DiffFile[],
  rsyncDiff: RsyncDiffResult,
): {
  files: DiffFile[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
    total: number;
  };
} {
  // rsync差分結果のパスをSetに変換（高速検索用）
  const changedPaths = new Set(rsyncDiff.entries.map((e) => e.path));
  const changeTypeMap = new Map(
    rsyncDiff.entries.map((e) => [e.path, e.changeType]),
  );

  // 変更があるファイルのみをフィルタリング
  const filteredFiles: DiffFile[] = [];

  for (const file of files) {
    if (changedPaths.has(file.path)) {
      // rsyncの差分タイプをDiffFileのstatusにマッピング
      const rsyncChangeType = changeTypeMap.get(file.path);
      filteredFiles.push({
        ...file,
        status: rsyncChangeType ?? file.status,
      });
    }
  }

  // サマリーを再計算
  const summary = {
    added: rsyncDiff.added,
    modified: rsyncDiff.modified,
    deleted: rsyncDiff.deleted,
    renamed: 0,
    total: filteredFiles.length,
  };

  return { files: filteredFiles, summary };
}

/**
 * 初期データを送信
 */
async function sendInitMessage(
  socket: WebSocket,
  state: ServerState,
): Promise<void> {
  const { diffResult, options } = state;
  let { lazyLoading } = state;

  // remoteTargets情報を構築
  const remoteTargets = options.targets?.map((t) => ({
    host: t.host,
    dest: t.dest,
  }));

  // remoteモードの場合、rsync getDiff()による最適化を試みる
  if (options.diffMode === "remote" && options.localDir) {
    const rsyncDiff = await tryRsyncGetDiff(state);

    if (rsyncDiff) {
      // rsync getDiff()が成功した場合、変更ファイルのみを送信
      const { files, summary } = filterFilesByRsyncDiff(
        diffResult.files,
        rsyncDiff,
      );

      // 変更があったファイルのパスリストを保存
      state.changedFiles = files.map((f) => f.path);

      // 変更ファイル数が少ない場合は遅延読み込みを無効化
      if (files.length <= LAZY_LOADING_THRESHOLD) {
        lazyLoading = false;
        state.lazyLoading = false;
      }

      const message: WsInitMessage = {
        type: "init",
        data: {
          base: options.base,
          target: options.target,
          diffMode: options.diffMode,
          files,
          summary,
          remoteTargets,
          lazyLoading: false, // rsync getDiff()使用時は遅延読み込み不要
        },
      };

      socket.send(JSON.stringify(message));

      // 接続エラーがあればクライアントに通知
      if (state.connectionError) {
        sendErrorMessage(socket, state.connectionError);
      }
      return;
    }
  }

  // 遅延読み込みモードの場合
  if (lazyLoading) {
    debugLog(
      `[LazyLoading] Enabled for ${diffResult.files.length} files`,
    );

    // ルートレベルのツリー構造を構築
    const tree = buildRootLevelTree(diffResult.files);

    // remoteモードの場合、ルートレベルのファイルのみステータスをチェック
    if (options.diffMode === "remote") {
      const concurrency = options.concurrency ?? 10;
      const rootFiles = tree.filter((node) => node.type === "file");

      if (rootFiles.length > 0) {
        debugLog(
          `[LazyLoading] Checking status for ${rootFiles.length} root-level files`,
        );

        await batchAsync(
          rootFiles,
          async (node) => {
            try {
              const { remoteStatus } = await getLocalAndRemoteContents(
                node.path,
                state,
              );
              node.status = remoteStatus.hasChanges
                ? (remoteStatus.exists ? "M" : "A")
                : "U";
            } catch {
              node.status = "A";
            }
          },
          concurrency,
        );
      }
    }

    const message: WsInitMessage = {
      type: "init",
      data: {
        base: options.base,
        target: options.target,
        diffMode: options.diffMode,
        files: diffResult.files,
        summary: {
          added: diffResult.added,
          modified: diffResult.modified,
          deleted: diffResult.deleted,
          renamed: diffResult.renamed,
          total: diffResult.files.length,
        },
        remoteTargets,
        tree,
        lazyLoading: true,
      },
    };

    socket.send(JSON.stringify(message));

    // 接続エラーがあればクライアントに通知
    if (state.connectionError) {
      sendErrorMessage(socket, state.connectionError);
    }
    return;
  }

  // 非遅延読み込みモード（従来の処理）
  let files = diffResult.files;
  let summary = {
    added: diffResult.added,
    modified: diffResult.modified,
    deleted: diffResult.deleted,
    renamed: diffResult.renamed,
    total: diffResult.files.length,
  };

  // remoteモードのみ（bothは除く）の場合、全ファイルのremoteStatusをチェックして差分があるファイルのみを返す
  // bothモードの場合はgitの差分をそのまま使用し、remote statusはファイル選択時に取得する
  if (options.diffMode === "remote") {
    const concurrency = options.concurrency ?? 10;
    debugLog(
      `[RemoteDiff] Checking remote status for ${files.length} files (concurrency: ${concurrency})...`,
    );

    // 全ファイルのremoteStatusを取得（同時実行数を制限）
    const filesWithStatus = await batchAsync(
      files,
      async (file) => {
        try {
          const { remoteStatus } = await getLocalAndRemoteContents(
            file.path,
            state,
          );
          return { file, remoteStatus };
        } catch (error) {
          debugError(
            `[RemoteDiff] Error checking status for ${file.path}:`,
            error,
          );
          // エラーの場合は差分ありとして扱う
          return { file, remoteStatus: { exists: false, hasChanges: true } };
        }
      },
      concurrency,
    );

    // 差分があるファイルのみをフィルタリング
    const changedFiles = filesWithStatus.filter(
      ({ remoteStatus }) => remoteStatus.hasChanges,
    );

    // サマリーを再計算
    let added = 0;
    let modified = 0;
    changedFiles.forEach(({ remoteStatus }) => {
      if (!remoteStatus.exists) {
        added++;
      } else {
        modified++;
      }
    });

    files = changedFiles.map(({ file, remoteStatus }) => ({
      ...file,
      // remoteStatusに基づいてstatusを更新
      status: remoteStatus.exists ? ("M" as const) : ("A" as const),
    }));

    summary = {
      added,
      modified,
      deleted: 0,
      renamed: 0,
      total: files.length,
    };

    debugLog(
      `[RemoteDiff] Found ${files.length} files with changes (${added} new, ${modified} modified)`,
    );

    // 変更があったファイルのパスリストを保存
    state.changedFiles = files.map((f) => f.path);
  }

  const message: WsInitMessage = {
    type: "init",
    data: {
      base: options.base,
      target: options.target,
      diffMode: options.diffMode,
      files,
      summary,
      remoteTargets,
      lazyLoading: false,
    },
  };

  socket.send(JSON.stringify(message));

  // 接続エラーがあればクライアントに通知
  if (state.connectionError) {
    sendErrorMessage(socket, state.connectionError);
  }
}

/**
 * WebSocketメッセージを処理
 */
async function handleWebSocketMessage(
  socket: WebSocket,
  message: WsClientMessage,
  state: ServerState,
): Promise<void> {
  switch (message.type) {
    case "file_request": {
      // リクエストタイプを取得（デフォルト: モードに応じたデフォルト）
      const requestType = message.requestType ??
        (state.options.diffMode === "git" ? "git" : "remote");

      await handleFileRequest(socket, message.path, requestType, state);
      break;
    }

    case "confirm": {
      // アップロード確認 - Uploaderを切断（リモート比較用）
      await disconnectUploader(state);
      // WebSocket接続は維持し、進捗コントローラーを作成して返却
      // state.socketはnullにしない（oncloseでの誤検知を防ぐ）
      const progressController = createProgressController(socket, state);
      state.resolve({
        confirmed: true,
        progressController,
        changedFiles: state.changedFiles ?? undefined,
      });
      break;
    }

    case "cancel": {
      // キャンセル - Uploaderを切断
      await disconnectUploader(state);
      state.socket = null;
      socket.close();
      state.abortController.abort();
      state.resolve({ confirmed: false, cancelReason: "user_cancel" });
      break;
    }

    case "expand_directory": {
      // ディレクトリ展開リクエスト
      await handleExpandDirectory(socket, message.path, state);
      break;
    }
  }
}

/**
 * ファイルリクエストを処理
 */
async function handleFileRequest(
  socket: WebSocket,
  path: string,
  requestType: FileRequestType,
  state: ServerState,
): Promise<void> {
  const response: WsFileResponseMessage = {
    type: "file_response",
    path,
    requestType,
  };

  try {
    if (requestType === "git" || requestType === "both") {
      // Git diff内容を取得
      const { base: baseContent, target: targetContent } =
        await getFileDiffContents(
          state.options.base,
          state.options.target,
          path,
        );
      response.base = baseContent;
      response.target = targetContent;
    }

    if (requestType === "remote" || requestType === "both") {
      // ローカルファイルとリモートファイルを取得
      const { local, remote, remoteStatus } = await getLocalAndRemoteContents(
        path,
        state,
      );
      response.local = local;
      response.remote = remote;
      response.remoteStatus = remoteStatus;
    }
  } catch (error) {
    debugError(`Error fetching file contents for ${path}:`, error);
    // エラーでも空の内容を返す
    if (requestType === "git" || requestType === "both") {
      response.base = response.base ?? { path, content: "", isBinary: false };
      response.target = response.target ??
        { path, content: "", isBinary: false };
    }
    if (requestType === "remote" || requestType === "both") {
      response.local = response.local ?? { path, content: "", isBinary: false };
      response.remote = response.remote ??
        { path, content: "", isBinary: false };
      response.remoteStatus = { exists: false, hasChanges: true };
    }
  }

  socket.send(JSON.stringify(response));

  // 接続エラーがあればクライアントに通知（catchの外でも確認）
  if (state.connectionError) {
    sendErrorMessage(socket, state.connectionError);
  }
}

/**
 * ローカルファイルとリモートファイルの内容を取得
 */
async function getLocalAndRemoteContents(
  path: string,
  state: ServerState,
): Promise<{
  local: FileContent;
  remote: FileContent;
  remoteStatus: { exists: boolean; hasChanges: boolean };
}> {
  const textDecoder = new TextDecoder();

  // ローカルファイル内容を取得
  const localContent = await getLocalFileContent(path, state);

  // リモートファイル内容を取得
  const remoteContent = await getRemoteFileContent(path, state);

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
async function getLocalFileContent(
  path: string,
  state: ServerState,
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
async function getRemoteFileContent(
  path: string,
  state: ServerState,
): Promise<Uint8Array | null> {
  const { targets } = state.options;

  // ターゲットが設定されていない場合はnullを返す
  if (!targets || targets.length === 0) {
    debugLog(`[RemoteDiff] No targets configured for path: ${path}`);
    return null;
  }

  try {
    // Uploaderを取得または作成
    debugLog(`[RemoteDiff] Fetching remote file: ${path}`);
    const uploader = await getOrCreateUploader(state);

    // リモートファイルを読み取り
    const remoteFile = await uploader.readFile(path);

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
async function getOrCreateUploader(state: ServerState): Promise<Uploader> {
  // 既に接続エラーが発生している場合は再試行しない
  if (state.connectionError) {
    throw new Error(state.connectionError);
  }

  // 既にUploaderが存在する場合はそれを返す
  if (state.uploader) {
    debugLog("[RemoteDiff] Using cached uploader connection");
    return state.uploader;
  }

  const { targets } = state.options;

  if (!targets || targets.length === 0) {
    const error = "No targets configured for remote file fetching";
    state.connectionError = error;
    throw new Error(error);
  }

  // 最初のターゲットを使用
  const target = targets[0];
  debugLog(
    `[RemoteDiff] Creating new uploader for ${target.host}:${target.dest}`,
  );
  const uploader = createUploader(target);

  // 接続
  debugLog(`[RemoteDiff] Connecting to ${target.host}...`);
  try {
    await uploader.connect();
    debugLog(`[RemoteDiff] Connected to ${target.host}`);
    state.uploader = uploader;
    return uploader;
  } catch (error) {
    // 接続エラーを記録
    const errorMessage = `Failed to connect to ${target.host}: ${
      error instanceof Error ? error.message : String(error)
    }`;
    state.connectionError = errorMessage;
    debugError(`[RemoteDiff] ${errorMessage}`);
    throw new Error(errorMessage);
  }
}

/**
 * Uploaderを切断
 */
async function disconnectUploader(state: ServerState): Promise<void> {
  if (state.uploader) {
    try {
      await state.uploader.disconnect();
    } catch {
      // 切断エラーは無視
    }
    state.uploader = null;
  }
}

/**
 * ディレクトリ展開リクエストを処理
 */
async function handleExpandDirectory(
  socket: WebSocket,
  dirPath: string,
  state: ServerState,
): Promise<void> {
  const { diffResult, options } = state;

  debugLog(`[LazyLoading] Expanding directory: ${dirPath}`);

  // 指定ディレクトリの直下の子ノードを取得
  const children = getDirectChildren(diffResult.files, dirPath);

  // remoteモードの場合、ファイルのステータスをチェック
  if (options.diffMode === "remote") {
    const concurrency = options.concurrency ?? 10;
    const fileNodes = children.filter((node) => node.type === "file");

    if (fileNodes.length > 0) {
      debugLog(
        `[LazyLoading] Checking status for ${fileNodes.length} files in ${dirPath}`,
      );

      await batchAsync(
        fileNodes,
        async (node) => {
          try {
            const { remoteStatus } = await getLocalAndRemoteContents(
              node.path,
              state,
            );
            node.status = remoteStatus.hasChanges
              ? (remoteStatus.exists ? "M" : "A")
              : "U";
          } catch {
            node.status = "A";
          }
        },
        concurrency,
      );
    }
  } else {
    // gitモードの場合、diffResultからステータスを取得
    for (const node of children) {
      if (node.type === "file") {
        const file = diffResult.files.find((f) => f.path === node.path);
        if (file) {
          node.status = file.status;
        }
      }
    }
  }

  // レスポンスを送信
  const response: WsDirectoryContentsMessage = {
    type: "directory_contents",
    path: dirPath,
    children,
  };

  socket.send(JSON.stringify(response));

  debugLog(
    `[LazyLoading] Sent ${children.length} children for ${dirPath}`,
  );
}

/**
 * バイナリコンテンツかどうかを判定
 */
function isBinaryContent(content: Uint8Array): boolean {
  // 最初の8192バイトをチェック
  const checkLength = Math.min(content.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    // NULLバイトがあればバイナリ
    if (content[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * サーバのURLを取得
 */
export function getServerUrl(port: number): string {
  return `http://localhost:${port}`;
}
