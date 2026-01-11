/**
 * getManualDiffForTarget() パフォーマンステスト
 *
 * 異なる規模のファイルセットでパフォーマンスを計測
 */

import { describe, it } from "@std/testing/bdd";
import {
  getManualDiffForTarget,
} from "../../src/diff-viewer/remote-diff.ts";
import type {
  RemoteFileContent,
  ResolvedTargetConfig,
  UploadFile,
  Uploader,
} from "../../src/types/mod.ts";

/** モックUploader（readFile/listRemoteFiles対応） */
class MockUploader implements Uploader {
  protocol = "mock" as const;
  private files = new Map<string, Uint8Array>();
  private remoteFiles: string[] = [];

  setRemoteFile(path: string, content: Uint8Array): void {
    this.files.set(path, content);
  }

  setRemoteFiles(paths: string[]): void {
    this.remoteFiles = paths;
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async testConnection(): Promise<boolean> {
    return await Promise.resolve(true);
  }

  async mkdir(_remotePath: string): Promise<void> {}

  async upload(
    _file: UploadFile,
    _remotePath: string,
    _onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {}

  async delete(_remotePath: string): Promise<void> {}

  async readFile(path: string): Promise<RemoteFileContent | null> {
    const content = this.files.get(path);
    if (!content) {
      return await Promise.resolve(null);
    }
    return await Promise.resolve({ content, size: content.length });
  }

  async listRemoteFiles(): Promise<string[]> {
    return await Promise.resolve(this.remoteFiles);
  }
}

/** テスト用の一時ファイルを作成 */
async function createTempFile(content: Uint8Array): Promise<string> {
  const tempFile = await Deno.makeTempFile();
  await Deno.writeFile(tempFile, content);
  return tempFile;
}

/** テストケースを実行して結果を表示 */
async function runPerformanceTest(
  testName: string,
  fileCount: number,
  fileSizeBytes: number,
  concurrency: number,
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`テストケース: ${testName}`);
  console.log(`${"=".repeat(60)}`);

  const target: ResolvedTargetConfig = {
    host: "localhost",
    dest: "/upload/",
    protocol: "scp",
    user: "testuser",
    auth_type: "ssh_key",
    key_file: "/test/key",
    timeout: 30000,
    retry: 3,
    sync_mode: "update",
    ignore: [],
  };

  const uploader = new MockUploader();
  const tempFiles: string[] = [];
  const uploadFiles: UploadFile[] = [];

  try {
    // テストファイルを生成
    console.log(`ファイル生成中... (${fileCount} files × ${fileSizeBytes} bytes)`);
    const fileGenStart = performance.now();

    for (let i = 0; i < fileCount; i++) {
      // ファイル内容を生成
      // crypto.getRandomValuesは最大65536バイトまでなので、大きなファイルは繰り返しで生成
      let content: Uint8Array;
      if (fileSizeBytes <= 65536) {
        // 小さいファイルはランダムバイトで生成
        content = new Uint8Array(fileSizeBytes);
        crypto.getRandomValues(content);
      } else {
        // 大きいファイルは固定パターンで埋める（パフォーマンステストなので内容は問わない）
        content = new Uint8Array(fileSizeBytes);
        const pattern = new Uint8Array(65536);
        crypto.getRandomValues(pattern);

        // パターンを繰り返して埋める
        for (let offset = 0; offset < fileSizeBytes; offset += 65536) {
          const remaining = Math.min(65536, fileSizeBytes - offset);
          content.set(pattern.subarray(0, remaining), offset);
        }
      }

      const tempFile = await createTempFile(content);
      tempFiles.push(tempFile);

      uploadFiles.push({
        relativePath: `file${i}.txt`,
        size: content.length,
        isDirectory: false,
        sourcePath: tempFile,
      });

      // リモートに存在しない状態を想定（追加ファイル）
    }

    const fileGenEnd = performance.now();
    console.log(`ファイル生成完了: ${(fileGenEnd - fileGenStart).toFixed(2)} ms`);

    // メモリ使用量（テスト前）
    const memBefore = Deno.memoryUsage();

    // テスト実行
    console.log(`\nテスト実行中... (concurrency: ${concurrency})`);
    const testStart = performance.now();

    const result = await getManualDiffForTarget(
      target,
      uploadFiles,
      "/tmp",
      { uploader, concurrency },
    );

    const testEnd = performance.now();

    // メモリ使用量（テスト後）
    const memAfter = Deno.memoryUsage();

    // 結果表示
    const totalSizeMB = (fileCount * fileSizeBytes) / (1024 * 1024);
    const executionTimeMs = testEnd - testStart;
    const memoryUsedMB = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);
    const throughput = fileCount / (executionTimeMs / 1000);

    console.log(`\n${"=".repeat(60)}`);
    console.log("テスト結果:");
    console.log(`${"=".repeat(60)}`);
    console.log(`ファイル数:      ${fileCount.toLocaleString()} files`);
    console.log(`ファイルサイズ:  ${fileSizeBytes.toLocaleString()} bytes`);
    console.log(`総サイズ:        ${totalSizeMB.toFixed(2)} MB`);
    console.log(`実行時間:        ${executionTimeMs.toFixed(2)} ms`);
    console.log(`メモリ使用量:    ${memoryUsedMB.toFixed(2)} MB`);
    console.log(`スループット:    ${throughput.toFixed(2)} files/sec`);
    console.log(`\n差分結果:`);
    console.log(`  追加:          ${result.added}`);
    console.log(`  変更:          ${result.modified}`);
    console.log(`  削除:          ${result.deleted}`);
    console.log(`${"=".repeat(60)}\n`);
  } finally {
    // クリーンアップ
    console.log(`クリーンアップ中... (${tempFiles.length} files)`);
    for (const tempFile of tempFiles) {
      try {
        await Deno.remove(tempFile);
      } catch {
        // ファイルが既に削除されている場合は無視
      }
    }
    console.log("クリーンアップ完了");
  }
}

describe("getManualDiffForTarget - パフォーマンステスト", () => {
  // 環境変数でテストを制御
  const skipPerformanceTests = Deno.env.get("SKIP_PERFORMANCE_TESTS") === "true";
  const skipLargeTests = Deno.env.get("SKIP_LARGE_TESTS") === "true";

  it("小規模: 100ファイル × 1KB", async () => {
    if (skipPerformanceTests) {
      console.log("パフォーマンステストをスキップ (SKIP_PERFORMANCE_TESTS=true)");
      return;
    }

    await runPerformanceTest(
      "小規模",
      100, // 100 files
      1024, // 1 KB
      10, // concurrency
    );
  });

  it("中規模: 1,000ファイル × 10KB", async () => {
    if (skipPerformanceTests) {
      console.log("パフォーマンステストをスキップ (SKIP_PERFORMANCE_TESTS=true)");
      return;
    }

    await runPerformanceTest(
      "中規模",
      1000, // 1,000 files
      10 * 1024, // 10 KB
      10, // concurrency
    );
  });

  it("大規模: 8,000ファイル × 10KB", async () => {
    if (skipPerformanceTests || skipLargeTests) {
      console.log("大規模テストをスキップ (SKIP_PERFORMANCE_TESTS=true or SKIP_LARGE_TESTS=true)");
      return;
    }

    await runPerformanceTest(
      "大規模",
      8000, // 8,000 files
      10 * 1024, // 10 KB
      10, // concurrency
    );
  });

  it("大容量: 10ファイル × 100MB", async () => {
    if (skipPerformanceTests || skipLargeTests) {
      console.log("大容量テストをスキップ (SKIP_PERFORMANCE_TESTS=true or SKIP_LARGE_TESTS=true)");
      return;
    }

    await runPerformanceTest(
      "大容量",
      10, // 10 files
      100 * 1024 * 1024, // 100 MB
      5, // concurrency (大容量なので並列数を減らす)
    );
  });
});
