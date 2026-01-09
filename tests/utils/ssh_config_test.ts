/**
 * SSH接続設定ユーティリティのテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  buildSshArgs,
  buildSshCommand,
  LEGACY_ALGORITHMS,
  LEGACY_ALGORITHMS_SSH2,
} from "../../src/utils/ssh-config.ts";

describe("buildSshArgs", () => {
  it("基本的なSSH引数を構築する", () => {
    const args = buildSshArgs({
      port: 22,
    });

    assertEquals(args.includes("-o"), true);
    assertEquals(args.includes("BatchMode=yes"), true);
    assertEquals(args.includes("StrictHostKeyChecking=accept-new"), true);
    assertEquals(args.includes("-p"), true);
    assertEquals(args.includes("22"), true);
  });

  it("パスワード認証時はBatchModeを含めない", () => {
    const args = buildSshArgs({
      port: 22,
      password: "secret",
    });

    assertEquals(args.includes("BatchMode=yes"), false);
  });

  it("秘密鍵ファイルを指定できる", () => {
    const args = buildSshArgs({
      port: 22,
      keyFile: "/path/to/key",
    });

    assertEquals(args.includes("-i"), true);
    assertEquals(args.includes("/path/to/key"), true);
  });

  it("カスタムタイムアウトを指定できる", () => {
    const args = buildSshArgs({
      port: 22,
      timeout: 60,
    });

    assertEquals(args.includes("ConnectTimeout=60"), true);
  });

  it("デフォルトタイムアウトは30秒", () => {
    const args = buildSshArgs({
      port: 22,
    });

    assertEquals(args.includes("ConnectTimeout=30"), true);
  });

  it("レガシーモードでアルゴリズムオプションを追加する", () => {
    const args = buildSshArgs({
      port: 22,
      legacyMode: true,
    });

    const argsStr = args.join(" ");
    assertEquals(argsStr.includes("KexAlgorithms="), true);
    assertEquals(argsStr.includes("HostKeyAlgorithms="), true);
    assertEquals(argsStr.includes("PubkeyAcceptedAlgorithms="), true);
  });

  it("SCPではポートオプションを-Pにできる", () => {
    const args = buildSshArgs(
      { port: 2222 },
      { portFlag: "-P" },
    );

    assertEquals(args.includes("-P"), true);
    assertEquals(args.includes("2222"), true);
    assertEquals(args.includes("-p"), false);
  });

  it("keyFileFirstオプションで秘密鍵を先頭に配置できる", () => {
    const args = buildSshArgs(
      { port: 22, keyFile: "/path/to/key" },
      { keyFileFirst: true },
    );

    // 最初の要素が-iであることを確認
    assertEquals(args[0], "-i");
    assertEquals(args[1], "/path/to/key");
  });
});

describe("buildSshCommand", () => {
  it("sshコマンド文字列を構築する", () => {
    const cmd = buildSshCommand({
      port: 22,
    });

    assertEquals(cmd.startsWith("ssh "), true);
    assertEquals(cmd.includes("-o BatchMode=yes"), true);
    assertEquals(cmd.includes("-p 22"), true);
  });

  it("レガシーモードを含むコマンドを構築する", () => {
    const cmd = buildSshCommand({
      port: 22,
      legacyMode: true,
    });

    assertEquals(cmd.includes("KexAlgorithms="), true);
  });
});

describe("LEGACY_ALGORITHMS", () => {
  it("鍵交換アルゴリズムが定義されている", () => {
    assertEquals(
      LEGACY_ALGORITHMS.kexAlgorithms.includes("diffie-hellman-group14-sha1"),
      true,
    );
  });

  it("ホスト鍵アルゴリズムが定義されている", () => {
    assertEquals(LEGACY_ALGORITHMS.hostKeyAlgorithms.includes("ssh-rsa"), true);
  });

  it("公開鍵認証アルゴリズムが定義されている", () => {
    assertEquals(
      LEGACY_ALGORITHMS.pubkeyAcceptedAlgorithms.includes("ssh-rsa"),
      true,
    );
  });
});

describe("LEGACY_ALGORITHMS_SSH2", () => {
  it("ssh2ライブラリ用の鍵交換アルゴリズムが配列で定義されている", () => {
    assertEquals(Array.isArray(LEGACY_ALGORITHMS_SSH2.kex), true);
    assertEquals(
      LEGACY_ALGORITHMS_SSH2.kex.includes("diffie-hellman-group14-sha1"),
      true,
    );
  });

  it("ssh2ライブラリ用のホスト鍵アルゴリズムが配列で定義されている", () => {
    assertEquals(Array.isArray(LEGACY_ALGORITHMS_SSH2.serverHostKey), true);
    assertEquals(LEGACY_ALGORITHMS_SSH2.serverHostKey.includes("ssh-rsa"), true);
  });

  it("ssh2ライブラリ用の暗号アルゴリズムが配列で定義されている", () => {
    assertEquals(Array.isArray(LEGACY_ALGORITHMS_SSH2.cipher), true);
    assertEquals(LEGACY_ALGORITHMS_SSH2.cipher.includes("aes128-ctr"), true);
    assertEquals(LEGACY_ALGORITHMS_SSH2.cipher.includes("aes128-cbc"), true); // レガシー
  });

  it("ssh2ライブラリ用のHMACアルゴリズムが配列で定義されている", () => {
    assertEquals(Array.isArray(LEGACY_ALGORITHMS_SSH2.hmac), true);
    assertEquals(LEGACY_ALGORITHMS_SSH2.hmac.includes("hmac-sha2-256"), true);
    assertEquals(LEGACY_ALGORITHMS_SSH2.hmac.includes("hmac-sha1"), true); // レガシー
  });
});
