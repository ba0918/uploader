#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Git hooks インストールスクリプト
 *
 * scripts/hooks/ 内のフックを .git/hooks/ にコピーして実行権限を付与します。
 *
 * 使用方法:
 *   deno task install-hooks
 */

import { exists } from "@std/fs";
import { dirname, join } from "@std/path";

const PROJECT_ROOT = dirname(dirname(new URL(import.meta.url).pathname));
const HOOKS_SOURCE_DIR = join(PROJECT_ROOT, "scripts", "hooks");
const HOOKS_TARGET_DIR = join(PROJECT_ROOT, ".git", "hooks");

interface Hook {
  name: string;
  description: string;
}

const HOOKS: Hook[] = [
  {
    name: "pre-commit",
    description: "型チェック、lint、フォーマット、テストを実行",
  },
  {
    name: "pre-push",
    description: "型チェック、lint、全テストを実行（push前の最終確認）",
  },
];

async function installHooks(): Promise<void> {
  console.log("📦 Installing Git hooks...\n");

  // .git/hooks ディレクトリの存在確認
  if (!await exists(HOOKS_TARGET_DIR)) {
    console.error(
      "❌ Error: .git/hooks directory not found. Are you in a Git repository?",
    );
    Deno.exit(1);
  }

  let installedCount = 0;

  for (const hook of HOOKS) {
    const sourcePath = join(HOOKS_SOURCE_DIR, hook.name);
    const targetPath = join(HOOKS_TARGET_DIR, hook.name);

    // ソースファイルの存在確認
    if (!await exists(sourcePath)) {
      console.error(`❌ Error: Hook template not found: ${sourcePath}`);
      continue;
    }

    // フックをコピー
    try {
      const content = await Deno.readTextFile(sourcePath);
      await Deno.writeTextFile(targetPath, content);

      // 実行権限を付与 (Unix系のみ)
      if (Deno.build.os !== "windows") {
        await Deno.chmod(targetPath, 0o755);
      }

      console.log(`✓ Installed: ${hook.name}`);
      console.log(`  ${hook.description}`);
      installedCount++;
    } catch (error) {
      console.error(`❌ Error installing ${hook.name}:`, error);
    }
  }

  console.log(`\n✅ Successfully installed ${installedCount} hook(s)!`);
  console.log("\n📝 Note:");
  console.log("  - フックは自動で実行されます");
  console.log("  - 一時的にスキップするには: git commit --no-verify");
  console.log("  - フックを無効化するには: rm .git/hooks/pre-commit");
}

if (import.meta.main) {
  await installHooks();
}
