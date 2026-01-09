/**
 * config/loader.ts のテスト
 */

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { parse as parseYaml } from "@std/yaml";
import type { Config, ProfileConfig } from "../../src/types/mod.ts";
import {
  ConfigLoadError,
  findConfigFile,
  loadConfigFile,
  resolveProfile,
} from "../../src/config/loader.ts";
import { validateConfig } from "../../src/config/validator.ts";

/** テスト用の有効なConfig */
function createValidConfig(
  overrides?: Partial<{
    _global: { ignore_groups?: Record<string, string[]>; default_ignore?: string[] };
    development: ProfileConfig;
    production: ProfileConfig;
  }>,
): Config {
  const base: Config = {
    _global: {
      ignore_groups: {
        common: ["*.log", "node_modules/"],
      },
      default_ignore: ["common"],
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

  describe("グローバルignore_groupsとdefault_ignore", () => {
    it("default_ignoreがプロファイルに適用される", () => {
      const config = createValidConfig({
        _global: {
          ignore_groups: { common: ["*.log", "*.tmp"] },
          default_ignore: ["common"],
        },
      });
      const resolved = resolveProfile(config, "development");

      assertEquals(resolved.ignore, ["*.log", "*.tmp"]);
    });

    it("ignore_groupsがない場合は空配列", () => {
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

  describe("ターゲットdefaultsのマージ", () => {
    it("defaultsが各ターゲットにマージされる", () => {
      const config: Config = {
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              port: 2222,
              protocol: "rsync",
              user: "testuser",
              sync_mode: "update",
            },
            targets: [
              { dest: "/upload1/" },
              { dest: "/upload2/" },
              { dest: "/upload3/" },
            ],
          },
        },
      };

      const resolved = resolveProfile(config, "test");

      assertEquals(resolved.to.targets.length, 3);
      // 全てのターゲットにdefaultsがマージされている
      for (const target of resolved.to.targets) {
        assertEquals(target.host, "localhost");
        assertEquals(target.port, 2222);
        assertEquals(target.protocol, "rsync");
        assertEquals(target.user, "testuser");
        assertEquals(target.sync_mode, "update");
      }
      // destは個別に設定されている
      assertEquals(resolved.to.targets[0].dest, "/upload1/");
      assertEquals(resolved.to.targets[1].dest, "/upload2/");
      assertEquals(resolved.to.targets[2].dest, "/upload3/");
    });

    it("個別設定がdefaultsを上書きする", () => {
      const config: Config = {
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              port: 2222,
              protocol: "rsync",
              sync_mode: "update",
            },
            targets: [
              { dest: "/upload1/" },
              { dest: "/upload2/", port: 3333, sync_mode: "mirror" },
            ],
          },
        },
      };

      const resolved = resolveProfile(config, "test");

      // 1つ目はdefaultsのまま
      assertEquals(resolved.to.targets[0].port, 2222);
      assertEquals(resolved.to.targets[0].sync_mode, "update");

      // 2つ目は個別設定で上書き
      assertEquals(resolved.to.targets[1].port, 3333);
      assertEquals(resolved.to.targets[1].sync_mode, "mirror");
    });

    it("配列は完全に上書きされる（マージではない）", () => {
      const config: Config = {
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "rsync",
              rsync_options: ["--compress", "--verbose"],
            },
            targets: [
              { dest: "/upload1/" },
              { dest: "/upload2/", rsync_options: ["--bwlimit=1000"] },
            ],
          },
        },
      };

      const resolved = resolveProfile(config, "test");

      // 1つ目はdefaultsの配列
      assertEquals(resolved.to.targets[0].rsync_options, [
        "--compress",
        "--verbose",
      ]);

      // 2つ目は個別設定で完全に上書き
      assertEquals(resolved.to.targets[1].rsync_options, ["--bwlimit=1000"]);
    });

    it("defaultsがない場合も正常に動作する", () => {
      const config: Config = {
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              {
                host: "example.com",
                protocol: "sftp",
                dest: "/var/www",
              },
            ],
          },
        },
      };

      const resolved = resolveProfile(config, "test");

      assertEquals(resolved.to.targets[0].host, "example.com");
      assertEquals(resolved.to.targets[0].protocol, "sftp");
    });

    it("hostがないとエラーになる", () => {
      const config: Config = {
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              protocol: "rsync",
            },
            targets: [{ dest: "/upload1/" }],
          },
        },
      };

      assertThrows(
        () => resolveProfile(config, "test"),
        ConfigLoadError,
        "host が指定されていません",
      );
    });

    it("protocolがないとエラーになる", () => {
      const config: Config = {
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
            },
            targets: [{ dest: "/upload1/" }],
          },
        },
      };

      assertThrows(
        () => resolveProfile(config, "test"),
        ConfigLoadError,
        "protocol が指定されていません",
      );
    });

    it("defaultsの環境変数も展開される", () => {
      Deno.env.set("TEST_HOST", "env-host.example.com");
      Deno.env.set("TEST_USER", "env-user");

      const config: Config = {
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "${TEST_HOST}",
              protocol: "sftp",
              user: "${TEST_USER}",
            },
            targets: [{ dest: "/upload1/" }, { dest: "/upload2/" }],
          },
        },
      };

      const resolved = resolveProfile(config, "test");

      assertEquals(resolved.to.targets[0].host, "env-host.example.com");
      assertEquals(resolved.to.targets[0].user, "env-user");
      assertEquals(resolved.to.targets[1].host, "env-host.example.com");
      assertEquals(resolved.to.targets[1].user, "env-user");
    });
  });

  describe("YAML→validateConfig→resolveProfile 統合テスト", () => {
    // 実際のYAML読み込みフローをテスト（validateConfigが返すundefinedプロパティを含む）
    it("defaultsを使ったYAML設定が正しく解決される", () => {
      const yaml = `
test:
  from:
    type: "file"
    src:
      - "/tmp/test"
  to:
    defaults:
      host: "localhost"
      port: 2222
      protocol: "rsync"
      user: "testuser"
      sync_mode: "update"
    targets:
      - dest: "/upload1/"
      - dest: "/upload2/"
      - dest: "/upload3/"
`;
      const parsed = parseYaml(yaml) as Record<string, unknown>;
      const validated = validateConfig(parsed);
      const resolved = resolveProfile(validated, "test");

      assertEquals(resolved.to.targets.length, 3);
      for (const target of resolved.to.targets) {
        assertEquals(target.host, "localhost");
        assertEquals(target.port, 2222);
        assertEquals(target.protocol, "rsync");
        assertEquals(target.user, "testuser");
        assertEquals(target.sync_mode, "update");
      }
    });

    it("個別設定がdefaultsを上書きする（YAML経由）", () => {
      const yaml = `
test:
  from:
    type: "git"
    base: "main"
  to:
    defaults:
      host: "localhost"
      port: 2222
      protocol: "rsync"
      user: "testuser"
    targets:
      - dest: "/upload1/"
      - dest: "/upload2/"
        port: 3333
        protocol: "sftp"
`;
      const parsed = parseYaml(yaml) as Record<string, unknown>;
      const validated = validateConfig(parsed);
      const resolved = resolveProfile(validated, "test");

      // 1つ目はdefaultsのまま
      assertEquals(resolved.to.targets[0].host, "localhost");
      assertEquals(resolved.to.targets[0].port, 2222);
      assertEquals(resolved.to.targets[0].protocol, "rsync");

      // 2つ目は個別設定で上書き
      assertEquals(resolved.to.targets[1].host, "localhost");
      assertEquals(resolved.to.targets[1].port, 3333);
      assertEquals(resolved.to.targets[1].protocol, "sftp");
    });

    it("rsync_optionsなどの配列も正しく処理される（YAML経由）", () => {
      const yaml = `
test:
  from:
    type: "file"
    src: ["/tmp"]
  to:
    defaults:
      host: "localhost"
      protocol: "rsync"
      user: "deploy"
      rsync_options:
        - "--compress"
        - "--verbose"
    targets:
      - dest: "/upload1/"
      - dest: "/upload2/"
        rsync_options:
          - "--bwlimit=1000"
`;
      const parsed = parseYaml(yaml) as Record<string, unknown>;
      const validated = validateConfig(parsed);
      const resolved = resolveProfile(validated, "test");

      // 1つ目はdefaultsの配列
      assertEquals(resolved.to.targets[0].rsync_options, [
        "--compress",
        "--verbose",
      ]);

      // 2つ目は個別設定で完全に上書き
      assertEquals(resolved.to.targets[1].rsync_options, ["--bwlimit=1000"]);
    });

    it("複雑な設定もYAML経由で正しく処理される", () => {
      const yaml = `
_global:
  ignore_groups:
    common:
      - "*.log"
      - "node_modules/"
  default_ignore:
    - "common"

production:
  from:
    type: "file"
    src:
      - "dist/"
  to:
    defaults:
      host: "prod.example.com"
      port: 22
      protocol: "rsync"
      user: "deploy"
      auth_type: "ssh_key"
      key_file: "~/.ssh/id_rsa"
      rsync_path: "sudo rsync"
      rsync_options:
        - "--compress"
        - "--chmod=D755,F644"
      sync_mode: "update"
      timeout: 60
      retry: 5
    targets:
      - dest: "/var/www/app1/"
      - dest: "/var/www/app2/"
      - dest: "/var/www/app3/"
        sync_mode: "mirror"
        timeout: 120
`;
      const parsed = parseYaml(yaml) as Record<string, unknown>;
      const validated = validateConfig(parsed);
      const resolved = resolveProfile(validated, "production");

      assertEquals(resolved.to.targets.length, 3);
      assertEquals(resolved.ignore, ["*.log", "node_modules/"]);

      // 全ターゲット共通
      for (const target of resolved.to.targets) {
        assertEquals(target.host, "prod.example.com");
        assertEquals(target.port, 22);
        assertEquals(target.protocol, "rsync");
        assertEquals(target.user, "deploy");
        assertEquals(target.rsync_path, "sudo rsync");
        assertEquals(target.rsync_options, ["--compress", "--chmod=D755,F644"]);
      }

      // 個別設定
      assertEquals(resolved.to.targets[0].sync_mode, "update");
      assertEquals(resolved.to.targets[0].timeout, 60);
      assertEquals(resolved.to.targets[2].sync_mode, "mirror");
      assertEquals(resolved.to.targets[2].timeout, 120);
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

describe("ignore 解決ロジック", () => {
  describe("ignore_groups と default_ignore", () => {
    it("default_ignoreで指定したグループがデフォルト適用される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log", ".git/"],
            template: ["template/"],
          },
          default_ignore: ["common"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              { host: "localhost", protocol: "local", dest: "/tmp/" },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      assertEquals(resolved.ignore, ["*.log", ".git/"]);
      assertEquals(resolved.to.targets[0].ignore, ["*.log", ".git/"]);
    });

    it("複数グループを組み合わせられる", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log"],
            assets: ["*.png", "*.jpg"],
          },
          default_ignore: ["common", "assets"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              { host: "localhost", protocol: "local", dest: "/tmp/" },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      assertEquals(resolved.ignore, ["*.log", "*.png", "*.jpg"]);
    });

    it("重複パターンは除去される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            group1: ["*.log", "*.tmp"],
            group2: ["*.tmp", "*.bak"],
          },
          default_ignore: ["group1", "group2"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              { host: "localhost", protocol: "local", dest: "/tmp/" },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // *.tmpは重複しているので1回だけ
      assertEquals(resolved.ignore, ["*.log", "*.tmp", "*.bak"]);
    });
  });

  describe("ターゲット固有の ignore 設定", () => {
    it("ターゲットのignoreがdefaults/default_ignoreを上書きする", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log"],
            template: ["template/"],
            property: ["property/"],
          },
          default_ignore: ["common"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              {
                host: "localhost",
                protocol: "local",
                dest: "/tmp/a",
                // ignore未指定 → default_ignoreを使用
              },
              {
                host: "localhost",
                protocol: "local",
                dest: "/tmp/b",
                ignore: {
                  use: ["common", "template"],
                },
              },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // 1つ目はdefault_ignore
      assertEquals(resolved.to.targets[0].ignore, ["*.log"]);
      // 2つ目は個別設定
      assertEquals(resolved.to.targets[1].ignore, ["*.log", "template/"]);
    });

    it("defaultsのignoreが適用される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log"],
            template: ["template/"],
          },
          default_ignore: ["common"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              ignore: {
                use: ["common", "template"],
              },
            },
            targets: [
              { dest: "/tmp/a" },
              { dest: "/tmp/b" },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // 両方ともdefaultsのignoreが適用される
      assertEquals(resolved.to.targets[0].ignore, ["*.log", "template/"]);
      assertEquals(resolved.to.targets[1].ignore, ["*.log", "template/"]);
    });

    it("ターゲットのignoreがdefaultsを上書きする", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log"],
            template: ["template/"],
            property: ["property/"],
          },
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              ignore: {
                use: ["common"],
              },
            },
            targets: [
              { dest: "/tmp/a" },
              {
                dest: "/tmp/b",
                ignore: {
                  use: ["template", "property"],
                },
              },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // 1つ目はdefaultsのignore
      assertEquals(resolved.to.targets[0].ignore, ["*.log"]);
      // 2つ目はターゲット固有のignore
      assertEquals(resolved.to.targets[1].ignore, ["template/", "property/"]);
    });

    it("addで追加パターンを指定できる", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log"],
          },
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              {
                host: "localhost",
                protocol: "local",
                dest: "/tmp/",
                ignore: {
                  use: ["common"],
                  add: ["special/", "*.bak"],
                },
              },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      assertEquals(resolved.to.targets[0].ignore, [
        "*.log",
        "special/",
        "*.bak",
      ]);
    });

    it("use: [] で何も除外しないことを明示できる", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log"],
          },
          default_ignore: ["common"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              {
                host: "localhost",
                protocol: "local",
                dest: "/tmp/",
                ignore: {
                  use: [],
                },
              },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // 明示的に空にした
      assertEquals(resolved.to.targets[0].ignore, []);
    });
  });

  describe("profile.ignore の解決（defaults.ignore対応）", () => {
    it("defaults.ignoreがprofile.ignoreに反映される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log", ".git/"],
            template: ["template/"],
          },
          default_ignore: ["common", "template"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              ignore: {
                use: ["common"],
                add: [".ai-docs/", "dev-tools/"],
              },
            },
            targets: [{ dest: "/tmp/" }],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // defaults.ignoreがprofile.ignoreに反映される
      // default_ignoreの["common", "template"]ではなく、
      // defaults.ignoreの["common"] + addの[".ai-docs/", "dev-tools/"]が使われる
      assertEquals(resolved.ignore, ["*.log", ".git/", ".ai-docs/", "dev-tools/"]);
      // "template/"は含まれない
      assertEquals(resolved.ignore.includes("template/"), false);
    });

    it("defaults.ignore未指定時はdefault_ignoreがprofile.ignoreに適用される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log"],
            template: ["template/"],
          },
          default_ignore: ["common", "template"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              // ignore未指定
            },
            targets: [{ dest: "/tmp/" }],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // defaults.ignoreがないのでdefault_ignoreが使われる
      assertEquals(resolved.ignore, ["*.log", "template/"]);
    });

    it("defaults自体がない場合もdefault_ignoreがprofile.ignoreに適用される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log"],
          },
          default_ignore: ["common"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              { host: "localhost", protocol: "local", dest: "/tmp/" },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      assertEquals(resolved.ignore, ["*.log"]);
    });
  });

  describe("優先順位テスト: target.ignore > defaults.ignore > _global.default_ignore", () => {
    // 各レベルの設定を明確に識別できるように別々のパターンを使用
    // global: ["GLOBAL-PATTERN"]
    // defaults: ["DEFAULTS-PATTERN"]
    // target: ["TARGET-PATTERN"]

    it("全3レベルが設定された場合、ターゲットごとのignoreは正しい優先順位で解決される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            global: ["GLOBAL-PATTERN"],
            defaults: ["DEFAULTS-PATTERN"],
            target: ["TARGET-PATTERN"],
          },
          default_ignore: ["global"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              ignore: { use: ["defaults"] },
            },
            targets: [
              { dest: "/tmp/use-defaults" }, // ignore未指定 → defaults.ignore
              { dest: "/tmp/use-target", ignore: { use: ["target"] } }, // 個別設定
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // ターゲット[0]: ignore未指定 → defaults.ignoreを使用
      assertEquals(resolved.to.targets[0].ignore, ["DEFAULTS-PATTERN"]);
      // ターゲット[1]: ignore指定あり → target.ignoreを使用
      assertEquals(resolved.to.targets[1].ignore, ["TARGET-PATTERN"]);
    });

    it("全3レベルが設定された場合、profile.ignoreはdefaults.ignoreから解決される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            global: ["GLOBAL-PATTERN"],
            defaults: ["DEFAULTS-PATTERN"],
          },
          default_ignore: ["global"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              ignore: { use: ["defaults"] },
            },
            targets: [{ dest: "/tmp/" }],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // profile.ignoreはdefaults.ignoreから解決される（default_ignoreより優先）
      assertEquals(resolved.ignore, ["DEFAULTS-PATTERN"]);
      assertEquals(resolved.ignore.includes("GLOBAL-PATTERN"), false);
    });

    it("defaults.ignore未指定の場合、profile.ignoreは_global.default_ignoreから解決される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            global: ["GLOBAL-PATTERN"],
          },
          default_ignore: ["global"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              // ignore未指定
            },
            targets: [{ dest: "/tmp/" }],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // defaults.ignoreがないので_global.default_ignoreを使用
      assertEquals(resolved.ignore, ["GLOBAL-PATTERN"]);
      assertEquals(resolved.to.targets[0].ignore, ["GLOBAL-PATTERN"]);
    });

    it("defaults自体がない場合も_global.default_ignoreが使用される", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            global: ["GLOBAL-PATTERN"],
          },
          default_ignore: ["global"],
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            targets: [
              { host: "localhost", protocol: "local", dest: "/tmp/" },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      assertEquals(resolved.ignore, ["GLOBAL-PATTERN"]);
      assertEquals(resolved.to.targets[0].ignore, ["GLOBAL-PATTERN"]);
    });

    it("target.ignoreはdefaults.ignoreを完全に上書きする（マージではない）", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            base: ["BASE-PATTERN"],
            extra: ["EXTRA-PATTERN"],
          },
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              ignore: {
                use: ["base"],
                add: ["DEFAULTS-ADD"],
              },
            },
            targets: [
              { dest: "/tmp/defaults-only" },
              {
                // target.ignoreが指定されると、defaults.ignoreは完全に無視される
                dest: "/tmp/target-override",
                ignore: { use: ["extra"], add: ["TARGET-ADD"] },
              },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // ターゲット[0]: defaults.ignoreをそのまま使用
      assertEquals(resolved.to.targets[0].ignore, ["BASE-PATTERN", "DEFAULTS-ADD"]);

      // ターゲット[1]: target.ignoreで完全に上書き
      // defaults.ignoreの内容（BASE-PATTERN, DEFAULTS-ADD）は含まれない
      assertEquals(resolved.to.targets[1].ignore, ["EXTRA-PATTERN", "TARGET-ADD"]);
      assertEquals(resolved.to.targets[1].ignore.includes("BASE-PATTERN"), false);
      assertEquals(resolved.to.targets[1].ignore.includes("DEFAULTS-ADD"), false);
    });

    it("addはグループのパターンに追加するものであり、親レベルとのマージではない", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            base: ["BASE-PATTERN"],
          },
        },
        test: {
          from: { type: "git", base: "main" },
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              ignore: { use: ["base"], add: ["DEFAULTS-ADD"] },
            },
            targets: [
              {
                dest: "/tmp/",
                // addはuse: ["base"]のパターンに追加する
                // defaults.ignoreのaddとは別物
                ignore: { use: ["base"], add: ["TARGET-ADD"] },
              },
            ],
          },
        },
      };
      const resolved = resolveProfile(config, "test");

      // target.ignoreで上書き: BASE-PATTERN + TARGET-ADD
      // DEFAULTS-ADDは含まれない（マージではなく上書き）
      assertEquals(resolved.to.targets[0].ignore, ["BASE-PATTERN", "TARGET-ADD"]);
      assertEquals(resolved.to.targets[0].ignore.includes("DEFAULTS-ADD"), false);
    });
  });
});
