/**
 * アップローダーファクトリー
 *
 * プロトコルに応じたアップローダーインスタンスを作成
 */

import type { ResolvedTargetConfig, Uploader } from "../types/mod.ts";
import { UploadError } from "../types/mod.ts";
import { LocalUploader } from "./local.ts";
import { SftpUploader } from "./sftp.ts";
import { ScpUploader } from "./scp.ts";
import { RsyncUploader } from "./rsync.ts";

/**
 * アップローダーを作成
 */
export function createUploader(target: ResolvedTargetConfig): Uploader {
  switch (target.protocol) {
    case "local":
      return new LocalUploader({
        dest: target.dest,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
      });

    case "sftp":
      return new SftpUploader({
        host: target.host,
        port: target.port ?? 22,
        user: target.user,
        // password指定かつkey_file未指定なら自動的にpassword認証
        authType: target.auth_type ??
          (target.password && !target.key_file ? "password" : "ssh_key"),
        keyFile: target.key_file,
        password: target.password,
        dest: target.dest,
        timeout: (target.timeout ?? 30) * 1000,
        retry: target.retry ?? 3,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
        legacyMode: target.legacy_mode,
      });

    case "scp":
      return new ScpUploader({
        host: target.host,
        port: target.port ?? 22,
        user: target.user,
        keyFile: target.key_file,
        password: target.password,
        dest: target.dest,
        timeout: target.timeout ?? 30,
        retry: target.retry ?? 3,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
        legacyMode: target.legacy_mode,
      });

    case "rsync":
      return new RsyncUploader({
        host: target.host,
        port: target.port ?? 22,
        user: target.user,
        keyFile: target.key_file,
        password: target.password,
        dest: target.dest,
        timeout: target.timeout ?? 30,
        retry: target.retry ?? 3,
        preservePermissions: target.preserve_permissions,
        preserveTimestamps: target.preserve_timestamps,
        rsyncPath: target.rsync_path,
        rsyncOptions: target.rsync_options,
        legacyMode: target.legacy_mode,
      });

    default:
      throw new UploadError(
        `Unsupported protocol: ${target.protocol}`,
        "CONNECTION_ERROR",
      );
  }
}
