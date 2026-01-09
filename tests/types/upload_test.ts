/**
 * アップロード関連の型ガードテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  hasBulkUpload,
  hasDiff,
  type BulkUploadCapable,
  type DiffCapable,
  type RemoteFileContent,
  type Uploader,
} from "../../src/types/mod.ts";

// モック用のUploaderクラス
class MockBasicUploader implements Uploader {
  connect(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): Promise<void> {
    return Promise.resolve();
  }
  mkdir(_remotePath: string): Promise<void> {
    return Promise.resolve();
  }
  upload(): Promise<void> {
    return Promise.resolve();
  }
  delete(_remotePath: string): Promise<void> {
    return Promise.resolve();
  }
  readFile(_remotePath: string): Promise<RemoteFileContent | null> {
    return Promise.resolve(null);
  }
}

// BulkUploadCapableを実装したUploader
class MockBulkUploader extends MockBasicUploader implements BulkUploadCapable {
  bulkUpload() {
    return Promise.resolve({
      successCount: 0,
      failedCount: 0,
      totalSize: 0,
      duration: 0,
    });
  }
}

// DiffCapableを実装したUploader
class MockDiffUploader extends MockBasicUploader implements DiffCapable {
  getDiff() {
    return Promise.resolve({ entries: [], added: 0, modified: 0, deleted: 0 });
  }
}

// 両方を実装したUploader
class MockFullUploader
  extends MockBasicUploader
  implements BulkUploadCapable, DiffCapable
{
  bulkUpload() {
    return Promise.resolve({
      successCount: 0,
      failedCount: 0,
      totalSize: 0,
      duration: 0,
    });
  }
  getDiff() {
    return Promise.resolve({ entries: [], added: 0, modified: 0, deleted: 0 });
  }
}

describe("hasBulkUpload", () => {
  it("BulkUploadCapableを実装していない場合はfalseを返す", () => {
    const uploader = new MockBasicUploader();
    assertEquals(hasBulkUpload(uploader), false);
  });

  it("BulkUploadCapableを実装している場合はtrueを返す", () => {
    const uploader = new MockBulkUploader();
    assertEquals(hasBulkUpload(uploader), true);
  });

  it("両方を実装している場合もtrueを返す", () => {
    const uploader = new MockFullUploader();
    assertEquals(hasBulkUpload(uploader), true);
  });

  it("DiffCapableのみ実装している場合はfalseを返す", () => {
    const uploader = new MockDiffUploader();
    assertEquals(hasBulkUpload(uploader), false);
  });
});

describe("hasDiff", () => {
  it("DiffCapableを実装していない場合はfalseを返す", () => {
    const uploader = new MockBasicUploader();
    assertEquals(hasDiff(uploader), false);
  });

  it("DiffCapableを実装している場合はtrueを返す", () => {
    const uploader = new MockDiffUploader();
    assertEquals(hasDiff(uploader), true);
  });

  it("両方を実装している場合もtrueを返す", () => {
    const uploader = new MockFullUploader();
    assertEquals(hasDiff(uploader), true);
  });

  it("BulkUploadCapableのみ実装している場合はfalseを返す", () => {
    const uploader = new MockBulkUploader();
    assertEquals(hasDiff(uploader), false);
  });
});
