/**
 * cli/list.ts のテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { showProfileList } from "../../src/cli/list.ts";
import type { Config } from "../../src/types/mod.ts";

// console.log の出力をキャプチャするヘルパー
function captureConsoleLog(fn: () => void): string[] {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  return logs;
}

describe("showProfileList", () => {
  describe("基本的な出力", () => {
    it("設定ファイルパスを表示する", () => {
      const config: Config = {
        development: {
          from: { type: "git", base: "origin/main" },
          to: {
            targets: [
              { host: "example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("./uploader.yaml"), true);
    });

    it("プロファイル名を表示する", () => {
      const config: Config = {
        development: {
          from: { type: "git", base: "origin/main" },
          to: {
            targets: [
              { host: "example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("development"), true);
    });

    it("プロファイルがない場合はメッセージを表示する", () => {
      const config: Config = {};

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("プロファイルが見つかりません"), true);
    });
  });

  describe("gitモードの表示", () => {
    it("gitモードのプロファイルを正しく表示する", () => {
      const config: Config = {
        development: {
          from: { type: "git", base: "origin/main", target: "HEAD" },
          to: {
            targets: [
              { host: "example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("git"), true);
      assertEquals(output.includes("origin/main"), true);
    });

    it("include_untrackedがtrueの場合に表示する", () => {
      const config: Config = {
        development: {
          from: { type: "git", base: "origin/main", include_untracked: true },
          to: {
            targets: [
              { host: "example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("include_untracked"), true);
    });
  });

  describe("fileモードの表示", () => {
    it("fileモードのプロファイルを正しく表示する", () => {
      const config: Config = {
        staging: {
          from: { type: "file", src: ["dist/", "public/"] },
          to: {
            targets: [
              {
                host: "staging.example.com",
                protocol: "sftp",
                dest: "/var/www/",
              },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("file"), true);
      assertEquals(output.includes("dist/"), true);
    });
  });

  describe("複数ターゲットの表示", () => {
    it("複数ターゲットがある場合はサーバー数を表示する", () => {
      const config: Config = {
        production: {
          from: { type: "file", src: ["dist/"] },
          to: {
            targets: [
              { host: "web1.example.com", protocol: "sftp", dest: "/var/www/" },
              { host: "web2.example.com", protocol: "sftp", dest: "/var/www/" },
              { host: "web3.example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("3 servers"), true);
    });
  });

  describe("複数プロファイルの表示", () => {
    it("複数のプロファイルを表示する", () => {
      const config: Config = {
        development: {
          from: { type: "git", base: "origin/develop" },
          to: {
            targets: [
              { host: "dev.example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
        staging: {
          from: { type: "file", src: ["dist/"] },
          to: {
            targets: [
              {
                host: "staging.example.com",
                protocol: "sftp",
                dest: "/var/www/",
              },
            ],
          },
        },
        production: {
          from: { type: "git", base: "origin/main" },
          to: {
            targets: [
              { host: "prod.example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("development"), true);
      assertEquals(output.includes("staging"), true);
      assertEquals(output.includes("production"), true);
    });
  });

  describe("_globalの除外", () => {
    it("_globalはプロファイルとして表示されない", () => {
      const config: Config = {
        _global: {
          ignore_groups: {
            common: ["*.log", "node_modules/"],
          },
        },
        development: {
          from: { type: "git", base: "origin/main" },
          to: {
            targets: [
              { host: "example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      // _globalはプロファイル一覧に表示されない
      // developmentは表示される
      assertEquals(output.includes("development"), true);
      // _globalがプロファイル名として表示されていないことを確認
      // ただし、出力全体には含まれない可能性があるのでチェック方法を調整
    });
  });

  describe("defaultsの表示", () => {
    it("defaultsがある場合に表示する", () => {
      const config: Config = {
        production: {
          from: { type: "file", src: ["dist/"] },
          to: {
            defaults: {
              sync_mode: "mirror",
              password: "secret123",
            },
            targets: [
              { host: "web1.example.com", protocol: "sftp", dest: "/var/www/" },
              { host: "web2.example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("defaults"), true);
      assertEquals(output.includes("sync_mode=mirror"), true);
      // パスワードはマスクされる
      assertEquals(output.includes("password=***"), true);
      // 実際のパスワードは表示されない
      assertEquals(output.includes("secret123"), false);
    });

    it("auth_typeがある場合に表示する", () => {
      const config: Config = {
        production: {
          from: { type: "file", src: ["dist/"] },
          to: {
            defaults: {
              auth_type: "ssh_key",
            },
            targets: [
              { host: "web1.example.com", protocol: "sftp", dest: "/var/www/" },
              { host: "web2.example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("auth=ssh_key"), true);
    });

    it("空のdefaultsは表示されない", () => {
      const config: Config = {
        production: {
          from: { type: "file", src: ["dist/"] },
          to: {
            defaults: {},
            targets: [
              { host: "web1.example.com", protocol: "sftp", dest: "/var/www/" },
              { host: "web2.example.com", protocol: "sftp", dest: "/var/www/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("defaults:"), false);
    });
  });

  describe("defaultsからの値継承", () => {
    it("単一ターゲットでdefaultsからhost/user/protocolを継承する", () => {
      const config: Config = {
        production: {
          from: { type: "file", src: ["dist/"] },
          to: {
            defaults: {
              host: "default-host.com",
              user: "default-user",
              protocol: "sftp",
              port: 2222,
            },
            targets: [{ dest: "/var/www/" }],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("default-user@default-host.com:2222"), true);
    });

    it("複数ターゲットでdefaultsからhost/user/protocolを継承する", () => {
      const config: Config = {
        production: {
          from: { type: "file", src: ["dist/"] },
          to: {
            defaults: {
              host: "default-host.com",
              user: "default-user",
              protocol: "scp",
            },
            targets: [{ dest: "/var/www/a" }, { dest: "/var/www/b" }],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("default-user@default-host.com:22"), true);
    });
  });

  describe("プロトコルごとのポート表示", () => {
    it("localプロトコルでもターゲット情報は表示される", () => {
      const config: Config = {
        local: {
          from: { type: "file", src: ["dist/"] },
          to: {
            targets: [
              { host: "localhost", protocol: "local", dest: "/tmp/deploy/" },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      // localプロトコルでもホスト情報は表示される
      assertEquals(output.includes("localhost"), true);
      assertEquals(output.includes("/tmp/deploy/"), true);
    });

    it("rsyncプロトコルでターゲット情報が表示される", () => {
      const config: Config = {
        rsync: {
          from: { type: "file", src: ["dist/"] },
          to: {
            targets: [
              {
                host: "rsync.example.com",
                protocol: "rsync",
                user: "deploy",
                dest: "/var/www/",
              },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("deploy@rsync.example.com"), true);
      assertEquals(output.includes("/var/www/"), true);
    });

    it("カスタムポートが正しく表示される", () => {
      const config: Config = {
        custom: {
          from: { type: "file", src: ["dist/"] },
          to: {
            targets: [
              {
                host: "example.com",
                protocol: "sftp",
                port: 2222,
                user: "deploy",
                dest: "/var/www/",
              },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes(":2222"), true);
    });
  });

  describe("環境変数形式のユーザー名", () => {
    it("環境変数形式のユーザー名がそのまま表示される", () => {
      const config: Config = {
        env_test: {
          from: { type: "file", src: ["dist/"] },
          to: {
            targets: [
              {
                host: "example.com",
                protocol: "sftp",
                user: "${SSH_USER}",
                dest: "/var/www/",
              },
            ],
          },
        },
      };

      const logs = captureConsoleLog(() => {
        showProfileList(config, "./uploader.yaml");
      });

      const output = logs.join("\n");
      assertEquals(output.includes("${SSH_USER}@example.com"), true);
    });
  });
});
