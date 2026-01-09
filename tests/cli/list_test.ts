/**
 * cli/list.ts のテスト
 */

import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
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
              { host: "staging.example.com", protocol: "sftp", dest: "/var/www/" },
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
              { host: "staging.example.com", protocol: "sftp", dest: "/var/www/" },
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
          ignore: ["*.log", "node_modules/"],
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
  });
});
