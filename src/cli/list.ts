/**
 * プロファイル一覧表示
 */

import type { Config, ProfileConfig } from "../types/mod.ts";
import { getProfile, getProfileNames } from "../config/validator.ts";
import { bold, cyan, dim, green, yellow } from "@std/fmt/colors";

/**
 * パスワードをマスクする
 */
function maskPassword(password?: string): string {
  if (!password) return "";
  return "***";
}

/**
 * 環境変数形式かどうかをチェック
 */
function isEnvVar(value?: string): boolean {
  return !!value && /\$\{.+\}/.test(value);
}

/**
 * プロファイルの詳細情報をフォーマット
 */
function formatProfileDetail(profile: ProfileConfig): string[] {
  const lines: string[] = [];

  // ソース情報
  if (profile.from.type === "git") {
    const target = profile.from.target || "HEAD";
    lines.push(
      `  ${dim("type:")} ${green("git")} ${
        dim(`(${profile.from.base} → ${target})`)
      }`,
    );
    if (profile.from.include_untracked) {
      lines.push(`  ${dim("include_untracked:")} ${yellow("true")}`);
    }
  } else {
    lines.push(`  ${dim("type:")} ${green("file")}`);
    lines.push(`  ${dim("src:")} ${profile.from.src.join(", ")}`);
  }

  // ターゲット情報
  const targets = profile.to.targets;
  if (targets.length === 1) {
    const t = targets[0];
    const host = t.host || profile.to.defaults?.host || "";
    const protocol = t.protocol || profile.to.defaults?.protocol || "";
    const port = t.port || profile.to.defaults?.port ||
      (protocol === "sftp" || protocol === "scp" ? 22 : undefined);
    const user = t.user || profile.to.defaults?.user || "";
    const dest = t.dest;

    const portStr = port ? `:${port}` : "";
    const userStr = isEnvVar(user) ? user : user;
    lines.push(
      `  ${dim("target:")} ${cyan(`${userStr}@${host}${portStr}`)} → ${dest}`,
    );
    lines.push(`  ${dim("protocol:")} ${protocol}`);
  } else {
    lines.push(`  ${dim("targets:")} ${targets.length} servers`);
    for (const t of targets) {
      const host = t.host || profile.to.defaults?.host || "";
      const protocol = t.protocol || profile.to.defaults?.protocol || "";
      const port = t.port || profile.to.defaults?.port ||
        (protocol === "sftp" || protocol === "scp" ? 22 : undefined);
      const user = t.user || profile.to.defaults?.user || "";
      const dest = t.dest;

      const portStr = port ? `:${port}` : "";
      const userStr = isEnvVar(user) ? user : user;
      lines.push(
        `    ${dim("-")} ${cyan(`${userStr}@${host}${portStr}`)} → ${dest}`,
      );
    }
  }

  // デフォルト設定がある場合
  if (profile.to.defaults) {
    const d = profile.to.defaults;
    const defaultItems: string[] = [];
    if (d.sync_mode) defaultItems.push(`sync_mode=${d.sync_mode}`);
    if (d.auth_type) defaultItems.push(`auth=${d.auth_type}`);
    if (d.password) defaultItems.push(`password=${maskPassword(d.password)}`);
    if (defaultItems.length > 0) {
      lines.push(`  ${dim("defaults:")} ${defaultItems.join(", ")}`);
    }
  }

  return lines;
}

/**
 * プロファイル一覧を表示
 */
export function showProfileList(config: Config, configPath: string): void {
  const profileNames = getProfileNames(config);

  console.log();
  console.log(bold("設定ファイル:"), configPath);
  console.log();

  if (profileNames.length === 0) {
    console.log(dim("  プロファイルが見つかりません"));
    console.log();
    return;
  }

  console.log(bold("プロファイル一覧:"));
  console.log();

  for (const name of profileNames) {
    const profile = getProfile(config, name);
    if (!profile) continue;

    console.log(bold(cyan(`  ${name}`)));
    const details = formatProfileDetail(profile);
    for (const line of details) {
      console.log(line);
    }
    console.log();
  }
}
