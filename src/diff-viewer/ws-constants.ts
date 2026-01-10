/**
 * diff-viewer WebSocket 定数
 */

/** 遅延読み込みの閾値（この数を超えたら遅延読み込みを有効化） */
export const LAZY_LOADING_THRESHOLD = 100;

/** デフォルトのアイドルタイムアウト（秒） */
export const DEFAULT_UPLOADER_IDLE_TIMEOUT = 300; // 5分

/** デフォルトの同時ターゲットチェック数 */
export const DEFAULT_TARGET_CHECK_CONCURRENCY = 3;

/** ブラウザ起動前の待機時間（ミリ秒） */
export const BROWSER_STARTUP_DELAY = 100;
