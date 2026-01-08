/**
 * カラー定義とスタイリング
 */

import {
  blue,
  bold as boldFn,
  cyan,
  dim as dimFn,
  gray as grayFn,
  green,
  italic as italicFn,
  red,
  underline as underlineFn,
  yellow,
} from "@std/fmt/colors";

/** 成功、追加されたファイル */
export const success = green;
export const added = green;

/** エラー、削除されたファイル */
export const error = red;
export const deleted = red;

/** 警告、変更されたファイル */
export const warning = yellow;
export const modified = yellow;

/** 情報、プロンプト */
export const info = blue;

/** パス、URL */
export const path = cyan;
export const url = cyan;

/** 補助情報、タイムスタンプ */
export const dim = dimFn;
export const gray = grayFn;

/** 重要な情報、見出し */
export const bold = boldFn;
export const header = boldFn;

/** その他のスタイル */
export const underline = underlineFn;
export const italic = italicFn;

/** 複合スタイル */
export const errorBold = (text: string) => boldFn(red(text));
export const successBold = (text: string) => boldFn(green(text));
export const infoBold = (text: string) => boldFn(blue(text));

/** ボックス描画文字 */
export const box = {
  // 丸角
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  // 直角
  topLeftSquare: "┌",
  topRightSquare: "┐",
  bottomLeftSquare: "└",
  bottomRightSquare: "┘",
  // 線
  horizontal: "─",
  vertical: "│",
  // 分岐
  teeRight: "├",
  teeLeft: "┤",
  teeDown: "┬",
  teeUp: "┴",
  cross: "┼",
  // ツリー
  branch: "├─",
  corner: "└─",
} as const;

/** アイコン */
export const icons = {
  check: "✓",
  cross: "✗",
  warning: "⚠",
  info: "ℹ",
  arrow: "→",
  arrowUp: "↑",
  arrowDown: "↓",
  bullet: "•",
  plus: "+",
  minus: "-",
  tilde: "~",
  folder: "📁",
  file: "📄",
} as const;

/** スピナーフレーム */
export const spinnerFrames = ["◐", "◓", "◑", "◒"] as const;
