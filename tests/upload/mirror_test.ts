/**
 * upload/mirror.ts のテスト
 */

import { assertEquals } from "@std/assert";
import { prepareMirrorSync } from "../../src/upload/mirror.ts";
import type {
  RemoteFileContent,
  Uploader,
  UploadFile,
} from "../../src/types/mod.ts";

// モックアップローダー（listRemoteFilesをサポートしない）
class MockUploaderWithoutList implements Uploader {
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async mkdir(_remotePath: string): Promise<void> {}
  async upload(
    _file: UploadFile,
    _remotePath: string,
    _onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {}
  async delete(_remotePath: string): Promise<void> {}
  readFile(_remotePath: string): Promise<RemoteFileContent | null> {
    return Promise.resolve(null);
  }
}

// モックアップローダー（listRemoteFilesをサポート）
class MockUploaderWithList extends MockUploaderWithoutList {
  constructor(private remoteFiles: string[]) {
    super();
  }

  listRemoteFiles(): Promise<string[]> {
    return Promise.resolve(this.remoteFiles);
  }
}

// モックアップローダー（listRemoteFilesでエラーを投げる）
class MockUploaderWithListError extends MockUploaderWithoutList {
  listRemoteFiles(): Promise<string[]> {
    return Promise.reject(new Error("Failed to list remote files"));
  }
}

Deno.test("prepareMirrorSync - listRemoteFilesをサポートしない場合は何もしない", async () => {
  const uploader = new MockUploaderWithoutList();
  const uploadFiles: UploadFile[] = [
    { relativePath: "src/index.ts", size: 100, isDirectory: false },
  ];

  const result = await prepareMirrorSync(uploader, uploadFiles, []);

  // 元の配列がそのまま返される
  assertEquals(result, uploadFiles);
});

Deno.test("prepareMirrorSync - リモートにのみ存在するファイルを削除対象に追加", async () => {
  const remoteFiles = [
    "src/index.ts",
    "src/old.ts",
    "dist/bundle.js",
  ];
  const uploader = new MockUploaderWithList(remoteFiles);

  const uploadFiles: UploadFile[] = [
    {
      relativePath: "src/index.ts",
      size: 100,
      isDirectory: false,
      changeType: "add",
    },
  ];

  const result = await prepareMirrorSync(uploader, uploadFiles, []);

  // src/old.ts と dist/bundle.js が削除対象として追加される
  assertEquals(result.length, 3);
  assertEquals(result[0], uploadFiles[0]); // 元のファイル

  const deleteFiles = result.filter((f) => f.changeType === "delete");
  assertEquals(deleteFiles.length, 2);
  assertEquals(deleteFiles[0].relativePath, "src/old.ts");
  assertEquals(deleteFiles[1].relativePath, "dist/bundle.js");
});

Deno.test("prepareMirrorSync - ignoreパターンを適用", async () => {
  const remoteFiles = [
    "src/index.ts",
    "debug.log",
    "node_modules/foo/index.js",
    "dist/bundle.js.map",
  ];
  const uploader = new MockUploaderWithList(remoteFiles);

  const uploadFiles: UploadFile[] = [
    {
      relativePath: "src/index.ts",
      size: 100,
      isDirectory: false,
      changeType: "add",
    },
  ];

  const result = await prepareMirrorSync(uploader, uploadFiles, [
    "*.log",
    "node_modules/",
    "**/*.map",
  ]);

  // debug.log, node_modules/, *.map は無視される
  // 削除対象は追加されない（全てignoreパターンにマッチ）
  assertEquals(result.length, 1);
  assertEquals(result[0], uploadFiles[0]);
});

Deno.test("prepareMirrorSync - ローカルとリモート両方に存在するファイルは削除されない", async () => {
  const remoteFiles = [
    "src/index.ts",
    "src/utils.ts",
    "README.md",
  ];
  const uploader = new MockUploaderWithList(remoteFiles);

  const uploadFiles: UploadFile[] = [
    {
      relativePath: "src/index.ts",
      size: 100,
      isDirectory: false,
      changeType: "modify",
    },
    {
      relativePath: "src/utils.ts",
      size: 200,
      isDirectory: false,
      changeType: "add",
    },
    {
      relativePath: "README.md",
      size: 300,
      isDirectory: false,
      changeType: "modify",
    },
  ];

  const result = await prepareMirrorSync(uploader, uploadFiles, []);

  // 全てのファイルがローカルとリモート両方に存在するので、削除対象は追加されない
  assertEquals(result.length, 3);
  assertEquals(result, uploadFiles);
});

Deno.test("prepareMirrorSync - ローカルの削除ファイルは除外して比較", async () => {
  const remoteFiles = [
    "src/index.ts",
    "src/old.ts",
  ];
  const uploader = new MockUploaderWithList(remoteFiles);

  const uploadFiles: UploadFile[] = [
    {
      relativePath: "src/index.ts",
      size: 100,
      isDirectory: false,
      changeType: "add",
    },
    {
      relativePath: "src/old.ts",
      size: 0,
      isDirectory: false,
      changeType: "delete",
    },
  ];

  const result = await prepareMirrorSync(uploader, uploadFiles, []);

  // src/old.ts はローカルで削除予定なので、リモートからも削除される
  // しかし既にuploadFilesに削除対象として含まれているので重複しない
  assertEquals(result.length, 2);
  assertEquals(result[0].relativePath, "src/index.ts");
  assertEquals(result[1].relativePath, "src/old.ts");
  assertEquals(result[1].changeType, "delete");
});

Deno.test("prepareMirrorSync - リモートファイル一覧取得に失敗しても続行", async () => {
  const uploader = new MockUploaderWithListError();
  const uploadFiles: UploadFile[] = [
    { relativePath: "src/index.ts", size: 100, isDirectory: false },
  ];

  const result = await prepareMirrorSync(uploader, uploadFiles, []);

  // エラーが発生しても元の配列が返される
  assertEquals(result, uploadFiles);
});

Deno.test("prepareMirrorSync - 空の配列を渡しても正常動作", async () => {
  const remoteFiles = ["src/old.ts", "dist/bundle.js"];
  const uploader = new MockUploaderWithList(remoteFiles);

  const result = await prepareMirrorSync(uploader, [], []);

  // 全てのリモートファイルが削除対象として追加される
  assertEquals(result.length, 2);
  assertEquals(result[0].relativePath, "src/old.ts");
  assertEquals(result[0].changeType, "delete");
  assertEquals(result[1].relativePath, "dist/bundle.js");
  assertEquals(result[1].changeType, "delete");
});

Deno.test("prepareMirrorSync - リモートにファイルがない場合", async () => {
  const uploader = new MockUploaderWithList([]);
  const uploadFiles: UploadFile[] = [
    {
      relativePath: "src/index.ts",
      size: 100,
      isDirectory: false,
      changeType: "add",
    },
  ];

  const result = await prepareMirrorSync(uploader, uploadFiles, []);

  // リモートにファイルがないので削除対象は追加されない
  assertEquals(result.length, 1);
  assertEquals(result, uploadFiles);
});

Deno.test("prepareMirrorSync - 複雑なケース（追加、変更、削除、ignoreの組み合わせ）", async () => {
  const remoteFiles = [
    "src/index.ts", // ローカルにもある（変更）
    "src/old.ts", // ローカルにない（削除対象）
    "debug.log", // ignoreパターンでスキップ
    "dist/bundle.js", // ローカルにない（削除対象）
    "node_modules/foo/index.js", // ignoreパターンでスキップ
  ];
  const uploader = new MockUploaderWithList(remoteFiles);

  const uploadFiles: UploadFile[] = [
    {
      relativePath: "src/index.ts",
      size: 100,
      isDirectory: false,
      changeType: "modify",
    },
    {
      relativePath: "src/new.ts",
      size: 200,
      isDirectory: false,
      changeType: "add",
    },
  ];

  const result = await prepareMirrorSync(uploader, uploadFiles, [
    "*.log",
    "node_modules/",
  ]);

  // 期待: src/index.ts (modify), src/new.ts (add), src/old.ts (delete), dist/bundle.js (delete)
  assertEquals(result.length, 4);

  assertEquals(result[0].relativePath, "src/index.ts");
  assertEquals(result[0].changeType, "modify");

  assertEquals(result[1].relativePath, "src/new.ts");
  assertEquals(result[1].changeType, "add");

  const deleteFiles = result.filter((f) => f.changeType === "delete");
  assertEquals(deleteFiles.length, 2);

  const deletePaths = deleteFiles.map((f) => f.relativePath).sort();
  assertEquals(deletePaths, ["dist/bundle.js", "src/old.ts"]);
});
