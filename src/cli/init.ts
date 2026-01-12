/**
 * uploader init コマンドの実装
 *
 * 設定ファイルテンプレート (uploader.yaml) を生成します。
 */

import { exists } from "@std/fs";
import { CONFIG_TEMPLATE } from "../templates/config-template.ts";

export interface InitOptions {
  /** 既存ファイルを無条件で上書き */
  force?: boolean;
  /** 出力先ファイルパス（デフォルト: uploader.yaml） */
  output?: string;
  /** プロンプトなしで実行（CI環境向け） */
  quiet?: boolean;
}

/**
 * uploader init コマンドを実行
 *
 * @param options - 初期化オプション
 * @throws Error - ファイル書き込みエラー
 */
export async function initCommand(
  options: InitOptions = {},
): Promise<void> {
  const outputPath = options.output || "uploader.yaml";

  // 既存ファイルチェック
  const fileExists = await exists(outputPath);

  if (fileExists && !options.force) {
    if (options.quiet) {
      // quiet モードでは上書き確認をスキップしてエラー
      console.error(
        `Error: ${outputPath} already exists. Use --force to overwrite.`,
      );
      Deno.exit(1);
    } else {
      // インタラクティブモード: ユーザーに確認
      const overwrite = confirm(`${outputPath} already exists. Overwrite?`);
      if (!overwrite) {
        console.log("Aborted.");
        return;
      }
    }
  }

  // テンプレート書き込み
  try {
    await Deno.writeTextFile(outputPath, CONFIG_TEMPLATE);
  } catch (error) {
    if (error instanceof Deno.errors.PermissionDenied) {
      console.error(
        `Error: Permission denied. Cannot write to ${outputPath}`,
      );
      Deno.exit(1);
    } else if (error instanceof Deno.errors.NotFound) {
      console.error(
        `Error: Directory not found for ${outputPath}`,
      );
      Deno.exit(1);
    } else {
      throw error;
    }
  }

  // 成功メッセージ表示
  if (fileExists && options.force) {
    console.log(`✓ Created ${outputPath} (overwritten)`);
  } else {
    console.log(`✓ Created ${outputPath}`);
  }

  // Next Steps メッセージ
  console.log("\nNext steps:");
  console.log(`  1. Edit ${outputPath} to match your environment`);
  console.log("  2. Test with: uploader <profile> --dry-run");
  console.log("  3. Deploy: uploader <profile>");
  console.log("\nDocumentation: docs/getting-started.md");
}
