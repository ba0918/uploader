/**
 * シェルユーティリティのテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { escapeShellArg } from "../../src/utils/shell.ts";

describe("escapeShellArg", () => {
  it("通常の文字列をエスケープする", () => {
    assertEquals(escapeShellArg("test"), "'test'");
  });

  it("スペースを含む文字列をエスケープする", () => {
    assertEquals(escapeShellArg("test file.txt"), "'test file.txt'");
  });

  it("シングルクォートを含む文字列をエスケープする", () => {
    assertEquals(escapeShellArg("it's a test"), "'it'\\''s a test'");
  });

  it("ダブルクォートを含む文字列をエスケープする", () => {
    assertEquals(escapeShellArg('test "quoted"'), "'test \"quoted\"'");
  });

  it("コマンド置換を無効化する", () => {
    assertEquals(escapeShellArg("$(rm -rf /)"), "'$(rm -rf /)'");
  });

  it("バッククォートによるコマンド置換を無効化する", () => {
    assertEquals(escapeShellArg("`rm -rf /`"), "'`rm -rf /`'");
  });

  it("変数展開を無効化する", () => {
    assertEquals(escapeShellArg("$HOME"), "'$HOME'");
  });

  it("セミコロンによるコマンド連結を無効化する", () => {
    assertEquals(escapeShellArg("test; rm -rf /"), "'test; rm -rf /'");
  });

  it("改行を含む文字列をエスケープする", () => {
    assertEquals(escapeShellArg("test\nfile"), "'test\nfile'");
  });

  it("空文字列をエスケープする", () => {
    assertEquals(escapeShellArg(""), "''");
  });

  it("パス区切りを含む文字列をエスケープする", () => {
    assertEquals(escapeShellArg("/path/to/file"), "'/path/to/file'");
  });

  it("複数のシングルクォートをエスケープする", () => {
    assertEquals(
      escapeShellArg("it's John's file"),
      "'it'\\''s John'\\''s file'",
    );
  });

  it("特殊文字の組み合わせをエスケープする", () => {
    // 入力: '; rm -rf / #
    // 処理: 先頭' + (入力の'を'\''に置換) + 末尾'
    // 結果: ''\''; rm -rf / #'
    const dangerous = "'; rm -rf / #";
    assertEquals(escapeShellArg(dangerous), "''\\''; rm -rf / #'");
  });
});
