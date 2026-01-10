/**
 * diff-viewer CSS スタイル定義
 *
 * html.ts から分離された CSS 部分
 */

/**
 * diff-viewer のスタイルを取得
 */
export function getStyles(): string {
  return `
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

    /* ターゲットセレクター */
    .target-selector {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      background: rgba(86, 156, 214, 0.1);
      border: 1px solid rgba(86, 156, 214, 0.3);
      border-radius: 6px;
      padding: 6px 12px;
    }

    .target-selector.hidden {
      display: none;
    }

    .target-selector label {
      color: var(--accent-blue);
      font-weight: 500;
      white-space: nowrap;
    }

    .target-selector select {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 6px 28px 6px 10px;
      font-size: 13px;
      cursor: pointer;
      min-width: 200px;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23808080' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
    }

    .target-selector select:hover {
      border-color: var(--accent-blue);
      background-color: var(--bg-secondary);
    }

    .target-selector select:focus {
      outline: none;
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 2px rgba(86, 156, 214, 0.2);
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

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary:disabled {
      background: #4a4a4a;
    }

    .btn-primary:disabled:hover {
      background: #4a4a4a;
    }

    /* ボタンラッパー（ツールチップ用） */
    .btn-wrapper {
      position: relative;
      display: inline-block;
    }

    .btn-tooltip {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
      margin-bottom: 8px;
      z-index: 100;
      border: 1px solid var(--border-color);
    }

    .btn-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: var(--bg-tertiary);
    }

    .btn-wrapper:hover .btn-tooltip:not(:empty) {
      opacity: 1;
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

    .empty-tree-message {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      color: var(--text-secondary);
      font-size: 13px;
      text-align: center;
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
      min-width: fit-content;
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
      width: 500px;
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
      height: 18px;
      line-height: 18px;
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

    /* ターゲット詳細表示用の拡張スタイル */
    .confirm-modal-wide {
      max-width: 600px;
      min-width: 500px;
    }

    .confirm-summary {
      text-align: center;
      margin-bottom: 16px;
      padding: 10px;
      background: rgba(86, 156, 214, 0.1);
      border-radius: 4px;
      font-size: 14px;
    }

    .confirm-summary-item strong {
      color: var(--accent-blue);
    }

    .confirm-target-list {
      background: var(--bg-tertiary);
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 20px;
      max-height: 300px;
      overflow-y: auto;
    }

    .confirm-target-item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      margin-bottom: 4px;
      background: var(--bg-secondary);
      border-radius: 4px;
      border-left: 3px solid var(--accent-blue);
    }

    .confirm-target-item:last-child {
      margin-bottom: 0;
    }

    .confirm-target-item.no-changes {
      border-left-color: var(--text-secondary);
      opacity: 0.7;
    }

    .confirm-target-item.error {
      border-left-color: var(--color-deleted);
    }

    .confirm-target-host {
      font-weight: 500;
      color: var(--text-primary);
      flex: 1;
      min-width: 150px;
    }

    .confirm-target-files {
      font-size: 13px;
      color: var(--text-secondary);
      min-width: 80px;
      text-align: right;
    }

    .confirm-target-breakdown {
      width: 100%;
      font-size: 12px;
      margin-top: 4px;
      padding-top: 6px;
      border-top: 1px solid var(--border-color);
    }

    .confirm-stat {
      margin-right: 12px;
    }

    .confirm-stat.added {
      color: var(--color-added);
    }

    .confirm-stat.modified {
      color: var(--color-modified);
    }

    .confirm-stat.deleted {
      color: var(--color-deleted);
    }

    .confirm-target-error {
      width: 100%;
      font-size: 12px;
      color: var(--color-deleted);
      margin-top: 4px;
    }

    /* 初期ローディングオーバーレイ */
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(30, 30, 30, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      flex-direction: column;
      gap: 20px;
    }

    .loading-overlay.hidden {
      display: none;
    }

    .loading-overlay .spinner-large {
      width: 80px;
      height: 80px;
      border: 5px solid var(--border-color);
      border-top-color: var(--accent-blue);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .loading-overlay .loading-text {
      font-size: 20px;
      color: var(--text-primary);
      font-weight: 500;
    }

    .loading-overlay .loading-subtext {
      font-size: 14px;
      color: var(--text-secondary);
      text-align: center;
      max-width: 400px;
      line-height: 1.5;
    }

    /* 進捗モーダル（ワイド版） */
    .progress-modal-wide {
      width: 600px;
      text-align: left;
    }

    .progress-targets-container {
      max-height: 400px;
      overflow-y: auto;
      padding: 8px;
      background: var(--bg-tertiary);
      border-radius: 6px;
    }

    /* 進捗ターゲットアイテム（Confirm画面と統一デザイン） */
    .progress-target-item {
      padding: 12px;
      margin-bottom: 8px;
      background: var(--bg-secondary);
      border-radius: 6px;
      border-left: 3px solid var(--accent-blue);
    }

    .progress-target-item:last-child {
      margin-bottom: 0;
    }

    .progress-target-item.completed {
      border-left-color: var(--color-added);
    }

    .progress-target-item.failed {
      border-left-color: var(--color-deleted);
    }

    .progress-target-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .progress-target-host {
      font-weight: 500;
      color: var(--text-primary);
    }

    .progress-target-files {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .progress-target-breakdown {
      font-size: 12px;
      margin-bottom: 10px;
    }

    .progress-stat {
      margin-right: 12px;
    }

    .progress-stat.added {
      color: var(--color-added);
    }

    .progress-stat.modified {
      color: var(--color-modified);
    }

    .progress-stat.deleted {
      color: var(--color-deleted);
    }

    .progress-target-progress {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 8px;
    }

    .progress-target-status {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }

    .progress-target-status.uploading {
      color: var(--accent-blue);
      background: rgba(86, 156, 214, 0.2);
    }

    .progress-target-status.completed {
      color: var(--color-added);
      background: rgba(78, 201, 176, 0.2);
    }

    .progress-target-status.failed {
      color: var(--color-deleted);
      background: rgba(244, 71, 71, 0.2);
    }

    .progress-target-file {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-style: italic;
    }

    /* ローディング進捗表示（ターゲット差分チェック用） */
    .loading-progress-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 32px;
      max-width: 600px;
      width: 100%;
    }

    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 4px solid var(--border-color);
      border-top-color: var(--accent-blue);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .loading-title {
      font-size: 18px;
      color: var(--text-primary);
      font-weight: 500;
    }

    .loading-progress-bar {
      width: 100%;
      height: 6px;
      background: var(--bg-tertiary);
      border-radius: 3px;
      overflow: hidden;
    }

    .loading-progress-fill {
      height: 100%;
      background: var(--accent-blue);
      transition: width 0.3s ease;
      border-radius: 3px;
    }

    .loading-progress-text {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .loading-checking-text {
      font-size: 13px;
      color: var(--text-secondary);
      font-style: italic;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .loading-results {
      width: 100%;
      margin-top: 8px;
      max-height: 300px;
      overflow-y: auto;
    }

    .loading-result-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      margin-bottom: 4px;
      background: var(--bg-tertiary);
      border-radius: 6px;
      border-left: 3px solid var(--border-color);
    }

    .loading-result-item.completed {
      border-left-color: var(--color-added);
    }

    .loading-result-item.error {
      border-left-color: var(--color-deleted);
    }

    .loading-result-item.pending {
      border-left-color: var(--text-secondary);
      opacity: 0.7;
    }

    .loading-result-icon {
      font-size: 14px;
      flex-shrink: 0;
    }

    .loading-result-item.completed .loading-result-icon {
      color: var(--color-added);
    }

    .loading-result-item.error .loading-result-icon {
      color: var(--color-deleted);
    }

    .loading-result-host {
      font-weight: 500;
      color: var(--text-primary);
      flex-shrink: 0;
      min-width: 120px;
    }

    .loading-result-details {
      font-size: 12px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .loading-result-item.error .loading-result-details {
      color: var(--color-deleted);
    }
  `;
}
