/**
 * diff-viewer 関連の型定義
 */

import type { DiffFile, FileChangeType, FileContent } from "./git.ts";
import type { DiffMode } from "./cli.ts";
import type { ResolvedTargetConfig } from "./config.ts";
import type {
  TransferProgressEvent,
  UploadFile,
  UploadResult,
} from "./upload.ts";

/** diff-viewerの起動オプション */
export interface DiffViewerOptions {
  /** ポート番号 */
  port: number;
  /** ブラウザを自動で開くか */
  openBrowser: boolean;
  /** CUIモードで確認するか */
  cui: boolean;
  /** base ブランチ（gitモード用） */
  base: string;
  /** target ブランチ（gitモード用） */
  target: string;
  /** diff表示モード */
  diffMode: DiffMode;
  /** ターゲット設定（remoteモード用） */
  targets?: ResolvedTargetConfig[];
  /** アップロード対象ファイル（remoteモード用） */
  uploadFiles?: UploadFile[];
  /** リモートステータスチェックの同時実行数（デフォルト: 10） */
  concurrency?: number;
  /** ローカルディレクトリパス（fileモード時、rsync diff用） */
  localDir?: string;
  /** Uploader接続のアイドルタイムアウト（秒、デフォルト: 300 = 5分、0で無効） */
  uploaderIdleTimeout?: number;
  /** rsync checksum比較を使用するか */
  checksum?: boolean;
}

/** diff-viewerの起動結果 */
export interface DiffViewerResult {
  /** ユーザーがアップロードを確認したか */
  confirmed: boolean;
  /** キャンセル理由（キャンセル時のみ） */
  cancelReason?: "user_cancel" | "connection_closed" | "timeout" | "no_changes";
  /** 進捗コントローラー（confirm時のみ存在） */
  progressController?: DiffViewerProgressController;
  /** ターゲットインデックスごとの変更ファイルリスト（remote diffモード時のみ） */
  changedFilesByTarget?: Map<number, string[]>;
}

/** diff-viewer進捗コントローラー */
export interface DiffViewerProgressController {
  /** 進捗を送信 */
  sendProgress(event: TransferProgressEvent): void;
  /** アップロード完了を通知 */
  sendComplete(result: UploadResult): void;
  /** エラーを通知 */
  sendError(message: string): void;
  /** 接続を閉じる */
  close(): void;
}

/** WebSocketメッセージの基底型 */
export interface WsMessageBase {
  type: string;
}

/** 初期データ送信メッセージ */
export interface WsInitMessage extends WsMessageBase {
  type: "init";
  data: {
    base: string;
    target: string;
    /** diff表示モード */
    diffMode: DiffMode;
    files: DiffFile[];
    summary: {
      added: number;
      modified: number;
      deleted: number;
      renamed: number;
      total: number;
    };
    /** リモートターゲット一覧（remoteモード用） */
    remoteTargets?: Array<{
      host: string;
      dest: string;
    }>;
    /** ツリー構造データ（遅延読み込みモード時） */
    tree?: DiffTreeNode[];
    /** 遅延読み込みが有効か */
    lazyLoading?: boolean;
    /** アップロードボタンの状態 */
    uploadButtonState?: UploadButtonState;
  };
}

/** アップロードボタン無効化理由 */
export type UploadButtonDisabledReason =
  | "no_changes"
  | "connection_error"
  | "checking";

/** アップロードボタンの状態 */
export interface UploadButtonState {
  /** 無効化されているか */
  disabled: boolean;
  /** 無効化理由（disabled=trueの場合） */
  reason?: UploadButtonDisabledReason;
  /** 無効化メッセージ（ツールチップ用） */
  message?: string;
}

/** ファイルリクエストの種類（リモート差分のみサポート） */
export type FileRequestType = "remote";

/** ファイル内容リクエストメッセージ */
export interface WsFileRequestMessage extends WsMessageBase {
  type: "file_request";
  path: string;
  /** リクエストするファイルの種類（デフォルト: git） */
  requestType?: FileRequestType;
}

/** ファイル内容レスポンスメッセージ */
export interface WsFileResponseMessage extends WsMessageBase {
  type: "file_response";
  path: string;
  /** リクエストの種類 */
  requestType: FileRequestType;
  // Git diff用（requestType: "git" または "both"）
  /** Git baseの内容 */
  base?: FileContent;
  /** Git targetの内容 */
  target?: FileContent;
  // Remote diff用（requestType: "remote" または "both"）
  /** ローカルファイルの内容 */
  local?: FileContent;
  /** リモートファイルの内容 */
  remote?: FileContent;
  /** リモートファイルのステータス情報 */
  remoteStatus?: {
    /** リモートにファイルが存在するか */
    exists: boolean;
    /** ローカルとリモートに差分があるか */
    hasChanges: boolean;
  };
}

/** アップロード確認メッセージ */
export interface WsConfirmMessage extends WsMessageBase {
  type: "confirm";
}

/** キャンセルメッセージ */
export interface WsCancelMessage extends WsMessageBase {
  type: "cancel";
}

/** ターゲット切り替えメッセージ */
export interface WsSwitchTargetMessage extends WsMessageBase {
  type: "switch_target";
  /** 新しいターゲットインデックス */
  targetIndex: number;
}

/** ディレクトリ展開リクエストメッセージ */
export interface WsExpandDirectoryMessage extends WsMessageBase {
  type: "expand_directory";
  /** 展開するディレクトリのパス */
  path: string;
}

/** ディレクトリ内容レスポンスメッセージ */
export interface WsDirectoryContentsMessage extends WsMessageBase {
  type: "directory_contents";
  /** ディレクトリパス */
  path: string;
  /** 子ノード一覧 */
  children: DiffTreeNode[];
}

/** エラーメッセージ */
export interface WsErrorMessage extends WsMessageBase {
  type: "error";
  message: string;
}

/** アップロード進捗メッセージ */
export interface WsProgressMessage extends WsMessageBase {
  type: "progress";
  data: TransferProgressEvent;
}

/** アップロード完了データ */
export interface UploadCompleteData {
  /** 成功したターゲット数 */
  successTargets: number;
  /** 失敗したターゲット数 */
  failedTargets: number;
  /** 合計転送ファイル数 */
  totalFiles: number;
  /** 合計転送サイズ */
  totalSize: number;
  /** 合計転送時間（ミリ秒） */
  totalDuration: number;
}

/** アップロード完了メッセージ */
export interface WsCompleteMessage extends WsMessageBase {
  type: "complete";
  data: UploadCompleteData;
}

/** キャンセル済みメッセージ */
export interface WsCancelledMessage extends WsMessageBase {
  type: "cancelled";
}

/** アップロードボタン状態更新メッセージ */
export interface WsUploadStateMessage extends WsMessageBase {
  type: "upload_state";
  data: UploadButtonState;
}

/** ターゲットごとの差分サマリー */
export interface TargetDiffSummary {
  /** ターゲットインデックス */
  targetIndex: number;
  /** ホスト名 */
  host: string;
  /** 宛先パス */
  dest: string;
  /** ファイル数 */
  fileCount: number;
  /** 追加ファイル数 */
  added: number;
  /** 変更ファイル数 */
  modified: number;
  /** 削除ファイル数 */
  deleted: number;
  /** チェック完了したか */
  completed: boolean;
  /** エラーメッセージ（エラー時のみ） */
  error?: string;
}

/** ローディング進捗メッセージ */
export interface WsLoadingProgressMessage extends WsMessageBase {
  type: "loading_progress";
  data: {
    /** 現在チェック中のターゲット名（複数可） */
    checkingTargets: string[];
    /** 完了したターゲット数 */
    completedCount: number;
    /** 全ターゲット数 */
    totalCount: number;
    /** 各ターゲットの結果 */
    results: TargetDiffSummary[];
  };
}

/** サーバーからクライアントへのメッセージ */
export type WsServerMessage =
  | WsInitMessage
  | WsFileResponseMessage
  | WsDirectoryContentsMessage
  | WsErrorMessage
  | WsProgressMessage
  | WsCompleteMessage
  | WsCancelledMessage
  | WsUploadStateMessage
  | WsLoadingProgressMessage;

/** クライアントからサーバーへのメッセージ */
export type WsClientMessage =
  | WsFileRequestMessage
  | WsExpandDirectoryMessage
  | WsConfirmMessage
  | WsCancelMessage
  | WsSwitchTargetMessage;

/** diff-viewerの状態 */
export interface DiffViewerState {
  /** サーバーが起動中か */
  running: boolean;
  /** 接続中のクライアント数 */
  clientCount: number;
  /** 最後のアクティビティ時刻 */
  lastActivity: Date;
}

/** CUIフォールバックの確認結果 */
export interface CuiConfirmResult {
  /** ユーザーがアップロードを確認したか */
  confirmed: boolean;
  /** 変更がなかった場合true（確認をスキップ） */
  noChanges?: boolean;
  /** ターゲットインデックスごとの変更ファイルリスト（remote diffモード時のみ） */
  changedFilesByTarget?: Map<number, string[]>;
}

/** ファイルツリーノード */
export interface FileTreeNode {
  /** ノード名（ファイル名またはディレクトリ名） */
  name: string;
  /** フルパス */
  path: string;
  /** ディレクトリかどうか */
  isDirectory: boolean;
  /** 子ノード（ディレクトリの場合） */
  children?: FileTreeNode[];
  /** 変更種別（ファイルの場合） */
  status?: "A" | "M" | "D" | "R";
}

/** diff viewer用ツリーノード（遅延読み込み対応） */
export interface DiffTreeNode {
  /** ノード名（ファイル名またはディレクトリ名） */
  name: string;
  /** フルパス */
  path: string;
  /** ノードタイプ */
  type: "file" | "directory";
  /** 変更ステータス（ファイルのみ、remoteモード時は遅延評価） */
  status?: FileChangeType;
  /** 子ノードが読み込み済みか（ディレクトリのみ） */
  loaded?: boolean;
  /** 子ノード（ディレクトリのみ） */
  children?: DiffTreeNode[];
  /** ファイル数（ディレクトリの場合、子孫のファイル総数） */
  fileCount?: number;
}

/** diff表示モード */
export type DiffDisplayMode = "side-by-side" | "unified";
