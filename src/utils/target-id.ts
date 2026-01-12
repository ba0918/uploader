/**
 * ターゲットID生成ユーティリティ
 *
 * ターゲット設定から一意の識別子を生成する
 */

import type { ResolvedTargetConfig } from "../types/mod.ts";

/**
 * ターゲットID型
 *
 * "host:port:dest" 形式の一意識別子
 */
export type TargetId = string;

/**
 * ターゲット設定から一意のIDを生成
 *
 * @param target ターゲット設定
 * @returns ターゲットID（"host:port:dest" 形式）
 *
 * @example
 * ```typescript
 * const target = {
 *   host: "example.com",
 *   port: 22,
 *   dest: "/var/www",
 *   // ... その他の設定
 * };
 * const id = getTargetId(target);
 * // => "example.com:22:/var/www"
 * ```
 */
export function getTargetId(target: ResolvedTargetConfig): TargetId {
  const port = target.port ?? 22;
  return `${target.host}:${port}:${target.dest}`;
}
