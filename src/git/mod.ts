/**
 * Gitモジュール
 *
 * Git差分の取得とファイル内容の読み取り機能を提供
 */

export {
  getCurrentBranch,
  getDiff,
  getStagedDiff,
  getUntrackedFiles,
  GitCommandError,
  refExists,
} from "./diff.ts";

export type { GitDiffOptions } from "./diff.ts";

export {
  getFileContent,
  getFileDiffContents,
  getMultipleFileContents,
  getWorkingTreeContent,
  isFileBinary,
} from "./file-reader.ts";
