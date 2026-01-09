/**
 * 設定ファイルの型定義
 */

/** 転送プロトコル */
export type Protocol = "sftp" | "scp" | "rsync" | "local";

/** 認証方式 */
export type AuthType = "ssh_key" | "password";

/** 同期モード */
export type SyncMode = "update" | "mirror";

/** ソースタイプ */
export type SourceType = "git" | "file";

/** ignore設定（名前付きグループ方式） */
export interface IgnoreConfig {
  /** 使用するグループ名 */
  use?: string[];
  /** 追加のパターン */
  add?: string[];
}

/** グローバル設定 */
export interface GlobalConfig {
  /** 名前付きignoreグループ */
  ignore_groups?: Record<string, string[]>;
  /** ignore未指定時に適用するデフォルトグループ名 */
  default_ignore?: string[];
}

/** Git ソース設定 */
export interface GitSource {
  type: "git";
  base: string;
  target?: string;
  include_untracked?: boolean;
}

/** File ソース設定 */
export interface FileSource {
  type: "file";
  src: string[];
}

/** ソース設定 */
export type SourceConfig = GitSource | FileSource;

/** ターゲットサーバ設定 */
export interface TargetConfig {
  host: string;
  protocol: Protocol;
  port?: number;
  user?: string;
  auth_type?: AuthType;
  key_file?: string;
  password?: string;
  dest: string;
  sync_mode?: SyncMode;
  preserve_permissions?: boolean;
  preserve_timestamps?: boolean;
  timeout?: number;
  retry?: number;
  /** rsync: リモート側で実行するrsyncコマンドパス（例: "sudo rsync"） */
  rsync_path?: string;
  /** rsync: 追加オプション（例: ["--chmod=D755,F644", "--chown=www-data:www-data"]） */
  rsync_options?: string[];
  /** 古いSSHサーバー向けのレガシーアルゴリズムを有効化 */
  legacy_mode?: boolean;
  /** ターゲット固有のignore設定 */
  ignore?: IgnoreConfig;
}

/** ターゲットのデフォルト設定（destは各ターゲットで必須なので除外） */
export type TargetDefaults = Partial<Omit<TargetConfig, "dest">>;

/** 入力時のターゲット設定（defaultsとマージ前、destのみ必須） */
export type PartialTargetConfig = Partial<TargetConfig> & { dest: string };

/** 宛先設定 */
export interface DestinationConfig {
  /** ターゲット共通のデフォルト設定 */
  defaults?: TargetDefaults;
  targets: PartialTargetConfig[];
}

/** プロファイル設定 */
export interface ProfileConfig {
  from: SourceConfig;
  to: DestinationConfig;
}

/** 設定ファイル全体 */
export interface Config {
  _global?: GlobalConfig;
  [profile: string]: ProfileConfig | GlobalConfig | undefined;
}

/** 解決済みターゲット設定（環境変数展開後） */
export interface ResolvedTargetConfig
  extends Omit<TargetConfig, "user" | "password" | "ignore"> {
  user: string;
  password?: string;
  /** 解決済みignoreパターン配列 */
  ignore: string[];
}

/** 解決済みプロファイル設定 */
export interface ResolvedProfileConfig {
  from: SourceConfig;
  to: {
    targets: ResolvedTargetConfig[];
  };
  ignore: string[];
}
