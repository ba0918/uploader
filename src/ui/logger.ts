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

/**
 * ANSIエスケープコードを除去
 */
function stripAnsi(str: string): string {
  // deno-lint-ignore no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * 表示幅を計算（ANSIコード除去後）
 */
function getDisplayWidth(str: string): number {
  return stripAnsi(str).length;
}

/** ロガー設定 */
interface LoggerConfig {
  level: LogLevel;
  logFile?: string;
}

/** グローバルロガー設定 */
let config: LoggerConfig = {
  level: "normal",
};

/** ログファイルハンドル */
let logFileHandle: Deno.FsFile | null = null;

/** ログバッファ（バッチ書き込み用） */
let logBuffer: string[] = [];

/** ログバッファのフラッシュタイマー */
let flushTimer: number | null = null;

/**
 * ロガーを初期化
 */
export async function initLogger(
  options: Partial<LoggerConfig>,
): Promise<void> {
  // 既存のログファイルを閉じる
  await closeLogger();

  config = { ...config, ...options };

  // ログファイルを開く
  if (config.logFile) {
    try {
      logFileHandle = await Deno.open(config.logFile, {
        write: true,
        create: true,
        truncate: true,
      });

      // ヘッダーを書き込み
      const timestamp = new Date().toISOString();
      await writeToLogFile(`=== uploader log started at ${timestamp} ===\n\n`);
    } catch (error) {
      console.error(
        `Warning: Failed to open log file: ${config.logFile}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      logFileHandle = null;
    }
  }
}

/**
 * ログファイルに書き込み
 */
async function writeToLogFile(message: string): Promise<void> {
  if (!logFileHandle) return;

  try {
    const encoder = new TextEncoder();
    await logFileHandle.write(encoder.encode(message));
  } catch {
    // 書き込み失敗は無視
  }
}

/**
 * ログバッファをフラッシュ
 */
async function flushLogBuffer(): Promise<void> {
  if (logBuffer.length === 0 || !logFileHandle) return;

  const messages = logBuffer.join("");
  logBuffer = [];
  await writeToLogFile(messages);
}

/**
 * ログをバッファに追加（遅延書き込み）
 */
function bufferLogMessage(message: string): void {
  if (!logFileHandle) return;

  logBuffer.push(message);

  // フラッシュタイマーをリセット
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
  }

  // 100ms後にフラッシュ
  flushTimer = setTimeout(() => {
    flushLogBuffer();
    flushTimer = null;
  }, 100);
}

/**
 * ロガーを閉じる（リソース解放）
 */
export async function closeLogger(): Promise<void> {
  // バッファをフラッシュ
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushLogBuffer();

  // ファイルを閉じる
  if (logFileHandle) {
    try {
      // フッターを書き込み
      const timestamp = new Date().toISOString();
      await writeToLogFile(`\n=== uploader log ended at ${timestamp} ===\n`);
      logFileHandle.close();
    } catch {
      // クローズ失敗は無視
    }
    logFileHandle = null;
  }
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
  const output = info(icons.info) + " " + message;
  if (config.level !== "quiet") {
    console.log(output);
  }
  bufferLogMessage("[INFO] " + message + "\n");
}

/**
 * 成功ログを出力
 */
export function logSuccess(message: string): void {
  const output = success(icons.check) + " " + message;
  if (config.level !== "quiet") {
    console.log(output);
  }
  bufferLogMessage("[SUCCESS] " + message + "\n");
}

/**
 * 警告ログを出力
 */
export function logWarning(message: string): void {
  console.log(warning(icons.warning) + " " + warning(message));
  bufferLogMessage("[WARNING] " + message + "\n");
}

/**
 * エラーログを出力
 */
export function logError(message: string): void {
  console.error(error(icons.cross) + " " + error(message));
  bufferLogMessage("[ERROR] " + message + "\n");
}

/**
 * 詳細ログを出力（--verbose時のみ）
 */
export function logVerbose(message: string): void {
  if (config.level === "verbose") {
    console.log(dim("  " + message));
  }
  // ファイルには常に出力
  bufferLogMessage("[VERBOSE] " + message + "\n");
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
  bufferLogMessage("\n--- " + title + " ---\n");
}

/**
 * セクション内の行を出力
 */
export function logSectionLine(message: string, last = false): void {
  if (config.level !== "quiet") {
    const prefix = last ? box.bottomLeftSquare : box.teeRight;
    console.log(prefix + box.horizontal + " " + message);
  }
  bufferLogMessage("  " + stripAnsi(message) + "\n");
}

/**
 * セクションを閉じる（空の終端行）
 */
export function logSectionClose(): void {
  if (config.level !== "quiet") {
    console.log(box.bottomLeftSquare + box.horizontal);
  }
  bufferLogMessage("\n");
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
  bufferLogMessage("    " + "  ".repeat(indent) + stripAnsi(message) + "\n");
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
  // ファイル出力用のメッセージを構築
  const fileLines = [
    `\n--- Loading profile: ${profileName} ---`,
    `  From: ${fromType} (${fromDetail})`,
    `  To: ${targetCount} target(s)`,
    ...targets.map((t) => `    - ${t.host} (${t.protocol})`),
    `  Ignore: ${ignoreCount} pattern(s)\n`,
  ];
  bufferLogMessage(fileLines.join("\n") + "\n");

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
 * ボックスの内部幅を計算（動的幅対応）
 */
function calculateBoxWidth(
  title: string,
  lines: string[],
  minWidth = 44,
): number {
  // タイトルの幅（アイコン + スペース + タイトル + 余白）
  const titleWidth = 6 + getDisplayWidth(title) + 2;

  // 各行の幅（インデント + テキスト + 余白）
  const lineWidths = lines.map((l) => 6 + getDisplayWidth(l) + 2);

  // 最大幅を計算（最小幅以上）
  return Math.max(minWidth, titleWidth, ...lineWidths);
}

/**
 * 成功ボックスを表示
 */
export function logSuccessBox(title: string, lines: string[]): void {
  // ファイル出力
  const fileLines = [
    `\n[SUCCESS] ${title}`,
    ...lines.map((l) => `  ${stripAnsi(l)}`),
    "",
  ];
  bufferLogMessage(fileLines.join("\n") + "\n");

  const width = calculateBoxWidth(title, lines);
  const line = box.horizontal.repeat(width);

  console.log();
  console.log(success(box.topLeft + line + box.topRight));
  console.log(
    success(box.vertical) + " ".repeat(width) + success(box.vertical),
  );

  // タイトル行
  const titlePadding = Math.max(0, width - 6 - getDisplayWidth(title));
  console.log(
    success(box.vertical) +
      "   " +
      success(icons.check) +
      "  " +
      bold(title) +
      " ".repeat(titlePadding) +
      success(box.vertical),
  );
  console.log(
    success(box.vertical) + " ".repeat(width) + success(box.vertical),
  );

  // コンテンツ行
  for (const l of lines) {
    const padding = Math.max(0, width - 6 - getDisplayWidth(l));
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
  // ファイル出力
  const fileLines = [
    `\n[ERROR] ${title}`,
    ...lines.map((l) => `  ${stripAnsi(l)}`),
    "",
  ];
  bufferLogMessage(fileLines.join("\n") + "\n");

  const width = calculateBoxWidth(title, lines);
  const line = box.horizontal.repeat(width);

  console.log();
  console.log(error(box.topLeft + line + box.topRight));
  console.log(error(box.vertical) + " ".repeat(width) + error(box.vertical));

  // タイトル行
  const titlePadding = Math.max(0, width - 6 - getDisplayWidth(title));
  console.log(
    error(box.vertical) +
      "   " +
      error(icons.cross) +
      "  " +
      bold(title) +
      " ".repeat(titlePadding) +
      error(box.vertical),
  );
  console.log(error(box.vertical) + " ".repeat(width) + error(box.vertical));

  // コンテンツ行
  for (const l of lines) {
    const padding = Math.max(0, width - 6 - getDisplayWidth(l));
    console.log(
      error(box.vertical) + "      " + l + " ".repeat(padding) +
        error(box.vertical),
    );
  }

  console.log(error(box.vertical) + " ".repeat(width) + error(box.vertical));
  console.log(error(box.bottomLeft + line + box.bottomRight));
  console.log();
}

/**
 * 警告ボックスを表示
 */
export function logWarningBox(title: string, lines: string[]): void {
  // ファイル出力
  const fileLines = [
    `\n[WARNING] ${title}`,
    ...lines.map((l) => `  ${stripAnsi(l)}`),
    "",
  ];
  bufferLogMessage(fileLines.join("\n") + "\n");

  const width = calculateBoxWidth(title, lines);
  const line = box.horizontal.repeat(width);

  console.log();
  console.log(warning(box.topLeft + line + box.topRight));
  console.log(
    warning(box.vertical) + " ".repeat(width) + warning(box.vertical),
  );

  // タイトル行
  const titlePadding = Math.max(0, width - 6 - getDisplayWidth(title));
  console.log(
    warning(box.vertical) +
      "   " +
      warning(icons.warning) +
      "  " +
      bold(title) +
      " ".repeat(titlePadding) +
      warning(box.vertical),
  );
  console.log(
    warning(box.vertical) + " ".repeat(width) + warning(box.vertical),
  );

  // コンテンツ行
  for (const l of lines) {
    const padding = Math.max(0, width - 6 - getDisplayWidth(l));
    console.log(
      warning(box.vertical) + "      " + l + " ".repeat(padding) +
        warning(box.vertical),
    );
  }

  console.log(
    warning(box.vertical) + " ".repeat(width) + warning(box.vertical),
  );
  console.log(warning(box.bottomLeft + line + box.bottomRight));
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
  const { added, modified, deleted, renamed, files } = summary;
  const total = files.length;

  // ファイル出力
  const fileLines = [
    "\n--- Changes detected ---",
    `  Added: ${added} file(s)`,
    `  Modified: ${modified} file(s)`,
    `  Deleted: ${deleted} file(s)`,
    `  Renamed: ${renamed} file(s)`,
    `  Total: ${total} file(s)`,
    "",
    "  Files:",
    ...files.slice(0, 20).map((f) => `    [${f.status}] ${f.path}`),
    files.length > 20 ? `    ... and ${files.length - 20} more` : "",
    "",
  ];
  bufferLogMessage(fileLines.filter((l) => l).join("\n") + "\n");

  if (config.level === "quiet") return;

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
  bufferLogMessage("[INFO] No changes detected\n");

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
  const { fileCount, directoryCount, totalSize, files, sources } = summary;

  // ファイル出力
  const fileList = files.filter((f) => !f.isDirectory);
  const fileLogLines = [
    "\n--- Files collected ---",
    `  Source: ${sources.join(", ")}`,
    `  Files: ${fileCount}`,
    `  Directories: ${directoryCount}`,
    `  Total size: ${formatFileSize(totalSize)}`,
    "",
    "  File list:",
    ...fileList.slice(0, 20).map((f) =>
      `    ${f.relativePath} (${formatFileSize(f.size)})`
    ),
    fileList.length > 20 ? `    ... and ${fileList.length - 20} more` : "",
    "",
  ];
  bufferLogMessage(fileLogLines.filter((l) => l).join("\n") + "\n");

  if (config.level === "quiet") return;

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

  // ファイル一覧表示（ディレクトリ以外）- fileListは既に上で定義済み
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
  bufferLogMessage("[WARNING] No files found\n");

  if (config.level === "quiet") return;

  console.log();
  console.log(warning(icons.warning) + " " + warning("No files found"));
  console.log();
}

/** アップロード進捗 */
export interface UploadProgress {
  targetIndex: number;
  totalTargets: number;
  host: string;
  fileIndex: number;
  totalFiles: number;
  currentFile: string;
  status: string;
}

/**
 * アップロード進捗を表示
 */
export function logUploadProgress(progress: UploadProgress): void {
  if (config.level === "quiet") return;

  const {
    targetIndex,
    totalTargets,
    host,
    fileIndex,
    totalFiles,
    currentFile,
    status,
  } = progress;

  // カーソルを行頭に戻して上書き
  const targetInfo = totalTargets > 1
    ? ` [${targetIndex + 1}/${totalTargets}]`
    : "";
  const progressPercent = totalFiles > 0
    ? Math.round((fileIndex / totalFiles) * 100)
    : 0;
  const progressBar = createProgressBar(progressPercent, 20);

  // クリアして表示
  Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));

  const statusIcon = status === "uploading" ? icons.arrowUp : icons.check;
  const line = `${info(statusIcon)} ${
    path(host)
  }${targetInfo} ${progressBar} ${progressPercent}% (${fileIndex}/${totalFiles}) ${
    dim(currentFile)
  }`;

  Deno.stdout.writeSync(new TextEncoder().encode(line));
}

/**
 * アップロード進捗行をクリア
 */
export function clearUploadProgress(): void {
  if (config.level === "quiet") return;
  Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));
}

/**
 * プログレスバーを作成
 */
function createProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return success("█".repeat(filled)) + dim("░".repeat(empty));
}

/**
 * ファイルサイズを人間が読みやすい形式にフォーマット（エクスポート版）
 */
export function formatFileSizeExport(bytes: number): string {
  return formatFileSize(bytes);
}

/**
 * 時間を mm:ss 形式にフォーマット
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${
    remainingSeconds.toString().padStart(2, "0")
  }`;
}

/** アップロード結果サマリー */
export interface UploadResultSummary {
  successTargets: number;
  failedTargets: number;
  totalFiles: number;
  totalSize: number;
  totalDuration: number;
  targets: Array<{
    host: string;
    status: string;
    successCount: number;
    failedCount: number;
    error?: string;
  }>;
}

/**
 * アップロード成功を表示
 */
export function logUploadSuccess(summary: UploadResultSummary): void {
  const { successTargets, totalFiles, totalSize, totalDuration, targets } =
    summary;

  const lines = [
    `${totalFiles} files uploaded to ${successTargets} target(s)`,
    `Total size: ${formatFileSize(totalSize)}`,
    `Total time: ${formatDuration(totalDuration)}`,
  ];

  logSuccessBox("Upload completed successfully!", lines);

  // ターゲット別の詳細（verboseモード時）
  if (config.level === "verbose") {
    console.log(box.topLeftSquare + " " + bold("Target Details"));
    console.log(box.vertical);
    targets.forEach((target, i) => {
      const isLast = i === targets.length - 1;
      const prefix = isLast ? box.corner : box.branch;
      const statusIcon = target.status === "completed"
        ? success(icons.check)
        : error(icons.cross);
      console.log(
        box.vertical + " " + prefix + " " + statusIcon + " " +
          path(target.host) +
          dim(` (${target.successCount} files)`),
      );
    });
    console.log(box.bottomLeftSquare + box.horizontal);
    console.log();
  }
}

/**
 * アップロード失敗を表示
 */
export function logUploadFailure(summary: UploadResultSummary): void {
  const { successTargets, targets } = summary;

  const lines: string[] = [];

  // 失敗したターゲットの情報
  const failedTargetsList = targets.filter((t) => t.status === "failed");
  for (const target of failedTargetsList) {
    lines.push(`${target.host}: ${target.error || "Unknown error"}`);
  }

  // 部分的な成功があれば表示
  if (successTargets > 0) {
    lines.push("");
    lines.push("Partial results:");
    for (const target of targets) {
      const statusIcon = target.status === "completed"
        ? icons.check
        : icons.cross;
      const statusColor = target.status === "completed" ? success : error;
      lines.push(
        `  ${statusColor(statusIcon)} ${target.host}: ${target.successCount}/${
          target.successCount + target.failedCount
        } files`,
      );
    }
  }

  logErrorBox("Upload failed", lines);
}

/**
 * アップロード開始を表示
 */
export function logUploadStart(
  targetCount: number,
  fileCount: number,
  totalSize: number,
): void {
  // ファイル出力
  const fileLines = [
    "\n--- Starting upload ---",
    `  Targets: ${targetCount}`,
    `  Files: ${fileCount}`,
    `  Size: ${formatFileSize(totalSize)}`,
    "",
  ];
  bufferLogMessage(fileLines.join("\n") + "\n");

  if (config.level === "quiet") return;

  console.log();
  console.log(box.topLeftSquare + " " + bold("Starting upload"));
  console.log(box.vertical);
  console.log(
    box.teeRight + box.horizontal + " Targets: " + info(`${targetCount}`),
  );
  console.log(
    box.teeRight + box.horizontal + " Files: " + info(`${fileCount}`),
  );
  console.log(
    box.bottomLeftSquare + box.horizontal + " Size: " +
      info(formatFileSize(totalSize)),
  );
  console.log();
}

/**
 * ターゲット接続中を表示
 */
export function logConnecting(host: string): void {
  if (config.level === "quiet") return;
  console.log(info(icons.info) + " Connecting to " + path(host) + "...");
}

/**
 * ターゲット接続完了を表示
 */
export function logConnected(host: string): void {
  if (config.level === "quiet") return;
  console.log(success(icons.check) + " Connected to " + path(host));
}

/**
 * ターゲット完了を表示
 */
export function logTargetComplete(
  host: string,
  successCount: number,
  failedCount: number,
  duration: number,
): void {
  if (config.level === "quiet") return;

  const statusIcon = failedCount === 0
    ? success(icons.check)
    : warning(icons.warning);
  const statusText = failedCount === 0
    ? success(`${successCount} files`)
    : warning(`${successCount} succeeded, ${failedCount} failed`);

  console.log(
    statusIcon + " " + path(host) + " " + statusText +
      dim(` (${formatDuration(duration)})`),
  );
}
