/**
 * diff-viewer フロントエンドHTML
 *
 * HTML構造を定義し、styles.ts と scripts.ts をインポートして組み立てる
 */

import { getScripts } from "./scripts.ts";
import { getStyles } from "./styles.ts";

/**
 * diff-viewer の HTML 構造を取得
 */
function getHtmlStructure(): string {
  return `
  <header class="header">
    <h1>
      <span class="icon">&#8593;</span>
      uploader - Diff Viewer
    </h1>
    <div class="branch-info">
      <span id="base-branch">base</span>
      &rarr;
      <span id="target-branch">target</span>
    </div>
    <div class="transfer-info hidden" id="transfer-info">
      <div class="transfer-direction">Local &rarr; Remote</div>
      <div class="transfer-protocol">Protocol: <span id="protocol-value"></span></div>
    </div>
    <div class="target-selector hidden" id="target-selector">
      <label>Target:</label>
      <select id="target-select"></select>
    </div>
    <div class="header-actions">
      <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
      <div class="btn-wrapper">
        <button class="btn btn-primary" id="upload-btn" disabled>Checking...</button>
        <span class="btn-tooltip" id="upload-tooltip">Checking for changes...</span>
      </div>
    </div>
  </header>

  <main class="main">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span>Changes</span>
        <div class="summary-badges">
          <span class="badge badge-added" id="added-count">+0</span>
          <span class="badge badge-modified" id="modified-count">~0</span>
          <span class="badge badge-deleted" id="deleted-count">-0</span>
        </div>
      </div>
      <div class="file-tree" id="file-tree">
        <!-- ファイルリストがここに入る -->
      </div>
    </aside>

    <section class="content">
      <div class="tab-bar">
        <div class="tab active" id="tab-git-diff">Git Diff</div>
        <div class="tab hidden" id="tab-remote-diff">Remote Diff</div>
        <span class="remote-badge hidden" id="remote-target-badge"></span>
        <div class="view-toggle">
          <button class="view-btn active" id="view-side-by-side">Side by Side</button>
          <button class="view-btn" id="view-unified">Unified</button>
        </div>
      </div>
      <div class="diff-container" id="diff-container">
        <div class="diff-placeholder">
          Select a file to view diff
        </div>
      </div>
    </section>
  </main>

  <footer class="status-bar connected" id="status-bar">
    <span id="status-text">Connecting...</span>
    <span id="file-count">0 files</span>
  </footer>

  <!-- トースト通知コンテナ -->
  <div class="toast-container" id="toast-container"></div>

  <!-- 初期ローディングオーバーレイ -->
  <div class="loading-overlay" id="loading-overlay">
    <div class="spinner-large"></div>
    <div class="loading-text">Checking remote differences...</div>
    <div class="loading-subtext">This may take a few minutes for large projects.<br>Please wait...</div>
  </div>
  `;
}

/**
 * diff-viewer の完全な HTML を取得
 */
export function getHtmlContent(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>uploader - Diff Viewer</title>
  <style>${getStyles()}</style>
</head>
<body>
${getHtmlStructure()}
  <script>${getScripts()}</script>
</body>
</html>`;
}
