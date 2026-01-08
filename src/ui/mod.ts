/**
 * UIモジュールのエクスポート
 */

export * from "./colors.ts";
export { getVersion, showBanner, showVersion } from "./banner.ts";
export {
  clearUploadProgress,
  closeLogger,
  formatDuration,
  formatFileSizeExport,
  getLogLevel,
  initLogger,
  isQuiet,
  isVerbose,
  logConnected,
  logConnecting,
  logDiffSummary,
  logError,
  logErrorBox,
  logFileSummary,
  logInfo,
  logNoChanges,
  logNoFiles,
  logProfileInfo,
  logSection,
  logSectionClose,
  logSectionLine,
  logSuccess,
  logSuccessBox,
  logTargetComplete,
  logTreeItem,
  logUploadFailure,
  logUploadProgress,
  logUploadStart,
  logUploadSuccess,
  logVerbose,
  logWarning,
  logWarningBox,
} from "./logger.ts";

export type {
  DiffSummary,
  FileSummary,
  UploadProgress,
  UploadResultSummary,
} from "./logger.ts";

// スピナー
export { createSpinner, withSpinner } from "./spinner.ts";
export type { Spinner, SpinnerOptions } from "./spinner.ts";

// プログレスバー
export {
  clearInlineProgress,
  createProgressBarString,
  createProgressDisplay,
  printInlineProgress,
  renderMultiTargetProgress,
  renderSingleTargetProgress,
} from "./progress.ts";
export type {
  MultiTargetProgress,
  ProgressBarOptions,
  ProgressDisplay,
  SingleTargetProgress,
} from "./progress.ts";

// プロンプト
export { confirm, confirmUpload, input, select } from "./prompt.ts";
export type {
  ConfirmOptions,
  InputOptions,
  SelectOptions,
  UploadConfirmInfo,
} from "./prompt.ts";
