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

/** アップローダーインターフェース */
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
