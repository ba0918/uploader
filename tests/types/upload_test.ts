/**
 * アップロード関連の型ガードテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  type BulkUploadCapable,
  type DiffCapable,
  hasBulkUpload,
  hasDiff,
  hasListRemoteFiles,
  type ListRemoteFilesCapable,
  type RemoteFileContent,
  type Uploader,
  type UploadFile,
  type UploadOptions,
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
class MockFullUploader extends MockBasicUploader
  implements BulkUploadCapable, DiffCapable {
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

// ListRemoteFilesCapableを実装したUploader
class MockListRemoteFilesUploader extends MockBasicUploader
  implements ListRemoteFilesCapable {
  listRemoteFiles() {
    return Promise.resolve(["file1.txt", "file2.txt"]);
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

describe("hasListRemoteFiles", () => {
  it("ListRemoteFilesCapableを実装していない場合はfalseを返す", () => {
    const uploader = new MockBasicUploader();
    assertEquals(hasListRemoteFiles(uploader), false);
  });

  it("ListRemoteFilesCapableを実装している場合はtrueを返す", () => {
    const uploader = new MockListRemoteFilesUploader();
    assertEquals(hasListRemoteFiles(uploader), true);
  });

  it("BulkUploadCapableのみ実装している場合はfalseを返す", () => {
    const uploader = new MockBulkUploader();
    assertEquals(hasListRemoteFiles(uploader), false);
  });

  it("DiffCapableのみ実装している場合はfalseを返す", () => {
    const uploader = new MockDiffUploader();
    assertEquals(hasListRemoteFiles(uploader), false);
  });
});

describe("UploadOptions.filesByTarget", () => {
  // テスト用のUploadFileを作成
  function createTestFile(path: string): UploadFile {
    return {
      relativePath: path,
      size: 100,
      content: new Uint8Array([1, 2, 3]),
      isDirectory: false,
    };
  }

  it("filesByTargetを設定できる", () => {
    const filesByTarget = new Map<string, UploadFile[]>();
    filesByTarget.set("host1:22:/var/www", [createTestFile("file1.txt")]);
    filesByTarget.set("host2:22:/var/www", [
      createTestFile("file2.txt"),
      createTestFile("file3.txt"),
    ]);

    const options: UploadOptions = {
      dryRun: false,
      filesByTarget,
    };

    assertEquals(options.filesByTarget?.size, 2);
    assertEquals(options.filesByTarget?.get("host1:22:/var/www")?.length, 1);
    assertEquals(options.filesByTarget?.get("host2:22:/var/www")?.length, 2);
  });

  it("filesByTargetが未設定の場合はundefined", () => {
    const options: UploadOptions = {
      dryRun: false,
    };

    assertEquals(options.filesByTarget, undefined);
  });

  it("filesByTargetで登録されていないターゲットはundefinedを返す", () => {
    const filesByTarget = new Map<string, UploadFile[]>();
    filesByTarget.set("host1:22:/var/www", [createTestFile("file1.txt")]);

    const options: UploadOptions = {
      filesByTarget,
    };

    // 登録されているターゲットIDは取得できる
    assertEquals(
      options.filesByTarget?.get("host1:22:/var/www")?.length,
      1,
    );
    // 登録されていないターゲットIDはundefined
    assertEquals(options.filesByTarget?.get("host2:22:/var/www"), undefined);
    assertEquals(options.filesByTarget?.get("host3:22:/var/www"), undefined);
  });

  it("空のファイルリストも設定できる", () => {
    const filesByTarget = new Map<string, UploadFile[]>();
    filesByTarget.set("host1:22:/var/www", []);
    filesByTarget.set("host2:22:/var/www", [createTestFile("file1.txt")]);

    const options: UploadOptions = {
      filesByTarget,
    };

    assertEquals(options.filesByTarget?.get("host1:22:/var/www")?.length, 0);
    assertEquals(options.filesByTarget?.get("host2:22:/var/www")?.length, 1);
  });
});
