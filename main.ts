/**
 * uploader - Git-based deployment tool
 *
 * Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイするCLIツール
 */

import { parseArgs, showHelp } from "./src/cli/mod.ts";
import {
  ConfigLoadError,
  ConfigValidationError,
  loadAndResolveProfile,
} from "./src/config/mod.ts";
import { getDiff, GitCommandError } from "./src/git/mod.ts";
import type { GitDiffResult, LogLevel } from "./src/types/mod.ts";
import {
  dim,
  initLogger,
  logDiffSummary,
  logError,
  logNoChanges,
  logProfileInfo,
  logSection,
  logSectionLine,
  path,
  showBanner,
} from "./src/ui/mod.ts";

/** 終了コード */
const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  CONFIG_ERROR: 2,
  AUTH_ERROR: 3,
  CONNECTION_ERROR: 4,
  PARTIAL_FAILURE: 5,
} as const;

/**
 * メイン処理
 */
async function main(): Promise<number> {
  try {
    const args = parseArgs(Deno.args);

    // ヘルプ/バージョン表示時は終了
    if (args === null) {
      return EXIT_CODES.SUCCESS;
    }

    // ログレベルを設定
    let logLevel: LogLevel = "normal";
    if (args.verbose) {
      logLevel = "verbose";
    } else if (args.quiet) {
      logLevel = "quiet";
    }
    initLogger({ level: logLevel });

    // バナー表示（quiet モード以外）
    if (logLevel !== "quiet") {
      showBanner();
    }

    // プロファイル名がない場合はヘルプを表示
    if (!args.profile) {
      showHelp();
      return EXIT_CODES.SUCCESS;
    }

    // 設定ファイルを読み込み
    const { profile, configPath } = await loadAndResolveProfile(
      args.profile,
      args.config,
    );

    // CLI引数で設定を上書き
    if (profile.from.type === "git") {
      if (args.base) {
        profile.from.base = args.base;
      }
      if (args.target) {
        profile.from.target = args.target;
      }
    }

    // プロファイル情報を表示
    const fromType = profile.from.type;
    let fromDetail: string;
    if (profile.from.type === "git") {
      fromDetail = `${profile.from.base} → ${profile.from.target || "HEAD"}`;
    } else {
      fromDetail = profile.from.src.join(", ");
    }

    const targets = profile.to.targets.map((t) => ({
      host: t.host,
      protocol: t.protocol,
    }));

    logProfileInfo(
      args.profile,
      fromType,
      fromDetail,
      targets.length,
      targets,
      profile.ignore.length,
    );

    // 設定ファイルパスを表示
    logSection("Configuration");
    logSectionLine(`Config: ${path(configPath)}`, true);

    // Git差分を取得
    let diffResult: GitDiffResult | null = null;
    if (profile.from.type === "git") {
      const base = profile.from.base;
      const target = profile.from.target || "HEAD";

      diffResult = await getDiff(base, target, {
        excludePatterns: profile.ignore,
      });

      // 差分サマリーを表示
      if (diffResult.files.length === 0) {
        logNoChanges();
        return EXIT_CODES.SUCCESS;
      }

      logDiffSummary({
        added: diffResult.added,
        modified: diffResult.modified,
        deleted: diffResult.deleted,
        renamed: diffResult.renamed,
        files: diffResult.files,
      });
    }

    // dry-run モードの場合
    if (args.dryRun) {
      logSection("DRY RUN MODE");
      logSectionLine(dim("(no files will be uploaded)"), true);
      console.log();
      console.log(
        dim("  dry-run モードのため、アップロードはスキップされました。"),
      );
      console.log();
      return EXIT_CODES.SUCCESS;
    }

    // TODO: Phase 3以降で実装
    // - ファイルモード処理
    // - diff viewer
    // - SFTP/SCPアップロード

    console.log();
    console.log(
      dim(
        "  アップロード機能はまだ実装されていません。Phase 4で実装予定です。",
      ),
    );
    console.log();

    return EXIT_CODES.SUCCESS;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      logError(`設定ファイルエラー: ${error.message}`);
      return EXIT_CODES.CONFIG_ERROR;
    }

    if (error instanceof ConfigLoadError) {
      logError(`設定読み込みエラー: ${error.message}`);
      return EXIT_CODES.CONFIG_ERROR;
    }

    if (error instanceof GitCommandError) {
      logError(`Gitエラー: ${error.message}`);
      if (error.stderr) {
        console.error(dim(`  ${error.stderr.trim()}`));
      }
      return EXIT_CODES.GENERAL_ERROR;
    }

    logError(
      `予期しないエラー: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return EXIT_CODES.GENERAL_ERROR;
  }
}

// エントリーポイント
if (import.meta.main) {
  const exitCode = await main();
  Deno.exit(exitCode);
}
