# uploader 実装TODO

完了済みタスクは [TODO_ARCHIVE.md](./TODO_ARCHIVE.md) を参照。

---

## セキュリティ修正（完了）

- [x] コマンドインジェクション脆弱性の修正 (`utils/shell.ts`)
  - `escapeShellArg()` 関数を追加
  - ssh-base.ts の `mkdir()`, `delete()`, `readFile()` で使用

---

## リファクタリング: 原則違反の修正

### 高優先度

- [x] 認証エラー検出パターンの共通化 (`utils/error.ts`)
  - `isSshAuthError()`, `isSftpAuthError()`, `isConnectionRefusedError()` を追加
  - scp.ts, rsync.ts, ssh-base.ts, sftp.ts で利用
- [x] upload() 処理フローの共通化 (`ssh-base.ts`)
  - テンプレートメソッドパターンで基底クラスに実装
  - 接続確認 → ディレクトリ処理 → 親ディレクトリ確保 → アップロード
  - scp.ts, rsync.ts の重複コードを削除

### 中優先度

- [x] Uploader インターフェースの分割 (ISP)
  - `Uploader`: 基本操作（connect, upload, delete, etc.）
  - `BulkUploadCapable`: bulkUpload()
  - `DiffCapable`: getDiff()
  - `hasBulkUpload()`, `hasDiff()` 型ガード関数追加
- [x] "No source for file upload" エラーメッセージの定数化 (`utils/error.ts`)
  - `ERROR_MESSAGES.NO_SOURCE_FOR_FILE_UPLOAD` として定義
  - ssh-base.ts, sftp.ts, local.ts で使用

### 低優先度

- [x] マジックナンバーの定数化 (`utils/constants.ts`)
  - `FILE_TRANSFER.CHUNK_SIZE` (64KB)
  - `BINARY_CHECK.CHECK_LENGTH` (8192バイト)
- [x] チャンク読み込みロジックの共通化
  - 評価の結果、共通化しない判断（書き込み先が異なるため抽象化により複雑性が増す）

---

## リファクタリング: DRY原則違反の修正（完了）

**目的**: 重複コードの統合による保守性向上

### 高優先度

- [x] SSH接続設定の共通化 (`utils/ssh-config.ts`)
  - `buildSshArgs()` が ssh-base.ts, rsync.ts, scp.ts で重複
  - StrictHostKeyChecking, ConnectTimeout, ポート設定
- [x] レガシーモード設定の共通化
  - KexAlgorithms, HostKeyAlgorithms, PubkeyAcceptedAlgorithms が4ファイルで分散

### 中優先度

- [x] リトライロジックの共通化 (`utils/retry.ts`)
  - ssh-base.ts と sftp.ts で同じ指数バックオフ実装
- [x] エラーハンドリングの共通化 (`utils/retry.ts` に含む)
  - `getErrorMessage()`, `toError()` を追加
- [x] ディレクトリ操作の共通化 (`utils/directory.ts`)
  - `getParentDir()`, `ensureParentDir()` を追加
  - sftp.ts, scp.ts, rsync.ts, local.ts で利用

### 低優先度

- [x] バッファ→一時ファイル書き込みの共通化 (`ssh-base.ts`)
  - `uploadBuffer()`, `uploadFileFromPath()` を追加
  - scp.ts, rsync.ts の重複コードを削除
- [x] 設定検証パターンの共通化 (`config/validator.ts`)
  - `VALID_PROTOCOLS`, `VALID_AUTH_TYPES`, `VALID_SYNC_MODES` を定数化

---

## リファクタリング: コード分割による保守性向上

**目的**: 肥大化したファイルを分割して責任を明確化

### html.ts の分割（完了）

- [x] `styles.ts` に CSS を分離
- [x] `scripts.ts` に JavaScript を分離
- [x] `html.ts` を更新して分離したモジュールをインポート

### server.ts の責任分離（完了）

- [x] `ws-handler.ts` に WebSocket メッセージハンドラを分離
- [x] `file-content.ts` にローカル/リモートファイル取得ロジックを分離
- [x] `server.ts` を HTTP サーバ処理に集中

---

## diff viewer: 全ターゲット事前チェック機能（完了）

**目的**: UX改善 - 全ターゲットの差分を事前にチェックし、正確なファイル数表示とアップロード動作の予測可能性を向上

### 背景

解決済みの問題:
- ~~ターゲット切替時に差分チェックが行われる遅延実行設計~~
- ~~ユーザーが確認していないターゲットはアップロード対象外になる~~
- ~~Target Detailsのファイル数表示が不正確（未確認ターゲットは0件表示）~~

### Phase 1: 全ターゲット並列チェック（完了）

- [x] 初回ローディング時に全ターゲットの差分を並列チェック
  - `checkAllTargetsDiff()` 関数を追加 (`ws-handler.ts`)
  - 同時実行数を制限（デフォルト: 3、`concurrency`オプションで調整可能）
  - 結果を `diffCacheByTarget` にキャッシュ

- [x] ローディング進捗の表示
  - WebSocketメッセージ `loading_progress` を追加 (`types/diff-viewer.ts`)
  - 現在チェック中のターゲット名を表示
  - 完了ターゲット数/全ターゲット数を表示
  - ブラウザUI側でプログレスバーとターゲット別結果を表示 (`scripts.ts`, `styles.ts`)

- [x] ターゲット切替時のキャッシュ参照
  - キャッシュがあればネットワーク通信なしで即時表示
  - `handleSwitchTarget()` を修正

### Phase 2: Confirm画面の改善（完了）

- [x] 各ターゲットのアップロード内容を明示
  - ターゲットごとのファイル数を表示
  - 変更種別ごとの内訳（追加/変更/削除）を表示
  - 例: `localhost:/var/www - 8228 files (+5000 new, ~3200 modified, -28 deleted)`

- [x] Confirmダイアログのレイアウト改善
  - 全ターゲットの概要を一覧表示
  - 0件のターゲットは「No changes」と明示
  - エラーが発生したターゲットはエラーメッセージを表示

---

## リファクタリング: デッドコード削除と後方互換処理の整理（完了）

**目的**: 未使用コードの削除と deprecated フィールドの廃止による保守性向上

### 高優先度

- [x] `formatDuration()` 重複削除 (`upload/progress.ts`)
  - `utils/format.ts` と完全に同じ実装が存在していたため削除
  - テストは `utils/format.ts` からインポートするよう修正

- [x] `rsyncDiffResult` deprecated フィールド削除 (`ws-handler.ts`)
  - `diffCacheByTarget` に移行済み
  - 型定義・初期化・リセット処理から削除

### 中優先度

- [x] CUIモードの `changedFilesByTarget` 対応
  - `remote-diff.ts` に `collectChangedFilesByTarget()` を追加
  - `CuiConfirmResult` 型を更新
  - `browser.ts` の `cuiConfirm()` を修正
  - `mod.ts` を `changedFilesByTarget` を使うように変更
  - `main.ts` の後方互換分岐を削除
  - `DiffViewerResult` から deprecated な `changedFiles` を削除

- [x] `isDiffViewerSupported()` 削除 (`diff-viewer/mod.ts`)
  - 常に `true` を返すだけの無意味な関数を削除
  - テストも削除

- [x] `parseYesNo()` 削除 (`browser.ts`)
  - テスト以外で使われていなかったため関数自体を削除
  - テストも削除

### 低優先度

- [x] `getServerUrl()` エクスポート削除 (`diff-viewer/mod.ts`)
  - 外部から使われていないためエクスポートを削除
  - 内部インポートは維持

---

## 保留中 (Phase 9.4: diff viewer 仮想スクロール)

**目的**: 大量ファイル表示時のブラウザパフォーマンス改善

- [ ] 表示範囲のDOMのみ生成
- [ ] スクロール位置に応じて動的にDOM更新
- [ ] または: ページネーション（100件ずつ表示）

---

## 技術メモ

### 依存関係

```json
{
  "imports": {
    "@std/yaml": "jsr:@std/yaml@^1",
    "@std/path": "jsr:@std/path@^1",
    "@std/fs": "jsr:@std/fs@^1",
    "@std/fmt": "jsr:@std/fmt@^1",
    "@std/cli": "jsr:@std/cli@^1",
    "ssh2": "npm:ssh2@^1"
  }
}
```

### 終了コード

| コード | 意味                 |
| ------ | -------------------- |
| 0      | 成功                 |
| 1      | 一般エラー           |
| 2      | 設定ファイルエラー   |
| 3      | 認証エラー           |
| 4      | 接続エラー           |
| 5      | 一部ファイル転送失敗 |

### 結合テストの実行方法

```bash
# 1. SSH鍵を生成（初回のみ）
./tests/integration/scripts/setup-ssh-keys.sh

# 2. Dockerコンテナを起動
docker compose -f docker-compose.test.yml up -d

# 3. テストを実行
deno test tests/integration/

# 4. コンテナを停止
docker compose -f docker-compose.test.yml down
```
