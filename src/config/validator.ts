/**
 * 設定ファイルの検証
 */

import type {
  Config,
  ProfileConfig,
  SourceConfig,
  TargetConfig,
} from "../types/mod.ts";

/** 検証エラー */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "ConfigValidationError";
  }
}

/**
 * 設定ファイル全体を検証
 */
export function validateConfig(config: unknown): Config {
  if (typeof config !== "object" || config === null) {
    throw new ConfigValidationError(
      "設定ファイルはオブジェクトである必要があります",
      "root",
    );
  }

  const result: Config = {};
  const configObj = config as Record<string, unknown>;

  for (const [key, value] of Object.entries(configObj)) {
    if (key === "_global") {
      result._global = validateGlobal(value);
    } else {
      result[key] = validateProfile(value, key);
    }
  }

  return result;
}

/**
 * グローバル設定を検証
 */
function validateGlobal(value: unknown): { ignore?: string[] } {
  if (typeof value !== "object" || value === null) {
    throw new ConfigValidationError(
      "_global はオブジェクトである必要があります",
      "_global",
    );
  }

  const global = value as Record<string, unknown>;
  const result: { ignore?: string[] } = {};

  if (global.ignore !== undefined) {
    if (!Array.isArray(global.ignore)) {
      throw new ConfigValidationError(
        "ignore は配列である必要があります",
        "_global.ignore",
      );
    }
    result.ignore = global.ignore.map((item, i) => {
      if (typeof item !== "string") {
        throw new ConfigValidationError(
          "ignore の各要素は文字列である必要があります",
          `_global.ignore[${i}]`,
        );
      }
      return item;
    });
  }

  return result;
}

/**
 * プロファイルを検証
 */
function validateProfile(value: unknown, name: string): ProfileConfig {
  if (typeof value !== "object" || value === null) {
    throw new ConfigValidationError(
      "プロファイルはオブジェクトである必要があります",
      name,
    );
  }

  const profile = value as Record<string, unknown>;

  if (!profile.from) {
    throw new ConfigValidationError("from は必須です", `${name}.from`);
  }

  if (!profile.to) {
    throw new ConfigValidationError("to は必須です", `${name}.to`);
  }

  return {
    from: validateSource(profile.from, `${name}.from`),
    to: validateDestination(profile.to, `${name}.to`),
  };
}

/**
 * ソース設定を検証
 */
function validateSource(value: unknown, path: string): SourceConfig {
  if (typeof value !== "object" || value === null) {
    throw new ConfigValidationError("オブジェクトである必要があります", path);
  }

  const source = value as Record<string, unknown>;

  if (!source.type) {
    throw new ConfigValidationError("type は必須です", `${path}.type`);
  }

  if (source.type === "git") {
    if (!source.base) {
      throw new ConfigValidationError(
        "git モードでは base は必須です",
        `${path}.base`,
      );
    }
    return {
      type: "git",
      base: String(source.base),
      target: source.target ? String(source.target) : undefined,
      include_untracked: source.include_untracked === true,
    };
  }

  if (source.type === "file") {
    if (!source.src || !Array.isArray(source.src)) {
      throw new ConfigValidationError(
        "file モードでは src (配列) は必須です",
        `${path}.src`,
      );
    }
    return {
      type: "file",
      src: source.src.map((item, i) => {
        if (typeof item !== "string") {
          throw new ConfigValidationError(
            "src の各要素は文字列である必要があります",
            `${path}.src[${i}]`,
          );
        }
        return item;
      }),
    };
  }

  throw new ConfigValidationError(
    `無効な type です: ${source.type} (git または file を指定してください)`,
    `${path}.type`,
  );
}

/**
 * 宛先設定を検証
 */
function validateDestination(
  value: unknown,
  path: string,
): { targets: TargetConfig[] } {
  if (typeof value !== "object" || value === null) {
    throw new ConfigValidationError("オブジェクトである必要があります", path);
  }

  const dest = value as Record<string, unknown>;

  if (!dest.targets || !Array.isArray(dest.targets)) {
    throw new ConfigValidationError(
      "targets (配列) は必須です",
      `${path}.targets`,
    );
  }

  if (dest.targets.length === 0) {
    throw new ConfigValidationError(
      "targets は1つ以上必要です",
      `${path}.targets`,
    );
  }

  return {
    targets: dest.targets.map((target, i) =>
      validateTarget(target, `${path}.targets[${i}]`)
    ),
  };
}

/**
 * ターゲット設定を検証
 */
function validateTarget(value: unknown, path: string): TargetConfig {
  if (typeof value !== "object" || value === null) {
    throw new ConfigValidationError("オブジェクトである必要があります", path);
  }

  const target = value as Record<string, unknown>;

  // 必須フィールド
  if (!target.host || typeof target.host !== "string") {
    throw new ConfigValidationError(
      "host (文字列) は必須です",
      `${path}.host`,
    );
  }

  if (!target.protocol || typeof target.protocol !== "string") {
    throw new ConfigValidationError(
      "protocol (文字列) は必須です",
      `${path}.protocol`,
    );
  }

  const validProtocols = ["sftp", "scp", "rsync", "local"];
  if (!validProtocols.includes(target.protocol)) {
    throw new ConfigValidationError(
      `無効な protocol です: ${target.protocol} (sftp, scp, rsync, local のいずれか)`,
      `${path}.protocol`,
    );
  }

  if (!target.dest || typeof target.dest !== "string") {
    throw new ConfigValidationError(
      "dest (文字列) は必須です",
      `${path}.dest`,
    );
  }

  // protocol が local 以外の場合は user が必要
  if (target.protocol !== "local" && !target.user) {
    throw new ConfigValidationError(
      "sftp/scp/rsync では user は必須です",
      `${path}.user`,
    );
  }

  // auth_type の検証
  if (target.auth_type) {
    const validAuthTypes = ["ssh_key", "password"];
    if (!validAuthTypes.includes(target.auth_type as string)) {
      throw new ConfigValidationError(
        `無効な auth_type です: ${target.auth_type} (ssh_key, password のいずれか)`,
        `${path}.auth_type`,
      );
    }
  }

  // sync_mode の検証
  if (target.sync_mode) {
    const validSyncModes = ["update", "mirror"];
    if (!validSyncModes.includes(target.sync_mode as string)) {
      throw new ConfigValidationError(
        `無効な sync_mode です: ${target.sync_mode} (update, mirror のいずれか)`,
        `${path}.sync_mode`,
      );
    }
  }

  return {
    host: target.host,
    protocol: target.protocol as "sftp" | "scp" | "rsync" | "local",
    port: typeof target.port === "number" ? target.port : undefined,
    user: target.user ? String(target.user) : undefined,
    auth_type: target.auth_type as "ssh_key" | "password" | undefined,
    key_file: target.key_file ? String(target.key_file) : undefined,
    password: target.password ? String(target.password) : undefined,
    dest: target.dest,
    sync_mode: (target.sync_mode as "update" | "mirror") || "update",
    preserve_permissions: target.preserve_permissions === true,
    preserve_timestamps: target.preserve_timestamps === true,
    timeout: typeof target.timeout === "number" ? target.timeout : 30,
    retry: typeof target.retry === "number" ? target.retry : 3,
    rsync_path: target.rsync_path ? String(target.rsync_path) : undefined,
    rsync_options: Array.isArray(target.rsync_options)
      ? target.rsync_options.map(String)
      : undefined,
    legacy_mode: target.legacy_mode === true,
  };
}

/**
 * プロファイルが存在するか確認
 */
export function hasProfile(config: Config, profileName: string): boolean {
  return profileName in config && profileName !== "_global";
}

/**
 * プロファイルを取得
 */
export function getProfile(
  config: Config,
  profileName: string,
): ProfileConfig | undefined {
  const profile = config[profileName];
  if (profile && "from" in profile) {
    return profile as ProfileConfig;
  }
  return undefined;
}

/**
 * 利用可能なプロファイル名を取得
 */
export function getProfileNames(config: Config): string[] {
  return Object.keys(config).filter((key) => key !== "_global");
}
