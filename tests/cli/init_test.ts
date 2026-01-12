/**
 * init.ts のテスト
 */

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { exists } from "@std/fs";
import { initCommand } from "../../src/cli/init.ts";
import { CONFIG_TEMPLATE } from "../../src/templates/config-template.ts";

describe("initCommand", () => {
  const testDir = "/tmp/uploader-init-test";
  const testFile = `${testDir}/test-config.yaml`;

  beforeEach(async () => {
    // テストディレクトリを作成
    await Deno.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // テストディレクトリを削除
    try {
      await Deno.remove(testDir, { recursive: true });
    } catch {
      // ディレクトリが既に削除されている場合は無視
    }
  });

  it("should create config file with default name", async () => {
    const defaultFile = `${testDir}/uploader.yaml`;

    // 元のカレントディレクトリを保存
    const originalCwd = Deno.cwd();

    try {
      // テストディレクトリに移動
      Deno.chdir(testDir);

      // uploader.yaml を生成
      await initCommand();

      // ファイルが作成されたことを確認
      const fileExists = await exists(defaultFile);
      assertEquals(fileExists, true, "uploader.yaml should be created");

      // ファイル内容がテンプレートと一致することを確認
      const content = await Deno.readTextFile(defaultFile);
      assertEquals(content, CONFIG_TEMPLATE);
    } finally {
      // カレントディレクトリを元に戻す
      Deno.chdir(originalCwd);
    }
  });

  it("should create config file with custom output path", async () => {
    await initCommand({ output: testFile });

    // ファイルが作成されたことを確認
    const fileExists = await exists(testFile);
    assertEquals(fileExists, true, "test-config.yaml should be created");

    // ファイル内容がテンプレートと一致することを確認
    const content = await Deno.readTextFile(testFile);
    assertEquals(content, CONFIG_TEMPLATE);
  });

  it("should exit with error when file exists in quiet mode", async () => {
    // ファイルを事前に作成
    await Deno.writeTextFile(testFile, "existing content");

    // quiet モードで実行すると Deno.exit(1) が呼ばれる
    // テスト環境では exit を呼べないので、代わりにエラーメッセージを確認
    let errorCaught = false;
    const originalExit = Deno.exit;

    try {
      // Deno.exit をモック
      Deno.exit = ((code: number) => {
        errorCaught = true;
        assertEquals(code, 1, "Should exit with code 1");
        throw new Error("Exit called");
      }) as typeof Deno.exit;

      await initCommand({ output: testFile, quiet: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Exit called") {
        // Expected error
      } else {
        throw error;
      }
    } finally {
      // Deno.exit を元に戻す
      Deno.exit = originalExit;
    }

    assertEquals(errorCaught, true, "Should have called Deno.exit(1)");

    // 既存ファイルが上書きされていないことを確認
    const content = await Deno.readTextFile(testFile);
    assertEquals(content, "existing content");
  });

  it("should overwrite file with --force option", async () => {
    // ファイルを事前に作成
    await Deno.writeTextFile(testFile, "existing content");

    // force オプションで実行
    await initCommand({ output: testFile, force: true });

    // ファイルが上書きされたことを確認
    const content = await Deno.readTextFile(testFile);
    assertEquals(content, CONFIG_TEMPLATE);
  });

  it.ignore("should handle permission denied error", async () => {
    const readonlyDir = `${testDir}/readonly`;
    const readonlyFile = `${readonlyDir}/config.yaml`;

    // 読み取り専用ディレクトリを作成
    await Deno.mkdir(readonlyDir, { recursive: true });

    // ディレクトリを読み取り専用にする（Linuxのみ）
    if (Deno.build.os !== "windows") {
      await Deno.chmod(readonlyDir, 0o444);

      let errorCaught = false;
      const originalExit = Deno.exit;

      try {
        // Deno.exit をモック
        Deno.exit = ((code: number) => {
          errorCaught = true;
          assertEquals(code, 1, "Should exit with code 1");
          throw new Error("Exit called");
        }) as typeof Deno.exit;

        await initCommand({ output: readonlyFile });
      } catch (error) {
        if (error instanceof Error && error.message === "Exit called") {
          // Expected error
        } else {
          throw error;
        }
      } finally {
        // Deno.exit を元に戻す
        Deno.exit = originalExit;
        // パーミッションを戻す
        await Deno.chmod(readonlyDir, 0o755);
      }

      assertEquals(errorCaught, true, "Should have called Deno.exit(1)");
    }
  });

  it("should handle directory not found error", async () => {
    const nonExistentFile = `${testDir}/nonexistent/dir/config.yaml`;

    let errorCaught = false;
    const originalExit = Deno.exit;

    try {
      // Deno.exit をモック
      Deno.exit = ((code: number) => {
        errorCaught = true;
        assertEquals(code, 1, "Should exit with code 1");
        throw new Error("Exit called");
      }) as typeof Deno.exit;

      await initCommand({ output: nonExistentFile });
    } catch (error) {
      if (error instanceof Error && error.message === "Exit called") {
        // Expected error
      } else {
        throw error;
      }
    } finally {
      // Deno.exit を元に戻す
      Deno.exit = originalExit;
    }

    assertEquals(errorCaught, true, "Should have called Deno.exit(1)");
  });
});

describe("CONFIG_TEMPLATE", () => {
  it("should contain valid YAML content", () => {
    // テンプレートが空でないことを確認
    assertEquals(
      CONFIG_TEMPLATE.length > 0,
      true,
      "CONFIG_TEMPLATE should not be empty",
    );

    // テンプレートに基本的なYAMLキーワードが含まれることを確認
    assertEquals(
      CONFIG_TEMPLATE.includes("_global"),
      true,
      "Should contain _global section",
    );
    assertEquals(
      CONFIG_TEMPLATE.includes("from:"),
      true,
      "Should contain from: keyword",
    );
    assertEquals(
      CONFIG_TEMPLATE.includes("to:"),
      true,
      "Should contain to: keyword",
    );
  });

  it("should contain environment variable examples", () => {
    // 環境変数の例が含まれることを確認（エスケープ済み）
    assertEquals(
      CONFIG_TEMPLATE.includes("${DEPLOY_USER}") ||
        CONFIG_TEMPLATE.includes("\\${DEPLOY_USER}"),
      true,
      "Should contain environment variable example",
    );
  });
});
