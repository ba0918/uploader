/**
 * 起動バナー表示
 */

import { bold, box, dim, info } from "./colors.ts";

const VERSION = "1.0.0";

/**
 * 起動バナーを表示
 */
export function showBanner(): void {
  const width = 44;
  const line = box.horizontal.repeat(width);

  console.log();
  console.log(info(box.topLeft + line + box.topRight));
  console.log(info(box.vertical) + " ".repeat(width) + info(box.vertical));
  console.log(
    info(box.vertical) +
      "   " +
      bold("⬆  uploader") +
      dim(` v${VERSION}`) +
      " ".repeat(width - 21 - VERSION.length) +
      info(box.vertical),
  );
  console.log(
    info(box.vertical) +
      "      " +
      dim("Git-based deployment tool") +
      " ".repeat(width - 31) +
      info(box.vertical),
  );
  console.log(info(box.vertical) + " ".repeat(width) + info(box.vertical));
  console.log(info(box.bottomLeft + line + box.bottomRight));
  console.log();
}

/**
 * バージョンを取得
 */
export function getVersion(): string {
  return VERSION;
}

/**
 * シンプルなバージョン表示
 */
export function showVersion(): void {
  console.log(`uploader v${VERSION}`);
}
