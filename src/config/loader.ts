/**
 * 設定ファイルの読み込み
 */

import { parse as parseYaml } from "@std/yaml";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type {
  Config,
  GlobalConfig,
  IgnoreConfig,
  PartialTargetConfig,
  ProfileConfig,
  ResolvedProfileConfig,
  ResolvedTargetConfig,
  TargetConfig,
  TargetDefaults,
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
function getHomeConfigPaths(): string[] {
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (home) {
    return [
      join(home, ".config", "uploader", "config.yaml"),
      join(home, ".config", "uploader", "config.yml"),
    ];
  }
  return [];
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
  for (const homePath of getHomeConfigPaths()) {
    if (await exists(homePath)) {
      return homePath;
    }
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
 * オブジェクトから undefined の値を持つプロパティを除外
 */
function removeUndefinedProps<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key as keyof T] = value;
    }
  }
  return result;
}

/**
 * グローバル設定からignoreグループを取得
 */
function getIgnoreGroups(
  globalConfig?: GlobalConfig,
): Record<string, string[]> {
  return globalConfig?.ignore_groups ?? {};
}

/**
 * デフォルトのignoreグループ名を取得
 */
function getDefaultIgnoreGroups(globalConfig?: GlobalConfig): string[] {
  return globalConfig?.default_ignore ?? [];
}

/**
 * IgnoreConfig をパターン配列に解決
 *
 * @param ignoreConfig ターゲットまたはdefaultsのignore設定
 * @param ignoreGroups グローバルのignoreグループ定義
 */
function resolveIgnoreConfig(
  ignoreConfig: IgnoreConfig | undefined,
  ignoreGroups: Record<string, string[]>,
): string[] {
  if (!ignoreConfig) {
    return [];
  }

  const patterns: string[] = [];

  // use で指定されたグループのパターンを追加
  if (ignoreConfig.use) {
    for (const groupName of ignoreConfig.use) {
      const groupPatterns = ignoreGroups[groupName];
      if (groupPatterns) {
        patterns.push(...groupPatterns);
      }
      // バリデーション済みなので存在しないグループはありえない
    }
  }

  // add で指定された追加パターンを追加
  if (ignoreConfig.add) {
    patterns.push(...ignoreConfig.add);
  }

  // 重複を除去
  return [...new Set(patterns)];
}

/**
 * ターゲットのignoreパターンを解決
 *
 * 優先順位: target.ignore → defaults.ignore → default_ignore
 */
function resolveTargetIgnore(
  targetIgnore: IgnoreConfig | undefined,
  defaultsIgnore: IgnoreConfig | undefined,
  defaultIgnoreGroups: string[],
  ignoreGroups: Record<string, string[]>,
): string[] {
  // ターゲットに明示的なignore設定がある場合はそれを使用
  if (targetIgnore !== undefined) {
    return resolveIgnoreConfig(targetIgnore, ignoreGroups);
  }

  // defaultsにignore設定がある場合はそれを使用
  if (defaultsIgnore !== undefined) {
    return resolveIgnoreConfig(defaultsIgnore, ignoreGroups);
  }

  // どちらもない場合はグローバルのデフォルトを使用
  return resolveIgnoreConfig({ use: defaultIgnoreGroups }, ignoreGroups);
}

/**
 * defaults と個別ターゲット設定をマージ
 * 個別設定が優先される（配列は完全に上書き）
 */
function mergeTargetWithDefaults(
  defaults: TargetDefaults | undefined,
  target: PartialTargetConfig,
): TargetConfig {
  // undefined のプロパティを除外してマージ
  const cleanDefaults = defaults ? removeUndefinedProps(defaults) : {};
  const cleanTarget = removeUndefinedProps(target);
  const merged = { ...cleanDefaults, ...cleanTarget };

  // host と protocol が必須なのでチェック
  if (!merged.host) {
    throw new ConfigLoadError(
      `ターゲット (dest: ${target.dest}) に host が指定されていません。defaults か個別設定で指定してください`,
    );
  }
  if (!merged.protocol) {
    throw new ConfigLoadError(
      `ターゲット (dest: ${target.dest}) に protocol が指定されていません。defaults か個別設定で指定してください`,
    );
  }

  // デフォルト値を適用
  return {
    ...merged,
    host: merged.host,
    protocol: merged.protocol,
    dest: target.dest,
    sync_mode: merged.sync_mode ?? "update",
    preserve_permissions: merged.preserve_permissions ?? false,
    preserve_timestamps: merged.preserve_timestamps ?? false,
    timeout: merged.timeout ?? 30,
    retry: merged.retry ?? 3,
    legacy_mode: merged.legacy_mode ?? false,
  } as TargetConfig;
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

  // グローバルの ignore グループを取得（後方互換性対応）
  const ignoreGroups = getIgnoreGroups(config._global);
  const defaultIgnoreGroupNames = getDefaultIgnoreGroups(config._global);

  // defaults を各ターゲットにマージしてから key_file を展開し、ignore を解決
  const defaults = resolved.to.defaults;
  const targets: ResolvedTargetConfig[] = resolved.to.targets.map((target) => {
    const merged = mergeTargetWithDefaults(defaults, target);

    // ターゲットごとのignoreパターンを解決
    const resolvedIgnore = resolveTargetIgnore(
      target.ignore,
      defaults?.ignore,
      defaultIgnoreGroupNames,
      ignoreGroups,
    );

    // ignore プロパティを除外して ResolvedTargetConfig を構築
    const { ignore: _ignore, ...rest } = merged;
    return {
      ...rest,
      key_file: merged.key_file ? expandTilde(merged.key_file) : undefined,
      user: merged.user || "",
      ignore: resolvedIgnore,
    };
  });

  // プロファイル全体で共通のignore
  // 優先順位: defaults.ignore → _global.default_ignore
  const profileIgnore = resolveIgnoreConfig(
    defaults?.ignore ?? { use: defaultIgnoreGroupNames },
    ignoreGroups,
  );

  return {
    from: resolved.from,
    to: { targets },
    ignore: profileIgnore,
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
