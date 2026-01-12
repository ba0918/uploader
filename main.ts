/**
 * uploader - Git-based deployment tool
 *
 * Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイするCLIツール
 */

import {
  initCommand,
  parseArgs,
  showHelp,
  showProfileList,
} from "./src/cli/mod.ts";
import {
  ConfigLoadError,
  ConfigValidationError,
  findConfigFile,
  loadAndResolveProfile,
  loadConfigFile,
} from "./src/config/mod.ts";
import { collectFiles, FileCollectError } from "./src/file/mod.ts";
import { getDiff, GitCommandError } from "./src/git/mod.ts";
import {
  applyIgnoreFilter,
  collectedFilesToUploadFiles,
  diffFilesToUploadFiles,
  uploadToTargets,
} from "./src/upload/mod.ts";
import { prepareMirrorSync } from "./src/upload/mirror.ts";
import { createUploader } from "./src/upload/factory.ts";
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
 * @returns 解決されたDiffMode（"remote"）、またはfalse（diff無効時）
 */
function resolveDiffMode(
  diffOption: DiffOption,
): { mode: DiffMode | false } {
  // diff無効
  if (diffOption === false) {
    return { mode: false };
  }

  // auto または remote → remoteモード
  return { mode: "remote" };
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
  logVerbose,
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

    // init サブコマンドの処理
    if ("init" in args) {
      await initCommand(args.init);
      return EXIT_CODES.SUCCESS;
    }

    // 以降は CliArgs として処理（init は既にチェック済み）
    const cliArgs = args;

    // ログレベルを設定
    let logLevel: LogLevel = "normal";
    if (cliArgs.verbose) {
      logLevel = "verbose";
    } else if (cliArgs.quiet) {
      logLevel = "quiet";
    }
    await initLogger({ level: logLevel, logFile: cliArgs.logFile });

    // バナー表示（quiet モード以外）
    if (logLevel !== "quiet") {
      showBanner();
    }

    // プロファイル一覧表示
    if (cliArgs.list) {
      const configPath = await findConfigFile(cliArgs.config);
      if (!configPath) {
        logError(
          "設定ファイルが見つかりません。uploader.yaml を作成するか --config で指定してください",
        );
        return EXIT_CODES.CONFIG_ERROR;
      }
      const config = await loadConfigFile(configPath);
      showProfileList(config, configPath);
      return EXIT_CODES.SUCCESS;
    }

    // プロファイル名がない場合はヘルプを表示
    if (!cliArgs.profile) {
      showHelp();
      return EXIT_CODES.SUCCESS;
    }

    // 設定ファイルを読み込み
    logVerbose(`Loading profile "${cliArgs.profile}" from config...`);
    const { profile, configPath } = await loadAndResolveProfile(
      cliArgs.profile,
      cliArgs.config,
    );
    logVerbose(`Config loaded from: ${configPath}`);
    logVerbose(`Profile type: ${profile.from.type}`);
    logVerbose(`Target count: ${profile.to.targets.length}`);
    for (const target of profile.to.targets) {
      logVerbose(`  - ${target.host}:${target.dest} (${target.protocol})`);
    }
    if (profile.ignore.length > 0) {
      logVerbose(`Ignore patterns: ${profile.ignore.join(", ")}`);
    }

    // CLI引数で設定を上書き
    if (profile.from.type === "git") {
      if (cliArgs.base) {
        profile.from.base = cliArgs.base;
      }
      if (cliArgs.target) {
        profile.from.target = cliArgs.target;
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
      cliArgs.profile,
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

      logVerbose(`Getting git diff: ${base}...${target}`);
      const startTime = Date.now();
      diffResult = await getDiff(base, target, {
        excludePatterns: profile.ignore,
      });
      const elapsed = Date.now() - startTime;
      logVerbose(`Git diff completed in ${elapsed}ms`);

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
      logVerbose(`Collecting files from: ${profile.from.src.join(", ")}`);
      const startTime = Date.now();
      fileResult = await collectFiles(profile.from.src, {
        ignorePatterns: profile.ignore,
      });
      const elapsed = Date.now() - startTime;
      logVerbose(
        `File collection completed in ${elapsed}ms: ${fileResult.fileCount} files, ${fileResult.totalSize} bytes`,
      );

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
    // ターゲット別のファイルリスト（remote diffモード時に設定）
    let filesByTarget: Map<number, UploadFile[]> | undefined;

    if (diffResult) {
      // Gitモード: 差分ファイルをアップロードファイルに変換
      const targetRef = profile.from.type === "git"
        ? (profile.from.target || "HEAD")
        : "HEAD";
      uploadFiles = await diffFilesToUploadFiles(diffResult.files, targetRef);
      // ignoreパターンを適用
      uploadFiles = applyIgnoreFilter(uploadFiles, profile.ignore);
    } else if (fileResult) {
      // ファイルモード: 収集ファイルをアップロードファイルに変換
      uploadFiles = collectedFilesToUploadFiles(fileResult.files);
    }

    // アップロードするファイルがない場合
    if (uploadFiles.length === 0) {
      logNoChanges();
      return EXIT_CODES.SUCCESS;
    }

    // mirrorモード処理: リモートにのみ存在するファイルを削除対象として追加
    const hasMirrorMode = profile.to.targets.some((t) =>
      t.sync_mode === "mirror"
    );

    if (hasMirrorMode && profile.from.type === "file") {
      logVerbose("Mirror mode detected. Checking for remote-only files...");

      // 最初のmirrorモードターゲットを使用してリモートファイルを取得
      const mirrorTarget = profile.to.targets.find((t) =>
        t.sync_mode === "mirror"
      );

      if (mirrorTarget) {
        const uploader = createUploader(mirrorTarget);
        try {
          await uploader.connect();
          logVerbose(
            `[${mirrorTarget.host}] Connected for mirror sync preparation`,
          );

          const beforeCount = uploadFiles.length;
          uploadFiles = await prepareMirrorSync(
            uploader,
            uploadFiles,
            profile.ignore,
          );
          const deleteCount = uploadFiles.length - beforeCount;

          if (deleteCount > 0) {
            logInfo(
              `Mirror mode: ${deleteCount} remote-only file(s) will be deleted`,
            );
          }

          await uploader.disconnect();
        } catch (error) {
          logVerbose(
            `Failed to prepare mirror sync: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          // エラーが発生しても続行（prepareMirrorSync内でgraceful degradation）
        }
      }
    }

    // dry-run モードの場合
    if (cliArgs.dryRun) {
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

    if (cliArgs.diff !== false) {
      // diffオプションを解決（常にremoteモード）
      const { mode: diffMode } = resolveDiffMode(cliArgs.diff);

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

        // fileモードの場合、ローカルディレクトリのベースパスを算出
        let localDir: string | undefined;
        if (
          profile.from.type === "file" && fileResult &&
          fileResult.files.length > 0
        ) {
          // 最初のファイルからベースディレクトリを算出
          const firstFile = fileResult.files.find((f) => !f.isDirectory);
          if (firstFile) {
            // sourcePath: /home/user/project/src/file.ts
            // relativePath: src/file.ts
            // → baseDir: /home/user/project/
            const sourcePath = firstFile.sourcePath;
            const relativePath = firstFile.relativePath;
            if (sourcePath.endsWith(relativePath)) {
              localDir = sourcePath.slice(0, -relativePath.length);
              // 末尾のスラッシュを削除（rsync getDiff()で追加される）
              if (localDir.endsWith("/")) {
                localDir = localDir.slice(0, -1);
              }
            }
          }
        }

        // diff viewerを起動
        const viewerResult = await startDiffViewer(viewerDiffResult, {
          port: cliArgs.port,
          openBrowser: !cliArgs.noBrowser,
          cui: cliArgs.cui,
          base: profile.from.type === "git" ? profile.from.base : "Local",
          target: profile.from.type === "git"
            ? (profile.from.target || "HEAD")
            : "Remote",
          diffMode,
          targets: profile.to.targets,
          uploadFiles,
          concurrency: cliArgs.concurrency,
          localDir,
          checksum: cliArgs.checksum,
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

        // remote diffモードの場合、ターゲット別に変更ファイルをフィルタリング
        if (viewerResult.changedFilesByTarget) {
          // ターゲット別のファイルリストを作成
          filesByTarget = new Map<number, UploadFile[]>();
          for (
            const [targetIndex, changedFiles] of viewerResult
              .changedFilesByTarget
          ) {
            const changedSet = new Set(changedFiles);
            const filteredFiles = uploadFiles.filter(
              (f) => changedSet.has(f.relativePath),
            );
            filesByTarget.set(targetIndex, filteredFiles);
            logVerbose(
              `Target ${targetIndex}: ${filteredFiles.length} changed files`,
            );
          }
          // 全ターゲットのうち最大のファイル数をログに出力
          const fileCounts = Array.from(filesByTarget.values()).map((f) =>
            f.length
          );
          const maxFiles = fileCounts.length > 0 ? Math.max(...fileCounts) : 0;
          logInfo(
            `Filtered to target-specific files (max ${maxFiles} files per target)`,
          );
        }
      }
    }

    // アップロード実行
    const totalSize = uploadFiles.reduce((sum, f) => sum + f.size, 0);
    logVerbose(
      `Starting upload: ${uploadFiles.length} files, ${totalSize} bytes to ${profile.to.targets.length} target(s)`,
    );
    logVerbose(
      `Upload options: dryRun=${cliArgs.dryRun}, delete=${cliArgs.delete}, strict=${cliArgs.strict}, parallel=${cliArgs.parallel}`,
    );
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

    const uploadStartTime = Date.now();
    // mirrorモードのターゲットがある場合は自動的にdeleteRemoteを有効化
    const hasMirrorTarget = profile.to.targets.some((t) =>
      t.sync_mode === "mirror"
    );
    const shouldDeleteRemote = cliArgs.delete || hasMirrorTarget;

    const result = await uploadToTargets(
      profile.to.targets,
      uploadFiles,
      {
        dryRun: cliArgs.dryRun,
        deleteRemote: shouldDeleteRemote,
        strict: cliArgs.strict,
        parallel: cliArgs.parallel,
        filesByTarget,
      },
      onProgress,
    );
    const uploadElapsed = Date.now() - uploadStartTime;
    logVerbose(`Upload completed in ${uploadElapsed}ms`);
    logVerbose(
      `Result: ${result.successTargets} succeeded, ${result.failedTargets} failed, ${result.totalFiles} files transferred`,
    );
    for (const t of result.targets) {
      logVerbose(
        `  - ${t.target.host}: ${t.status} (${t.successCount}/${
          t.successCount + t.failedCount
        } files)`,
      );
    }

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
