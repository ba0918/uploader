/**
 * rsync --itemize-changes 出力パーサー
 *
 * rsync dry-runの出力をパースして、変更ファイルの一覧を取得する
 */

import type { RsyncDiffEntry, RsyncDiffResult } from "../types/mod.ts";

/**
 * rsync --itemize-changes の1行をパース
 *
 * 出力形式:
 * - `>f+++++++++` or `>f+++++++++ filename`: 新規ファイル（A）
 * - `>f.st......` or similar: 変更ファイル（M）
 * - `*deleting   filename`: 削除ファイル（D）
 * - `>d+++++++++`: 新規ディレクトリ（スキップ）
 * - `.d..t......`: ディレクトリのタイムスタンプ変更（スキップ）
 *
 * @param line rsync出力の1行
 * @returns パース結果、またはスキップすべき行の場合はnull
 */
export function parseItemizeLine(
  line: string,
): RsyncDiffEntry | null {
  // 空行はスキップ
  if (!line || line.trim() === "") {
    return null;
  }

  // 削除パターン: *deleting   filename
  if (line.startsWith("*deleting")) {
    const path = line.slice(10).trim();
    // 空のパスはスキップ
    if (!path) {
      return null;
    }
    // ディレクトリ（末尾が/）はスキップ
    if (path.endsWith("/")) {
      return null;
    }
    return { path, changeType: "D" };
  }

  // ファイル変更パターン: XYflags filename
  // X: < (受信側から送信側へ), > (送信側から受信側へ), . (属性のみ変更), c (ローカル変更), h (ハードリンク)
  // Y: f (ファイル), d (ディレクトリ), L (シンボリックリンク), D (デバイス), S (特殊ファイル)
  // flags: 9文字のフラグ（変更内容を示す）
  // 各フラグは小文字（ソースが新しい）と大文字（更新が必要）の両方がある
  // 例: >f+++++++++ new.txt, >f.st...... modified.txt, <f..T...... timestamp.txt
  const match = line.match(
    /^([<>.ch])([fdLDS])([cCsSpPtToOgGuUaAxX.+]{9})\s+(.+)$/,
  );
  if (!match) {
    return null;
  }

  const [, _direction, fileType, flags, path] = match;

  // ファイル以外はスキップ
  if (fileType !== "f") {
    return null;
  }

  // フラグを解析（9文字）
  // 位置0: checksum (c)
  // 位置1: size (s/S)
  // 位置2: time (t/T)
  // 以降: permissions, owner, group, etc.

  // +が全てなら新規（A）
  const isNew = /^\++$/.test(flags);
  if (isNew) {
    return { path, changeType: "A" as const };
  }

  // 内容変更: checksumまたはsizeまたはtimeフラグがある場合
  // flags[0] = checksum (c/C), flags[1] = size (s/S), flags[2] = time (t/T)
  const hasContentChange = flags[0] === "c" || flags[0] === "C" ||
    flags[1] === "s" || flags[1] === "S" ||
    flags[2] === "t" || flags[2] === "T";

  if (!hasContentChange) {
    // パーミッションのみの変更はスキップ
    return null;
  }

  return {
    path,
    changeType: "M" as const,
  };
}

/**
 * rsync --itemize-changes の出力全体をパース
 *
 * @param output rsync出力（文字列またはUint8Array）
 * @returns 差分結果
 */
export function parseItemizeChanges(
  output: string | Uint8Array,
): RsyncDiffResult {
  const text = typeof output === "string"
    ? output
    : new TextDecoder().decode(output);
  const lines = text.split("\n");

  const entries: RsyncDiffEntry[] = [];
  let added = 0;
  let modified = 0;
  let deleted = 0;

  for (const line of lines) {
    const parsed = parseItemizeLine(line);
    if (parsed) {
      entries.push(parsed);
      switch (parsed.changeType) {
        case "A":
          added++;
          break;
        case "M":
          modified++;
          break;
        case "D":
          deleted++;
          break;
      }
    }
  }

  return { entries, added, modified, deleted };
}
