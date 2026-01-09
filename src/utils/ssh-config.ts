/**
 * SSH接続設定の共通ユーティリティ
 *
 * ssh-base.ts, rsync.ts, scp.ts で重複していた設定を統合
 */

/** SSH接続オプション */
export interface SshConnectionOptions {
  /** パスワード認証か */
  password?: string;
  /** 秘密鍵ファイルパス */
  keyFile?: string;
  /** ポート番号 */
  port: number;
  /** 接続タイムアウト（秒） */
  timeout?: number;
  /** レガシーモード（古いSSHサーバー向け） */
  legacyMode?: boolean;
}

/** SSH引数構築オプション */
export interface BuildSshArgsOptions {
  /** ポートオプション名（デフォルト: "-p"、SCPは"-P"） */
  portFlag?: "-p" | "-P";
  /** 秘密鍵オプションを先頭に配置するか */
  keyFileFirst?: boolean;
}

/**
 * レガシーモード用のアルゴリズム設定
 *
 * 古いSSHサーバー（OpenSSH 7.x以前など）との互換性のため、
 * 非推奨のアルゴリズムを有効化する
 */
export const LEGACY_ALGORITHMS = {
  /** 鍵交換アルゴリズム */
  kexAlgorithms:
    "+diffie-hellman-group-exchange-sha1,diffie-hellman-group14-sha1,diffie-hellman-group1-sha1",
  /** ホスト鍵アルゴリズム */
  hostKeyAlgorithms: "+ssh-rsa,ssh-dss",
  /** 公開鍵認証アルゴリズム */
  pubkeyAcceptedAlgorithms: "+ssh-rsa",
} as const;

/**
 * SSH接続の基本オプションを構築
 */
export function buildSshArgs(
  options: SshConnectionOptions,
  buildOptions?: BuildSshArgsOptions,
): string[] {
  const args: string[] = [];
  const portFlag = buildOptions?.portFlag ?? "-p";
  const keyFileFirst = buildOptions?.keyFileFirst ?? false;

  // 秘密鍵オプション（先頭に配置する場合）
  if (keyFileFirst && options.keyFile) {
    args.push("-i", options.keyFile);
  }

  // パスワード認証時はBatchModeを使わない（sshpassと互換性がない）
  if (!options.password) {
    args.push("-o", "BatchMode=yes");
  }

  // 基本的な接続オプション
  args.push(
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `ConnectTimeout=${options.timeout ?? 30}`,
    portFlag,
    String(options.port),
  );

  // 秘密鍵オプション（通常の位置）
  if (!keyFileFirst && options.keyFile) {
    args.push("-i", options.keyFile);
  }

  // レガシーモード: 古いSSHサーバー向けのアルゴリズムを有効化
  if (options.legacyMode) {
    args.push(
      "-o",
      `KexAlgorithms=${LEGACY_ALGORITHMS.kexAlgorithms}`,
      "-o",
      `HostKeyAlgorithms=${LEGACY_ALGORITHMS.hostKeyAlgorithms}`,
      "-o",
      `PubkeyAcceptedAlgorithms=${LEGACY_ALGORITHMS.pubkeyAcceptedAlgorithms}`,
    );
  }

  return args;
}

/**
 * rsync用のSSH接続コマンド文字列を構築
 */
export function buildSshCommand(options: SshConnectionOptions): string {
  const args = buildSshArgs(options);
  return `ssh ${args.join(" ")}`;
}

/**
 * sftp/ssh2ライブラリ用のレガシーアルゴリズム設定
 *
 * ssh2ライブラリはOpenSSH CLIとは設定形式が異なるため、
 * 配列形式でアルゴリズムを指定する
 */
export const LEGACY_ALGORITHMS_SSH2 = {
  /** 鍵交換アルゴリズム（モダン + レガシー） */
  kex: [
    // モダンなアルゴリズム
    "ecdh-sha2-nistp256",
    "ecdh-sha2-nistp384",
    "ecdh-sha2-nistp521",
    "diffie-hellman-group-exchange-sha256",
    "diffie-hellman-group14-sha256",
    // レガシーアルゴリズム
    "diffie-hellman-group-exchange-sha1",
    "diffie-hellman-group14-sha1",
    "diffie-hellman-group1-sha1",
  ],
  /** ホスト鍵アルゴリズム（レガシー優先） */
  serverHostKey: [
    "ssh-rsa", // レガシー（SHA-1ベース）- 古いサーバー向け
    "ssh-dss", // レガシー（DSA）
    "rsa-sha2-512",
    "rsa-sha2-256",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
  ],
  /** 暗号アルゴリズム（CBC対応追加） */
  cipher: [
    "aes128-ctr",
    "aes192-ctr",
    "aes256-ctr",
    "aes128-cbc", // レガシー
    "aes256-cbc", // レガシー
    "3des-cbc", // レガシー
  ],
  /** HMACアルゴリズム（古いサーバー向け） */
  hmac: [
    "hmac-sha2-256",
    "hmac-sha2-512",
    "hmac-sha1", // レガシー
    "hmac-md5", // レガシー
  ],
} as const;
