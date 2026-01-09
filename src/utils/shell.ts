/**
 * シェルコマンド関連のユーティリティ
 */

/**
 * シェル引数を安全にエスケープ
 *
 * シングルクォートで囲み、内部のシングルクォートを '\'' に置換する。
 * これにより、特殊文字（$, `, ", スペース等）を含むパスでも
 * コマンドインジェクションを防止できる。
 *
 * @example
 * escapeShellArg("test file.txt") // "'test file.txt'"
 * escapeShellArg("it's a test")   // "'it'\\''s a test'"
 * escapeShellArg('$(rm -rf /)')   // "'$(rm -rf /)'"
 *
 * @param arg エスケープする文字列
 * @returns エスケープされた文字列（シングルクォートで囲まれる）
 */
export function escapeShellArg(arg: string): string {
  // シングルクォートを '\'' に置換してシングルクォートで囲む
  // 'arg' → arg 内の ' を '\'' に置換
  // 例: "it's" → "'it'\''s'"
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}
