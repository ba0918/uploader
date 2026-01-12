/**
 * cli/args.ts のテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { parseArgs } from "../../src/cli/args.ts";
import type { CliArgs } from "../../src/types/mod.ts";

/**
 * parseArgs の結果を CliArgs として取得するヘルパー関数
 * （init コマンドのテストは別ファイルで行うため、このテストでは常に CliArgs を期待）
 */
function parseAsCliArgs(args: string[]): CliArgs {
  return parseArgs(args) as CliArgs;
}

describe("parseArgs", () => {
  describe("基本的なパース", () => {
    it("プロファイル名をパースできる", () => {
      const result = parseAsCliArgs(["development"]);
      assertEquals(result.profile, "development");
    });

    it("引数なしの場合はプロファイルがundefined", () => {
      const result = parseAsCliArgs([]);
      assertEquals(result.profile, undefined);
    });

    it("複数の引数がある場合は最初がプロファイル", () => {
      const result = parseAsCliArgs(["production", "extra", "args"]);
      assertEquals(result.profile, "production");
    });
  });

  describe("設定ファイルオプション", () => {
    it("--configオプションをパースできる", () => {
      const result = parseAsCliArgs(["--config", "custom.yaml", "profile"]);
      assertEquals(result.config, "custom.yaml");
    });

    it("-cショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-c", "custom.yaml", "profile"]);
      assertEquals(result.config, "custom.yaml");
    });

    it("--config=形式をパースできる", () => {
      const result = parseAsCliArgs(["--config=custom.yaml", "profile"]);
      assertEquals(result.config, "custom.yaml");
    });
  });

  describe("diffオプション", () => {
    it("--diffオプションをパースできる（値なしはauto）", () => {
      const result = parseAsCliArgs(["--diff", "profile"]);
      assertEquals(result.diff, "auto");
    });

    it("-dショートオプションをパースできる（値なしはauto）", () => {
      const result = parseAsCliArgs(["-d", "profile"]);
      assertEquals(result.diff, "auto");
    });

    it("--diff=remoteでremoteモードを指定できる", () => {
      const result = parseAsCliArgs(["--diff=remote", "profile"]);
      assertEquals(result.diff, "remote");
    });

    it("無効なモードは警告を出してautoを返す", () => {
      const result = parseAsCliArgs(["--diff=invalid", "profile"]);
      assertEquals(result.diff, "auto");
    });

    it("デフォルトはfalse", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.diff, false);
    });

    it("--diff profileでプロファイルを誤って取り込まない", () => {
      const result = parseAsCliArgs(["--diff", "test_profile"]);
      assertEquals(result.diff, "auto");
      assertEquals(result.profile, "test_profile");
    });

    it("-d profileでプロファイルを誤って取り込まない", () => {
      const result = parseAsCliArgs(["-d", "my_profile"]);
      assertEquals(result.diff, "auto");
      assertEquals(result.profile, "my_profile");
    });

    it("-d=remote形式をパースできる", () => {
      const result = parseAsCliArgs(["-d=remote", "profile"]);
      assertEquals(result.diff, "remote");
      assertEquals(result.profile, "profile");
    });
  });

  describe("dry-runオプション", () => {
    it("--dry-runオプションをパースできる", () => {
      const result = parseAsCliArgs(["--dry-run", "profile"]);
      assertEquals(result.dryRun, true);
    });

    it("-nショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-n", "profile"]);
      assertEquals(result.dryRun, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.dryRun, false);
    });
  });

  describe("deleteオプション", () => {
    it("--deleteオプションをパースできる", () => {
      const result = parseAsCliArgs(["--delete", "profile"]);
      assertEquals(result.delete, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.delete, false);
    });
  });

  describe("ブランチオプション", () => {
    it("--baseオプションをパースできる", () => {
      const result = parseAsCliArgs(["--base", "main", "profile"]);
      assertEquals(result.base, "main");
    });

    it("-bショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-b", "develop", "profile"]);
      assertEquals(result.base, "develop");
    });

    it("--targetオプションをパースできる", () => {
      const result = parseAsCliArgs(["--target", "feature/xxx", "profile"]);
      assertEquals(result.target, "feature/xxx");
    });

    it("-tショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-t", "HEAD", "profile"]);
      assertEquals(result.target, "HEAD");
    });

    it("baseとtargetを同時に指定できる", () => {
      const result = parseAsCliArgs([
        "--base",
        "main",
        "--target",
        "feature/branch",
        "profile",
      ]);
      assertEquals(result.base, "main");
      assertEquals(result.target, "feature/branch");
    });
  });

  describe("verboseとquietオプション", () => {
    it("--verboseオプションをパースできる", () => {
      const result = parseAsCliArgs(["--verbose", "profile"]);
      assertEquals(result.verbose, true);
    });

    it("-vショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-v", "profile"]);
      assertEquals(result.verbose, true);
    });

    it("--quietオプションをパースできる", () => {
      const result = parseAsCliArgs(["--quiet", "profile"]);
      assertEquals(result.quiet, true);
    });

    it("-qショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-q", "profile"]);
      assertEquals(result.quiet, true);
    });

    it("デフォルトは両方false", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.verbose, false);
      assertEquals(result.quiet, false);
    });
  });

  describe("portオプション", () => {
    it("--portオプションをパースできる", () => {
      const result = parseAsCliArgs(["--port", "8080", "profile"]);
      assertEquals(result.port, 8080);
    });

    it("-pショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-p", "8000", "profile"]);
      assertEquals(result.port, 8000);
    });

    it("デフォルトは3000", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.port, 3000);
    });

    it("無効なポートはデフォルトを使用", () => {
      const result = parseAsCliArgs(["--port", "invalid", "profile"]);
      assertEquals(result.port, 3000);
    });

    it("範囲外のポートはデフォルトを使用", () => {
      const result = parseAsCliArgs(["--port", "70000", "profile"]);
      assertEquals(result.port, 3000);
    });
  });

  describe("no-browserオプション", () => {
    it("--no-browserオプションをパースできる", () => {
      const result = parseAsCliArgs(["--no-browser", "profile"]);
      assertEquals(result.noBrowser, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.noBrowser, false);
    });
  });

  describe("cuiオプション", () => {
    it("--cuiオプションをパースできる", () => {
      const result = parseAsCliArgs(["--cui", "profile"]);
      assertEquals(result.cui, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.cui, false);
    });

    it("--diffと--cuiを同時に指定できる", () => {
      const result = parseAsCliArgs(["--diff", "--cui", "profile"]);
      assertEquals(result.diff, "auto");
      assertEquals(result.cui, true);
    });
  });

  describe("strictオプション", () => {
    it("--strictオプションをパースできる", () => {
      const result = parseAsCliArgs(["--strict", "profile"]);
      assertEquals(result.strict, true);
    });

    it("-sショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-s", "profile"]);
      assertEquals(result.strict, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.strict, false);
    });
  });

  describe("log-fileオプション", () => {
    it("--log-fileオプションをパースできる", () => {
      const result = parseAsCliArgs(["--log-file", "output.log", "profile"]);
      assertEquals(result.logFile, "output.log");
    });

    it("-lショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-l", "deploy.log", "profile"]);
      assertEquals(result.logFile, "deploy.log");
    });
  });

  describe("concurrencyオプション", () => {
    it("--concurrencyオプションをパースできる", () => {
      const result = parseAsCliArgs(["--concurrency", "20", "profile"]);
      assertEquals(result.concurrency, 20);
    });

    it("デフォルトは10", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.concurrency, 10);
    });

    it("無効な値はデフォルトを使用", () => {
      const result = parseAsCliArgs(["--concurrency", "invalid", "profile"]);
      assertEquals(result.concurrency, 10);
    });

    it("0以下の値はデフォルトを使用", () => {
      const result = parseAsCliArgs(["--concurrency", "0", "profile"]);
      assertEquals(result.concurrency, 10);
    });

    it("負の値はデフォルトを使用", () => {
      const result = parseAsCliArgs(["--concurrency", "-5", "profile"]);
      assertEquals(result.concurrency, 10);
    });
  });

  describe("parallelオプション", () => {
    it("--parallelオプションをパースできる", () => {
      const result = parseAsCliArgs(["--parallel", "profile"]);
      assertEquals(result.parallel, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.parallel, false);
    });
  });

  describe("listオプション", () => {
    it("--listオプションをパースできる", () => {
      const result = parseAsCliArgs(["--list"]);
      assertEquals(result.list, true);
    });

    it("-Lショートオプションをパースできる", () => {
      const result = parseAsCliArgs(["-L"]);
      assertEquals(result.list, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseAsCliArgs(["profile"]);
      assertEquals(result.list, false);
    });

    it("--listと--configを同時に指定できる", () => {
      const result = parseAsCliArgs(["--list", "--config", "custom.yaml"]);
      assertEquals(result.list, true);
      assertEquals(result.config, "custom.yaml");
    });
  });

  describe("helpオプション", () => {
    it("--helpオプションでnullを返す", () => {
      const result = parseArgs(["--help"]);
      assertEquals(result, null);
    });

    it("-hショートオプションでnullを返す", () => {
      const result = parseArgs(["-h"]);
      assertEquals(result, null);
    });
  });

  describe("versionオプション", () => {
    it("--versionオプションでnullを返す", () => {
      const result = parseArgs(["--version"]);
      assertEquals(result, null);
    });

    it("-Vショートオプションでnullを返す", () => {
      const result = parseArgs(["-V"]);
      assertEquals(result, null);
    });
  });

  describe("複合オプション", () => {
    it("複数のオプションを同時にパースできる", () => {
      const result = parseAsCliArgs([
        "--config",
        "custom.yaml",
        "--diff=remote",
        "--dry-run",
        "--verbose",
        "--base",
        "main",
        "--port",
        "8080",
        "production",
      ]);
      assertEquals(result.config, "custom.yaml");
      assertEquals(result.diff, "remote");
      assertEquals(result.dryRun, true);
      assertEquals(result.verbose, true);
      assertEquals(result.base, "main");
      assertEquals(result.port, 8080);
      assertEquals(result.profile, "production");
    });

    it("ショートオプションをまとめて指定できる", () => {
      const result = parseAsCliArgs(["-nv", "--diff", "profile"]);
      assertEquals(result.diff, "auto");
      assertEquals(result.dryRun, true);
      assertEquals(result.verbose, true);
    });
  });
});
