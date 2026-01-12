#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * uploader.example.yaml をビルド時に src/templates/config-template.ts に埋め込むスクリプト
 *
 * 使用方法:
 *   deno run --allow-read --allow-write scripts/embed-template.ts
 *
 * 処理内容:
 *   1. uploader.example.yaml を読み込む
 *   2. TypeScript定数として src/templates/config-template.ts に書き込む
 *   3. ビルド時に自動実行されることで、バイナリに設定テンプレートが埋め込まれる
 */

import { dirname, fromFileUrl, join } from "@std/path";

const PROJECT_ROOT = dirname(fromFileUrl(import.meta.url));
const EXAMPLE_YAML_PATH = join(PROJECT_ROOT, "..", "uploader.example.yaml");
const OUTPUT_PATH = join(
  PROJECT_ROOT,
  "..",
  "src",
  "templates",
  "config-template.ts",
);

async function main() {
  console.log("📝 Embedding uploader.example.yaml into TypeScript...");

  // uploader.example.yaml を読み込む
  const exampleYaml = await Deno.readTextFile(EXAMPLE_YAML_PATH);

  // ${...} をエスケープ（\${...}に変換）してテンプレート文字列として埋め込む
  const escapedYaml = exampleYaml.replace(/\$/g, "\\$");

  // TypeScriptコードを生成
  const tsCode =
    `// このファイルは scripts/embed-template.ts によって自動生成されます
// 直接編集しないでください。uploader.example.yaml を編集してください。

/**
 * uploader init コマンドで使用される設定ファイルテンプレート
 *
 * uploader.example.yaml の内容がビルド時に埋め込まれます。
 */
export const CONFIG_TEMPLATE = \`${escapedYaml}\`;
`;

  // 出力ディレクトリを作成
  await Deno.mkdir(dirname(OUTPUT_PATH), { recursive: true });

  // ファイルに書き込む
  await Deno.writeTextFile(OUTPUT_PATH, tsCode);

  console.log(`✅ Successfully embedded template to ${OUTPUT_PATH}`);
  console.log(
    `   Template size: ${exampleYaml.length} characters (${
      (exampleYaml.length / 1024).toFixed(2)
    } KB)`,
  );
}

if (import.meta.main) {
  await main();
}
