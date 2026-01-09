/**
 * 転送進捗管理
 */

import type {
  FileTransferResult,
  TargetUploadResult,
  TransferProgressCallback,
  TransferStatus,
  UploadResult,
} from "../types/mod.ts";
import type { ResolvedTargetConfig } from "../types/config.ts";

/**
 * ターゲットの一意キーを生成
 */
function createTargetKey(target: ResolvedTargetConfig): string {
  return `${target.host}:${target.dest}`;
}

/**
 * 転送進捗マネージャー
 */
export class TransferProgressManager {
  private targetResults: Map<string, TargetUploadResult> = new Map();
  private targetIndexMap: Map<string, number> = new Map();
  private startTime: number = 0;
  private callback?: TransferProgressCallback;

  constructor(callback?: TransferProgressCallback) {
    this.callback = callback;
  }

  /**
   * 転送開始
   */
  start(): void {
    this.startTime = Date.now();
    this.targetResults.clear();
    this.targetIndexMap.clear();
  }

  /**
   * ターゲットの初期化
   */
  initTarget(target: ResolvedTargetConfig): void {
    const key = createTargetKey(target);
    const index = this.targetResults.size;
    this.targetIndexMap.set(key, index);
    this.targetResults.set(key, {
      target,
      status: "pending",
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      files: [],
      duration: 0,
    });
  }

  /**
   * ターゲットの接続開始
   */
  startTargetConnection(host: string, dest?: string): void {
    const key = this.findTargetKey(host, dest);
    if (key) {
      const result = this.targetResults.get(key);
      if (result) {
        result.status = "connecting";
      }
    }
  }

  /**
   * ターゲットのアップロード開始
   */
  startTargetUpload(host: string, dest?: string): void {
    const key = this.findTargetKey(host, dest);
    if (key) {
      const result = this.targetResults.get(key);
      if (result) {
        result.status = "uploading";
      }
    }
  }

  /**
   * ファイル転送の進捗を更新
   */
  updateFileProgress(
    host: string,
    fileIndex: number,
    totalFiles: number,
    currentFile: string,
    bytesTransferred: number,
    fileSize: number,
    status: TransferStatus,
    dest?: string,
  ): void {
    if (this.callback) {
      const key = this.findTargetKey(host, dest);
      const targetIndex = key ? (this.targetIndexMap.get(key) ?? 0) : 0;
      this.callback({
        targetIndex,
        totalTargets: this.targetResults.size,
        host,
        fileIndex,
        totalFiles,
        currentFile,
        bytesTransferred,
        fileSize,
        status,
      });
    }
  }

  /**
   * ファイル転送結果を記録
   */
  recordFileResult(
    host: string,
    result: FileTransferResult,
    dest?: string,
  ): void {
    const key = this.findTargetKey(host, dest);
    if (key) {
      const targetResult = this.targetResults.get(key);
      if (targetResult) {
        targetResult.files.push(result);
        if (result.status === "completed") {
          targetResult.successCount++;
        } else if (result.status === "failed") {
          targetResult.failedCount++;
        } else if (result.status === "skipped") {
          targetResult.skippedCount++;
        }
      }
    }
  }

  /**
   * ターゲット完了
   */
  completeTarget(host: string, error?: string, dest?: string): void {
    const key = this.findTargetKey(host, dest);
    if (key) {
      const result = this.targetResults.get(key);
      if (result) {
        result.duration = Date.now() - this.startTime;
        if (error) {
          result.status = "failed";
          result.error = error;
        } else if (result.failedCount > 0) {
          result.status = "failed";
        } else {
          result.status = "completed";
        }
      }
    }
  }

  /**
   * 接続失敗
   */
  failTargetConnection(host: string, error: string, dest?: string): void {
    const key = this.findTargetKey(host, dest);
    if (key) {
      const result = this.targetResults.get(key);
      if (result) {
        result.status = "failed";
        result.error = error;
        result.duration = Date.now() - this.startTime;
      }
    }
  }

  /**
   * 全体の結果を取得
   */
  getResult(): UploadResult {
    const targets = Array.from(this.targetResults.values());
    const successTargets = targets.filter((t) => t.status === "completed")
      .length;
    const failedTargets = targets.filter((t) => t.status === "failed").length;

    let totalFiles = 0;
    let totalSize = 0;
    for (const target of targets) {
      for (const file of target.files) {
        if (file.status === "completed") {
          totalFiles++;
          totalSize += file.size;
        }
      }
    }

    return {
      successTargets,
      failedTargets,
      targets,
      totalFiles,
      totalSize,
      totalDuration: Date.now() - this.startTime,
    };
  }

  /**
   * ターゲットキーを検索
   * dest が指定されていれば host:dest で検索、なければ host で始まるキーを検索
   */
  private findTargetKey(host: string, dest?: string): string | undefined {
    if (dest) {
      const exactKey = `${host}:${dest}`;
      if (this.targetResults.has(exactKey)) {
        return exactKey;
      }
    }
    // dest が指定されていない場合、host で始まる最初のキーを返す（後方互換性）
    for (const key of this.targetResults.keys()) {
      if (key.startsWith(host + ":")) {
        return key;
      }
    }
    return undefined;
  }
}

/**
 * 時間を mm:ss 形式にフォーマット
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${
    remainingSeconds.toString().padStart(2, "0")
  }`;
}

/**
 * ファイルサイズを人間が読みやすい形式にフォーマット
 */
export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  if (unitIndex === 0) {
    return `${size} ${units[unitIndex]}`;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 転送速度を計算
 */
export function calculateSpeed(bytes: number, ms: number): string {
  if (ms === 0) return "0 B/s";
  const bytesPerSecond = (bytes / ms) * 1000;
  return `${formatSize(bytesPerSecond)}/s`;
}
