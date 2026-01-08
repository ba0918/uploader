/**
 * config/validator.ts のテスト
 */

import { assertEquals, assertThrows } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
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
    it("ignoreパターンを持つ_globalは有効", () => {
      const result = validateConfig({
        _global: {
          ignore: ["*.log", ".git/"],
        },
      });
      assertEquals(result._global?.ignore, ["*.log", ".git/"]);
    });

    it("空のignore配列は有効", () => {
      const result = validateConfig({
        _global: {
          ignore: [],
        },
      });
      assertEquals(result._global?.ignore, []);
    });

    it("ignoreが配列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore: "not-array",
            },
          }),
        ConfigValidationError,
        "ignore は配列である必要があります",
      );
    });

    it("ignore要素が文字列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            _global: {
              ignore: [123],
            },
          }),
        ConfigValidationError,
        "ignore の各要素は文字列である必要があります",
      );
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
        src: ["dist/", "public/"],
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
        "file モードでは src (配列) は必須です",
      );
    });

    it("srcが配列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            staging: {
              from: { type: "file", src: "not-array" },
              to: validFileProfile.to,
            },
          }),
        ConfigValidationError,
        "file モードでは src (配列) は必須です",
      );
    });

    it("src要素が文字列でない場合は無効", () => {
      assertThrows(
        () =>
          validateConfig({
            staging: {
              from: { type: "file", src: [123] },
              to: validFileProfile.to,
            },
          }),
        ConfigValidationError,
        "src の各要素は文字列である必要があります",
      );
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
      from: { type: "file", src: ["dist/"] },
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

    it("sftp/scpでuserがない場合は無効", () => {
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
        "sftp/scp では user は必須です",
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

    it("デフォルト値が正しく設定される", () => {
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
      assertEquals(target?.sync_mode, "update");
      assertEquals(target?.timeout, 30);
      assertEquals(target?.retry, 3);
      assertEquals(target?.preserve_permissions, false);
      assertEquals(target?.preserve_timestamps, false);
    });
  });
});

describe("hasProfile", () => {
  const config = {
    _global: { ignore: [] },
    development: {
      from: { type: "git" as const, base: "main" },
      to: {
        targets: [{ host: "localhost", protocol: "local" as const, dest: "/" }],
      },
    },
    staging: {
      from: { type: "file" as const, src: ["dist/"] },
      to: {
        targets: [{ host: "localhost", protocol: "local" as const, dest: "/" }],
      },
    },
  };

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
    _global: { ignore: [] },
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
      _global: { ignore: [] },
      development: {
        from: { type: "git" as const, base: "main" },
        to: {
          targets: [
            { host: "localhost", protocol: "local" as const, dest: "/" },
          ],
        },
      },
      staging: {
        from: { type: "file" as const, src: ["dist/"] },
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
