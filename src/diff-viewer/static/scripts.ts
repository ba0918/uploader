/**
 * diff-viewer JavaScript ロジック
 *
 * html.ts から分離された JavaScript 部分
 */

/**
 * diff-viewer のスクリプトを取得
 */
export function getScripts(): string {
  return `
    // アプリケーション状態
    const state = {
      ws: null,
      files: [],
      selectedFile: null,
      viewMode: 'side-by-side', // 'side-by-side' | 'unified'
      fileContents: new Map(), // path -> { remote: {local, remote} }
      base: '',
      target: '',
      diffMode: 'remote', // remoteモードのみサポート
      currentDiffTab: 'remote', // remoteモードのみ
      remoteTargets: [], // [{host, dest}]
      currentTargetIndex: 0, // 現在選択中のターゲットインデックス
      // 遅延読み込み対応
      lazyLoading: false, // 遅延読み込みモードか
      tree: null, // サーバーから受け取ったツリー構造（lazyLoading時のみ使用）
      loadingDirs: new Set(), // 読み込み中のディレクトリパス
      // アップロードボタン状態
      uploadDisabled: true, // ボタンが無効化されているか
      uploadDisabledReason: 'checking', // 'no_changes' | 'connection_error' | 'checking' | null
      uploadDisabledMessage: 'Checking for changes...' // ツールチップに表示するメッセージ
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
      remoteTargetBadge: document.getElementById('remote-target-badge'),
      targetSelector: document.getElementById('target-selector'),
      targetSelect: document.getElementById('target-select'),
      uploadTooltip: document.getElementById('upload-tooltip'),
      loadingOverlay: document.getElementById('loading-overlay')
    };

    // Uploadボタンの状態を更新
    function updateUploadButtonState(disabled, reason, message) {
      state.uploadDisabled = disabled;
      state.uploadDisabledReason = reason || null;
      state.uploadDisabledMessage = message || '';

      elements.uploadBtn.disabled = disabled;

      // ボタンテキストを更新
      if (reason === 'checking') {
        elements.uploadBtn.textContent = 'Checking...';
      } else {
        elements.uploadBtn.textContent = 'Upload';
      }

      // ツールチップを更新
      if (disabled && message) {
        elements.uploadTooltip.textContent = message;
      } else {
        elements.uploadTooltip.textContent = '';
      }
    }

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
        // ボタンを無効化
        updateUploadButtonState(true, 'connection_error', 'Disconnected from server');
        // ローディングオーバーレイを非表示
        elements.loadingOverlay.classList.add('hidden');
      };

      state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        elements.statusBar.className = 'status-bar disconnected';
        elements.statusText.textContent = 'Connection error';
        // ボタンを無効化
        updateUploadButtonState(true, 'connection_error', 'Connection lost');
        // ローディングオーバーレイを非表示
        elements.loadingOverlay.classList.add('hidden');
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

    // 進捗追跡用の状態
    const progressState = {
      targets: new Map() // host -> { fileIndex, totalFiles, status, currentFile }
    };

    // 進捗モーダルを表示
    function showProgressModal() {
      // 既存のモーダルを削除
      const existing = document.getElementById('progress-modal');
      if (existing) existing.remove();

      // 進捗状態をリセット
      progressState.targets.clear();

      const modal = document.createElement('div');
      modal.id = 'progress-modal';
      modal.className = 'progress-modal';

      // 複数ターゲットの場合は複数行表示
      const targetCount = state.remoteTargets.length;

      if (targetCount > 1) {
        // 複数ターゲット用のHTML
        const targetRows = state.remoteTargets.map((target, index) => \`
          <div class="progress-target-row" id="progress-target-\${index}">
            <div class="progress-target-header">
              <span class="progress-target-host">\${escapeHtml(target.host)}</span>
              <span class="progress-target-status" id="progress-status-\${index}">Waiting...</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar" id="progress-bar-\${index}" style="width: 0%"></div>
            </div>
            <div class="progress-target-details">
              <span id="progress-details-\${index}">0 / 0 files</span>
              <span class="progress-target-file" id="progress-file-\${index}"></span>
            </div>
          </div>
        \`).join('');

        modal.innerHTML = \`
          <div class="progress-modal-content progress-multi-target">
            <div class="progress-header">
              <div class="spinner"></div>
              <span class="progress-title">Uploading to \${targetCount} targets...</span>
            </div>
            <div class="progress-targets-container">
              \${targetRows}
            </div>
          </div>
        \`;
      } else {
        // 単一ターゲット用のHTML（従来と同じ）
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
      }

      document.body.appendChild(modal);
    }

    // 進捗を更新
    function updateProgress(data) {
      const targetCount = state.remoteTargets.length;

      if (targetCount > 1) {
        // 複数ターゲット用の更新
        const targetIndex = data.targetIndex ?? 0;
        const bar = document.getElementById('progress-bar-' + targetIndex);
        const details = document.getElementById('progress-details-' + targetIndex);
        const file = document.getElementById('progress-file-' + targetIndex);
        const status = document.getElementById('progress-status-' + targetIndex);
        const row = document.getElementById('progress-target-' + targetIndex);

        if (bar && details) {
          const percent = data.totalFiles > 0 ? ((data.fileIndex + 1) / data.totalFiles) * 100 : 0;
          bar.style.width = percent + '%';
          details.textContent = (data.fileIndex + 1) + ' / ' + data.totalFiles + ' files';

          if (file) {
            file.textContent = data.currentFile || '';
          }

          // ターゲット完了は最後のファイルが完了した時
          const isTargetCompleted = data.fileIndex + 1 === data.totalFiles && data.status === 'completed';
          const isTargetFailed = data.status === 'failed';

          if (status) {
            if (isTargetCompleted) {
              status.textContent = 'Completed';
              status.className = 'progress-target-status completed';
            } else if (isTargetFailed) {
              status.textContent = 'Failed';
              status.className = 'progress-target-status failed';
            } else {
              status.textContent = 'Uploading...';
              status.className = 'progress-target-status uploading';
            }
          }

          if (row) {
            if (isTargetCompleted) {
              row.classList.add('completed');
            } else if (isTargetFailed) {
              row.classList.add('failed');
            }
          }
        }

        // 進捗状態を保存
        progressState.targets.set(data.host, {
          fileIndex: data.fileIndex,
          totalFiles: data.totalFiles,
          status: data.status,
          currentFile: data.currentFile
        });
      } else {
        // 単一ターゲット用の更新（従来と同じ）
        const bar = document.getElementById('progress-bar');
        const details = document.getElementById('progress-details');
        const file = document.getElementById('progress-file');
        const host = document.getElementById('progress-host');

        if (bar && details && file && host) {
          const percent = data.totalFiles > 0 ? ((data.fileIndex + 1) / data.totalFiles) * 100 : 0;
          bar.style.width = percent + '%';
          details.textContent = (data.fileIndex + 1) + ' / ' + data.totalFiles + ' files';
          file.textContent = data.currentFile;
          host.textContent = 'Target: ' + data.host;
        }
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
        case 'directory_contents':
          handleDirectoryContents(message);
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
            // 接続エラーの場合はボタンを無効化
            updateUploadButtonState(true, 'connection_error', message.message);
          }
          break;
        case 'upload_state':
          // アップロードボタンの状態を更新
          updateUploadButtonState(
            message.data.disabled,
            message.data.reason,
            message.data.message
          );
          break;
      }
    }

    // 初期化データの処理
    function handleInit(data) {
      // ローディングオーバーレイを非表示
      elements.loadingOverlay.classList.add('hidden');

      // diff表示を常にリセット（ターゲット切り替え時の「Switching target...」を消すため）
      elements.diffContainer.innerHTML = '<div class="diff-placeholder">Select a file to view diff</div>';

      // 以前のターゲットインデックスを保存（再初期化時用）
      const previousTargetIndex = state.currentTargetIndex;
      const isReinit = state.files.length > 0;

      state.base = data.base;
      state.target = data.target;
      state.files = data.files;
      state.diffMode = 'remote'; // remoteモードのみサポート
      state.remoteTargets = data.remoteTargets || [];
      // 遅延読み込み設定を反映
      state.lazyLoading = data.lazyLoading || false;
      state.tree = data.tree || null;

      // ファイルコンテンツキャッシュをクリア（ターゲット切り替え時）
      if (isReinit) {
        state.fileContents.clear();
        state.selectedFile = null;
      }

      // 初期タブを設定（常にremote）
      state.currentDiffTab = 'remote';

      // UIを更新
      elements.baseBranch.textContent = data.base;
      elements.targetBranch.textContent = data.target;
      elements.addedCount.textContent = '+' + data.summary.added;
      elements.modifiedCount.textContent = '~' + data.summary.modified;
      elements.deletedCount.textContent = '-' + data.summary.deleted;
      elements.fileCount.textContent = data.summary.total + ' files';

      // タブ表示を更新
      updateTabVisibility();

      // ターゲットセレクターを初期化（初回のみ）または選択状態を維持
      if (isReinit) {
        // 再初期化時はセレクターの値を維持
        elements.targetSelect.value = previousTargetIndex.toString();
      } else {
        initTargetSelector();
      }

      // ファイルツリーを描画
      renderFileTree();

      // アップロードボタン状態を更新
      if (data.uploadButtonState) {
        updateUploadButtonState(
          data.uploadButtonState.disabled,
          data.uploadButtonState.reason,
          data.uploadButtonState.message
        );
      } else {
        // デフォルト: ファイルがない場合は無効化
        const hasFiles = data.summary.total > 0;
        updateUploadButtonState(
          !hasFiles,
          hasFiles ? null : 'no_changes',
          hasFiles ? null : 'No changes to upload'
        );
      }
    }

    // ターゲットセレクターを初期化
    function initTargetSelector() {
      if (state.remoteTargets.length <= 1) {
        // ターゲットが1つ以下なら非表示
        elements.targetSelector.classList.add('hidden');
        return;
      }

      // セレクターを表示
      elements.targetSelector.classList.remove('hidden');

      // オプションを生成
      elements.targetSelect.innerHTML = state.remoteTargets.map((target, index) =>
        \`<option value="\${index}">\${escapeHtml(target.host)}:\${escapeHtml(target.dest)}</option>\`
      ).join('');

      // 変更イベントリスナー
      elements.targetSelect.addEventListener('change', (e) => {
        const newIndex = parseInt(e.target.value, 10);
        if (newIndex !== state.currentTargetIndex) {
          switchTarget(newIndex);
        }
      });
    }

    // ターゲットを切り替え
    function switchTarget(newIndex) {
      state.currentTargetIndex = newIndex;

      // ローディングオーバーレイを表示
      elements.loadingOverlay.classList.remove('hidden');

      // ボタンを「確認中」状態に更新
      updateUploadButtonState(true, 'checking', 'Checking for changes...');

      // ローディング表示（サーバーからinitメッセージが来るまで）
      elements.diffContainer.innerHTML = \`
        <div class="loading">
          <div class="spinner"></div>
          Switching target...
        </div>
      \`;

      // ファイルツリーもローディング状態を表示
      elements.fileTree.innerHTML = \`
        <div class="loading" style="padding: 20px;">
          <div class="spinner"></div>
          Loading...
        </div>
      \`;

      // サーバーにターゲット変更を通知（サーバーからinitメッセージが再送信される）
      state.ws.send(JSON.stringify({
        type: 'switch_target',
        targetIndex: newIndex
      }));

      // タブバーのバッジも更新
      updateTabVisibility();
    }

    // タブの表示/非表示を更新
    function updateTabVisibility() {
      // gitタブは常に非表示、remoteタブは常に表示
      elements.tabGitDiff.classList.add('hidden');
      elements.tabRemoteDiff.classList.remove('hidden');

      // タブのアクティブ状態を更新（常にremote）
      elements.tabGitDiff.classList.remove('active');
      elements.tabRemoteDiff.classList.add('active');

      // リモートターゲットバッジを更新（現在選択中のターゲットを表示）
      if (state.remoteTargets.length > 0) {
        const target = state.remoteTargets[state.currentTargetIndex] || state.remoteTargets[0];
        elements.remoteTargetBadge.textContent = target.host;
        elements.remoteTargetBadge.classList.remove('hidden');
      } else {
        elements.remoteTargetBadge.classList.add('hidden');
      }

      // branch-info表示を調整（remoteモード）
      const branchInfo = document.querySelector('.branch-info');
      branchInfo.innerHTML = '<span>Local</span> &rarr; <span>Remote</span>';
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
    function toggleDirectory(path, node = null) {
      if (expandedDirs.has(path)) {
        expandedDirs.delete(path);
        renderFileTree();
      } else {
        expandedDirs.add(path);
        // 遅延読み込みモードで未読み込みのディレクトリの場合
        if (state.lazyLoading && node && node.loaded === false) {
          requestDirectoryExpand(path);
        } else {
          renderFileTree();
        }
      }
    }

    // ディレクトリ展開をサーバーにリクエスト
    function requestDirectoryExpand(path) {
      if (state.loadingDirs.has(path)) return; // 重複リクエスト防止

      state.loadingDirs.add(path);
      renderFileTree(); // ローディング表示のため再描画

      state.ws.send(JSON.stringify({
        type: 'expand_directory',
        path: path
      }));
    }

    // ディレクトリ内容レスポンスの処理
    function handleDirectoryContents(message) {
      const { path, children } = message;

      state.loadingDirs.delete(path);

      if (!state.tree) return;

      // ツリー内の該当ノードを更新
      const node = findTreeNode(state.tree, path);
      if (node) {
        node.children = children;
        node.loaded = true;
      }

      renderFileTree();
    }

    // ツリー内のノードをパスで検索
    function findTreeNode(nodes, path) {
      for (const node of nodes) {
        if (node.path === path) {
          return node;
        }
        if (node.children && path.startsWith(node.path + '/')) {
          const found = findTreeNode(node.children, path);
          if (found) return found;
        }
      }
      return null;
    }

    // ファイルツリーの描画
    function renderFileTree() {
      elements.fileTree.innerHTML = '';

      // ファイルが0件の場合はメッセージを表示
      const hasFiles = state.lazyLoading
        ? (state.tree && state.tree.length > 0)
        : (state.files && state.files.length > 0);

      if (!hasFiles) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'empty-tree-message';
        messageDiv.textContent = 'No changes detected for this target';
        elements.fileTree.appendChild(messageDiv);
        return;
      }

      // 遅延読み込みモードの場合はサーバーから受け取ったツリーを使用
      if (state.lazyLoading && state.tree) {
        elements.fileTree.appendChild(renderLazyTree(state.tree, 0));
      } else {
        // 通常モード：filesからツリーを構築
        const tree = buildFileTree(state.files);
        elements.fileTree.appendChild(renderNode(tree));
      }
    }

    // 遅延読み込みモード用ツリーレンダリング
    function renderLazyTree(nodes, depth) {
      const fragment = document.createDocumentFragment();
      const indent = depth * 16;

      nodes.forEach(node => {
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'tree-node';

        if (node.type === 'directory') {
          // ディレクトリノード
          const isExpanded = expandedDirs.has(node.path);
          const isLoading = state.loadingDirs.has(node.path);

          const itemDiv = document.createElement('div');
          itemDiv.className = 'tree-item';
          itemDiv.style.paddingLeft = (8 + indent) + 'px';

          itemDiv.innerHTML = \`
            <span class="tree-toggle \${isExpanded ? '' : 'collapsed'}">\${isLoading ? '' : '&#9660;'}</span>
            <span class="tree-icon folder">\${isLoading ? '&#8987;' : (isExpanded ? '&#128194;' : '&#128193;')}</span>
            <span class="tree-name directory">\${escapeHtml(node.name)}</span>
            <span class="tree-count">\${node.fileCount ?? ''}</span>
          \`;

          itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isLoading) {
              toggleDirectory(node.path, node);
            }
          });

          nodeDiv.appendChild(itemDiv);

          // 子要素のコンテナ
          const childrenDiv = document.createElement('div');
          childrenDiv.className = 'tree-children' + (isExpanded ? '' : ' collapsed');

          if (isExpanded && node.children && node.children.length > 0) {
            childrenDiv.appendChild(renderLazyTree(node.children, depth + 1));
          } else if (isExpanded && isLoading) {
            // ローディング中の表示
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'tree-item';
            loadingDiv.style.paddingLeft = (8 + indent + 16) + 'px';
            loadingDiv.innerHTML = '<span class="tree-icon">&#8987;</span><span class="tree-name" style="color: var(--text-secondary)">Loading...</span>';
            childrenDiv.appendChild(loadingDiv);
          }

          nodeDiv.appendChild(childrenDiv);
        } else {
          // ファイルノード
          nodeDiv.dataset.path = node.path;

          const itemDiv = document.createElement('div');
          const fileInState = state.files.find(f => f.path === node.path);
          itemDiv.className = 'tree-item' + (state.selectedFile?.path === node.path ? ' selected' : '');
          itemDiv.style.paddingLeft = (8 + indent) + 'px';

          // remoteモードの場合はremoteStatusを優先
          // remoteモードのステータス表示
          const displayStatus = fileInState?.remoteStatus
            ? fileInState.remoteStatus
            : (node.status || 'U');

          itemDiv.innerHTML = \`
            <span class="tree-toggle empty"></span>
            <span class="tree-icon file">&#128196;</span>
            <span class="tree-name" title="\${escapeHtml(node.path)}">\${escapeHtml(node.name)}</span>
            <span class="tree-status status-\${displayStatus}">\${displayStatus}</span>
          \`;

          itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            // state.filesからファイル情報を取得、なければnodeから作成
            const file = fileInState || { path: node.path, name: node.name, status: node.status };
            selectFile(file);
          });

          nodeDiv.appendChild(itemDiv);
        }

        fragment.appendChild(nodeDiv);
      });

      return fragment;
    }

    // 通常モード用ツリーレンダリング（再帰）
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

        // remoteモードのステータス表示
        const displayStatus = file.remoteStatus
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

      // キャッシュチェック - remoteデータがあるか
      const cached = state.fileContents.get(file.path);
      if (cached?.remote) {
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
      if (!cached?.remote) return;

      // remoteモードのdiff表示
      renderDiff(file, cached.remote.local, cached.remote.remote, 'remote');
    }

    // ファイル内容レスポンスの処理
    function handleFileResponse(message) {
      // 既存のキャッシュを取得または新規作成
      const cached = state.fileContents.get(message.path) || {};

      // remoteデータをキャッシュに保存
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

      // ステータス更新
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
        if (statusBadge) {
          statusBadge.className = 'tree-status status-' + file.remoteStatus;
          statusBadge.textContent = file.remoteStatus;
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
        const target = state.remoteTargets[state.currentTargetIndex] || state.remoteTargets[0];
        leftHeader = 'Local';
        rightHeader = target ? \`Remote (\${target.host}:\${target.dest})\` : 'Remote';
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
        const target = state.remoteTargets[state.currentTargetIndex] || state.remoteTargets[0];
        headerInfo = \`\${file.path} (Local vs \${target ? target.host + ':' + target.dest : 'Remote'})\`;
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
  `;
}
