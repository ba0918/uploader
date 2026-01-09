/**
 * diff-viewer モジュール
 *
 * ブラウザベースの差分確認UI
 */

import type {
  DiffViewerOptions,
  DiffViewerResult,
  GitDiffResult,
} from "../types/mod.ts";
import { cuiConfirm, openBrowser } from "./browser.ts";
import { getServerUrl, startDiffViewerServer } from "./server.ts";
import {
  cyan,
  dim,
  logSection,
  logSectionClose,
  logSectionLine,
} from "../ui/mod.ts";

export { cuiConfirm, openBrowser } from "./browser.ts";
export { getServerUrl, startDiffViewerServer } from "./server.ts";

/**
 * diff viewerを起動して結果を返す
 */
export async function startDiffViewer(
  diffResult: GitDiffResult,
  options: DiffViewerOptions,
): Promise<DiffViewerResult> {
  const url = getServerUrl(options.port);

  // diff viewerの起動メッセージ
  logSection("Diff Viewer");
  logSectionLine(`Starting server on ${cyan(url)}`);

  if (options.openBrowser) {
    logSectionLine(`Opening browser...`, true);
    console.log();

    // サーバを起動（非同期）
    const serverPromise = startDiffViewerServer(diffResult, options);

    // 少し待ってからブラウザを開く（サーバの起動を待つ）
    await new Promise((resolve) => setTimeout(resolve, 100));

    // ブラウザを開く
    const browserOpened = await openBrowser(url);

    if (!browserOpened) {
      console.log(
        dim("  Could not open browser automatically."),
      );
      console.log(dim(`  Please open ${cyan(url)} manually.`));
      console.log();
    }

    // ユーザーの操作を待つ
    console.log(dim("  Waiting for user action in browser..."));
    console.log(
      dim("  Press Ctrl+C to cancel."),
    );
    console.log();

    const result = await serverPromise;

    if (result.confirmed) {
      logSectionLine(`User confirmed upload`, true);
    } else {
      logSectionLine(
        `User cancelled (${result.cancelReason || "unknown"})`,
        true,
      );
    }

    logSectionClose();
    console.log();

    return result;
  } else {
    // --no-browser モード: CUIフォールバック
    logSectionLine(`Browser disabled, using CUI mode`, true);
    logSectionClose();
    console.log();

    const cuiResult = await cuiConfirm(diffResult, {
      targets: options.targets,
      uploadFiles: options.uploadFiles,
      localDir: options.localDir,
    });
    return {
      confirmed: cuiResult.confirmed,
      cancelReason: cuiResult.confirmed
        ? undefined
        : cuiResult.noChanges
          ? "no_changes"
          : "user_cancel",
    };
  }
}

/**
 * diff viewerがサポートされているかチェック
 */
export function isDiffViewerSupported(): boolean {
  // Denoでは常にサポート
  return true;
}
