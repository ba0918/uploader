/**
 * ログ出力
 */

import type { LogLevel } from "../types/mod.ts";
import {
  bold,
  box,
  dim,
  error,
  icons,
  info,
  path,
  success,
  warning,
} from "./colors.ts";

/** ロガー設定 */
interface LoggerConfig {
  level: LogLevel;
  logFile?: string;
}

/** グローバルロガー設定 */
let config: LoggerConfig = {
  level: "normal",
};

/**
 * ロガーを初期化
 */
export function initLogger(options: Partial<LoggerConfig>): void {
  config = { ...config, ...options };
}

/**
 * ログレベルを取得
 */
export function getLogLevel(): LogLevel {
  return config.level;
}

/**
 * 詳細ログか判定
 */
export function isVerbose(): boolean {
  return config.level === "verbose";
}

/**
 * 静かモードか判定
 */
export function isQuiet(): boolean {
  return config.level === "quiet";
}

/**
 * 情報ログを出力
 */
export function logInfo(message: string): void {
  if (config.level !== "quiet") {
    console.log(info(icons.info) + " " + message);
  }
}

/**
 * 成功ログを出力
 */
export function logSuccess(message: string): void {
  if (config.level !== "quiet") {
    console.log(success(icons.check) + " " + message);
  }
}

/**
 * 警告ログを出力
 */
export function logWarning(message: string): void {
  console.log(warning(icons.warning) + " " + warning(message));
}

/**
 * エラーログを出力
 */
export function logError(message: string): void {
  console.error(error(icons.cross) + " " + error(message));
}

/**
 * 詳細ログを出力（--verbose時のみ）
 */
export function logVerbose(message: string): void {
  if (config.level === "verbose") {
    console.log(dim("  " + message));
  }
}

/**
 * セクションヘッダを出力
 */
export function logSection(title: string): void {
  if (config.level !== "quiet") {
    console.log();
    console.log(box.topLeftSquare + " " + bold(title));
    console.log(box.vertical);
  }
}

/**
 * セクション内の行を出力
 */
export function logSectionLine(message: string, last = false): void {
  if (config.level !== "quiet") {
    const prefix = last ? box.bottomLeftSquare : box.teeRight;
    console.log(prefix + box.horizontal + " " + message);
  }
}

/**
 * ツリー表示用の行を出力
 */
export function logTreeItem(message: string, last = false, indent = 0): void {
  if (config.level !== "quiet") {
    const prefix = last ? box.corner : box.branch;
    const indentStr = "   ".repeat(indent);
    console.log(box.vertical + indentStr + "   " + prefix + " " + message);
  }
}

/**
 * プロファイル読み込み情報を表示
 */
export function logProfileInfo(
  profileName: string,
  fromType: string,
  fromDetail: string,
  targetCount: number,
  targets: Array<{ host: string; protocol: string }>,
  ignoreCount: number,
): void {
  if (config.level === "quiet") return;

  console.log();
  console.log(box.topLeftSquare + " Loading profile: " + bold(profileName));
  console.log(box.vertical);
  console.log(
    box.teeRight + box.horizontal + " From: " + info(fromType) + " " +
      dim(`(${fromDetail})`),
  );
  console.log(
    box.teeRight + box.horizontal + " To:   " +
      info(`${targetCount} target(s)`),
  );

  targets.forEach((target, i) => {
    const isLast = i === targets.length - 1;
    const prefix = isLast ? box.corner : box.branch;
    console.log(
      box.vertical + "   " + prefix + " " + path(target.host) +
        dim(` (${target.protocol})`),
    );
  });

  console.log(box.vertical);
  console.log(
    box.bottomLeftSquare + box.horizontal + " Ignore: " +
      dim(`${ignoreCount} pattern(s)`),
  );
  console.log();
}

/**
 * 成功ボックスを表示
 */
export function logSuccessBox(title: string, lines: string[]): void {
  const width = 44;
  const line = box.horizontal.repeat(width);

  console.log();
  console.log(success(box.topLeft + line + box.topRight));
  console.log(
    success(box.vertical) + " ".repeat(width) + success(box.vertical),
  );
  console.log(
    success(box.vertical) +
      "   " +
      success(icons.check) +
      "  " +
      bold(title) +
      " ".repeat(Math.max(0, width - 6 - title.length)) +
      success(box.vertical),
  );
  console.log(
    success(box.vertical) + " ".repeat(width) + success(box.vertical),
  );

  for (const l of lines) {
    const padding = Math.max(0, width - 6 - l.length);
    console.log(
      success(box.vertical) + "      " + l + " ".repeat(padding) +
        success(box.vertical),
    );
  }

  console.log(
    success(box.vertical) + " ".repeat(width) + success(box.vertical),
  );
  console.log(success(box.bottomLeft + line + box.bottomRight));
  console.log();
}

/**
 * エラーボックスを表示
 */
export function logErrorBox(title: string, lines: string[]): void {
  const width = 44;
  const line = box.horizontal.repeat(width);

  console.log();
  console.log(error(box.topLeft + line + box.topRight));
  console.log(error(box.vertical) + " ".repeat(width) + error(box.vertical));
  console.log(
    error(box.vertical) +
      "   " +
      error(icons.cross) +
      "  " +
      bold(title) +
      " ".repeat(Math.max(0, width - 6 - title.length)) +
      error(box.vertical),
  );
  console.log(error(box.vertical) + " ".repeat(width) + error(box.vertical));

  for (const l of lines) {
    const padding = Math.max(0, width - 6 - l.length);
    console.log(
      error(box.vertical) + "      " + l + " ".repeat(padding) +
        error(box.vertical),
    );
  }

  console.log(error(box.vertical) + " ".repeat(width) + error(box.vertical));
  console.log(error(box.bottomLeft + line + box.bottomRight));
  console.log();
}

/** 差分サマリー */
export interface DiffSummary {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  files: Array<{
    path: string;
    status: "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X";
    oldPath?: string;
  }>;
}

/**
 * 差分サマリーを表示
 */
export function logDiffSummary(summary: DiffSummary, maxFiles = 5): void {
  if (config.level === "quiet") return;

  const { added, modified, deleted, renamed, files } = summary;
  const total = files.length;

  console.log();
  console.log(box.topLeftSquare + " " + bold("Changes detected"));
  console.log(box.vertical);

  // 統計表示
  if (added > 0) {
    console.log(
      box.vertical + "   " + success(icons.plus) + "  " +
        success(`${added} file(s) added`),
    );
  }
  if (modified > 0) {
    console.log(
      box.vertical + "   " + warning(icons.tilde) + "  " +
        warning(`${modified} file(s) modified`),
    );
  }
  if (deleted > 0) {
    console.log(
      box.vertical + "   " + error(icons.minus) + "  " +
        error(`${deleted} file(s) deleted`),
    );
  }
  if (renamed > 0) {
    console.log(
      box.vertical + "   " + info(icons.arrow) + "  " +
        info(`${renamed} file(s) renamed`),
    );
  }

  console.log(box.vertical + "   " + dim(box.horizontal.repeat(20)));
  console.log(box.vertical + "      " + bold(`${total} file(s) total`));
  console.log(box.vertical);

  // ファイル一覧表示
  const addedFiles = files.filter((f) => f.status === "A");
  const modifiedFiles = files.filter((f) => f.status === "M");
  const deletedFiles = files.filter((f) => f.status === "D");
  const renamedFiles = files.filter((f) => f.status === "R");

  if (addedFiles.length > 0) {
    console.log(box.teeRight + box.horizontal + " " + success("Added"));
    logFileList(addedFiles, maxFiles, success);
  }

  if (modifiedFiles.length > 0) {
    console.log(box.teeRight + box.horizontal + " " + warning("Modified"));
    logFileList(modifiedFiles, maxFiles, warning);
  }

  if (deletedFiles.length > 0) {
    console.log(box.teeRight + box.horizontal + " " + error("Deleted"));
    logFileList(deletedFiles, maxFiles, error);
  }

  if (renamedFiles.length > 0) {
    console.log(box.teeRight + box.horizontal + " " + info("Renamed"));
    for (let i = 0; i < Math.min(renamedFiles.length, maxFiles); i++) {
      const file = renamedFiles[i];
      const isLast = i === Math.min(renamedFiles.length, maxFiles) - 1 &&
        renamedFiles.length <= maxFiles;
      const prefix = isLast ? box.corner : box.branch;
      console.log(
        box.vertical + "   " + prefix + " " + dim(file.oldPath || "") +
          " " + icons.arrow + " " + path(file.path),
      );
    }
    if (renamedFiles.length > maxFiles) {
      console.log(
        box.vertical + "   " + box.corner + " " +
          dim(`... and ${renamedFiles.length - maxFiles} more`),
      );
    }
  }

  console.log(box.bottomLeftSquare + box.horizontal);
  console.log();
}

/**
 * ファイル一覧を表示（内部用）
 */
function logFileList(
  files: Array<{ path: string }>,
  maxFiles: number,
  colorFn: (s: string) => string,
): void {
  for (let i = 0; i < Math.min(files.length, maxFiles); i++) {
    const file = files[i];
    const isLast = i === Math.min(files.length, maxFiles) - 1 &&
      files.length <= maxFiles;
    const prefix = isLast ? box.corner : box.branch;
    console.log(box.vertical + "   " + prefix + " " + colorFn(file.path));
  }
  if (files.length > maxFiles) {
    console.log(
      box.vertical + "   " + box.corner + " " +
        dim(`... and ${files.length - maxFiles} more`),
    );
  }
}

/**
 * 変更なしメッセージを表示
 */
export function logNoChanges(): void {
  if (config.level === "quiet") return;

  console.log();
  console.log(info(icons.info) + " " + dim("No changes detected"));
  console.log();
}

/** ファイル収集サマリー */
export interface FileSummary {
  fileCount: number;
  directoryCount: number;
  totalSize: number;
  files: Array<{
    relativePath: string;
    size: number;
    isDirectory: boolean;
  }>;
  sources: string[];
}

/**
 * ファイルサイズを人間が読みやすい形式にフォーマット
 */
function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  if (unitIndex === 0) {
    return `${size} ${units[unitIndex]}`;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * ファイル収集サマリーを表示
 */
export function logFileSummary(summary: FileSummary, maxFiles = 10): void {
  if (config.level === "quiet") return;

  const { fileCount, directoryCount, totalSize, files, sources } = summary;

  console.log();
  console.log(box.topLeftSquare + " " + bold("Files collected"));
  console.log(box.vertical);

  // ソース表示
  console.log(
    box.vertical + "   " + info(icons.folder) + "  " +
      info(`Source: ${sources.join(", ")}`),
  );
  console.log(box.vertical);

  // 統計表示
  console.log(
    box.vertical + "   " + success(icons.file) + "  " +
      success(`${fileCount} file(s)`),
  );
  if (directoryCount > 0) {
    console.log(
      box.vertical + "   " + info(icons.folder) + "  " +
        info(`${directoryCount} director(ies)`),
    );
  }
  console.log(box.vertical + "   " + dim(box.horizontal.repeat(20)));
  console.log(
    box.vertical + "      " + bold(`Total: ${formatFileSize(totalSize)}`),
  );
  console.log(box.vertical);

  // ファイル一覧表示（ディレクトリ以外）
  const fileList = files.filter((f) => !f.isDirectory);
  const displayCount = Math.min(fileList.length, maxFiles);

  console.log(box.teeRight + box.horizontal + " " + info("Files"));
  for (let i = 0; i < displayCount; i++) {
    const file = fileList[i];
    const isLast = i === displayCount - 1 && fileList.length <= maxFiles;
    const prefix = isLast ? box.corner : box.branch;
    console.log(
      box.vertical + "   " + prefix + " " + path(file.relativePath) +
        " " + dim(`(${formatFileSize(file.size)})`),
    );
  }

  if (fileList.length > maxFiles) {
    console.log(
      box.vertical + "   " + box.corner + " " +
        dim(`... and ${fileList.length - maxFiles} more`),
    );
  }

  console.log(box.bottomLeftSquare + box.horizontal);
  console.log();
}

/**
 * ファイルなしメッセージを表示
 */
export function logNoFiles(): void {
  if (config.level === "quiet") return;

  console.log();
  console.log(warning(icons.warning) + " " + warning("No files found"));
  console.log();
}
