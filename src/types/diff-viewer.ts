/**
 * diff-viewer 関連の型定義
 */

import type { DiffFile, FileContent } from "./git.ts";
import type { DiffMode } from "./cli.ts";
import type { ResolvedTargetConfig } from "./config.ts";
import type { UploadFile } from "./upload.ts";

/** diff-viewerの起動オプション */
export interface DiffViewerOptions {
  /** ポート番号 */
  port: number;
  /** ブラウザを自動で開くか */
  openBrowser: boolean;
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
}

/** diff-viewerの起動結果 */
export interface DiffViewerResult {
  /** ユーザーがアップロードを確認したか */
  confirmed: boolean;
  /** キャンセル理由（キャンセル時のみ） */
  cancelReason?: "user_cancel" | "connection_closed" | "timeout";
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
  };
}

/** ファイルリクエストの種類 */
export type FileRequestType = "git" | "remote" | "both";

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

/** エラーメッセージ */
export interface WsErrorMessage extends WsMessageBase {
  type: "error";
  message: string;
}

/** サーバーからクライアントへのメッセージ */
export type WsServerMessage =
  | WsInitMessage
  | WsFileResponseMessage
  | WsErrorMessage;

/** クライアントからサーバーへのメッセージ */
export type WsClientMessage =
  | WsFileRequestMessage
  | WsConfirmMessage
  | WsCancelMessage;

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

/** diff表示モード */
export type DiffDisplayMode = "side-by-side" | "unified";
