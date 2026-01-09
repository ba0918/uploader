# 要件

簡単にまとめると

- gitブランチ間の差分を抽出し、設定に基づきアップロードする
- またはローカルのファイルを設定に基づきアップロードする
- 差分をアップロード前に目視でわかりやすく確認できる

## 開発環境

- Deno

## インストール

```sh
deno install --allow-read --allow-write --allow-net --allow-run -n uploader ./main.ts
```

## コマンド

```sh
uploader <profile>                          # 指定プロファイルの設定でアップロード
uploader --config=example.yaml <profile>    # 設定ファイルを明示的に指定
uploader --diff <profile>                   # アップロード前にdiff viewerで確認
uploader --dry-run <profile>                # dry-run（実際のアップロードは行わない）

# gitモード用オプション（設定ファイルより優先）
uploader --base=develop --target=feature/xxx <profile>

# その他オプション
uploader --delete <profile>                 # リモートの余分なファイルを削除（mirror同期）
uploader --parallel <profile>               # 複数ターゲットへ並列にアップロード
uploader --verbose <profile>                # 詳細ログ出力
uploader --quiet <profile>                  # 最小限の出力
uploader --port=8080 --diff <profile>       # diff viewerのポート指定

uploader --version                          # バージョン表示
uploader --help                             # ヘルプ表示

# --diffモード指定（Phase 7）
uploader --diff development                 # git diff（gitモードのデフォルト）
uploader --diff=git development             # 明示的にgit diff
uploader --diff=remote development          # ローカル vs リモート比較
uploader --diff=both development            # 両方（タブ切り替え）

uploader --diff staging                     # remote diff（fileモードのデフォルト）
uploader --diff=git staging                 # エラー（fileモードでは非対応）
```

## 設定ファイル

デフォルトの検索パス（優先順）:

1. `--config` で指定されたパス
2. `./uploader.yaml`
3. `./uploader.yml`
4. `~/.config/uploader/config.yaml`

---

## Configuration

```yaml
_global:
  # 名前付きignoreグループ（推奨）
  ignore_groups:
    common:
      - "*.log"
      - ".git/"
      - ".claude/"
      - "node_modules/"
    template:
      - "template/"
    property:
      - "property/"
  # デフォルトで適用するグループ（ignore未指定時）
  default_ignore: [common]

  # 後方互換: 旧来のignore（非推奨）
  # ignore:
  #   - "*.log"
  #   - ".git/"

# ===========================================
# プロファイル: development（gitモード）
# ===========================================
development:
  from:
    type: "git"
    base: "origin/main" # 比較元ブランチ（CLI: --base で上書き可能）
    target: "HEAD" # 比較先（CLI: --target で上書き可能）
    include_untracked: false # 未追跡ファイルを含むか

  to:
    targets:
      - host: "web1.example.com"
        protocol: "sftp" # sftp / scp
        port: 22
        user: "${DEPLOY_USER}"
        auth_type: "ssh_key"
        key_file: "~/.ssh/id_rsa"
        dest: "/var/www/html/"

        # 同期オプション
        sync_mode: "update" # update: 追加・更新のみ / mirror: 完全同期（--delete時のみ有効）
        preserve_permissions: true
        preserve_timestamps: true

        # 接続オプション
        timeout: 30 # 秒
        retry: 3

      - host: "web2.example.com"
        protocol: "sftp"
        port: 22
        user: "${DEPLOY_USER}"
        auth_type: "password"
        password: "${DEPLOY_PASSWORD}" # 環境変数から取得、未設定ならプロンプト
        dest: "/var/www/html/"
        sync_mode: "update"
        timeout: 30
        retry: 3

# ===========================================
# プロファイル: staging（fileモード）
# ===========================================
staging:
  from:
    type: "file"
    src: # アップロード対象（複数指定可、glob対応）
      - "dist/" # ディレクトリ（末尾/で中身のみ）
      - "public/assets/"
    # 注: "dist/" → dest直下に中身を展開
    #     "dist"  → dest/dist/ として作成

  to:
    # defaultsでターゲット共通のignoreを設定
    defaults:
      host: "staging.example.com"
      protocol: "sftp"
      port: 22
      user: "deployer"
      auth_type: "ssh_key"
      key_file: "~/.ssh/deploy_key"
      sync_mode: "update"
      timeout: 30
      retry: 3
      ignore:
        use: [common, template]  # グループを選択
    targets:
      - dest: "/var/www/staging-a/"
        # ignore未指定 → defaults.ignoreを使用
      - dest: "/var/www/staging-b/"
        ignore:
          use: [common, property]  # defaults.ignoreを上書き
          add: ["special_b/"]      # 追加パターン
      - dest: "/var/www/staging-c/"
        ignore:
          use: []  # 何も除外しない（明示的）

# ===========================================
# プロファイル: local（ローカルコピー）
# ===========================================
local:
  from:
    type: "file"
    src:
      - "dist/"

  to:
    targets:
      - host: "localhost"
        protocol: "local" # ローカルファイルコピー
        dest: "/tmp/deploy-test/"
        sync_mode: "mirror"
```

---

## CLI引数と設定ファイルの優先順位

```
CLI引数 > 設定ファイル > デフォルト値
```

| 項目          | CLI        | 設定ファイル        | デフォルト           |
| ------------- | ---------- | ------------------- | -------------------- |
| base branch   | `--base`   | `from.base`         | **エラー**（必須）   |
| target branch | `--target` | `from.target`       | `HEAD`               |
| 削除同期      | `--delete` | `sync_mode: mirror` | `update`（削除なし） |

---

## 認証情報の扱い

### 優先順位

1. 環境変数（`${VAR_NAME}` 形式で展開）
2. 実行時プロンプト入力（環境変数が未設定の場合）

### 推奨: SSH鍵認証

```yaml
auth_type: "ssh_key"
key_file: "~/.ssh/id_rsa"
# パスフレーズ付き鍵の場合は実行時に入力を求める
```

### パスワード認証（非推奨）

```yaml
auth_type: "password"
password: "${DEPLOY_PASSWORD}" # 必ず環境変数を使用
```

> ⚠️ 設定ファイルに平文パスワードを記載しないこと

---

## diff viewer の仕様

### 起動フロー

1. `uploader --diff <profile>` 実行
2. 差分を計算
3. ローカルにWebサーバを起動（デフォルト: `localhost:3000`、`--port`
   で変更可能）
4. ブラウザを自動で開く
5. ユーザーが確認

### UI構成

- **左ペイン**: ディレクトリツリー（変更ファイル一覧）
  - 追加: 緑
  - 変更: 黄
  - 削除: 赤
- **右ペイン**: diff viewer（シンタックスハイライト付き）
  - side-by-side または unified 表示切替

### 終了フロー

- 「アップロード実行」ボタン → サーバ終了 → CLIでアップロード開始
- 「キャンセル」ボタン → サーバ終了 → CLIでキャンセルメッセージ表示
- WebSocket接続断（タブを閉じた等） → サーバ終了 → CLIでキャンセル扱い

### ブラウザなし環境のフォールバック

`--no-browser` オプションまたはブラウザ起動失敗時:

- CUIで差分一覧を表示
- `y/n` でアップロード続行を確認

---

## エラーハンドリング

### アップロード失敗時

| 状況             | 動作                                                                          |
| ---------------- | ----------------------------------------------------------------------------- |
| 接続失敗         | リトライ（設定回数まで）→ 失敗ならエラー終了                                  |
| 認証失敗         | 即時エラー終了                                                                |
| ファイル転送失敗 | リトライ → 失敗なら該当ファイルをスキップして続行 or エラー終了（`--strict`） |
| 複数ターゲット   | 1つ失敗しても他は続行、最後にサマリー表示                                     |

### 終了コード

| コード | 意味                 |
| ------ | -------------------- |
| 0      | 成功                 |
| 1      | 一般エラー           |
| 2      | 設定ファイルエラー   |
| 3      | 認証エラー           |
| 4      | 接続エラー           |
| 5      | 一部ファイル転送失敗 |

---

## ログ出力

- デフォルト: 標準出力に進捗表示
- `--verbose`: 詳細ログ（転送ファイル一覧、タイミング等）
- `--quiet`: エラーのみ
- `--log-file=path`: ファイルに出力

---

## CUI デザイン仕様

モダンでグラフィカルなターミナルUIを目指すのだ。

### カラースキーム

```
┌─────────────────────────────────────────┐
│  色          用途                        │
├─────────────────────────────────────────┤
│  緑 (green)   成功、追加されたファイル     │
│  赤 (red)     エラー、削除されたファイル   │
│  黄 (yellow)  警告、変更されたファイル     │
│  青 (blue)    情報、プロンプト            │
│  シアン       パス、URL                   │
│  グレー       補助情報、タイムスタンプ     │
│  白 (bold)    重要な情報、見出し          │
└─────────────────────────────────────────┘
```

### 起動時バナー

```
╭──────────────────────────────────────────╮
│                                          │
│   ⬆  uploader v1.0.0                     │
│      Git-based deployment tool           │
│                                          │
╰──────────────────────────────────────────╯
```

### プロファイル読み込み表示

```
┌ Loading profile: development
│
├─ From: git (origin/main → HEAD)
├─ To:   2 targets
│   ├─ web1.example.com (sftp)
│   └─ web2.example.com (sftp)
│
└─ Ignore: 4 patterns
```

### 差分サマリー表示

```
┌ Changes detected
│
│   +  12 files added
│   ~   5 files modified
│   -   3 files deleted
│   ─────────────────
│      20 files total (1.2 MB)
│
├─ Added
│   ├─ src/components/Button.tsx
│   ├─ src/components/Modal.tsx
│   └─ ... and 10 more
│
├─ Modified
│   ├─ src/index.ts
│   └─ package.json
│
└─ Deleted
    └─ src/old-component.tsx
```

### プログレス表示（アップロード中）

```
┌ Uploading to web1.example.com
│
│  ████████████░░░░░░░░  60% (12/20 files)
│
│  ↑ src/components/Button.tsx (2.3 KB)
│
└─ Elapsed: 00:05  ETA: 00:03
```

複数ターゲットの場合：

```
┌ Upload Progress
│
│  web1.example.com  ████████████████████ 100% ✓
│  web2.example.com  ████████████░░░░░░░░  60%
│
└─ Total: 32/40 files
```

### スピナーアニメーション

処理中の待機状態：

```
◐ Connecting to web1.example.com...
◓ Calculating diff...
◑ Starting upload...
```

（`◐ ◓ ◑ ◒` のローテーション）

### インタラクティブ確認

```
┌ Confirm Upload
│
│  Target:  web1.example.com:/var/www/html/
│  Files:   20 files (1.2 MB)
│  Mode:    update (deletions: no)
│
└─ Proceed with upload? (y/N): █
```

### 成功時の表示

```
╭──────────────────────────────────────────╮
│                                          │
│   ✓  Upload completed successfully!      │
│                                          │
│      20 files uploaded to 2 targets      │
│      Total time: 00:12                   │
│                                          │
╰──────────────────────────────────────────╯
```

### エラー時の表示

```
╭──────────────────────────────────────────╮
│                                          │
│   ✗  Upload failed                       │
│                                          │
│      Connection refused: web2.example.com│
│      (Attempted 3 retries)               │
│                                          │
│   Partial results:                       │
│   ├─ web1.example.com: ✓ 20/20 files     │
│   └─ web2.example.com: ✗ 0/20 files      │
│                                          │
╰──────────────────────────────────────────╯
```

### 警告表示

```
⚠  Warning: 3 files were skipped (permission denied)
   └─ Use --verbose to see details
```

### dry-run モード表示

```
┌ DRY RUN MODE (no files will be uploaded)
│
│  Would upload 20 files to 2 targets:
│
│  web1.example.com:/var/www/html/
│   ├─ + src/components/Button.tsx (2.3 KB)
│   ├─ + src/components/Modal.tsx (1.8 KB)
│   ├─ ~ src/index.ts (0.5 KB)
│   └─ ... and 17 more
│
│  web2.example.com:/var/www/html/
│   └─ (same as above)
│
└─ Total: 20 files (1.2 MB)
```

### ヘルプ表示

```
Usage: uploader [options] <profile>

Options:
  --config <path>    Config file path
  --diff             Open diff viewer before upload
  --dry-run          Simulate upload without changes
  --delete           Delete remote files not in source
  --base <branch>    Base branch for git diff
  --target <branch>  Target branch for git diff
  --verbose          Show detailed output
  --quiet            Show errors only
  --port <number>    Port for diff viewer (default: 3000)
  --no-browser       Don't open browser for diff viewer
  --strict           Exit on any file transfer error
  --log-file <path>  Write logs to file
  --concurrency <n>  Max concurrent remote status checks (default: 10)
  --parallel         Upload to multiple targets in parallel
  --version          Show version
  --help             Show this help

Examples:
  uploader development
  uploader --diff --base=main staging
  uploader --dry-run --delete production
```

### ボックス描画文字

```
角:      ╭ ╮ ╰ ╯ (丸角) or ┌ ┐ └ ┘ (直角)
線:      │ ─
分岐:    ├ ┤ ┬ ┴ ┼
ツリー:  ├─ └─
```

### UI実装（自前実装）

Deno標準ライブラリの `@std/fmt/colors` をベースに自前実装。

| モジュール           | 機能                                  |
| -------------------- | ------------------------------------- |
| `src/ui/colors.ts`   | カラー定義、ボックス文字、アイコン    |
| `src/ui/banner.ts`   | 起動バナー表示                        |
| `src/ui/logger.ts`   | ログ出力、ボックス表示、サマリー表示  |
| `src/ui/spinner.ts`  | スピナーアニメーション                |
| `src/ui/progress.ts` | プログレスバー（単一/複数ターゲット） |
| `src/ui/prompt.ts`   | インタラクティブ確認（y/n、入力）     |

---

## 今後の検討事項

- [x] rsync over SSH 対応（Phase 9.2.5で実装済み）
- [x] 並列アップロード（複数ターゲット同時）（Phase 10.4で実装済み）
- [ ] FTP/FTPS 対応
- [ ] バックアップ機能（上書き前にリモートをバックアップ）
- [ ] Webhook通知（Slack等）
- [ ] 大量ファイル表示時の仮想スクロール（Phase 9.4）
