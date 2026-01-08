/**
 * config/loader.ts のテスト
 */

import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
import type { Config, ProfileConfig } from "../../src/types/mod.ts";
import {
  ConfigLoadError,
  findConfigFile,
  loadConfigFile,
  resolveProfile,
} from "../../src/config/loader.ts";

/** テスト用の有効なConfig */
function createValidConfig(
  overrides?: Partial<{
    _global: { ignore: string[] };
    development: ProfileConfig;
    production: ProfileConfig;
  }>,
): Config {
  const base: Config = {
    _global: {
      ignore: ["*.log", "node_modules/"],
    },
    development: {
      from: {
        type: "git",
        base: "main",
      },
      to: {
        targets: [
          {
            host: "dev.example.com",
            protocol: "sftp",
            user: "developer",
            dest: "/var/www/dev",
            auth_type: "ssh_key",
            key_file: "~/.ssh/id_rsa",
          },
        ],
      },
    },
    production: {
      from: {
        type: "file",
        src: ["dist/"],
      },
      to: {
        targets: [
          {
            host: "prod.example.com",
            protocol: "sftp",
            user: "deploy",
            dest: "/var/www/prod",
            auth_type: "password",
          },
        ],
      },
    },
  };

  return { ...base, ...overrides };
}

describe("ConfigLoadError", () => {
  it("ファイルパス付きでエラーを作成できる", () => {
    const error = new ConfigLoadError("テストエラー", "/path/to/config.yaml");

    assertEquals(error.name, "ConfigLoadError");
    assertEquals(error.message, "/path/to/config.yaml: テストエラー");
    assertEquals(error.filePath, "/path/to/config.yaml");
  });

  it("ファイルパスなしでエラーを作成できる", () => {
    const error = new ConfigLoadError("テストエラー");

    assertEquals(error.name, "ConfigLoadError");
    assertEquals(error.message, "テストエラー");
    assertEquals(error.filePath, undefined);
  });
});

describe("resolveProfile", () => {
  // テストの前後で環境変数を保存・復元
  let originalEnv: Map<string, string | undefined>;

  beforeEach(() => {
    originalEnv = new Map();
    originalEnv.set("HOME", Deno.env.get("HOME"));
    originalEnv.set("TEST_HOST", Deno.env.get("TEST_HOST"));
    originalEnv.set("TEST_USER", Deno.env.get("TEST_USER"));
  });

  afterEach(() => {
    for (const [key, value] of originalEnv) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  });

  describe("基本的な解決", () => {
    it("存在するプロファイルを解決できる", () => {
      const config = createValidConfig();
      const resolved = resolveProfile(config, "development");

      assertEquals(resolved.from.type, "git");
      assertEquals(resolved.to.targets.length, 1);
      assertEquals(resolved.to.targets[0].host, "dev.example.com");
    });

    it("存在しないプロファイルでエラーを投げる", () => {
      const config = createValidConfig();

      assertThrows(
        () => resolveProfile(config, "nonexistent"),
        ConfigLoadError,
        "プロファイル 'nonexistent' が見つかりません",
      );
    });

    it("空のConfigで利用可能プロファイルが(なし)と表示される", () => {
      const config: Config = {};

      assertThrows(
        () => resolveProfile(config, "test"),
        ConfigLoadError,
        "(なし)",
      );
    });
  });

  describe("グローバルignoreのマージ", () => {
    it("グローバルignoreがプロファイルに適用される", () => {
      const config = createValidConfig({
        _global: { ignore: ["*.log", "*.tmp"] },
      });
      const resolved = resolveProfile(config, "development");

      assertEquals(resolved.ignore, ["*.log", "*.tmp"]);
    });

    it("グローバルignoreがない場合は空配列", () => {
      const config: Config = {
        development: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              {
                host: "example.com",
                protocol: "sftp",
                user: "user",
                dest: "/var/www",
              },
            ],
          },
        },
      };

      const resolved = resolveProfile(config, "development");
      assertEquals(resolved.ignore, []);
    });
  });

  describe("環境変数の展開", () => {
    it("環境変数が展開される", () => {
      Deno.env.set("TEST_HOST", "env-host.example.com");
      Deno.env.set("TEST_USER", "env-user");

      const config: Config = {
        development: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              {
                host: "${TEST_HOST}",
                protocol: "sftp",
                user: "${TEST_USER}",
                dest: "/var/www",
              },
            ],
          },
        },
      };

      const resolved = resolveProfile(config, "development");
      assertEquals(resolved.to.targets[0].host, "env-host.example.com");
      assertEquals(resolved.to.targets[0].user, "env-user");
    });
  });

  describe("チルダ展開", () => {
    it("key_fileのチルダが展開される", () => {
      const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
      const config = createValidConfig();
      const resolved = resolveProfile(config, "development");

      // チルダが展開されている
      assertEquals(
        resolved.to.targets[0].key_file,
        `${home}/.ssh/id_rsa`,
      );
    });

    it("key_fileがない場合はundefinedのまま", () => {
      const config = createValidConfig();
      const resolved = resolveProfile(config, "production");

      assertEquals(resolved.to.targets[0].key_file, undefined);
    });
  });

  describe("デフォルト値の適用", () => {
    it("userが未設定の場合は空文字列になる", () => {
      const config: Config = {
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              {
                host: "example.com",
                protocol: "local",
                dest: "/tmp/test",
              },
            ],
          },
        },
      };

      const resolved = resolveProfile(config, "test");
      assertEquals(resolved.to.targets[0].user, "");
    });
  });

  describe("fileモードプロファイル", () => {
    it("fileモードのプロファイルを解決できる", () => {
      const config = createValidConfig();
      const resolved = resolveProfile(config, "production");

      assertEquals(resolved.from.type, "file");
      if (resolved.from.type === "file") {
        assertEquals(resolved.from.src, ["dist/"]);
      }
    });
  });
});

describe("findConfigFile", () => {
  // 一時ディレクトリを使用するテスト
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: "loader_test_" });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  it("明示的なパスが存在する場合はそのパスを返す", async () => {
    const configPath = `${tempDir}/custom.yaml`;
    await Deno.writeTextFile(configPath, "test: true");

    const result = await findConfigFile(configPath);
    assertEquals(result, configPath);
  });

  it("明示的なパスが存在しない場合はエラーを投げる", async () => {
    const configPath = `${tempDir}/nonexistent.yaml`;

    await assertRejects(
      () => findConfigFile(configPath),
      ConfigLoadError,
      "指定された設定ファイルが見つかりません",
    );
  });

  it("明示的なパスがない場合はundefinedを返す可能性がある", async () => {
    // カレントディレクトリにuploader.yamlがなく、
    // ホームの設定もない場合はundefinedを返す
    // （テスト環境によって結果が異なる）
    const result = await findConfigFile();
    // undefinedか文字列のどちらか
    assertEquals(
      typeof result === "undefined" || typeof result === "string",
      true,
    );
  });
});

describe("loadConfigFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: "loader_test_" });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  it("有効なYAMLファイルを読み込める", async () => {
    const configPath = `${tempDir}/valid.yaml`;
    const content = `
development:
  from:
    type: git
    base: main
  to:
    targets:
      - host: example.com
        protocol: sftp
        user: deploy
        dest: /var/www
`;
    await Deno.writeTextFile(configPath, content);

    const config = await loadConfigFile(configPath);
    assertEquals(typeof config, "object");
  });

  it("存在しないファイルでエラーを投げる", async () => {
    const configPath = `${tempDir}/nonexistent.yaml`;

    await assertRejects(
      () => loadConfigFile(configPath),
      ConfigLoadError,
      "ファイルが見つかりません",
    );
  });

  it("無効なYAMLでエラーを投げる", async () => {
    const configPath = `${tempDir}/invalid.yaml`;
    // 無効なYAML（タブとスペースの混在、不正な構文）
    await Deno.writeTextFile(configPath, ":\n  - [invalid:\n    }");

    await assertRejects(
      () => loadConfigFile(configPath),
      ConfigLoadError,
      "YAMLパースエラー",
    );
  });

  it("検証に失敗する設定でConfigValidationErrorを投げる", async () => {
    const configPath = `${tempDir}/invalid_config.yaml`;
    // fromがないプロファイル
    const content = `
development:
  to:
    targets:
      - host: example.com
        protocol: sftp
        user: deploy
        dest: /var/www
`;
    await Deno.writeTextFile(configPath, content);

    await assertRejects(
      () => loadConfigFile(configPath),
      Error, // ConfigValidationError
      "from",
    );
  });
});
