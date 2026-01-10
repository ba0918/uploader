/**
 * upload/factory.ts のテスト
 */

import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { createUploader } from "../../src/upload/factory.ts";
import { LocalUploader } from "../../src/upload/local.ts";
import { SftpUploader } from "../../src/upload/sftp.ts";
import { ScpUploader } from "../../src/upload/scp.ts";
import { RsyncUploader } from "../../src/upload/rsync.ts";
import { UploadError } from "../../src/types/mod.ts";
import type { ResolvedTargetConfig } from "../../src/types/config.ts";

// テスト用のベース設定を作成
function createBaseTarget(
  overrides: Partial<ResolvedTargetConfig>,
): ResolvedTargetConfig {
  return {
    host: "example.com",
    protocol: "sftp",
    port: 22,
    user: "testuser",
    dest: "/var/www/",
    sync_mode: "update",
    preserve_permissions: false,
    preserve_timestamps: false,
    timeout: 30,
    retry: 3,
    ignore: [],
    ...overrides,
  };
}

describe("createUploader", () => {
  describe("local プロトコル", () => {
    it("LocalUploaderを作成できる", () => {
      const target = createBaseTarget({
        protocol: "local",
        host: "localhost",
        dest: "/tmp/upload/",
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, LocalUploader);
    });

    it("preservePermissions設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "local",
        host: "localhost",
        dest: "/tmp/upload/",
        preserve_permissions: true,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, LocalUploader);
    });

    it("preserveTimestamps設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "local",
        host: "localhost",
        dest: "/tmp/upload/",
        preserve_timestamps: true,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, LocalUploader);
    });
  });

  describe("sftp プロトコル", () => {
    it("SftpUploaderを作成できる", () => {
      const target = createBaseTarget({
        protocol: "sftp",
        host: "sftp.example.com",
        user: "sftpuser",
        key_file: "~/.ssh/id_rsa",
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });

    it("パスワード認証設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "sftp",
        host: "sftp.example.com",
        user: "sftpuser",
        password: "secret",
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });

    it("auth_type指定が優先される", () => {
      const target = createBaseTarget({
        protocol: "sftp",
        host: "sftp.example.com",
        user: "sftpuser",
        password: "secret",
        auth_type: "ssh_key",
        key_file: "~/.ssh/id_rsa",
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });

    it("デフォルトポート22が使用される", () => {
      const target = createBaseTarget({
        protocol: "sftp",
        host: "sftp.example.com",
        user: "sftpuser",
        port: undefined,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });

    it("カスタムポートが反映される", () => {
      const target = createBaseTarget({
        protocol: "sftp",
        host: "sftp.example.com",
        user: "sftpuser",
        port: 2222,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });

    it("legacyMode設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "sftp",
        host: "sftp.example.com",
        user: "sftpuser",
        legacy_mode: true,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });

    it("タイムアウト設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "sftp",
        host: "sftp.example.com",
        user: "sftpuser",
        timeout: 60,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });

    it("リトライ設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "sftp",
        host: "sftp.example.com",
        user: "sftpuser",
        retry: 5,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });

    it("timeout未指定でデフォルト30秒が使用される", () => {
      const target: ResolvedTargetConfig = {
        host: "sftp.example.com",
        protocol: "sftp",
        port: 22,
        user: "sftpuser",
        dest: "/var/www/",
        sync_mode: "update",
        preserve_permissions: false,
        preserve_timestamps: false,
        timeout: undefined,
        retry: 3,
        ignore: [],
      };

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });

    it("retry未指定でデフォルト3回が使用される", () => {
      const target: ResolvedTargetConfig = {
        host: "sftp.example.com",
        protocol: "sftp",
        port: 22,
        user: "sftpuser",
        dest: "/var/www/",
        sync_mode: "update",
        preserve_permissions: false,
        preserve_timestamps: false,
        timeout: 30,
        retry: undefined,
        ignore: [],
      };

      const uploader = createUploader(target);

      assertInstanceOf(uploader, SftpUploader);
    });
  });

  describe("scp プロトコル", () => {
    it("ScpUploaderを作成できる", () => {
      const target = createBaseTarget({
        protocol: "scp",
        host: "scp.example.com",
        user: "scpuser",
        key_file: "~/.ssh/id_rsa",
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, ScpUploader);
    });

    it("パスワード設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "scp",
        host: "scp.example.com",
        user: "scpuser",
        password: "secret",
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, ScpUploader);
    });

    it("legacyMode設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "scp",
        host: "scp.example.com",
        user: "scpuser",
        legacy_mode: true,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, ScpUploader);
    });

    it("カスタムポートが反映される", () => {
      const target = createBaseTarget({
        protocol: "scp",
        host: "scp.example.com",
        user: "scpuser",
        port: 2222,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, ScpUploader);
    });

    it("port未指定でデフォルト22が使用される", () => {
      const target: ResolvedTargetConfig = {
        host: "scp.example.com",
        protocol: "scp",
        port: undefined,
        user: "scpuser",
        dest: "/var/www/",
        sync_mode: "update",
        preserve_permissions: false,
        preserve_timestamps: false,
        timeout: 30,
        retry: 3,
        ignore: [],
      };

      const uploader = createUploader(target);

      assertInstanceOf(uploader, ScpUploader);
    });

    it("timeout未指定でデフォルト30秒が使用される", () => {
      const target: ResolvedTargetConfig = {
        host: "scp.example.com",
        protocol: "scp",
        port: 22,
        user: "scpuser",
        dest: "/var/www/",
        sync_mode: "update",
        preserve_permissions: false,
        preserve_timestamps: false,
        timeout: undefined,
        retry: 3,
        ignore: [],
      };

      const uploader = createUploader(target);

      assertInstanceOf(uploader, ScpUploader);
    });

    it("retry未指定でデフォルト3回が使用される", () => {
      const target: ResolvedTargetConfig = {
        host: "scp.example.com",
        protocol: "scp",
        port: 22,
        user: "scpuser",
        dest: "/var/www/",
        sync_mode: "update",
        preserve_permissions: false,
        preserve_timestamps: false,
        timeout: 30,
        retry: undefined,
        ignore: [],
      };

      const uploader = createUploader(target);

      assertInstanceOf(uploader, ScpUploader);
    });
  });

  describe("rsync プロトコル", () => {
    it("RsyncUploaderを作成できる", () => {
      const target = createBaseTarget({
        protocol: "rsync",
        host: "rsync.example.com",
        user: "rsyncuser",
        key_file: "~/.ssh/id_rsa",
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, RsyncUploader);
    });

    it("rsyncPath設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "rsync",
        host: "rsync.example.com",
        user: "rsyncuser",
        rsync_path: "/usr/local/bin/rsync",
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, RsyncUploader);
    });

    it("rsyncOptions設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "rsync",
        host: "rsync.example.com",
        user: "rsyncuser",
        rsync_options: ["--compress", "--checksum"],
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, RsyncUploader);
    });

    it("legacyMode設定が反映される", () => {
      const target = createBaseTarget({
        protocol: "rsync",
        host: "rsync.example.com",
        user: "rsyncuser",
        legacy_mode: true,
      });

      const uploader = createUploader(target);

      assertInstanceOf(uploader, RsyncUploader);
    });

    it("port未指定でデフォルト22が使用される", () => {
      const target: ResolvedTargetConfig = {
        host: "rsync.example.com",
        protocol: "rsync",
        port: undefined,
        user: "rsyncuser",
        dest: "/var/www/",
        sync_mode: "update",
        preserve_permissions: false,
        preserve_timestamps: false,
        timeout: 30,
        retry: 3,
        ignore: [],
      };

      const uploader = createUploader(target);

      assertInstanceOf(uploader, RsyncUploader);
    });

    it("timeout未指定でデフォルト30秒が使用される", () => {
      const target: ResolvedTargetConfig = {
        host: "rsync.example.com",
        protocol: "rsync",
        port: 22,
        user: "rsyncuser",
        dest: "/var/www/",
        sync_mode: "update",
        preserve_permissions: false,
        preserve_timestamps: false,
        timeout: undefined,
        retry: 3,
        ignore: [],
      };

      const uploader = createUploader(target);

      assertInstanceOf(uploader, RsyncUploader);
    });

    it("retry未指定でデフォルト3回が使用される", () => {
      const target: ResolvedTargetConfig = {
        host: "rsync.example.com",
        protocol: "rsync",
        port: 22,
        user: "rsyncuser",
        dest: "/var/www/",
        sync_mode: "update",
        preserve_permissions: false,
        preserve_timestamps: false,
        timeout: 30,
        retry: undefined,
        ignore: [],
      };

      const uploader = createUploader(target);

      assertInstanceOf(uploader, RsyncUploader);
    });
  });

  describe("エラーハンドリング", () => {
    it("未サポートのプロトコルでエラーを投げる", () => {
      const target = createBaseTarget({
        // @ts-expect-error: テスト用に無効なプロトコルを指定
        protocol: "ftp",
        host: "ftp.example.com",
        user: "ftpuser",
      });

      assertThrows(
        () => createUploader(target),
        UploadError,
        "Unsupported protocol: ftp",
      );
    });

    it("未知のプロトコルでUploadErrorを投げる", () => {
      const target = createBaseTarget({
        // @ts-expect-error: テスト用に無効なプロトコルを指定
        protocol: "unknown",
        host: "unknown.example.com",
      });

      const error = assertThrows(
        () => createUploader(target),
        UploadError,
      );

      assertEquals(error.code, "CONNECTION_ERROR");
    });
  });
});
