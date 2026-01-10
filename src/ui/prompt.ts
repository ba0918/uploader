/**
 * インタラクティブプロンプト
 * ユーザーからの入力を受け取る
 */

import { bold, box, dim, info, path } from "./colors.ts";
import { formatFileSize } from "../utils/format.ts";

/** 確認プロンプトのオプション */
export interface ConfirmOptions {
  /** プロンプトメッセージ */
  message: string;
  /** デフォルト値（true = yes, false = no） */
  defaultValue?: boolean;
}

/**
 * Yes/No確認プロンプト
 * @returns true: Yes, false: No
 */
export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const { message, defaultValue } = options;

  // デフォルト値に応じて表示を変える
  const hint = defaultValue === true
    ? "(Y/n)"
    : defaultValue === false
    ? "(y/N)"
    : "(y/n)";

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // プロンプト表示
  Deno.stdout.writeSync(encoder.encode(`${message} ${dim(hint)}: `));

  // 入力を読み取る
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);

  if (n === null) {
    // EOF（Ctrl+D）が押された場合
    console.log();
    return defaultValue ?? false;
  }

  const input = decoder.decode(buf.subarray(0, n)).trim().toLowerCase();

  if (input === "") {
    // 空入力の場合はデフォルト値を使用
    return defaultValue ?? false;
  }

  if (input === "y" || input === "yes") {
    return true;
  }

  if (input === "n" || input === "no") {
    return false;
  }

  // 不明な入力の場合はデフォルト値を使用
  return defaultValue ?? false;
}

/** アップロード確認の情報 */
export interface UploadConfirmInfo {
  /** ターゲットホスト名 */
  host: string;
  /** 転送先パス */
  dest: string;
  /** ファイル数 */
  fileCount: number;
  /** 合計サイズ */
  totalSize: number;
  /** 同期モード */
  syncMode: "update" | "mirror";
  /** 削除するか */
  deletions: boolean;
}

/**
 * アップロード確認ダイアログを表示
 *
 * 表示例:
 * ┌ Confirm Upload
 * │
 * │  Target:  web1.example.com:/var/www/html/
 * │  Files:   20 files (1.2 MB)
 * │  Mode:    update (deletions: no)
 * │
 * └─ Proceed with upload? (y/N): █
 */
export async function confirmUpload(
  uploadInfo: UploadConfirmInfo,
): Promise<boolean> {
  const { host, dest, fileCount, totalSize, syncMode, deletions } = uploadInfo;

  console.log();
  console.log(box.topLeftSquare + " " + bold("Confirm Upload"));
  console.log(box.vertical);
  console.log(
    box.vertical + "  Target:  " + path(host) + ":" + path(dest),
  );
  console.log(
    box.vertical + "  Files:   " + info(`${fileCount} files`) + " " +
      dim(`(${formatFileSize(totalSize)})`),
  );
  console.log(
    box.vertical + "  Mode:    " + info(syncMode) +
      dim(` (deletions: ${deletions ? "yes" : "no"})`),
  );
  console.log(box.vertical);

  const encoder = new TextEncoder();
  Deno.stdout.writeSync(
    encoder.encode(
      box.bottomLeftSquare + box.horizontal + " Proceed with upload? ",
    ),
  );

  return await confirm({
    message: "",
    defaultValue: false,
  });
}

/** 入力プロンプトのオプション */
export interface InputOptions {
  /** プロンプトメッセージ */
  message: string;
  /** デフォルト値 */
  defaultValue?: string;
  /** 入力をマスクするか（パスワード用） */
  mask?: boolean;
}

/**
 * 文字列入力プロンプト
 */
export async function input(options: InputOptions): Promise<string> {
  const { message, defaultValue, mask = false } = options;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // プロンプト表示
  const defaultHint = defaultValue ? dim(` [${defaultValue}]`) : "";
  Deno.stdout.writeSync(encoder.encode(`${message}${defaultHint}: `));

  if (mask) {
    // パスワード入力の場合、rawモードを使用
    return await readPasswordInput(defaultValue);
  }

  // 通常の入力を読み取る
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);

  if (n === null) {
    console.log();
    return defaultValue ?? "";
  }

  const inputStr = decoder.decode(buf.subarray(0, n)).trim();
  return inputStr || defaultValue || "";
}

/**
 * パスワード入力（マスク付き）
 * 入力された文字を*で表示する
 */
async function readPasswordInput(defaultValue?: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // rawモードが使えるか確認
  if (!Deno.stdin.isTerminal()) {
    // 非TTYの場合は通常の入力
    const buf = new Uint8Array(1024);
    const n = await Deno.stdin.read(buf);
    if (n === null) {
      console.log();
      return defaultValue ?? "";
    }
    return decoder.decode(buf.subarray(0, n)).trim() || defaultValue || "";
  }

  // rawモードで1文字ずつ読み取る
  Deno.stdin.setRaw(true);

  try {
    const password: string[] = [];
    const buf = new Uint8Array(1);

    while (true) {
      const n = await Deno.stdin.read(buf);
      if (n === null) break;

      const char = buf[0];

      // Enter (CR or LF)
      if (char === 13 || char === 10) {
        Deno.stdout.writeSync(encoder.encode("\n"));
        break;
      }

      // Backspace
      if (char === 127 || char === 8) {
        if (password.length > 0) {
          password.pop();
          // カーソルを戻して*を消す
          Deno.stdout.writeSync(encoder.encode("\b \b"));
        }
        continue;
      }

      // Ctrl+C
      if (char === 3) {
        Deno.stdout.writeSync(encoder.encode("\n"));
        throw new Error("Cancelled");
      }

      // Ctrl+D (EOF)
      if (char === 4) {
        Deno.stdout.writeSync(encoder.encode("\n"));
        break;
      }

      // 通常の文字
      if (char >= 32 && char < 127) {
        password.push(String.fromCharCode(char));
        Deno.stdout.writeSync(encoder.encode("*"));
      }
    }

    return password.join("") || defaultValue || "";
  } finally {
    Deno.stdin.setRaw(false);
  }
}

/** 選択肢プロンプトのオプション */
export interface SelectOptions {
  /** プロンプトメッセージ */
  message: string;
  /** 選択肢 */
  options: string[];
  /** デフォルトのインデックス */
  defaultIndex?: number;
}

/**
 * 選択肢プロンプト
 * @returns 選択されたインデックス
 */
export async function select(selectOptions: SelectOptions): Promise<number> {
  const { message, options, defaultIndex = 0 } = selectOptions;

  console.log(info("?") + " " + bold(message));

  // 選択肢を表示
  options.forEach((opt, i) => {
    const prefix = i === defaultIndex ? info(">") : " ";
    const num = dim(`${i + 1}.`);
    console.log(`  ${prefix} ${num} ${opt}`);
  });

  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode("Select (1-" + options.length + "): "));

  const decoder = new TextDecoder();
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);

  if (n === null) {
    console.log();
    return defaultIndex;
  }

  const inputStr = decoder.decode(buf.subarray(0, n)).trim();

  if (inputStr === "") {
    return defaultIndex;
  }

  const num = parseInt(inputStr, 10);
  if (isNaN(num) || num < 1 || num > options.length) {
    return defaultIndex;
  }

  return num - 1;
}
