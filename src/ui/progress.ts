/**
 * プログレスバー
 * 単一ターゲット用と複数ターゲット用の進捗表示
 */

import { box, dim, icons, info, path, success } from "./colors.ts";
import { formatDuration, formatFileSizeExport, isQuiet } from "./logger.ts";

/** プログレスバーオプション */
export interface ProgressBarOptions {
  /** バーの幅（文字数） */
  width?: number;
  /** 完了部分の文字 */
  completeChar?: string;
  /** 未完了部分の文字 */
  incompleteChar?: string;
}

/**
 * プログレスバー文字列を生成
 */
export function createProgressBarString(
  percent: number,
  options: ProgressBarOptions = {},
): string {
  const {
    width = 20,
    completeChar = "█",
    incompleteChar = "░",
  } = options;

  const normalizedPercent = Math.max(0, Math.min(100, percent));
  const filled = Math.round((normalizedPercent / 100) * width);
  const empty = width - filled;

  return success(completeChar.repeat(filled)) +
    dim(incompleteChar.repeat(empty));
}

/** 単一ターゲット進捗の状態 */
export interface SingleTargetProgress {
  /** ホスト名 */
  host: string;
  /** 転送先パス */
  dest?: string;
  /** 完了ファイル数 */
  completedFiles: number;
  /** 総ファイル数 */
  totalFiles: number;
  /** 現在転送中のファイル名 */
  currentFile?: string;
  /** 現在転送中のファイルサイズ */
  currentFileSize?: number;
  /** 経過時間（ミリ秒） */
  elapsed?: number;
  /** 推定残り時間（ミリ秒） */
  eta?: number;
}

/** 複数ターゲット進捗の状態 */
export interface MultiTargetProgress {
  /** 各ターゲットの進捗 */
  targets: SingleTargetProgress[];
  /** 合計完了ファイル数 */
  totalCompleted: number;
  /** 合計ファイル数 */
  totalFiles: number;
}

/**
 * 単一ターゲット用プログレス表示を描画
 *
 * 表示例:
 * ┌ Uploading to web1.example.com
 * │
 * │  ████████████░░░░░░░░  60% (12/20 files)
 * │
 * │  ↑ src/components/Button.tsx (2.3 KB)
 * │
 * └─ Elapsed: 00:05  ETA: 00:03
 */
export function renderSingleTargetProgress(
  progress: SingleTargetProgress,
): string[] {
  if (isQuiet()) return [];

  const {
    host,
    completedFiles,
    totalFiles,
    currentFile,
    currentFileSize,
    elapsed,
    eta,
  } = progress;

  const percent = totalFiles > 0
    ? Math.round((completedFiles / totalFiles) * 100)
    : 0;
  const progressBar = createProgressBarString(percent);

  const lines: string[] = [];
  lines.push(box.topLeftSquare + " Uploading to " + path(host));
  lines.push(box.vertical);
  lines.push(
    box.vertical + "  " + progressBar + "  " + percent + "% (" +
      completedFiles + "/" + totalFiles + " files)",
  );
  lines.push(box.vertical);

  if (currentFile) {
    const sizeStr = currentFileSize !== undefined
      ? ` (${formatFileSizeExport(currentFileSize)})`
      : "";
    lines.push(
      box.vertical + "  " + info(icons.arrowUp) + " " + currentFile +
        dim(sizeStr),
    );
    lines.push(box.vertical);
  }

  const elapsedStr = elapsed !== undefined ? formatDuration(elapsed) : "--:--";
  const etaStr = eta !== undefined && eta > 0 ? formatDuration(eta) : "--:--";
  lines.push(
    box.bottomLeftSquare + box.horizontal + " Elapsed: " + elapsedStr +
      "  ETA: " + etaStr,
  );

  return lines;
}

/**
 * 複数ターゲット用プログレス表示を描画
 *
 * 表示例:
 * ┌ Upload Progress
 * │
 * │  web1.example.com  ████████████████████ 100% ✓
 * │  web2.example.com  ████████████░░░░░░░░  60%
 * │
 * └─ Total: 32/40 files
 */
export function renderMultiTargetProgress(
  progress: MultiTargetProgress,
): string[] {
  if (isQuiet()) return [];

  const { targets, totalCompleted, totalFiles } = progress;

  const lines: string[] = [];
  lines.push(box.topLeftSquare + " Upload Progress");
  lines.push(box.vertical);

  // 各ターゲットの進捗を表示
  const maxHostLen = Math.max(...targets.map((t) => t.host.length), 0);

  for (const target of targets) {
    const percent = target.totalFiles > 0
      ? Math.round((target.completedFiles / target.totalFiles) * 100)
      : 0;
    const progressBar = createProgressBarString(percent, { width: 20 });
    const hostPadded = target.host.padEnd(maxHostLen);

    // 完了している場合はチェックマーク、未完了の場合はパーセンテージ
    const statusStr = percent === 100
      ? " " + success(icons.check)
      : " " + dim(percent + "%");

    lines.push(
      box.vertical + "  " + path(hostPadded) + "  " + progressBar + statusStr,
    );
  }

  lines.push(box.vertical);
  lines.push(
    box.bottomLeftSquare + box.horizontal + " Total: " + totalCompleted +
      "/" + totalFiles + " files",
  );

  return lines;
}

/** プログレス表示のコントローラ */
export interface ProgressDisplay {
  /** 進捗を更新 */
  update(progress: SingleTargetProgress | MultiTargetProgress): void;
  /** 表示をクリア */
  clear(): void;
  /** 完了状態で終了 */
  finish(): void;
}

/**
 * プログレス表示のコントローラを作成
 * ターミナルの同じ位置に進捗を上書き表示する
 */
export function createProgressDisplay(): ProgressDisplay {
  const encoder = new TextEncoder();
  let lastLineCount = 0;

  /**
   * 前回の表示をクリア
   */
  function clearLines(): void {
    if (lastLineCount > 0) {
      // カーソルを上に移動して各行をクリア
      for (let i = 0; i < lastLineCount; i++) {
        Deno.stdout.writeSync(encoder.encode("\x1b[A\x1b[K"));
      }
    }
  }

  return {
    update(progress: SingleTargetProgress | MultiTargetProgress): void {
      if (isQuiet()) return;

      clearLines();

      const lines = "targets" in progress
        ? renderMultiTargetProgress(progress)
        : renderSingleTargetProgress(progress);

      // 描画
      for (const line of lines) {
        console.log(line);
      }
      lastLineCount = lines.length;
    },

    clear(): void {
      if (isQuiet()) return;
      clearLines();
      lastLineCount = 0;
    },

    finish(): void {
      // 最後の表示は残す（クリアしない）
      lastLineCount = 0;
    },
  };
}

/**
 * インラインプログレス表示（1行のみ）
 * カーソルを動かさず同じ行に上書きする簡易版
 */
export function printInlineProgress(
  host: string,
  completedFiles: number,
  totalFiles: number,
  currentFile?: string,
): void {
  if (isQuiet()) return;

  const encoder = new TextEncoder();
  const percent = totalFiles > 0
    ? Math.round((completedFiles / totalFiles) * 100)
    : 0;
  const progressBar = createProgressBarString(percent, { width: 20 });

  const fileInfo = currentFile ? " " + dim(currentFile) : "";
  const line = `\r${info(icons.arrowUp)} ${
    path(host)
  } ${progressBar} ${percent}% (${completedFiles}/${totalFiles})${fileInfo}\x1b[K`;

  Deno.stdout.writeSync(encoder.encode(line));
}

/**
 * インラインプログレス表示をクリア
 */
export function clearInlineProgress(): void {
  if (isQuiet()) return;
  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode("\r\x1b[K"));
}
