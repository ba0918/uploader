/**
 * エラー検出ユーティリティのテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  isConnectionRefusedError,
  isSftpAuthError,
  isSshAuthError,
} from "../../src/utils/error.ts";

describe("isSshAuthError", () => {
  it("Permission denied を検出する", () => {
    assertEquals(isSshAuthError("Permission denied (publickey)"), true);
  });

  it("publickey を検出する", () => {
    assertEquals(isSshAuthError("publickey authentication failed"), true);
  });

  it("Permission denied のみでも検出する", () => {
    assertEquals(isSshAuthError("Permission denied"), true);
  });

  it("関係ないエラーは false を返す", () => {
    assertEquals(isSshAuthError("Connection refused"), false);
  });

  it("空文字は false を返す", () => {
    assertEquals(isSshAuthError(""), false);
  });
});

describe("isSftpAuthError", () => {
  it("authentication を検出する", () => {
    assertEquals(
      isSftpAuthError("All configured authentication methods failed"),
      true,
    );
  });

  it("publickey を検出する", () => {
    assertEquals(isSftpAuthError("publickey authentication failed"), true);
  });

  it("password を検出する", () => {
    assertEquals(isSftpAuthError("password authentication failed"), true);
  });

  it("関係ないエラーは false を返す", () => {
    assertEquals(isSftpAuthError("Connection refused"), false);
  });

  it("空文字は false を返す", () => {
    assertEquals(isSftpAuthError(""), false);
  });
});

describe("isConnectionRefusedError", () => {
  it("Connection refused を検出する", () => {
    assertEquals(isConnectionRefusedError("Connection refused"), true);
  });

  it("関係ないエラーは false を返す", () => {
    assertEquals(isConnectionRefusedError("Permission denied"), false);
  });

  it("空文字は false を返す", () => {
    assertEquals(isConnectionRefusedError(""), false);
  });
});
