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
import { collectFiles, FileCollectError } from "./src/file/mod.ts";
import { getDiff, GitCommandError } from "./src/git/mod.ts";
import {
  collectedFilesToUploadFiles,
  diffFilesToUploadFiles,
  uploadToTargets,
} from "./src/upload/mod.ts";
import type {
  DiffMode,
  DiffOption,
  DiffViewerProgressController,
  FileCollectResult,
  GitDiffResult,
  LogLevel,
  TransferProgressEvent,
  UploadFile,
} from "./src/types/mod.ts";
import { UploadError } from "./src/types/mod.ts";

/**
 * diffオプションを実際のモードに解決
 *
 * @param diffOption CLIから渡されたdiffオプション
 * @param sourceType ソースの種類（git/file）
 * @returns 解決されたDiffMode、またはfalse（diff無効時）、またはエラーメッセージ
 */
function resolveDiffMode(
  diffOption: DiffOption,
  sourceType: "git" | "file",
): { mode: DiffMode | false } | { error: string } {
  // diff無効
  if (diffOption === false) {
    return { mode: false };
  }

  // auto: モードに応じたデフォルト値
  if (diffOption === "auto") {
    return { mode: sourceType === "git" ? "git" : "remote" };
  }

  // fileモードで--diff=gitはエラー
  if (sourceType === "file" && diffOption === "git") {
    return {
      error:
        "Error: --diff=git is not supported for file mode. Use --diff=remote instead.",
    };
  }

  // fileモードで--diff=bothはremoteにフォールバック（git diffは存在しないため）
  if (sourceType === "file" && diffOption === "both") {
    return { mode: "remote" };
  }

  return { mode: diffOption };
}
import {
  clearUploadProgress,
  closeLogger,
  dim,
  initLogger,
  logDiffSummary,
  logError,
  logFileSummary,
  logInfo,
  logNoChanges,
  logNoFiles,
  logProfileInfo,
  logSection,
  logSectionLine,
  logUploadFailure,
  logUploadProgress,
  logUploadStart,
  logUploadSuccess,
  path,
  showBanner,
} from "./src/ui/mod.ts";
import { startDiffViewer } from "./src/diff-viewer/mod.ts";

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
    await initLogger({ level: logLevel, logFile: args.logFile });

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

    // Git差分を取得 / ファイル収集
    let diffResult: GitDiffResult | null = null;
    let fileResult: FileCollectResult | null = null;

    if (profile.from.type === "git") {
      // Gitモード: 差分を取得
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
    } else {
      // ファイルモード: ファイルを収集
      fileResult = await collectFiles(profile.from.src, {
        ignorePatterns: profile.ignore,
      });

      // ファイルサマリーを表示
      if (fileResult.fileCount === 0) {
        logNoFiles();
        return EXIT_CODES.SUCCESS;
      }

      logFileSummary({
        fileCount: fileResult.fileCount,
        directoryCount: fileResult.directoryCount,
        totalSize: fileResult.totalSize,
        files: fileResult.files,
        sources: fileResult.sources,
      });
    }

    // アップロード用ファイルリストを作成
    let uploadFiles: UploadFile[] = [];

    if (diffResult) {
      // Gitモード: 差分ファイルをアップロードファイルに変換
      const targetRef = profile.from.type === "git"
        ? (profile.from.target || "HEAD")
        : "HEAD";
      uploadFiles = await diffFilesToUploadFiles(diffResult.files, targetRef);
    } else if (fileResult) {
      // ファイルモード: 収集ファイルをアップロードファイルに変換
      uploadFiles = collectedFilesToUploadFiles(fileResult.files);
    }

    // アップロードするファイルがない場合
    if (uploadFiles.length === 0) {
      logNoChanges();
      return EXIT_CODES.SUCCESS;
    }

    // dry-run モードの場合
    if (args.dryRun) {
      logSection("DRY RUN MODE");
      logSectionLine(dim("(no files will be uploaded)"), true);
      console.log();

      // アップロード予定のファイル一覧を表示
      console.log(
        dim(
          `  Would upload ${uploadFiles.length} file(s) to ${profile.to.targets.length} target(s)`,
        ),
      );

      for (const target of profile.to.targets) {
        console.log(dim(`    → ${target.host}:${target.dest}`));
      }

      console.log();
      return EXIT_CODES.SUCCESS;
    }

    // diff viewer (--diff オプション)
    let diffViewerController: DiffViewerProgressController | undefined;

    if (args.diff !== false) {
      // diffオプションを解決
      const diffModeResult = resolveDiffMode(args.diff, profile.from.type);

      if ("error" in diffModeResult) {
        // fileモードで--diff=gitはエラー
        logError(diffModeResult.error);
        return EXIT_CODES.GENERAL_ERROR;
      }

      const diffMode = diffModeResult.mode;

      if (diffMode !== false) {
        // diff viewerに渡すGitDiffResultを準備
        // fileモードの場合はCollectedFileからGitDiffResult互換のデータを作成
        const viewerDiffResult: GitDiffResult = diffResult || {
          files: fileResult!.files
            .filter((f) => !f.isDirectory)
            .map((f) => ({
              path: f.relativePath,
              status: "A" as const,
            })),
          added: fileResult!.fileCount,
          modified: 0,
          deleted: 0,
          renamed: 0,
          base: "Local",
          target: "Remote",
        };

        // diff viewerを起動
        const viewerResult = await startDiffViewer(viewerDiffResult, {
          port: args.port,
          openBrowser: !args.noBrowser,
          base: profile.from.type === "git" ? profile.from.base : "Local",
          target: profile.from.type === "git"
            ? (profile.from.target || "HEAD")
            : "Remote",
          diffMode,
          targets: profile.to.targets,
          uploadFiles,
        });

        if (!viewerResult.confirmed) {
          logSection("Upload cancelled");
          logSectionLine(
            dim(`Reason: ${viewerResult.cancelReason || "user action"}`),
            true,
          );
          console.log();
          return EXIT_CODES.SUCCESS;
        }

        // 進捗コントローラーを保存
        diffViewerController = viewerResult.progressController;

        // remote diffモードの場合、変更があったファイルのみにフィルタリング
        if (viewerResult.changedFiles) {
          const changedSet = new Set(viewerResult.changedFiles);
          uploadFiles = uploadFiles.filter(
            (f) => changedSet.has(f.relativePath),
          );
          logInfo(
            `Filtered to ${uploadFiles.length} changed files (remote diff)`,
          );
        }
      }
    }

    // アップロード実行
    const totalSize = uploadFiles.reduce((sum, f) => sum + f.size, 0);
    logUploadStart(
      profile.to.targets.length,
      uploadFiles.length,
      totalSize,
    );

    // 進捗コールバック
    let lastFile = "";
    const onProgress = (event: TransferProgressEvent) => {
      if (event.currentFile !== lastFile) {
        lastFile = event.currentFile;
        // CUI進捗表示
        logUploadProgress({
          targetIndex: event.targetIndex,
          totalTargets: event.totalTargets,
          host: event.host,
          fileIndex: event.fileIndex + 1,
          totalFiles: event.totalFiles,
          currentFile: event.currentFile,
          status: event.status,
        });
      }
      // WebSocket経由でブラウザにも送信
      diffViewerController?.sendProgress(event);
    };

    const result = await uploadToTargets(
      profile.to.targets,
      uploadFiles,
      {
        dryRun: args.dryRun,
        deleteRemote: args.delete,
        strict: args.strict,
      },
      onProgress,
    );

    // 進捗表示をクリア
    clearUploadProgress();
    console.log();

    // ブラウザに完了/エラーを通知
    if (diffViewerController) {
      if (result.failedTargets === 0) {
        diffViewerController.sendComplete(result);
      } else {
        diffViewerController.sendError(
          `Upload failed: ${result.failedTargets} target(s) failed`,
        );
      }
      // ブラウザがメッセージを受信する時間を確保してから接続を閉じる
      await new Promise((resolve) => setTimeout(resolve, 500));
      diffViewerController.close();
    }

    // 結果を表示
    const resultSummary = {
      successTargets: result.successTargets,
      failedTargets: result.failedTargets,
      totalFiles: result.totalFiles,
      totalSize: result.totalSize,
      totalDuration: result.totalDuration,
      targets: result.targets.map((t) => ({
        host: t.target.host,
        status: t.status,
        successCount: t.successCount,
        failedCount: t.failedCount,
        error: t.error,
      })),
    };

    if (result.failedTargets === 0) {
      logUploadSuccess(resultSummary);
      return EXIT_CODES.SUCCESS;
    } else if (result.successTargets > 0) {
      logUploadFailure(resultSummary);
      return EXIT_CODES.PARTIAL_FAILURE;
    } else {
      logUploadFailure(resultSummary);
      // エラーの種類に応じた終了コード
      const firstError = result.targets.find((t) => t.error);
      if (firstError?.error?.includes("Authentication")) {
        return EXIT_CODES.AUTH_ERROR;
      }
      if (firstError?.error?.includes("Connection")) {
        return EXIT_CODES.CONNECTION_ERROR;
      }
      return EXIT_CODES.GENERAL_ERROR;
    }
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

    if (error instanceof FileCollectError) {
      logError(`ファイル収集エラー: ${error.message}`);
      if (error.originalError) {
        console.error(dim(`  ${error.originalError.message}`));
      }
      return EXIT_CODES.GENERAL_ERROR;
    }

    if (error instanceof UploadError) {
      logError(`アップロードエラー: ${error.message}`);
      if (error.originalError) {
        console.error(dim(`  ${error.originalError.message}`));
      }
      switch (error.code) {
        case "AUTH_ERROR":
          return EXIT_CODES.AUTH_ERROR;
        case "CONNECTION_ERROR":
        case "TIMEOUT_ERROR":
          return EXIT_CODES.CONNECTION_ERROR;
        default:
          return EXIT_CODES.GENERAL_ERROR;
      }
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
  await closeLogger();
  Deno.exit(exitCode);
}
