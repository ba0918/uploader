/**
 * config/validator.ts のテスト
 */

import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  ConfigValidationError,
  getProfile,
  getProfileNames,
  hasProfile,
  validateConfig,
} from "../../src/config/validator.ts";

describe("validateConfig", () => {
  describe("基本的な検証", () => {
    it("空のオブジェクトは有効", () => {
      const result = validateConfig({});
      assertEquals(result, {});
    });

    it("nullは無効", () => {
      assertThrows(
        () => validateConfig(null),
        ConfigValidationError,
        "設定ファイルはオブジェクトである必要があります",
      );
    });

    it("プリミティブ値は無効", () => {
      assertThrows(
        () => validateConfig("string"),
        ConfigValidationError,
        "設定ファイルはオブジェクトである必要があります",
      );
    });

    it("配列は空のオブジェクトとして扱われる", () => {
      // 注: JavaScriptでは typeof [] === "object" なので、配列は通過する
      // 実際にはプロファイルとして使えないが、エラーにはならない
      const result = validateConfig([]);
      assertEquals(Object.keys(result).length, 0);
    });
  });

  describe("_global セクション", () => {
    it("空の_globalオブジェクトは有効", () => {
      const result = validateConfig({
        _global: {},
      });
      assertEquals(result._global, {});
    });

    it("_globalがオブジェクトでない場合は無効", () => {
      assertThrows(
        () => validateConfig({ _global: "string" }),
        ConfigValidationError,
        "_global はオブジェクトである必要があります",
      );
    });
  });

  describe("プロファイル検証 - gitモード", () => {
    const validGitProfile = {
      from: {
        type: "git",
        base: "origin/main",
        target: "HEAD",
      },
      to: {
        targets: [
          {
            host: "example.com",
            protocol: "sftp",
            user: "deploy",
            dest: "/var/www/",
          },
        ],
      },
    };

    it("有効なgitプロファイルは通過する", () => {
      const result = validateConfig({ development: validGitProfile });
      const profile = getProfile(result, "development");
      assertEquals(profile?.from.type, "git");
    });

    it("fromがない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            development: {
              to: validGitProfile.to,
            },
          }),
        ConfigValidationError,
        "from は必須です",
      );
    });

    it("toがない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            development: {
              from: validGitProfile.from,
            },
          }),
        ConfigValidationError,
        "to は必須です",
      );
    });

    it("gitモードでbaseがない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            development: {
              from: { type: "git" },
              to: validGitProfile.to,
            },
          }),
        ConfigValidationError,
        "git モードでは base は必須です",
      );
    });

    it("targetは省略可能", () => {
      const result = validateConfig({
        development: {
          from: { type: "git", base: "main" },
          to: validGitProfile.to,
        },
      });
      const profile = getProfile(result, "development");
      if (profile?.from.type === "git") {
        assertEquals(profile.from.target, undefined);
      }
    });

    it("include_untrackedはデフォルトでfalse", () => {
      const result = validateConfig({
        development: {
          from: { type: "git", base: "main" },
          to: validGitProfile.to,
        },
      });
      const profile = getProfile(result, "development");
      if (profile?.from.type === "git") {
        assertEquals(profile.from.include_untracked, false);
      }
    });
  });

  describe("プロファイル検証 - fileモード", () => {
    const validFileProfile = {
      from: {
        type: "file",
        src: "dist/",
      },
      to: {
        targets: [
          {
            host: "localhost",
            protocol: "local",
            dest: "/tmp/deploy/",
          },
        ],
      },
    };

    it("有効なfileプロファイルは通過する", () => {
      const result = validateConfig({ staging: validFileProfile });
      const profile = getProfile(result, "staging");
      assertEquals(profile?.from.type, "file");
    });

    it("fileモードでsrcがない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            staging: {
              from: { type: "file" },
              to: validFileProfile.to,
            },
          }),
        ConfigValidationError,
        "file モードでは src (文字列) は必須です",
      );
    });

    it("srcが文字列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            staging: {
              from: { type: "file", src: 123 },
              to: validFileProfile.to,
            },
          }),
        ConfigValidationError,
        "file モードでは src (文字列) は必須です",
      );
    });

    it("srcでsync_mode=mirrorは有効", () => {
      const result = validateConfig({
        staging: {
          from: {
            type: "file",
            src: "/path/to/bbs",
          },
          to: {
            targets: [
              {
                host: "localhost",
                protocol: "local",
                dest: "/tmp/deploy/",
                sync_mode: "mirror",
              },
            ],
          },
        },
      });
      const profile = getProfile(result, "staging");
      assertEquals(profile?.from.type, "file");
    });
  });

  describe("プロファイル検証 - 無効なtype", () => {
    it("無効なtypeは拒否される", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              from: { type: "invalid" },
              to: {
                targets: [{ host: "example.com", protocol: "sftp", dest: "/" }],
              },
            },
          }),
        ConfigValidationError,
        "無効な type です",
      );
    });
  });

  describe("ターゲット検証", () => {
    const baseProfile = {
      from: { type: "file", src: "dist/" },
    };

    it("有効なSFTPターゲットは通過する", () => {
      const result = validateConfig({
        test: {
          ...baseProfile,
          to: {
            targets: [
              {
                host: "example.com",
                protocol: "sftp",
                port: 22,
                user: "deploy",
                auth_type: "ssh_key",
                key_file: "~/.ssh/id_rsa",
                dest: "/var/www/",
                sync_mode: "update",
                timeout: 30,
                retry: 3,
              },
            ],
          },
        },
      });
      const profile = getProfile(result, "test");
      const target = profile?.to.targets[0];
      assertEquals(target?.protocol, "sftp");
      assertEquals(target?.port, 22);
    });

    it("hostがない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: [{ protocol: "sftp", dest: "/" }],
              },
            },
          }),
        ConfigValidationError,
        "host (文字列) は必須です",
      );
    });

    it("protocolがない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: [{ host: "example.com", dest: "/" }],
              },
            },
          }),
        ConfigValidationError,
        "protocol (文字列) は必須です",
      );
    });

    it("無効なprotocolは拒否される", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: [
                  { host: "example.com", protocol: "ftp", dest: "/" },
                ],
              },
            },
          }),
        ConfigValidationError,
        "無効な protocol です",
      );
    });

    it("destがない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: [{ host: "example.com", protocol: "local" }],
              },
            },
          }),
        ConfigValidationError,
        "dest (文字列) は必須です",
      );
    });

    it("sftp/scp/rsyncでuserがない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: [
                  { host: "example.com", protocol: "sftp", dest: "/" },
                ],
              },
            },
          }),
        ConfigValidationError,
        "sftp/scp/rsync では user は必須です",
      );
    });

    it("localプロトコルではuserは不要", () => {
      const result = validateConfig({
        test: {
          ...baseProfile,
          to: {
            targets: [{ host: "localhost", protocol: "local", dest: "/tmp/" }],
          },
        },
      });
      const profile = getProfile(result, "test");
      assertEquals(profile?.to.targets[0].user, undefined);
    });

    it("無効なauth_typeは拒否される", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: [
                  {
                    host: "example.com",
                    protocol: "sftp",
                    user: "deploy",
                    auth_type: "invalid",
                    dest: "/",
                  },
                ],
              },
            },
          }),
        ConfigValidationError,
        "無効な auth_type です",
      );
    });

    it("無効なsync_modeは拒否される", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: [
                  {
                    host: "example.com",
                    protocol: "sftp",
                    user: "deploy",
                    sync_mode: "invalid",
                    dest: "/",
                  },
                ],
              },
            },
          }),
        ConfigValidationError,
        "無効な sync_mode です",
      );
    });

    it("targets配列が空の場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: { targets: [] },
            },
          }),
        ConfigValidationError,
        "targets は1つ以上必要です",
      );
    });

    it("デフォルト値はloaderで設定される（validatorではundefined）", () => {
      // validator は PartialTargetConfig を返すので、デフォルト値は設定しない
      // デフォルト値は loader の resolveProfile で設定される
      const result = validateConfig({
        test: {
          ...baseProfile,
          to: {
            targets: [
              {
                host: "localhost",
                protocol: "local",
                dest: "/tmp/",
              },
            ],
          },
        },
      });
      const profile = getProfile(result, "test");
      const target = profile?.to.targets[0];
      // validator では undefined のまま
      assertEquals(target?.sync_mode, undefined);
      assertEquals(target?.timeout, undefined);
      assertEquals(target?.retry, undefined);
      assertEquals(target?.preserve_permissions, undefined);
      assertEquals(target?.preserve_timestamps, undefined);
    });
  });
});

describe("hasProfile", () => {
  const config = validateConfig({
    _global: {},
    development: {
      from: { type: "git", base: "main" },
      to: {
        targets: [{ host: "localhost", protocol: "local", dest: "/" }],
      },
    },
    staging: {
      from: { type: "file", src: "dist/" },
      to: {
        targets: [{ host: "localhost", protocol: "local", dest: "/" }],
      },
    },
  });

  it("存在するプロファイルはtrueを返す", () => {
    assertEquals(hasProfile(config, "development"), true);
    assertEquals(hasProfile(config, "staging"), true);
  });

  it("存在しないプロファイルはfalseを返す", () => {
    assertEquals(hasProfile(config, "production"), false);
  });

  it("_globalはプロファイルとして認識されない", () => {
    assertEquals(hasProfile(config, "_global"), false);
  });
});

describe("getProfile", () => {
  const config = {
    _global: {},
    development: {
      from: { type: "git" as const, base: "main" },
      to: {
        targets: [{ host: "localhost", protocol: "local" as const, dest: "/" }],
      },
    },
  };

  it("存在するプロファイルを取得できる", () => {
    const profile = getProfile(config, "development");
    assertEquals(profile?.from.type, "git");
  });

  it("存在しないプロファイルはundefinedを返す", () => {
    const profile = getProfile(config, "production");
    assertEquals(profile, undefined);
  });

  it("_globalはundefinedを返す", () => {
    const profile = getProfile(config, "_global");
    assertEquals(profile, undefined);
  });
});

describe("getProfileNames", () => {
  it("プロファイル名のリストを取得できる", () => {
    const config = {
      _global: {},
      development: {
        from: { type: "git" as const, base: "main" },
        to: {
          targets: [
            { host: "localhost", protocol: "local" as const, dest: "/" },
          ],
        },
      },
      staging: {
        from: { type: "file" as const, src: "dist/" },
        to: {
          targets: [
            { host: "localhost", protocol: "local" as const, dest: "/" },
          ],
        },
      },
    };

    const names = getProfileNames(config);
    assertEquals(names.includes("development"), true);
    assertEquals(names.includes("staging"), true);
    assertEquals(names.includes("_global"), false);
  });

  it("空の設定では空配列を返す", () => {
    assertEquals(getProfileNames({}), []);
  });
});

describe("エラーパス検証", () => {
  describe("fromの検証", () => {
    it("fromがオブジェクトでない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              from: "not-object",
              to: {
                targets: [{
                  host: "example.com",
                  protocol: "local",
                  dest: "/",
                }],
              },
            },
          }),
        ConfigValidationError,
        "オブジェクトである必要があります",
      );
    });

    it("from.typeがない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              from: {},
              to: {
                targets: [{
                  host: "example.com",
                  protocol: "local",
                  dest: "/",
                }],
              },
            },
          }),
        ConfigValidationError,
        "type は必須です",
      );
    });
  });

  describe("toの検証", () => {
    it("toがオブジェクトでない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              from: { type: "file", src: "dist/" },
              to: "not-object",
            },
          }),
        ConfigValidationError,
        "オブジェクトである必要があります",
      );
    });

    it("targetsが配列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              from: { type: "file", src: "dist/" },
              to: { targets: "not-array" },
            },
          }),
        ConfigValidationError,
        "targets (配列) は必須です",
      );
    });
  });

  describe("ターゲットの検証", () => {
    const baseProfile = {
      from: { type: "file", src: "dist/" },
    };

    it("ターゲットがオブジェクトでない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: ["not-object"],
              },
            },
          }),
        ConfigValidationError,
        "オブジェクトである必要があります",
      );
    });
  });

  describe("defaultsの検証", () => {
    const baseProfile = {
      from: { type: "file", src: "dist/" },
    };

    it("defaultsがオブジェクトでない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                defaults: "not-object",
                targets: [{ dest: "/" }],
              },
            },
          }),
        ConfigValidationError,
        "オブジェクトである必要があります",
      );
    });

    it("defaults.protocolが無効な場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                defaults: {
                  host: "example.com",
                  protocol: "invalid",
                },
                targets: [{ dest: "/" }],
              },
            },
          }),
        ConfigValidationError,
        "無効な protocol です",
      );
    });

    it("defaults.auth_typeが無効な場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                defaults: {
                  host: "example.com",
                  protocol: "sftp",
                  user: "deploy",
                  auth_type: "invalid",
                },
                targets: [{ dest: "/" }],
              },
            },
          }),
        ConfigValidationError,
        "無効な auth_type です",
      );
    });

    it("defaults.sync_modeが無効な場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                defaults: {
                  host: "example.com",
                  protocol: "sftp",
                  user: "deploy",
                  sync_mode: "invalid",
                },
                targets: [{ dest: "/" }],
              },
            },
          }),
        ConfigValidationError,
        "無効な sync_mode です",
      );
    });

    it("defaultsの各種設定が正しく反映される", () => {
      const result = validateConfig({
        test: {
          ...baseProfile,
          to: {
            defaults: {
              host: "example.com",
              protocol: "sftp",
              port: 2222,
              user: "deploy",
              auth_type: "ssh_key",
              key_file: "~/.ssh/id_rsa",
              password: "secret",
              sync_mode: "mirror",
              preserve_permissions: true,
              preserve_timestamps: true,
              timeout: 60,
              retry: 5,
              rsync_path: "/usr/bin/rsync",
              rsync_options: ["--compress"],
              legacy_mode: true,
            },
            targets: [{ dest: "/" }],
          },
        },
      });
      const profile = getProfile(result, "test");
      const defaults = profile?.to.defaults;

      assertEquals(defaults?.host, "example.com");
      assertEquals(defaults?.protocol, "sftp");
      assertEquals(defaults?.port, 2222);
      assertEquals(defaults?.user, "deploy");
      assertEquals(defaults?.auth_type, "ssh_key");
      assertEquals(defaults?.key_file, "~/.ssh/id_rsa");
      assertEquals(defaults?.password, "secret");
      assertEquals(defaults?.sync_mode, "mirror");
      assertEquals(defaults?.preserve_permissions, true);
      assertEquals(defaults?.preserve_timestamps, true);
      assertEquals(defaults?.timeout, 60);
      assertEquals(defaults?.retry, 5);
      assertEquals(defaults?.rsync_path, "/usr/bin/rsync");
      assertEquals(defaults?.rsync_options, ["--compress"]);
      assertEquals(defaults?.legacy_mode, true);
    });
  });

  describe("プロファイルの検証", () => {
    it("プロファイルがオブジェクトでない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: "not-object",
          }),
        ConfigValidationError,
        "プロファイルはオブジェクトである必要があります",
      );
    });

    it("プロファイルがnullの場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: null,
          }),
        ConfigValidationError,
        "プロファイルはオブジェクトである必要があります",
      );
    });
  });
});

describe("ignore_groups バリデーション", () => {
  describe("_global.ignore_groups", () => {
    it("有効なignore_groupsは通過する", () => {
      const result = validateConfig({
        _global: {
          ignore_groups: {
            common: ["*.log", ".git/"],
            template: ["template/"],
          },
        },
      });
      assertEquals(result._global?.ignore_groups, {
        common: ["*.log", ".git/"],
        template: ["template/"],
      });
    });

    it("空のignore_groupsは有効", () => {
      const result = validateConfig({
        _global: {
          ignore_groups: {},
        },
      });
      assertEquals(result._global?.ignore_groups, {});
    });

    it("空のグループ配列は有効", () => {
      const result = validateConfig({
        _global: {
          ignore_groups: {
            empty: [],
          },
        },
      });
      assertEquals(result._global?.ignore_groups?.empty, []);
    });

    it("ignore_groupsがオブジェクトでない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: "not-object",
            },
          }),
        ConfigValidationError,
        "ignore_groups はオブジェクトである必要があります",
      );
    });

    it("グループの値が配列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: {
                common: "not-array",
              },
            },
          }),
        ConfigValidationError,
        "ignore_groups.common は配列である必要があります",
      );
    });

    it("グループ要素が文字列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: {
                common: [123],
              },
            },
          }),
        ConfigValidationError,
        "パターンは文字列である必要があります",
      );
    });
  });

  describe("_global.default_ignore", () => {
    it("有効なdefault_ignoreは通過する", () => {
      const result = validateConfig({
        _global: {
          ignore_groups: {
            common: ["*.log"],
            template: ["template/"],
          },
          default_ignore: ["common"],
        },
      });
      assertEquals(result._global?.default_ignore, ["common"]);
    });

    it("空のdefault_ignore配列は有効", () => {
      const result = validateConfig({
        _global: {
          ignore_groups: {
            common: ["*.log"],
          },
          default_ignore: [],
        },
      });
      assertEquals(result._global?.default_ignore, []);
    });

    it("default_ignoreが配列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: {
                common: ["*.log"],
              },
              default_ignore: "common",
            },
          }),
        ConfigValidationError,
        "default_ignore は配列である必要があります",
      );
    });

    it("default_ignore要素が文字列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: {
                common: ["*.log"],
              },
              default_ignore: [123],
            },
          }),
        ConfigValidationError,
        "default_ignore の各要素は文字列である必要があります",
      );
    });

    it("存在しないグループ名を指定した場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: {
                common: ["*.log"],
              },
              default_ignore: ["nonexistent"],
            },
          }),
        ConfigValidationError,
        "存在しないグループ名が指定されています: nonexistent",
      );
    });
  });

  describe("ターゲットの ignore 設定", () => {
    const baseProfile = {
      from: { type: "file", src: "dist/" },
    };

    it("有効なignore設定（use）は通過する", () => {
      const result = validateConfig({
        _global: {
          ignore_groups: {
            common: ["*.log"],
            template: ["template/"],
          },
        },
        test: {
          ...baseProfile,
          to: {
            targets: [
              {
                host: "localhost",
                protocol: "local",
                dest: "/tmp/",
                ignore: {
                  use: ["common"],
                },
              },
            ],
          },
        },
      });
      const profile = getProfile(result, "test");
      assertEquals(profile?.to.targets[0].ignore, { use: ["common"] });
    });

    it("有効なignore設定（use + add）は通過する", () => {
      const result = validateConfig({
        _global: {
          ignore_groups: {
            common: ["*.log"],
          },
        },
        test: {
          ...baseProfile,
          to: {
            targets: [
              {
                host: "localhost",
                protocol: "local",
                dest: "/tmp/",
                ignore: {
                  use: ["common"],
                  add: ["extra/"],
                },
              },
            ],
          },
        },
      });
      const profile = getProfile(result, "test");
      assertEquals(profile?.to.targets[0].ignore, {
        use: ["common"],
        add: ["extra/"],
      });
    });

    it("空のuse配列は有効（何も除外しない）", () => {
      const result = validateConfig({
        _global: {
          ignore_groups: {
            common: ["*.log"],
          },
        },
        test: {
          ...baseProfile,
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
      });
      const profile = getProfile(result, "test");
      assertEquals(profile?.to.targets[0].ignore, { use: [] });
    });

    it("ignore.useが配列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: {
                common: ["*.log"],
              },
            },
            test: {
              ...baseProfile,
              to: {
                targets: [
                  {
                    host: "localhost",
                    protocol: "local",
                    dest: "/tmp/",
                    ignore: {
                      use: "common",
                    },
                  },
                ],
              },
            },
          }),
        ConfigValidationError,
        "ignore.use は配列である必要があります",
      );
    });

    it("存在しないグループ名をuseで指定した場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: {
                common: ["*.log"],
              },
            },
            test: {
              ...baseProfile,
              to: {
                targets: [
                  {
                    host: "localhost",
                    protocol: "local",
                    dest: "/tmp/",
                    ignore: {
                      use: ["nonexistent"],
                    },
                  },
                ],
              },
            },
          }),
        ConfigValidationError,
        "存在しないグループ名が指定されています: nonexistent",
      );
    });

    it("ignore.addが配列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: {
                common: ["*.log"],
              },
            },
            test: {
              ...baseProfile,
              to: {
                targets: [
                  {
                    host: "localhost",
                    protocol: "local",
                    dest: "/tmp/",
                    ignore: {
                      add: "extra/",
                    },
                  },
                ],
              },
            },
          }),
        ConfigValidationError,
        "ignore.add は配列である必要があります",
      );
    });

    it("defaultsでignoreを設定できる", () => {
      const result = validateConfig({
        _global: {
          ignore_groups: {
            common: ["*.log"],
            template: ["template/"],
          },
        },
        test: {
          ...baseProfile,
          to: {
            defaults: {
              host: "localhost",
              protocol: "local",
              ignore: {
                use: ["common", "template"],
              },
            },
            targets: [{ dest: "/tmp/a" }, { dest: "/tmp/b" }],
          },
        },
      });
      const profile = getProfile(result, "test");
      assertEquals(profile?.to.defaults?.ignore, {
        use: ["common", "template"],
      });
    });

    it("ignoreがオブジェクトでない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: [
                  {
                    host: "localhost",
                    protocol: "local",
                    dest: "/tmp/",
                    ignore: "not-object",
                  },
                ],
              },
            },
          }),
        ConfigValidationError,
        "ignore はオブジェクトである必要があります",
      );
    });

    it("ignore.use要素が文字列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore_groups: {
                common: ["*.log"],
              },
            },
            test: {
              ...baseProfile,
              to: {
                targets: [
                  {
                    host: "localhost",
                    protocol: "local",
                    dest: "/tmp/",
                    ignore: {
                      use: [123],
                    },
                  },
                ],
              },
            },
          }),
        ConfigValidationError,
        "グループ名は文字列である必要があります",
      );
    });

    it("ignore.add要素が文字列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            test: {
              ...baseProfile,
              to: {
                targets: [
                  {
                    host: "localhost",
                    protocol: "local",
                    dest: "/tmp/",
                    ignore: {
                      add: [123],
                    },
                  },
                ],
              },
            },
          }),
        ConfigValidationError,
        "パターンは文字列である必要があります",
      );
    });

    it("ターゲットの各種設定が正しく反映される", () => {
      const result = validateConfig({
        test: {
          ...baseProfile,
          to: {
            targets: [
              {
                host: "example.com",
                protocol: "rsync",
                port: 2222,
                user: "deploy",
                auth_type: "password",
                key_file: "~/.ssh/id_rsa",
                password: "secret",
                dest: "/var/www/",
                sync_mode: "mirror",
                preserve_permissions: true,
                preserve_timestamps: true,
                timeout: 60,
                retry: 5,
                rsync_path: "/usr/bin/rsync",
                rsync_options: ["--compress"],
                legacy_mode: true,
              },
            ],
          },
        },
      });
      const profile = getProfile(result, "test");
      const target = profile?.to.targets[0];

      assertEquals(target?.host, "example.com");
      assertEquals(target?.protocol, "rsync");
      assertEquals(target?.port, 2222);
      assertEquals(target?.user, "deploy");
      assertEquals(target?.auth_type, "password");
      assertEquals(target?.key_file, "~/.ssh/id_rsa");
      assertEquals(target?.password, "secret");
      assertEquals(target?.dest, "/var/www/");
      assertEquals(target?.sync_mode, "mirror");
      assertEquals(target?.preserve_permissions, true);
      assertEquals(target?.preserve_timestamps, true);
      assertEquals(target?.timeout, 60);
      assertEquals(target?.retry, 5);
      assertEquals(target?.rsync_path, "/usr/bin/rsync");
      assertEquals(target?.rsync_options, ["--compress"]);
      assertEquals(target?.legacy_mode, true);
    });
  });
});
