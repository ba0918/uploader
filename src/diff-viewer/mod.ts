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
import { BROWSER_STARTUP_DELAY } from "./ws-constants.ts";
import {
  cyan,
  dim,
  logSection,
  logSectionClose,
  logSectionLine,
} from "../ui/mod.ts";

export { cuiConfirm, openBrowser } from "./browser.ts";
export { startDiffViewerServer } from "./server.ts";

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

  // CUIモードかGUIモードかで分岐
  if (options.cui) {
    // --cui モード: CUIフォールバック
    logSectionLine(`Using CUI mode`, true);
    logSectionClose();
    console.log();

    const cuiResult = await cuiConfirm(diffResult, {
      targets: options.targets,
      uploadFiles: options.uploadFiles,
      localDir: options.localDir,
      checksum: options.checksum,
    });
    return {
      confirmed: cuiResult.confirmed,
      cancelReason: cuiResult.confirmed
        ? undefined
        : cuiResult.noChanges
        ? "no_changes"
        : "user_cancel",
      changedFilesByTarget: cuiResult.changedFilesByTarget,
    };
  } else {
    // GUIモード
    logSectionLine(`Starting server on ${cyan(url)}`);

    if (options.openBrowser) {
      logSectionLine(`Opening browser...`, true);
    } else {
      logSectionLine(`Server ready (manual open mode)`, true);
      console.log(dim(`  Open ${cyan(url)} in your browser.`));
    }
    console.log();

    // サーバを起動（非同期）
    const serverPromise = startDiffViewerServer(diffResult, options);

    // ブラウザ自動起動が有効な場合
    if (options.openBrowser) {
      // 少し待ってからブラウザを開く（サーバの起動を待つ）
      await new Promise((resolve) =>
        setTimeout(resolve, BROWSER_STARTUP_DELAY)
      );

      // ブラウザを開く
      const browserOpened = await openBrowser(url);

      if (!browserOpened) {
        console.log(
          dim("  Could not open browser automatically."),
        );
        console.log(dim(`  Please open ${cyan(url)} manually.`));
        console.log();
      }
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
  }
}
