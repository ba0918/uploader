/**
 * 設定ファイルの読み込み
 */

import { parse as parseYaml } from "@std/yaml";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type {
  Config,
  ProfileConfig,
  ResolvedProfileConfig,
} from "../types/mod.ts";
import { expandEnvVarsInObject, expandTilde } from "./env.ts";
import {
  ConfigValidationError,
  getProfile,
  getProfileNames,
  validateConfig,
} from "./validator.ts";

/** 設定ファイル読み込みエラー */
export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
  ) {
    super(filePath ? `${filePath}: ${message}` : message);
    this.name = "ConfigLoadError";
  }
}

/** デフォルトの設定ファイル検索パス */
const DEFAULT_CONFIG_PATHS = [
  "./uploader.yaml",
  "./uploader.yml",
];

/**
 * ホームディレクトリの設定ファイルパスを取得
 */
function getHomeConfigPath(): string | undefined {
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (home) {
    return join(home, ".config", "uploader", "config.yaml");
  }
  return undefined;
}

/**
 * 設定ファイルを検索
 * @param explicitPath 明示的に指定されたパス
 * @returns 見つかったファイルパス
 */
export async function findConfigFile(
  explicitPath?: string,
): Promise<string | undefined> {
  // 明示的に指定された場合はそのまま返す
  if (explicitPath) {
    const expanded = expandTilde(explicitPath);
    if (await exists(expanded)) {
      return expanded;
    }
    throw new ConfigLoadError(
      "指定された設定ファイルが見つかりません",
      expanded,
    );
  }

  // デフォルトパスを順に検索
  for (const path of DEFAULT_CONFIG_PATHS) {
    if (await exists(path)) {
      return path;
    }
  }

  // ホームディレクトリ
  const homePath = getHomeConfigPath();
  if (homePath && await exists(homePath)) {
    return homePath;
  }

  return undefined;
}

/**
 * 設定ファイルを読み込み
 * @param filePath ファイルパス
 * @returns パース済み設定
 */
export async function loadConfigFile(filePath: string): Promise<Config> {
  try {
    const content = await Deno.readTextFile(filePath);
    const parsed = parseYaml(content);
    return validateConfig(parsed);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }
    if (error instanceof Deno.errors.NotFound) {
      throw new ConfigLoadError("ファイルが見つかりません", filePath);
    }
    throw new ConfigLoadError(
      `YAMLパースエラー: ${
        error instanceof Error ? error.message : String(error)
      }`,
      filePath,
    );
  }
}

/**
 * プロファイルを解決（環境変数展開、デフォルト値適用）
 */
export function resolveProfile(
  config: Config,
  profileName: string,
): ResolvedProfileConfig {
  const profile = getProfile(config, profileName);

  if (!profile) {
    const available = getProfileNames(config);
    throw new ConfigLoadError(
      `プロファイル '${profileName}' が見つかりません。利用可能: ${
        available.join(", ") || "(なし)"
      }`,
    );
  }

  // 環境変数を展開
  const resolved = expandEnvVarsInObject(profile) as ProfileConfig;

  // グローバル ignore とマージ
  const globalIgnore = config._global?.ignore || [];

  // ターゲットの key_file を展開
  const targets = resolved.to.targets.map((target) => ({
    ...target,
    key_file: target.key_file ? expandTilde(target.key_file) : undefined,
    user: target.user || "",
  }));

  return {
    from: resolved.from,
    to: { targets },
    ignore: globalIgnore,
  };
}

/**
 * 設定を読み込んでプロファイルを解決
 */
export async function loadAndResolveProfile(
  profileName: string,
  explicitConfigPath?: string,
): Promise<
  { config: Config; profile: ResolvedProfileConfig; configPath: string }
> {
  const configPath = await findConfigFile(explicitConfigPath);

  if (!configPath) {
    throw new ConfigLoadError(
      "設定ファイルが見つかりません。uploader.yaml を作成するか --config で指定してください",
    );
  }

  const config = await loadConfigFile(configPath);
  const profile = resolveProfile(config, profileName);

  return { config, profile, configPath };
}
