/**
 * diff-viewer フロントエンドHTML
 *
 * HTMLをTypeScript文字列として埋め込む
 */

export function getHtmlContent(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>uploader - Diff Viewer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --bg-primary: #1e1e1e;
      --bg-secondary: #252526;
      --bg-tertiary: #2d2d30;
      --text-primary: #d4d4d4;
      --text-secondary: #808080;
      --border-color: #3c3c3c;
      --accent-blue: #569cd6;
      --color-added: #4ec9b0;
      --color-modified: #dcdcaa;
      --color-deleted: #f44747;
      --color-renamed: #ce9178;
      --diff-add-bg: rgba(78, 201, 176, 0.15);
      --diff-del-bg: rgba(244, 71, 71, 0.15);
      --diff-add-line: rgba(78, 201, 176, 0.3);
      --diff-del-line: rgba(244, 71, 71, 0.3);
    }

    body {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* ヘッダー */
    .header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header h1 {
      font-size: 16px;
      font-weight: normal;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header h1 .icon {
      color: var(--accent-blue);
    }

    .branch-info {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .branch-info span {
      color: var(--accent-blue);
      padding: 2px 6px;
      background: var(--bg-tertiary);
      border-radius: 3px;
    }

    .header-actions {
      display: flex;
      gap: 10px;
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-primary {
      background: #0e639c;
      color: white;
    }

    .btn-primary:hover {
      background: #1177bb;
    }

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .btn-secondary:hover {
      background: #3c3c3c;
    }

    /* メインコンテンツ */
    .main {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* サイドバー（ファイルツリー） */
    .sidebar {
      width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      padding: 12px 16px;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .summary-badges {
      display: flex;
      gap: 8px;
    }

    .badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .badge-added {
      background: rgba(78, 201, 176, 0.2);
      color: var(--color-added);
    }

    .badge-modified {
      background: rgba(220, 220, 170, 0.2);
      color: var(--color-modified);
    }

    .badge-deleted {
      background: rgba(244, 71, 71, 0.2);
      color: var(--color-deleted);
    }

    .file-tree {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    /* ツリーノード（ディレクトリまたはファイル） */
    .tree-node {
      user-select: none;
    }

    .tree-item {
      padding: 4px 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      white-space: nowrap;
    }

    .tree-item:hover {
      background: var(--bg-tertiary);
    }

    .tree-item.selected {
      background: rgba(86, 156, 214, 0.2);
    }

    /* ディレクトリの開閉アイコン */
    .tree-toggle {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      flex-shrink: 0;
      transition: transform 0.15s ease;
    }

    .tree-toggle.collapsed {
      transform: rotate(-90deg);
    }

    .tree-toggle.empty {
      visibility: hidden;
    }

    /* ディレクトリ/ファイルアイコン */
    .tree-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 14px;
    }

    .tree-icon.folder {
      color: #dcb67a;
    }

    .tree-icon.file {
      color: var(--text-secondary);
    }

    /* ノード名 */
    .tree-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tree-name.directory {
      font-weight: 500;
    }

    /* ファイルステータスバッジ */
    .tree-status {
      font-size: 10px;
      font-weight: bold;
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 2px;
      flex-shrink: 0;
    }

    /* ディレクトリのファイル数バッジ */
    .tree-count {
      font-size: 10px;
      color: var(--text-secondary);
      padding: 1px 5px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      flex-shrink: 0;
    }

    .status-A {
      color: var(--color-added);
      background: rgba(78, 201, 176, 0.2);
    }

    .status-M {
      color: var(--color-modified);
      background: rgba(220, 220, 170, 0.2);
    }

    .status-D {
      color: var(--color-deleted);
      background: rgba(244, 71, 71, 0.2);
    }

    .status-R {
      color: var(--color-renamed);
      background: rgba(206, 145, 120, 0.2);
    }

    .status-U {
      color: var(--text-secondary);
      background: var(--bg-tertiary);
    }

    /* 子要素のコンテナ */
    .tree-children {
      overflow: hidden;
      transition: max-height 0.2s ease;
    }

    .tree-children.collapsed {
      max-height: 0 !important;
    }

    /* コンテンツエリア */
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* タブバー */
    .tab-bar {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      padding: 0 10px;
    }

    .tab {
      padding: 10px 16px;
      font-size: 13px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
    }

    .tab:hover {
      color: var(--text-primary);
    }

    .tab.active {
      color: var(--text-primary);
      border-bottom-color: var(--accent-blue);
    }

    .tab.hidden {
      display: none;
    }

    .tab-separator {
      width: 1px;
      height: 20px;
      background: var(--border-color);
      margin: 0 8px;
    }

    .view-toggle {
      margin-left: auto;
      display: flex;
      gap: 4px;
    }

    /* リモート情報バッジ */
    .remote-badge {
      font-size: 11px;
      padding: 2px 6px;
      background: var(--bg-tertiary);
      border-radius: 3px;
      color: var(--text-secondary);
      margin-left: 8px;
    }

    .remote-badge.new-file {
      color: var(--color-added);
      background: rgba(78, 201, 176, 0.2);
    }

    .remote-badge.no-change {
      color: var(--text-secondary);
      background: var(--bg-tertiary);
    }

    .view-btn {
      padding: 4px 10px;
      font-size: 12px;
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 3px;
    }

    .view-btn.active {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    /* diff表示エリア */
    .diff-container {
      flex: 1;
      overflow: auto;
      background: var(--bg-primary);
    }

    .diff-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary);
      font-size: 14px;
    }

    /* Side-by-side表示 */
    .diff-side-by-side {
      display: flex;
      height: 100%;
    }

    .diff-pane {
      flex: 1;
      overflow: auto;
    }

    .diff-pane-left {
      border-right: 1px solid var(--border-color);
    }

    .diff-pane-header {
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
    }

    /* Unified表示 & 共通 */
    .diff-lines {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.5;
    }

    .diff-line {
      display: flex;
      white-space: pre;
    }

    .diff-line-number {
      width: 50px;
      padding: 0 10px;
      text-align: right;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      user-select: none;
      flex-shrink: 0;
    }

    .diff-line-content {
      flex: 1;
      padding: 0 10px;
    }

    .diff-line.added {
      background: var(--diff-add-bg);
    }

    .diff-line.added .diff-line-number {
      background: var(--diff-add-line);
    }

    .diff-line.deleted {
      background: var(--diff-del-bg);
    }

    .diff-line.deleted .diff-line-number {
      background: var(--diff-del-line);
    }

    .diff-line.context {
      background: transparent;
    }

    /* Unified表示のヘッダー */
    .diff-header {
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
    }

    /* バイナリファイル */
    .binary-notice {
      padding: 40px;
      text-align: center;
      color: var(--text-secondary);
    }

    /* ステータスバー */
    .status-bar {
      background: #007acc;
      color: white;
      padding: 4px 12px;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
    }

    .status-bar.connected {
      background: #007acc;
    }

    .status-bar.disconnected {
      background: #f44747;
    }

    /* ローディング */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary);
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--border-color);
      border-top-color: var(--accent-blue);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 10px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* スクロールバー */
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    ::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 5px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: #4c4c4c;
    }

    /* トースト通知 */
    .toast-container {
      position: fixed;
      top: 60px;
      right: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    }

    .toast {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: flex-start;
      gap: 10px;
      animation: slideIn 0.3s ease;
    }

    .toast.error {
      border-left: 4px solid var(--color-deleted);
    }

    .toast.warning {
      border-left: 4px solid var(--color-modified);
    }

    .toast.success {
      border-left: 4px solid var(--color-added);
    }

    .toast-icon {
      font-size: 18px;
      flex-shrink: 0;
    }

    .toast.error .toast-icon {
      color: var(--color-deleted);
    }

    .toast.warning .toast-icon {
      color: var(--color-modified);
    }

    .toast.success .toast-icon {
      color: var(--color-added);
    }

    .toast-content {
      flex: 1;
    }

    .toast-title {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .toast-message {
      font-size: 12px;
      color: var(--text-secondary);
      word-break: break-word;
    }

    .toast-close {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 0;
      font-size: 16px;
      line-height: 1;
    }

    .toast-close:hover {
      color: var(--text-primary);
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }

    /* 進捗モーダル */
    .progress-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .progress-modal-content {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 24px;
      min-width: 400px;
      max-width: 600px;
      text-align: center;
    }

    .progress-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 20px;
    }

    .progress-title {
      font-size: 16px;
      font-weight: 500;
    }

    .progress-host {
      font-size: 14px;
      color: var(--accent-blue);
      margin-bottom: 12px;
    }

    .progress-bar-container {
      background: var(--bg-tertiary);
      border-radius: 4px;
      height: 8px;
      margin: 12px 0;
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      background: var(--accent-blue);
      transition: width 0.3s ease;
      border-radius: 4px;
    }

    .progress-details {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .progress-file {
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .progress-status {
      margin-top: 20px;
      font-size: 14px;
    }

    .progress-status.success {
      color: var(--color-added);
    }

    .progress-status.error {
      color: var(--color-deleted);
    }

    .progress-status.cancelled {
      color: var(--color-modified);
    }

    .progress-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .progress-icon.success {
      color: var(--color-added);
    }

    .progress-icon.error {
      color: var(--color-deleted);
    }

    .progress-icon.cancelled {
      color: var(--color-modified);
    }

    .progress-modal .btn {
      margin-top: 20px;
    }

    /* 確認モーダル */
    .confirm-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .confirm-modal-content {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 24px;
      min-width: 400px;
      max-width: 500px;
    }

    .confirm-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .confirm-icon {
      font-size: 24px;
      color: var(--accent-blue);
    }

    .confirm-title {
      font-size: 16px;
      font-weight: 500;
    }

    .confirm-message {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 20px;
      line-height: 1.5;
    }

    .confirm-details {
      background: var(--bg-tertiary);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 20px;
      font-size: 13px;
    }

    .confirm-details-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
    }

    .confirm-details-label {
      color: var(--text-secondary);
    }

    .confirm-details-value {
      color: var(--text-primary);
      font-weight: 500;
    }

    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
  </style>
</head>
<body>
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
    <div class="header-actions">
      <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="upload-btn">Upload</button>
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

  <script>
    // アプリケーション状態
    const state = {
      ws: null,
      files: [],
      selectedFile: null,
      viewMode: 'side-by-side', // 'side-by-side' | 'unified'
      fileContents: new Map(), // path -> { git?: {base, target}, remote?: {local, remote} }
      base: '',
      target: '',
      diffMode: 'git', // 'git' | 'remote' | 'both'
      currentDiffTab: 'git', // 'git' | 'remote'
      remoteTargets: [] // [{host, dest}]
    };

    // DOM要素
    const elements = {
      baseBranch: document.getElementById('base-branch'),
      targetBranch: document.getElementById('target-branch'),
      addedCount: document.getElementById('added-count'),
      modifiedCount: document.getElementById('modified-count'),
      deletedCount: document.getElementById('deleted-count'),
      fileTree: document.getElementById('file-tree'),
      diffContainer: document.getElementById('diff-container'),
      statusBar: document.getElementById('status-bar'),
      statusText: document.getElementById('status-text'),
      fileCount: document.getElementById('file-count'),
      uploadBtn: document.getElementById('upload-btn'),
      cancelBtn: document.getElementById('cancel-btn'),
      viewSideBySide: document.getElementById('view-side-by-side'),
      viewUnified: document.getElementById('view-unified'),
      tabGitDiff: document.getElementById('tab-git-diff'),
      tabRemoteDiff: document.getElementById('tab-remote-diff'),
      remoteTargetBadge: document.getElementById('remote-target-badge')
    };

    // WebSocket接続
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      state.ws = new WebSocket(protocol + '//' + window.location.host);

      state.ws.onopen = () => {
        elements.statusBar.className = 'status-bar connected';
        elements.statusText.textContent = 'Connected';
      };

      state.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
      };

      state.ws.onclose = () => {
        elements.statusBar.className = 'status-bar disconnected';
        elements.statusText.textContent = 'Disconnected';
      };

      state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        elements.statusBar.className = 'status-bar disconnected';
        elements.statusText.textContent = 'Connection error';
      };
    }

    // トースト通知を表示
    function showToast(type, title, message, duration = 10000) {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;

      const icons = {
        error: '&#10060;',
        warning: '&#9888;',
        success: '&#10004;'
      };

      toast.innerHTML = \`
        <span class="toast-icon">\${icons[type] || icons.error}</span>
        <div class="toast-content">
          <div class="toast-title">\${escapeHtml(title)}</div>
          <div class="toast-message">\${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
      \`;

      container.appendChild(toast);

      // 自動で消える
      if (duration > 0) {
        setTimeout(() => {
          toast.style.animation = 'fadeOut 0.3s ease forwards';
          setTimeout(() => toast.remove(), 300);
        }, duration);
      }
    }

    // 進捗モーダルを表示
    function showProgressModal() {
      // 既存のモーダルを削除
      const existing = document.getElementById('progress-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'progress-modal';
      modal.className = 'progress-modal';
      modal.innerHTML = \`
        <div class="progress-modal-content">
          <div class="progress-header">
            <div class="spinner"></div>
            <span class="progress-title">Uploading...</span>
          </div>
          <div class="progress-host" id="progress-host">Preparing...</div>
          <div class="progress-bar-container">
            <div class="progress-bar" id="progress-bar" style="width: 0%"></div>
          </div>
          <div class="progress-details" id="progress-details">0 / 0 files</div>
          <div class="progress-file" id="progress-file"></div>
        </div>
      \`;
      document.body.appendChild(modal);
    }

    // 進捗を更新
    function updateProgress(data) {
      const bar = document.getElementById('progress-bar');
      const details = document.getElementById('progress-details');
      const file = document.getElementById('progress-file');
      const host = document.getElementById('progress-host');

      if (bar && details && file && host) {
        const percent = data.totalFiles > 0 ? ((data.fileIndex + 1) / data.totalFiles) * 100 : 0;
        bar.style.width = percent + '%';
        details.textContent = (data.fileIndex + 1) + ' / ' + data.totalFiles + ' files';
        file.textContent = data.currentFile;
        host.textContent = 'Target: ' + data.host + (data.totalTargets > 1 ? ' (' + (data.targetIndex + 1) + '/' + data.totalTargets + ')' : '');
      }
    }

    // 完了表示
    function showComplete(data) {
      const modal = document.getElementById('progress-modal');
      if (modal) {
        const content = modal.querySelector('.progress-modal-content');
        content.innerHTML = \`
          <div class="progress-icon success">&#10004;</div>
          <div class="progress-title" style="color: var(--color-added); font-size: 18px; margin-bottom: 12px;">Upload Complete</div>
          <div class="progress-details">
            \${data.totalFiles} files uploaded to \${data.successTargets} target(s)
          </div>
          <div class="progress-status success">
            Duration: \${formatDuration(data.totalDuration)} | Size: \${formatSize(data.totalSize)}
          </div>
          <p style="margin-top: 16px; color: var(--text-secondary); font-size: 13px;">You can close this page now.</p>
        \`;
      }
    }

    // キャンセル表示
    function showCancelled() {
      // 既存のモーダルを削除
      const existing = document.getElementById('progress-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'progress-modal';
      modal.className = 'progress-modal';
      modal.innerHTML = \`
        <div class="progress-modal-content">
          <div class="progress-icon cancelled">&#10006;</div>
          <div class="progress-title" style="color: var(--color-modified); font-size: 18px; margin-bottom: 12px;">Upload Cancelled</div>
          <div class="progress-details">
            The upload has been cancelled.
          </div>
          <p style="margin-top: 16px; color: var(--text-secondary); font-size: 13px;">You can close this page now.</p>
        </div>
      \`;
      document.body.appendChild(modal);
    }

    // エラー表示
    function showUploadError(message) {
      const modal = document.getElementById('progress-modal');
      if (modal) {
        const content = modal.querySelector('.progress-modal-content');
        content.innerHTML = \`
          <div class="progress-icon error">&#10060;</div>
          <div class="progress-title" style="color: var(--color-deleted); font-size: 18px; margin-bottom: 12px;">Upload Failed</div>
          <div class="progress-details" style="color: var(--text-secondary);">
            \${escapeHtml(message)}
          </div>
          <p style="margin-top: 16px; color: var(--text-secondary); font-size: 13px;">Check the CLI for more details.</p>
        </div>
        \`;
      }
    }

    // 確認モーダルを表示
    function showConfirmModal() {
      // 既存のモーダルを削除
      const existing = document.getElementById('confirm-modal');
      if (existing) existing.remove();

      // ファイル数とターゲット情報を取得
      const fileCount = state.files.length;
      const targetCount = state.remoteTargets.length;
      const targetHost = state.remoteTargets.length > 0 ? state.remoteTargets[0].host : 'unknown';

      const modal = document.createElement('div');
      modal.id = 'confirm-modal';
      modal.className = 'confirm-modal';
      modal.innerHTML = \`
        <div class="confirm-modal-content">
          <div class="confirm-header">
            <span class="confirm-icon">&#8593;</span>
            <span class="confirm-title">Confirm Upload</span>
          </div>
          <div class="confirm-message">
            Are you sure you want to upload these files to the remote server?
          </div>
          <div class="confirm-details">
            <div class="confirm-details-row">
              <span class="confirm-details-label">Files</span>
              <span class="confirm-details-value">\${fileCount} file(s)</span>
            </div>
            <div class="confirm-details-row">
              <span class="confirm-details-label">Target</span>
              <span class="confirm-details-value">\${escapeHtml(targetHost)}\${targetCount > 1 ? ' (+' + (targetCount - 1) + ' more)' : ''}</span>
            </div>
          </div>
          <div class="confirm-actions">
            <button class="btn btn-secondary" id="confirm-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="confirm-upload-btn">Upload</button>
          </div>
        </div>
      \`;
      document.body.appendChild(modal);

      // イベントリスナー
      document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
        modal.remove();
      });

      document.getElementById('confirm-upload-btn').addEventListener('click', () => {
        modal.remove();
        showProgressModal();
        state.ws.send(JSON.stringify({ type: 'confirm' }));
      });

      // 背景クリックでキャンセル
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });

      // Escキーでキャンセル
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          modal.remove();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    }

    // 時間フォーマット
    function formatDuration(ms) {
      if (ms < 1000) return ms + 'ms';
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) return seconds + 's';
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return minutes + 'm ' + remainingSeconds + 's';
    }

    // サイズフォーマット
    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    // メッセージハンドラ
    function handleMessage(message) {
      switch (message.type) {
        case 'init':
          handleInit(message.data);
          break;
        case 'file_response':
          handleFileResponse(message);
          break;
        case 'progress':
          updateProgress(message.data);
          break;
        case 'complete':
          showComplete(message.data);
          break;
        case 'cancelled':
          showCancelled();
          break;
        case 'error':
          console.error('Server error:', message.message);
          // 進捗モーダルが表示されている場合はエラー表示に切り替え
          const progressModal = document.getElementById('progress-modal');
          if (progressModal) {
            showUploadError(message.message);
          } else {
            showToast('error', 'Connection Error', message.message);
          }
          break;
      }
    }

    // 初期化データの処理
    function handleInit(data) {
      state.base = data.base;
      state.target = data.target;
      state.files = data.files;
      state.diffMode = data.diffMode || 'git';
      state.remoteTargets = data.remoteTargets || [];

      // 初期タブを設定
      if (state.diffMode === 'remote') {
        state.currentDiffTab = 'remote';
      } else {
        state.currentDiffTab = 'git';
      }

      // UIを更新
      elements.baseBranch.textContent = data.base;
      elements.targetBranch.textContent = data.target;
      elements.addedCount.textContent = '+' + data.summary.added;
      elements.modifiedCount.textContent = '~' + data.summary.modified;
      elements.deletedCount.textContent = '-' + data.summary.deleted;
      elements.fileCount.textContent = data.summary.total + ' files';

      // タブ表示を更新
      updateTabVisibility();

      // ファイルツリーを描画
      renderFileTree();
    }

    // タブの表示/非表示を更新
    function updateTabVisibility() {
      const showGitTab = state.diffMode === 'git' || state.diffMode === 'both';
      const showRemoteTab = state.diffMode === 'remote' || state.diffMode === 'both';

      elements.tabGitDiff.classList.toggle('hidden', !showGitTab);
      elements.tabRemoteDiff.classList.toggle('hidden', !showRemoteTab);

      // タブのアクティブ状態を更新
      elements.tabGitDiff.classList.toggle('active', state.currentDiffTab === 'git');
      elements.tabRemoteDiff.classList.toggle('active', state.currentDiffTab === 'remote');

      // リモートターゲットバッジを更新
      if (showRemoteTab && state.remoteTargets.length > 0) {
        const target = state.remoteTargets[0];
        elements.remoteTargetBadge.textContent = target.host;
        elements.remoteTargetBadge.classList.remove('hidden');
      } else {
        elements.remoteTargetBadge.classList.add('hidden');
      }

      // branch-info表示を調整（remoteモードの場合）
      const branchInfo = document.querySelector('.branch-info');
      if (state.diffMode === 'remote') {
        branchInfo.innerHTML = '<span>Local</span> &rarr; <span>Remote</span>';
      }
    }

    // タブ切り替え
    function switchDiffTab(tab) {
      if (state.currentDiffTab === tab) return;
      state.currentDiffTab = tab;

      // タブのアクティブ状態を更新
      elements.tabGitDiff.classList.toggle('active', tab === 'git');
      elements.tabRemoteDiff.classList.toggle('active', tab === 'remote');

      // 現在選択中のファイルがあれば再表示
      if (state.selectedFile) {
        showSelectedFileDiff();
      }
    }

    // ファイルリストからツリー構造を構築
    function buildFileTree(files) {
      const root = { children: new Map(), files: [] };

      files.forEach(file => {
        const parts = file.path.split('/');
        let current = root;

        // ディレクトリ階層を辿る
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current.children.has(part)) {
            current.children.set(part, {
              name: part,
              children: new Map(),
              files: [],
              path: parts.slice(0, i + 1).join('/')
            });
          }
          current = current.children.get(part);
        }

        // ファイルを追加
        current.files.push({
          ...file,
          name: parts[parts.length - 1]
        });
      });

      return root;
    }

    // ディレクトリ内のファイル数を再帰的にカウント
    function countFilesInDir(node) {
      let count = node.files.length;
      node.children.forEach(child => {
        count += countFilesInDir(child);
      });
      return count;
    }

    // ツリーの開閉状態を保存
    const expandedDirs = new Set();

    // ディレクトリの開閉をトグル
    function toggleDirectory(path) {
      if (expandedDirs.has(path)) {
        expandedDirs.delete(path);
      } else {
        expandedDirs.add(path);
      }
      renderFileTree();
    }

    // ファイルツリーの描画
    function renderFileTree() {
      elements.fileTree.innerHTML = '';
      const tree = buildFileTree(state.files);

      // 再帰的にツリーをレンダリング
      function renderNode(node, depth = 0) {
        const fragment = document.createDocumentFragment();
        const indent = depth * 16;

        // ディレクトリを先にソートして表示
        const sortedDirs = Array.from(node.children.entries()).sort((a, b) =>
          a[0].localeCompare(b[0])
        );

        // ディレクトリの表示
        sortedDirs.forEach(([name, child]) => {
          const isExpanded = expandedDirs.has(child.path);
          const fileCount = countFilesInDir(child);

          const nodeDiv = document.createElement('div');
          nodeDiv.className = 'tree-node';

          const itemDiv = document.createElement('div');
          itemDiv.className = 'tree-item';
          itemDiv.style.paddingLeft = (8 + indent) + 'px';

          itemDiv.innerHTML = \`
            <span class="tree-toggle \${isExpanded ? '' : 'collapsed'}">&#9660;</span>
            <span class="tree-icon folder">\${isExpanded ? '&#128194;' : '&#128193;'}</span>
            <span class="tree-name directory">\${escapeHtml(name)}</span>
            <span class="tree-count">\${fileCount}</span>
          \`;

          itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDirectory(child.path);
          });

          nodeDiv.appendChild(itemDiv);

          // 子要素のコンテナ
          const childrenDiv = document.createElement('div');
          childrenDiv.className = 'tree-children' + (isExpanded ? '' : ' collapsed');

          if (isExpanded) {
            const childNodes = renderNode(child, depth + 1);
            childrenDiv.appendChild(childNodes);
          }

          nodeDiv.appendChild(childrenDiv);
          fragment.appendChild(nodeDiv);
        });

        // ファイルをソートして表示
        const sortedFiles = [...node.files].sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        sortedFiles.forEach(file => {
          const nodeDiv = document.createElement('div');
          nodeDiv.className = 'tree-node';
          nodeDiv.dataset.path = file.path;

          const itemDiv = document.createElement('div');
          itemDiv.className = 'tree-item' + (state.selectedFile?.path === file.path ? ' selected' : '');
          itemDiv.style.paddingLeft = (8 + indent) + 'px';

          // remoteモードの場合はremoteStatusを優先、なければstatusを使用
          const displayStatus = (state.diffMode === 'remote' || state.diffMode === 'both') && file.remoteStatus
            ? file.remoteStatus
            : file.status;

          itemDiv.innerHTML = \`
            <span class="tree-toggle empty"></span>
            <span class="tree-icon file">&#128196;</span>
            <span class="tree-name" title="\${escapeHtml(file.path)}">\${escapeHtml(file.name)}</span>
            <span class="tree-status status-\${displayStatus}">\${displayStatus}</span>
          \`;

          itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            selectFile(file);
          });

          nodeDiv.appendChild(itemDiv);
          fragment.appendChild(nodeDiv);
        });

        return fragment;
      }

      // ルートノードをレンダリング
      elements.fileTree.appendChild(renderNode(tree));

      // 初回は全ディレクトリを展開
      if (expandedDirs.size === 0 && state.files.length > 0) {
        expandAllDirs(tree);
        elements.fileTree.innerHTML = '';
        elements.fileTree.appendChild(renderNode(tree));
      }
    }

    // 全ディレクトリを展開
    function expandAllDirs(node) {
      node.children.forEach((child, name) => {
        expandedDirs.add(child.path);
        expandAllDirs(child);
      });
    }

    // 現在のrequestTypeを取得（現在のタブに応じたリクエストのみ送信）
    function getRequestType() {
      return state.currentDiffTab; // 'git' or 'remote'
    }

    // ファイル選択
    function selectFile(file) {
      state.selectedFile = file;

      // 選択状態を更新
      document.querySelectorAll('.tree-node').forEach(node => {
        const item = node.querySelector('.tree-item');
        if (item) {
          item.classList.toggle('selected', node.dataset.path === file.path);
        }
      });

      // キャッシュチェック - 現在のタブに対応するデータがあるか
      const cached = state.fileContents.get(file.path);
      const needsGit = (state.currentDiffTab === 'git' || state.diffMode === 'both');
      const needsRemote = (state.currentDiffTab === 'remote' || state.diffMode === 'both');
      const hasGit = cached?.git;
      const hasRemote = cached?.remote;

      if ((needsGit && hasGit && !needsRemote) ||
          (needsRemote && hasRemote && !needsGit) ||
          (needsGit && needsRemote && hasGit && hasRemote)) {
        // キャッシュ済みなら即座に表示
        showSelectedFileDiff();
        return;
      }

      // ローディング表示
      elements.diffContainer.innerHTML = \`
        <div class="loading">
          <div class="spinner"></div>
          Loading...
        </div>
      \`;

      // サーバにリクエスト
      state.ws.send(JSON.stringify({
        type: 'file_request',
        path: file.path,
        requestType: getRequestType()
      }));
    }

    // 選択中のファイルのdiffを表示
    function showSelectedFileDiff() {
      const file = state.selectedFile;
      if (!file) return;

      const cached = state.fileContents.get(file.path);
      if (!cached) return;

      if (state.currentDiffTab === 'git' && cached.git) {
        renderDiff(file, cached.git.base, cached.git.target, 'git');
      } else if (state.currentDiffTab === 'remote' && cached.remote) {
        renderDiff(file, cached.remote.local, cached.remote.remote, 'remote');
      }
    }

    // ファイル内容レスポンスの処理
    function handleFileResponse(message) {
      // 既存のキャッシュを取得または新規作成
      const cached = state.fileContents.get(message.path) || {};

      // requestTypeに応じてキャッシュを更新
      if (message.base !== undefined || message.target !== undefined) {
        cached.git = {
          base: message.base,
          target: message.target
        };
      }
      if (message.local !== undefined || message.remote !== undefined) {
        cached.remote = {
          local: message.local,
          remote: message.remote,
          remoteStatus: message.remoteStatus
        };
      }

      state.fileContents.set(message.path, cached);

      // remoteStatusに基づいてファイルリストのステータスを更新
      if (message.remoteStatus) {
        updateFileStatus(message.path, message.remoteStatus);
      }

      // 現在選択中のファイルなら表示
      if (state.selectedFile && state.selectedFile.path === message.path) {
        showSelectedFileDiff();
      }
    }

    // ファイルのステータスを更新
    function updateFileStatus(path, remoteStatus) {
      const file = state.files.find(f => f.path === path);
      if (!file) return;

      // Remote Diffモードでのステータス更新
      if (state.diffMode === 'remote' || state.diffMode === 'both') {
        if (!remoteStatus.exists) {
          file.remoteStatus = 'A'; // 新規追加
        } else if (remoteStatus.hasChanges) {
          file.remoteStatus = 'M'; // 変更あり
        } else {
          file.remoteStatus = 'U'; // 変更なし (Unchanged)
        }

        // ファイルツリーのステータスバッジを更新
        const node = document.querySelector(\`.tree-node[data-path="\${CSS.escape(path)}"]\`);
        if (node) {
          const statusBadge = node.querySelector('.tree-status');
          if (statusBadge && state.currentDiffTab === 'remote') {
            statusBadge.className = 'tree-status status-' + file.remoteStatus;
            statusBadge.textContent = file.remoteStatus;
          }
        }
      }
    }

    // diff表示
    function renderDiff(file, baseContent, targetContent, diffType = 'git') {
      // バイナリファイルのチェック
      if (baseContent?.isBinary || targetContent?.isBinary) {
        elements.diffContainer.innerHTML = \`
          <div class="binary-notice">
            <p>Binary file - cannot display diff</p>
          </div>
        \`;
        return;
      }

      // コンテンツが存在しない場合のフォールバック
      const safeBase = baseContent || { content: '', isBinary: false };
      const safeTarget = targetContent || { content: '', isBinary: false };

      if (state.viewMode === 'side-by-side') {
        renderSideBySide(file, safeBase, safeTarget, diffType);
      } else {
        renderUnified(file, safeBase, safeTarget, diffType);
      }
    }

    // Side-by-side表示
    function renderSideBySide(file, baseContent, targetContent, diffType = 'git') {
      const baseLines = (baseContent.content || '').split('\\n');
      const targetLines = (targetContent.content || '').split('\\n');

      let baseHtml = '';
      let targetHtml = '';

      // 簡易diffアルゴリズム
      const diff = computeDiff(baseLines, targetLines);

      diff.forEach(item => {
        if (item.type === 'equal') {
          baseHtml += renderLine(item.baseLine, item.content, 'context');
          targetHtml += renderLine(item.targetLine, item.content, 'context');
        } else if (item.type === 'delete') {
          baseHtml += renderLine(item.baseLine, item.content, 'deleted');
          targetHtml += renderLine('', '', 'context');
        } else if (item.type === 'insert') {
          baseHtml += renderLine('', '', 'context');
          targetHtml += renderLine(item.targetLine, item.content, 'added');
        } else if (item.type === 'replace') {
          baseHtml += renderLine(item.baseLine, item.baseContent, 'deleted');
          targetHtml += renderLine(item.targetLine, item.targetContent, 'added');
        }
      });

      // ヘッダーラベルを決定
      let leftHeader, rightHeader;
      if (diffType === 'remote') {
        const target = state.remoteTargets[0];
        leftHeader = 'Local';
        rightHeader = target ? \`Remote (\${target.host})\` : 'Remote';
      } else {
        leftHeader = state.base;
        rightHeader = state.target;
      }

      elements.diffContainer.innerHTML = \`
        <div class="diff-side-by-side">
          <div class="diff-pane diff-pane-left">
            <div class="diff-pane-header">\${escapeHtml(leftHeader)}</div>
            <div class="diff-lines">\${baseHtml}</div>
          </div>
          <div class="diff-pane diff-pane-right">
            <div class="diff-pane-header">\${escapeHtml(rightHeader)}</div>
            <div class="diff-lines">\${targetHtml}</div>
          </div>
        </div>
      \`;
    }

    // Unified表示
    function renderUnified(file, baseContent, targetContent, diffType = 'git') {
      const baseLines = (baseContent.content || '').split('\\n');
      const targetLines = (targetContent.content || '').split('\\n');

      let html = '';
      const diff = computeDiff(baseLines, targetLines);

      diff.forEach(item => {
        if (item.type === 'equal') {
          html += renderUnifiedLine(' ', item.baseLine, item.targetLine, item.content, 'context');
        } else if (item.type === 'delete') {
          html += renderUnifiedLine('-', item.baseLine, '', item.content, 'deleted');
        } else if (item.type === 'insert') {
          html += renderUnifiedLine('+', '', item.targetLine, item.content, 'added');
        } else if (item.type === 'replace') {
          html += renderUnifiedLine('-', item.baseLine, '', item.baseContent, 'deleted');
          html += renderUnifiedLine('+', '', item.targetLine, item.targetContent, 'added');
        }
      });

      // ヘッダー情報を決定
      let headerInfo;
      if (diffType === 'remote') {
        const target = state.remoteTargets[0];
        headerInfo = \`\${file.path} (Local vs \${target ? target.host : 'Remote'})\`;
      } else {
        headerInfo = file.path;
      }

      elements.diffContainer.innerHTML = \`
        <div class="diff-unified">
          <div class="diff-header">\${escapeHtml(headerInfo)}</div>
          <div class="diff-lines">\${html}</div>
        </div>
      \`;
    }

    // 行をレンダリング
    function renderLine(lineNum, content, className) {
      const escapedContent = escapeHtml(content);
      return \`<div class="diff-line \${className}">
        <span class="diff-line-number">\${lineNum}</span>
        <span class="diff-line-content">\${escapedContent}</span>
      </div>\`;
    }

    // Unified行をレンダリング
    function renderUnifiedLine(prefix, baseLine, targetLine, content, className) {
      const escapedContent = escapeHtml(content);
      const lineNum = baseLine || targetLine || '';
      return \`<div class="diff-line \${className}">
        <span class="diff-line-number">\${lineNum}</span>
        <span class="diff-line-content">\${prefix} \${escapedContent}</span>
      </div>\`;
    }

    // HTMLエスケープ
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // 簡易diffアルゴリズム（LCS）
    function computeDiff(baseLines, targetLines) {
      const result = [];
      let baseIdx = 0;
      let targetIdx = 0;

      // LCSを計算
      const lcs = computeLCS(baseLines, targetLines);
      let lcsIdx = 0;

      while (baseIdx < baseLines.length || targetIdx < targetLines.length) {
        if (lcsIdx < lcs.length && baseIdx < baseLines.length && targetIdx < targetLines.length) {
          const lcsItem = lcs[lcsIdx];

          // LCSの位置まで進む
          while (baseIdx < lcsItem.baseIdx || targetIdx < lcsItem.targetIdx) {
            if (baseIdx < lcsItem.baseIdx && targetIdx < lcsItem.targetIdx) {
              // 両方とも異なる → replace
              result.push({
                type: 'replace',
                baseLine: baseIdx + 1,
                targetLine: targetIdx + 1,
                baseContent: baseLines[baseIdx],
                targetContent: targetLines[targetIdx]
              });
              baseIdx++;
              targetIdx++;
            } else if (baseIdx < lcsItem.baseIdx) {
              // baseのみ → delete
              result.push({
                type: 'delete',
                baseLine: baseIdx + 1,
                content: baseLines[baseIdx]
              });
              baseIdx++;
            } else {
              // targetのみ → insert
              result.push({
                type: 'insert',
                targetLine: targetIdx + 1,
                content: targetLines[targetIdx]
              });
              targetIdx++;
            }
          }

          // LCSの行（equal）
          result.push({
            type: 'equal',
            baseLine: baseIdx + 1,
            targetLine: targetIdx + 1,
            content: baseLines[baseIdx]
          });
          baseIdx++;
          targetIdx++;
          lcsIdx++;
        } else if (baseIdx < baseLines.length) {
          // 残りのbase → delete
          result.push({
            type: 'delete',
            baseLine: baseIdx + 1,
            content: baseLines[baseIdx]
          });
          baseIdx++;
        } else if (targetIdx < targetLines.length) {
          // 残りのtarget → insert
          result.push({
            type: 'insert',
            targetLine: targetIdx + 1,
            content: targetLines[targetIdx]
          });
          targetIdx++;
        }
      }

      return result;
    }

    // LCS（最長共通部分列）を計算
    function computeLCS(base, target) {
      const m = base.length;
      const n = target.length;

      // DP表を作成
      const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (base[i - 1] === target[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }

      // LCSを復元
      const lcs = [];
      let i = m, j = n;
      while (i > 0 && j > 0) {
        if (base[i - 1] === target[j - 1]) {
          lcs.unshift({ baseIdx: i - 1, targetIdx: j - 1, content: base[i - 1] });
          i--;
          j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
          i--;
        } else {
          j--;
        }
      }

      return lcs;
    }

    // ビューモード切り替え
    function setViewMode(mode) {
      state.viewMode = mode;
      elements.viewSideBySide.classList.toggle('active', mode === 'side-by-side');
      elements.viewUnified.classList.toggle('active', mode === 'unified');

      // 現在選択中のファイルがあれば再描画
      if (state.selectedFile && state.fileContents.has(state.selectedFile.path)) {
        showSelectedFileDiff();
      }
    }

    // イベントリスナー
    elements.tabGitDiff.addEventListener('click', () => switchDiffTab('git'));
    elements.tabRemoteDiff.addEventListener('click', () => switchDiffTab('remote'));

    elements.uploadBtn.addEventListener('click', () => {
      showConfirmModal();
    });

    elements.cancelBtn.addEventListener('click', () => {
      showCancelled();
      state.ws.send(JSON.stringify({ type: 'cancel' }));
    });

    elements.viewSideBySide.addEventListener('click', () => setViewMode('side-by-side'));
    elements.viewUnified.addEventListener('click', () => setViewMode('unified'));

    // ウィンドウを閉じる前の確認
    window.addEventListener('beforeunload', (e) => {
      e.preventDefault();
      e.returnValue = '';
    });

    // 初期化
    connect();
  </script>
</body>
</html>`;
}
