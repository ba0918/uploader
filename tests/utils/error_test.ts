/**
 * エラー検出ユーティリティのテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  classifyError,
  isConnectionRefusedError,
  isFileNotFoundError,
  isNetworkError,
  isPermissionDeniedError,
  isSftpAuthError,
  isSftpPermissionError,
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

describe("isFileNotFoundError", () => {
  it("Deno.errors.NotFound を検出する", () => {
    const error = new Deno.errors.NotFound("file not found");
    assertEquals(isFileNotFoundError(error), true);
  });

  it("No such file メッセージを検出する", () => {
    const error = new Error("No such file or directory");
    assertEquals(isFileNotFoundError(error), true);
  });

  it("not found メッセージを検出する（小文字）", () => {
    const error = new Error("File not found");
    assertEquals(isFileNotFoundError(error), true);
  });

  it("not found メッセージを検出する（大文字）", () => {
    const error = new Error("FILE NOT FOUND");
    assertEquals(isFileNotFoundError(error), true);
  });

  it("ENOENT メッセージを検出する", () => {
    const error = new Error("ENOENT: no such file");
    assertEquals(isFileNotFoundError(error), true);
  });

  it("関係ないエラーは false を返す", () => {
    const error = new Error("Permission denied");
    assertEquals(isFileNotFoundError(error), false);
  });

  it("Error オブジェクト以外は false を返す", () => {
    assertEquals(isFileNotFoundError("not an error"), false);
    assertEquals(isFileNotFoundError(null), false);
    assertEquals(isFileNotFoundError(undefined), false);
  });
});

describe("isPermissionDeniedError", () => {
  it("Deno.errors.PermissionDenied を検出する", () => {
    const error = new Deno.errors.PermissionDenied("permission denied");
    assertEquals(isPermissionDeniedError(error), true);
  });

  it("Permission denied メッセージを検出する", () => {
    const error = new Error("Permission denied");
    assertEquals(isPermissionDeniedError(error), true);
  });

  it("EACCES メッセージを検出する", () => {
    const error = new Error("EACCES: permission denied");
    assertEquals(isPermissionDeniedError(error), true);
  });

  it("permission メッセージを検出する（小文字）", () => {
    const error = new Error("permission error");
    assertEquals(isPermissionDeniedError(error), true);
  });

  it("permission メッセージを検出する（大文字）", () => {
    const error = new Error("PERMISSION ERROR");
    assertEquals(isPermissionDeniedError(error), true);
  });

  it("関係ないエラーは false を返す", () => {
    const error = new Error("Connection refused");
    assertEquals(isPermissionDeniedError(error), false);
  });

  it("Error オブジェクト以外は false を返す", () => {
    assertEquals(isPermissionDeniedError("not an error"), false);
    assertEquals(isPermissionDeniedError(null), false);
    assertEquals(isPermissionDeniedError(undefined), false);
  });
});

describe("isNetworkError", () => {
  it("Connection refused メッセージを検出する", () => {
    const error = new Error("Connection refused");
    assertEquals(isNetworkError(error), true);
  });

  it("Connection reset メッセージを検出する", () => {
    const error = new Error("Connection reset by peer");
    assertEquals(isNetworkError(error), true);
  });

  it("timeout メッセージを検出する（小文字）", () => {
    const error = new Error("connection timeout");
    assertEquals(isNetworkError(error), true);
  });

  it("timeout メッセージを検出する（大文字）", () => {
    const error = new Error("CONNECTION TIMEOUT");
    assertEquals(isNetworkError(error), true);
  });

  it("ETIMEDOUT メッセージを検出する", () => {
    const error = new Error("ETIMEDOUT: connection timed out");
    assertEquals(isNetworkError(error), true);
  });

  it("ECONNREFUSED メッセージを検出する", () => {
    const error = new Error("ECONNREFUSED: connection refused");
    assertEquals(isNetworkError(error), true);
  });

  it("関係ないエラーは false を返す", () => {
    const error = new Error("Permission denied");
    assertEquals(isNetworkError(error), false);
  });

  it("Error オブジェクト以外は false を返す", () => {
    assertEquals(isNetworkError("not an error"), false);
    assertEquals(isNetworkError(null), false);
    assertEquals(isNetworkError(undefined), false);
  });
});

describe("isSftpPermissionError", () => {
  it("code 3 は true を返す", () => {
    assertEquals(isSftpPermissionError(3), true);
  });

  it("code 2 は false を返す", () => {
    assertEquals(isSftpPermissionError(2), false);
  });

  it("code 0 は false を返す", () => {
    assertEquals(isSftpPermissionError(0), false);
  });

  it("undefined は false を返す", () => {
    assertEquals(isSftpPermissionError(undefined), false);
  });

  it("その他のコードは false を返す", () => {
    assertEquals(isSftpPermissionError(1), false);
    assertEquals(isSftpPermissionError(4), false);
    assertEquals(isSftpPermissionError(100), false);
  });
});

describe("classifyError", () => {
  it("SFTP code 2 は NotFound を返す", () => {
    const error = new Error("some error");
    assertEquals(classifyError(error, 2), "NotFound");
  });

  it("SFTP code 3 は PermissionDenied を返す", () => {
    const error = new Error("some error");
    assertEquals(classifyError(error, 3), "PermissionDenied");
  });

  it("ファイル不在エラーは NotFound を返す", () => {
    const error = new Error("No such file");
    assertEquals(classifyError(error), "NotFound");
  });

  it("Deno.errors.NotFound は NotFound を返す", () => {
    const error = new Deno.errors.NotFound("file not found");
    assertEquals(classifyError(error), "NotFound");
  });

  it("権限エラーは PermissionDenied を返す", () => {
    const error = new Error("Permission denied");
    assertEquals(classifyError(error), "PermissionDenied");
  });

  it("Deno.errors.PermissionDenied は PermissionDenied を返す", () => {
    const error = new Deno.errors.PermissionDenied("permission denied");
    assertEquals(classifyError(error), "PermissionDenied");
  });

  it("ネットワークエラーは NetworkError を返す", () => {
    const error = new Error("Connection refused");
    assertEquals(classifyError(error), "NetworkError");
  });

  it("タイムアウトエラーは NetworkError を返す", () => {
    const error = new Error("timeout");
    assertEquals(classifyError(error), "NetworkError");
  });

  it("その他のエラーは UnknownError を返す", () => {
    const error = new Error("something went wrong");
    assertEquals(classifyError(error), "UnknownError");
  });

  it("Error オブジェクト以外は UnknownError を返す", () => {
    assertEquals(classifyError("not an error"), "UnknownError");
    assertEquals(classifyError(null), "UnknownError");
    assertEquals(classifyError(undefined), "UnknownError");
  });

  it("SFTPコードが優先される（NotFoundエラーでもcode 3ならPermissionDenied）", () => {
    const error = new Error("No such file");
    assertEquals(classifyError(error, 3), "PermissionDenied");
  });

  it("SFTPコードが優先される（PermissionDeniedエラーでもcode 2ならNotFound）", () => {
    const error = new Error("Permission denied");
    assertEquals(classifyError(error, 2), "NotFound");
  });
});
