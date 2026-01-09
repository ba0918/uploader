/**
 * cli/args.ts のテスト
 */

import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { parseArgs } from "../../src/cli/args.ts";

describe("parseArgs", () => {
  describe("基本的なパース", () => {
    it("プロファイル名をパースできる", () => {
      const result = parseArgs(["development"]);
      assertEquals(result?.profile, "development");
    });

    it("引数なしの場合はプロファイルがundefined", () => {
      const result = parseArgs([]);
      assertEquals(result?.profile, undefined);
    });

    it("複数の引数がある場合は最初がプロファイル", () => {
      const result = parseArgs(["production", "extra", "args"]);
      assertEquals(result?.profile, "production");
    });
  });

  describe("設定ファイルオプション", () => {
    it("--configオプションをパースできる", () => {
      const result = parseArgs(["--config", "custom.yaml", "profile"]);
      assertEquals(result?.config, "custom.yaml");
    });

    it("-cショートオプションをパースできる", () => {
      const result = parseArgs(["-c", "custom.yaml", "profile"]);
      assertEquals(result?.config, "custom.yaml");
    });

    it("--config=形式をパースできる", () => {
      const result = parseArgs(["--config=custom.yaml", "profile"]);
      assertEquals(result?.config, "custom.yaml");
    });
  });

  describe("diffオプション", () => {
    it("--diffオプションをパースできる（値なしはauto）", () => {
      const result = parseArgs(["--diff", "profile"]);
      assertEquals(result?.diff, "auto");
    });

    it("-dショートオプションをパースできる（値なしはauto）", () => {
      const result = parseArgs(["-d", "profile"]);
      assertEquals(result?.diff, "auto");
    });

    it("--diff=remoteでremoteモードを指定できる", () => {
      const result = parseArgs(["--diff=remote", "profile"]);
      assertEquals(result?.diff, "remote");
    });

    it("無効なモードは警告を出してautoを返す", () => {
      const result = parseArgs(["--diff=invalid", "profile"]);
      assertEquals(result?.diff, "auto");
    });

    it("デフォルトはfalse", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.diff, false);
    });

    it("--diff profileでプロファイルを誤って取り込まない", () => {
      const result = parseArgs(["--diff", "test_profile"]);
      assertEquals(result?.diff, "auto");
      assertEquals(result?.profile, "test_profile");
    });

    it("-d profileでプロファイルを誤って取り込まない", () => {
      const result = parseArgs(["-d", "my_profile"]);
      assertEquals(result?.diff, "auto");
      assertEquals(result?.profile, "my_profile");
    });

    it("-d=remote形式をパースできる", () => {
      const result = parseArgs(["-d=remote", "profile"]);
      assertEquals(result?.diff, "remote");
      assertEquals(result?.profile, "profile");
    });
  });

  describe("dry-runオプション", () => {
    it("--dry-runオプションをパースできる", () => {
      const result = parseArgs(["--dry-run", "profile"]);
      assertEquals(result?.dryRun, true);
    });

    it("-nショートオプションをパースできる", () => {
      const result = parseArgs(["-n", "profile"]);
      assertEquals(result?.dryRun, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.dryRun, false);
    });
  });

  describe("deleteオプション", () => {
    it("--deleteオプションをパースできる", () => {
      const result = parseArgs(["--delete", "profile"]);
      assertEquals(result?.delete, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.delete, false);
    });
  });

  describe("ブランチオプション", () => {
    it("--baseオプションをパースできる", () => {
      const result = parseArgs(["--base", "main", "profile"]);
      assertEquals(result?.base, "main");
    });

    it("-bショートオプションをパースできる", () => {
      const result = parseArgs(["-b", "develop", "profile"]);
      assertEquals(result?.base, "develop");
    });

    it("--targetオプションをパースできる", () => {
      const result = parseArgs(["--target", "feature/xxx", "profile"]);
      assertEquals(result?.target, "feature/xxx");
    });

    it("-tショートオプションをパースできる", () => {
      const result = parseArgs(["-t", "HEAD", "profile"]);
      assertEquals(result?.target, "HEAD");
    });

    it("baseとtargetを同時に指定できる", () => {
      const result = parseArgs([
        "--base",
        "main",
        "--target",
        "feature/branch",
        "profile",
      ]);
      assertEquals(result?.base, "main");
      assertEquals(result?.target, "feature/branch");
    });
  });

  describe("verboseとquietオプション", () => {
    it("--verboseオプションをパースできる", () => {
      const result = parseArgs(["--verbose", "profile"]);
      assertEquals(result?.verbose, true);
    });

    it("-vショートオプションをパースできる", () => {
      const result = parseArgs(["-v", "profile"]);
      assertEquals(result?.verbose, true);
    });

    it("--quietオプションをパースできる", () => {
      const result = parseArgs(["--quiet", "profile"]);
      assertEquals(result?.quiet, true);
    });

    it("-qショートオプションをパースできる", () => {
      const result = parseArgs(["-q", "profile"]);
      assertEquals(result?.quiet, true);
    });

    it("デフォルトは両方false", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.verbose, false);
      assertEquals(result?.quiet, false);
    });
  });

  describe("portオプション", () => {
    it("--portオプションをパースできる", () => {
      const result = parseArgs(["--port", "8080", "profile"]);
      assertEquals(result?.port, 8080);
    });

    it("-pショートオプションをパースできる", () => {
      const result = parseArgs(["-p", "8000", "profile"]);
      assertEquals(result?.port, 8000);
    });

    it("デフォルトは3000", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.port, 3000);
    });

    it("無効なポートはデフォルトを使用", () => {
      const result = parseArgs(["--port", "invalid", "profile"]);
      assertEquals(result?.port, 3000);
    });

    it("範囲外のポートはデフォルトを使用", () => {
      const result = parseArgs(["--port", "70000", "profile"]);
      assertEquals(result?.port, 3000);
    });
  });

  describe("no-browserオプション", () => {
    it("--no-browserオプションをパースできる", () => {
      const result = parseArgs(["--no-browser", "profile"]);
      assertEquals(result?.noBrowser, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.noBrowser, false);
    });
  });

  describe("strictオプション", () => {
    it("--strictオプションをパースできる", () => {
      const result = parseArgs(["--strict", "profile"]);
      assertEquals(result?.strict, true);
    });

    it("-sショートオプションをパースできる", () => {
      const result = parseArgs(["-s", "profile"]);
      assertEquals(result?.strict, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.strict, false);
    });
  });

  describe("log-fileオプション", () => {
    it("--log-fileオプションをパースできる", () => {
      const result = parseArgs(["--log-file", "output.log", "profile"]);
      assertEquals(result?.logFile, "output.log");
    });

    it("-lショートオプションをパースできる", () => {
      const result = parseArgs(["-l", "deploy.log", "profile"]);
      assertEquals(result?.logFile, "deploy.log");
    });
  });

  describe("concurrencyオプション", () => {
    it("--concurrencyオプションをパースできる", () => {
      const result = parseArgs(["--concurrency", "20", "profile"]);
      assertEquals(result?.concurrency, 20);
    });

    it("デフォルトは10", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.concurrency, 10);
    });

    it("無効な値はデフォルトを使用", () => {
      const result = parseArgs(["--concurrency", "invalid", "profile"]);
      assertEquals(result?.concurrency, 10);
    });

    it("0以下の値はデフォルトを使用", () => {
      const result = parseArgs(["--concurrency", "0", "profile"]);
      assertEquals(result?.concurrency, 10);
    });

    it("負の値はデフォルトを使用", () => {
      const result = parseArgs(["--concurrency", "-5", "profile"]);
      assertEquals(result?.concurrency, 10);
    });
  });

  describe("parallelオプション", () => {
    it("--parallelオプションをパースできる", () => {
      const result = parseArgs(["--parallel", "profile"]);
      assertEquals(result?.parallel, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.parallel, false);
    });
  });

  describe("listオプション", () => {
    it("--listオプションをパースできる", () => {
      const result = parseArgs(["--list"]);
      assertEquals(result?.list, true);
    });

    it("-Lショートオプションをパースできる", () => {
      const result = parseArgs(["-L"]);
      assertEquals(result?.list, true);
    });

    it("デフォルトはfalse", () => {
      const result = parseArgs(["profile"]);
      assertEquals(result?.list, false);
    });

    it("--listと--configを同時に指定できる", () => {
      const result = parseArgs(["--list", "--config", "custom.yaml"]);
      assertEquals(result?.list, true);
      assertEquals(result?.config, "custom.yaml");
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
      const result = parseArgs([
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
      assertEquals(result?.config, "custom.yaml");
      assertEquals(result?.diff, "remote");
      assertEquals(result?.dryRun, true);
      assertEquals(result?.verbose, true);
      assertEquals(result?.base, "main");
      assertEquals(result?.port, 8080);
      assertEquals(result?.profile, "production");
    });

    it("ショートオプションをまとめて指定できる", () => {
      const result = parseArgs(["-nv", "--diff", "profile"]);
      assertEquals(result?.diff, "auto");
      assertEquals(result?.dryRun, true);
      assertEquals(result?.verbose, true);
    });
  });
});
