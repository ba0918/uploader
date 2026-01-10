/**
 * アップロード関連の型定義
 */

import type { ResolvedTargetConfig } from "./config.ts";

/** アップロードするファイル情報 */
export interface UploadFile {
  /** ソースファイルの絶対パス（ローカルファイルの場合） */
  sourcePath?: string;
  /** 相対パス（アップロード先での配置パス） */
  relativePath: string;
  /** ファイル内容（Gitモードの場合） */
  content?: Uint8Array;
  /** ファイルサイズ（バイト） */
  size: number;
  /** ディレクトリかどうか */
  isDirectory: boolean;
  /** 変更種別（Gitモードの場合） */
  changeType?: "add" | "modify" | "delete";
}

/** 転送状態 */
export type TransferStatus =
  | "pending"
  | "connecting"
  | "uploading"
  | "completed"
  | "failed"
  | "skipped";

/** 単一ファイルの転送結果 */
export interface FileTransferResult {
  /** ファイルパス */
  path: string;
  /** 転送状態 */
  status: TransferStatus;
  /** ファイルサイズ（バイト） */
  size: number;
  /** 転送時間（ミリ秒） */
  duration?: number;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/** ターゲットへの転送結果 */
export interface TargetUploadResult {
  /** ターゲット設定 */
  target: ResolvedTargetConfig;
  /** 転送状態 */
  status: TransferStatus;
  /** 成功したファイル数 */
  successCount: number;
  /** 失敗したファイル数 */
  failedCount: number;
  /** スキップしたファイル数 */
  skippedCount: number;
  /** ファイルごとの転送結果 */
  files: FileTransferResult[];
  /** 転送時間（ミリ秒） */
  duration: number;
  /** エラーメッセージ（接続失敗時など） */
  error?: string;
}

/** 全体のアップロード結果 */
export interface UploadResult {
  /** 成功したターゲット数 */
  successTargets: number;
  /** 失敗したターゲット数 */
  failedTargets: number;
  /** ターゲットごとの結果 */
  targets: TargetUploadResult[];
  /** 合計転送ファイル数 */
  totalFiles: number;
  /** 合計転送サイズ */
  totalSize: number;
  /** 合計転送時間（ミリ秒） */
  totalDuration: number;
}

/** アップロードオプション */
export interface UploadOptions {
  /** dry-runモード */
  dryRun?: boolean;
  /** 削除同期（mirrorモード時に有効） */
  deleteRemote?: boolean;
  /** 厳格モード（1ファイルでも失敗したらエラー終了） */
  strict?: boolean;
  /** 複数ターゲットへの並列アップロード */
  parallel?: boolean;
  /** ターゲットインデックスごとのファイルリスト（remote diffモード用） */
  filesByTarget?: Map<number, UploadFile[]>;
}

/** 転送進捗イベント */
export interface TransferProgressEvent {
  /** 現在のターゲットインデックス */
  targetIndex: number;
  /** ターゲット総数 */
  totalTargets: number;
  /** ターゲットホスト名 */
  host: string;
  /** 現在のファイルインデックス */
  fileIndex: number;
  /** ファイル総数 */
  totalFiles: number;
  /** 現在のファイルパス */
  currentFile: string;
  /** 転送済みバイト数 */
  bytesTransferred: number;
  /** ファイルのサイズ */
  fileSize: number;
  /** ステータス */
  status: TransferStatus;
}

/** 転送進捗コールバック */
export type TransferProgressCallback = (
  event: TransferProgressEvent,
) => void;

/** リモートファイル読み取り結果 */
export interface RemoteFileContent {
  /** ファイル内容 */
  content: Uint8Array;
  /** ファイルサイズ */
  size: number;
}

/** 一括アップロード進捗コールバック */
export type BulkUploadProgressCallback = (
  completedFiles: number,
  totalFiles: number,
  currentFile?: string,
) => void;

/** 一括アップロード結果 */
export interface BulkUploadResult {
  /** 成功したファイル数 */
  successCount: number;
  /** 失敗したファイル数 */
  failedCount: number;
  /** 転送サイズ（バイト） */
  totalSize: number;
  /** 転送時間（ミリ秒） */
  duration: number;
}

/** rsync差分エントリの変更種別 */
export type RsyncDiffChangeType = "A" | "M" | "D";

/** rsync差分エントリ */
export interface RsyncDiffEntry {
  /** ファイルパス（相対パス） */
  path: string;
  /** 変更種別: A=追加, M=変更, D=削除 */
  changeType: RsyncDiffChangeType;
}

/** rsync差分結果 */
export interface RsyncDiffResult {
  /** 差分があるファイル一覧 */
  entries: RsyncDiffEntry[];
  /** 追加ファイル数 */
  added: number;
  /** 変更ファイル数 */
  modified: number;
  /** 削除ファイル数 */
  deleted: number;
}

/**
 * 基本アップローダーインターフェース (ISP: 必須メソッドのみ)
 *
 * すべてのアップローダー実装が提供する基本操作。
 */
export interface Uploader {
  /** 接続 */
  connect(): Promise<void>;
  /** 切断 */
  disconnect(): Promise<void>;
  /** ディレクトリ作成 */
  mkdir(remotePath: string): Promise<void>;
  /** ファイルアップロード */
  upload(
    file: UploadFile,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void>;
  /** ファイル削除 */
  delete(remotePath: string): Promise<void>;
  /**
   * リモートファイル読み取り
   * @param remotePath リモートパス（dest相対）
   * @returns ファイル内容、存在しない場合はnull
   */
  readFile(remotePath: string): Promise<RemoteFileContent | null>;
}

/**
 * 一括アップロード機能インターフェース (ISP: 拡張機能)
 *
 * 複数ファイルを一度のコマンドで効率的に転送できるプロトコル用。
 * 現在はrsyncプロトコルのみがサポート。
 */
export interface BulkUploadCapable {
  /**
   * 一括アップロード
   * @param files アップロードするファイル一覧
   * @param onProgress 進捗コールバック
   * @returns 一括アップロード結果
   */
  bulkUpload(
    files: UploadFile[],
    onProgress?: BulkUploadProgressCallback,
  ): Promise<BulkUploadResult>;
}

/**
 * リモート差分検出機能インターフェース (ISP: 拡張機能)
 *
 * ローカルとリモートの差分を高速に検出できるプロトコル用。
 * 現在はrsyncプロトコルのみがサポート。
 */
export interface DiffCapable {
  /**
   * リモートとの差分を取得
   * @param localDir ローカルディレクトリのパス
   * @param files 比較対象のファイルパス（相対パス）のリスト。省略時はディレクトリ全体を比較
   * @param options オプション
   * @returns 差分結果
   */
  getDiff(
    localDir: string,
    files?: string[],
    options?: { checksum?: boolean },
  ): Promise<RsyncDiffResult>;
}

/**
 * 一括アップロード機能を持つかどうかを判定する型ガード
 * @param uploader アップローダー
 * @returns BulkUploadCapable を実装している場合 true
 */
export function hasBulkUpload(
  uploader: Uploader,
): uploader is Uploader & BulkUploadCapable {
  return typeof (uploader as unknown as BulkUploadCapable).bulkUpload ===
    "function";
}

/**
 * リモート差分検出機能を持つかどうかを判定する型ガード
 * @param uploader アップローダー
 * @returns DiffCapable を実装している場合 true
 */
export function hasDiff(
  uploader: Uploader,
): uploader is Uploader & DiffCapable {
  return typeof (uploader as unknown as DiffCapable).getDiff === "function";
}

/** アップローダーエラー */
export class UploadError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CONNECTION_ERROR"
      | "AUTH_ERROR"
      | "TRANSFER_ERROR"
      | "PERMISSION_ERROR"
      | "TIMEOUT_ERROR",
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "UploadError";
  }
}
