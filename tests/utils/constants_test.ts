/**
 * 共通定数のテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { BINARY_CHECK, FILE_TRANSFER } from "../../src/utils/mod.ts";

describe("FILE_TRANSFER", () => {
  it("CHUNK_SIZEが64KBに設定されている", () => {
    assertEquals(FILE_TRANSFER.CHUNK_SIZE, 64 * 1024);
    assertEquals(FILE_TRANSFER.CHUNK_SIZE, 65536);
  });
});

describe("BINARY_CHECK", () => {
  it("CHECK_LENGTHが8192バイトに設定されている", () => {
    assertEquals(BINARY_CHECK.CHECK_LENGTH, 8192);
  });
});
