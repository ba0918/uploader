/**
 * upload/progress.ts のテスト
 */

import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  calculateSpeed,
  formatDuration,
  formatSize,
  TransferProgressManager,
} from "../../src/upload/progress.ts";
import type { ResolvedTargetConfig } from "../../src/types/config.ts";
import type { TransferProgressEvent } from "../../src/types/mod.ts";

// テスト用のターゲット設定を作成
function createTestTarget(host: string): ResolvedTargetConfig {
  return {
    host,
    protocol: "sftp",
    port: 22,
    user: "testuser",
    dest: "/var/www/",
    sync_mode: "update",
    preserve_permissions: false,
    preserve_timestamps: false,
    timeout: 30,
    retry: 3,
  };
}

describe("TransferProgressManager", () => {
  describe("基本的な操作", () => {
    it("インスタンスを作成できる", () => {
      const manager = new TransferProgressManager();
      assertEquals(typeof manager, "object");
    });

    it("コールバック付きでインスタンスを作成できる", () => {
      const callback = (_progress: TransferProgressEvent) => {};
      const manager = new TransferProgressManager(callback);
      assertEquals(typeof manager, "object");
    });
  });

  describe("転送フロー", () => {
    it("完全な転送フローを追跡できる", () => {
      const manager = new TransferProgressManager();
      const target = createTestTarget("example.com");

      // 開始
      manager.start();
      manager.initTarget(target);

      // 接続
      manager.startTargetConnection("example.com");

      // アップロード開始
      manager.startTargetUpload("example.com");

      // ファイル転送記録
      manager.recordFileResult("example.com", {
        path: "/var/www/file1.txt",
        status: "completed",
        size: 1024,
        duration: 100,
      });

      manager.recordFileResult("example.com", {
        path: "/var/www/file2.txt",
        status: "completed",
        size: 2048,
        duration: 200,
      });

      // 完了
      manager.completeTarget("example.com");

      // 結果取得
      const result = manager.getResult();
      assertEquals(result.successTargets, 1);
      assertEquals(result.failedTargets, 0);
      assertEquals(result.totalFiles, 2);
      assertEquals(result.totalSize, 3072);
    });

    it("失敗したファイルを記録できる", () => {
      const manager = new TransferProgressManager();
      const target = createTestTarget("example.com");

      manager.start();
      manager.initTarget(target);
      manager.startTargetUpload("example.com");

      manager.recordFileResult("example.com", {
        path: "/var/www/success.txt",
        status: "completed",
        size: 1024,
        duration: 100,
      });

      manager.recordFileResult("example.com", {
        path: "/var/www/failed.txt",
        status: "failed",
        size: 0,
        duration: 50,
        error: "Permission denied",
      });

      manager.completeTarget("example.com");

      const result = manager.getResult();
      assertEquals(result.successTargets, 0); // 失敗があるので0
      assertEquals(result.failedTargets, 1);
      assertEquals(result.totalFiles, 1); // 成功したファイルのみカウント
    });

    it("スキップされたファイルを記録できる", () => {
      const manager = new TransferProgressManager();
      const target = createTestTarget("example.com");

      manager.start();
      manager.initTarget(target);
      manager.startTargetUpload("example.com");

      manager.recordFileResult("example.com", {
        path: "/var/www/skipped.txt",
        status: "skipped",
        size: 0,
        duration: 0,
      });

      manager.completeTarget("example.com");

      const result = manager.getResult();
      assertEquals(result.targets[0].skippedCount, 1);
    });
  });

  describe("複数ターゲット", () => {
    it("複数のターゲットを追跡できる", () => {
      const manager = new TransferProgressManager();
      const target1 = createTestTarget("server1.example.com");
      const target2 = createTestTarget("server2.example.com");

      manager.start();
      manager.initTarget(target1);
      manager.initTarget(target2);

      // ターゲット1
      manager.startTargetUpload("server1.example.com");
      manager.recordFileResult("server1.example.com", {
        path: "/var/www/file.txt",
        status: "completed",
        size: 1024,
        duration: 100,
      });
      manager.completeTarget("server1.example.com");

      // ターゲット2
      manager.startTargetUpload("server2.example.com");
      manager.recordFileResult("server2.example.com", {
        path: "/var/www/file.txt",
        status: "completed",
        size: 1024,
        duration: 150,
      });
      manager.completeTarget("server2.example.com");

      const result = manager.getResult();
      assertEquals(result.successTargets, 2);
      assertEquals(result.failedTargets, 0);
      assertEquals(result.targets.length, 2);
    });

    it("一部のターゲットが失敗しても他は成功として記録される", () => {
      const manager = new TransferProgressManager();
      const target1 = createTestTarget("server1.example.com");
      const target2 = createTestTarget("server2.example.com");

      manager.start();
      manager.initTarget(target1);
      manager.initTarget(target2);

      // ターゲット1 - 成功
      manager.startTargetUpload("server1.example.com");
      manager.recordFileResult("server1.example.com", {
        path: "/var/www/file.txt",
        status: "completed",
        size: 1024,
        duration: 100,
      });
      manager.completeTarget("server1.example.com");

      // ターゲット2 - 接続失敗
      manager.startTargetConnection("server2.example.com");
      manager.failTargetConnection(
        "server2.example.com",
        "Connection refused",
      );

      const result = manager.getResult();
      assertEquals(result.successTargets, 1);
      assertEquals(result.failedTargets, 1);
    });
  });

  describe("コールバック", () => {
    it("進捗更新時にコールバックが呼ばれる", () => {
      const progressUpdates: TransferProgressEvent[] = [];
      const callback = (progress: TransferProgressEvent) => {
        progressUpdates.push({ ...progress });
      };

      const manager = new TransferProgressManager(callback);
      const target = createTestTarget("example.com");

      manager.start();
      manager.initTarget(target);
      manager.startTargetUpload("example.com");

      manager.updateFileProgress(
        "example.com",
        0,
        2,
        "file1.txt",
        512,
        1024,
        "uploading",
      );

      assertEquals(progressUpdates.length, 1);
      assertEquals(progressUpdates[0].host, "example.com");
      assertEquals(progressUpdates[0].fileIndex, 0);
      assertEquals(progressUpdates[0].totalFiles, 2);
      assertEquals(progressUpdates[0].currentFile, "file1.txt");
      assertEquals(progressUpdates[0].bytesTransferred, 512);
      assertEquals(progressUpdates[0].fileSize, 1024);
      assertEquals(progressUpdates[0].status, "uploading");
    });
  });

  describe("ステータス遷移", () => {
    it("pending -> connecting -> uploading -> completed", () => {
      const manager = new TransferProgressManager();
      const target = createTestTarget("example.com");

      manager.start();
      manager.initTarget(target);

      let result = manager.getResult();
      assertEquals(result.targets[0].status, "pending");

      manager.startTargetConnection("example.com");
      result = manager.getResult();
      assertEquals(result.targets[0].status, "connecting");

      manager.startTargetUpload("example.com");
      result = manager.getResult();
      assertEquals(result.targets[0].status, "uploading");

      manager.completeTarget("example.com");
      result = manager.getResult();
      assertEquals(result.targets[0].status, "completed");
    });

    it("エラー時はfailedステータスになる", () => {
      const manager = new TransferProgressManager();
      const target = createTestTarget("example.com");

      manager.start();
      manager.initTarget(target);
      manager.startTargetConnection("example.com");
      manager.failTargetConnection("example.com", "Connection timeout");

      const result = manager.getResult();
      assertEquals(result.targets[0].status, "failed");
      assertEquals(result.targets[0].error, "Connection timeout");
    });
  });
});

describe("formatDuration", () => {
  it("0ミリ秒は00:00として表示する", () => {
    assertEquals(formatDuration(0), "00:00");
  });

  it("秒単位を正しくフォーマットする", () => {
    assertEquals(formatDuration(1000), "00:01");
    assertEquals(formatDuration(30000), "00:30");
    assertEquals(formatDuration(59000), "00:59");
  });

  it("分単位を正しくフォーマットする", () => {
    assertEquals(formatDuration(60000), "01:00");
    assertEquals(formatDuration(90000), "01:30");
    assertEquals(formatDuration(600000), "10:00");
  });

  it("複合時間を正しくフォーマットする", () => {
    assertEquals(formatDuration(65000), "01:05");
    assertEquals(formatDuration(3661000), "61:01");
  });
});

describe("formatSize", () => {
  it("バイト単位を正しくフォーマットする", () => {
    assertEquals(formatSize(0), "0 B");
    assertEquals(formatSize(100), "100 B");
    assertEquals(formatSize(1023), "1023 B");
  });

  it("キロバイト単位を正しくフォーマットする", () => {
    assertEquals(formatSize(1024), "1.0 KB");
    assertEquals(formatSize(1536), "1.5 KB");
    assertEquals(formatSize(10240), "10.0 KB");
  });

  it("メガバイト単位を正しくフォーマットする", () => {
    assertEquals(formatSize(1048576), "1.0 MB");
    assertEquals(formatSize(1572864), "1.5 MB");
    assertEquals(formatSize(10485760), "10.0 MB");
  });

  it("ギガバイト単位を正しくフォーマットする", () => {
    assertEquals(formatSize(1073741824), "1.0 GB");
    assertEquals(formatSize(1610612736), "1.5 GB");
  });

  it("テラバイト単位を正しくフォーマットする", () => {
    assertEquals(formatSize(1099511627776), "1.0 TB");
  });
});

describe("calculateSpeed", () => {
  it("0ミリ秒の場合は0 B/sを返す", () => {
    assertEquals(calculateSpeed(1024, 0), "0 B/s");
  });

  it("速度を正しく計算する", () => {
    // 1024バイト / 1000ミリ秒 = 1024 B/s = 1.0 KB/s
    assertEquals(calculateSpeed(1024, 1000), "1.0 KB/s");
  });

  it("高速転送を正しく表示する", () => {
    // 1MB / 100ミリ秒 = 10 MB/s
    assertEquals(calculateSpeed(1048576, 100), "10.0 MB/s");
  });

  it("低速転送を正しく表示する", () => {
    // 100バイト / 1000ミリ秒 = 100 B/s
    assertEquals(calculateSpeed(100, 1000), "100 B/s");
  });
});
