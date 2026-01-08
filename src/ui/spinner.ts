/**
 * スピナーアニメーション
 * ターミナルで処理中の状態を表示するためのスピナー
 */

import { info, spinnerFrames } from "./colors.ts";

/** スピナーオプション */
export interface SpinnerOptions {
  /** 表示するメッセージ */
  message: string;
  /** フレーム間の間隔（ミリ秒） */
  interval?: number;
  /** スピナーの色付け関数 */
  colorFn?: (text: string) => string;
}

/** スピナーインスタンス */
export interface Spinner {
  /** スピナーを開始 */
  start(): void;
  /** スピナーを停止 */
  stop(): void;
  /** メッセージを更新 */
  update(message: string): void;
  /** 成功状態で停止 */
  succeed(message?: string): void;
  /** 失敗状態で停止 */
  fail(message?: string): void;
  /** 警告状態で停止 */
  warn(message?: string): void;
  /** スピナーが実行中か判定 */
  isRunning(): boolean;
}

/**
 * スピナーを作成
 */
export function createSpinner(options: SpinnerOptions): Spinner {
  const { interval = 80, colorFn = info } = options;
  let message = options.message;
  let frameIndex = 0;
  let timerId: number | undefined;
  let running = false;

  const encoder = new TextEncoder();

  /**
   * 現在のフレームを描画
   */
  function render(): void {
    const frame = spinnerFrames[frameIndex % spinnerFrames.length];
    const line = `\r${colorFn(frame)} ${message}`;
    Deno.stdout.writeSync(encoder.encode(line + "\x1b[K"));
  }

  /**
   * 次のフレームに進める
   */
  function tick(): void {
    frameIndex++;
    render();
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      frameIndex = 0;
      render();
      timerId = setInterval(tick, interval);
    },

    stop(): void {
      if (!running) return;
      running = false;
      if (timerId !== undefined) {
        clearInterval(timerId);
        timerId = undefined;
      }
      // 行をクリア
      Deno.stdout.writeSync(encoder.encode("\r\x1b[K"));
    },

    update(newMessage: string): void {
      message = newMessage;
      if (running) {
        render();
      }
    },

    succeed(finalMessage?: string): void {
      this.stop();
      const msg = finalMessage ?? message;
      console.log(`\x1b[32m✓\x1b[0m ${msg}`);
    },

    fail(finalMessage?: string): void {
      this.stop();
      const msg = finalMessage ?? message;
      console.log(`\x1b[31m✗\x1b[0m ${msg}`);
    },

    warn(finalMessage?: string): void {
      this.stop();
      const msg = finalMessage ?? message;
      console.log(`\x1b[33m⚠\x1b[0m ${msg}`);
    },

    isRunning(): boolean {
      return running;
    },
  };
}

/**
 * スピナー付きで非同期処理を実行
 * 処理完了後に自動的にスピナーを停止する
 */
export async function withSpinner<T>(
  options: SpinnerOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const spinner = createSpinner(options);
  spinner.start();

  try {
    const result = await fn();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}
