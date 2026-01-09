# uploader 実装TODO

完了済みタスクは [TODO_ARCHIVE.md](./TODO_ARCHIVE.md) を参照。

---

## 進行中 (Phase 9.4: diff viewer 仮想スクロール)

**目的**: 大量ファイル表示時のブラウザパフォーマンス改善

- [ ] 表示範囲のDOMのみ生成
- [ ] スクロール位置に応じて動的にDOM更新
- [ ] または: ページネーション（100件ずつ表示）

---

## 進行中 (Phase 10: コードリファクタリング)

コードレビューで発見された改善点の対応。

### Phase 10.1: SSHベースアップローダーの共通基底クラス化 ✅ 完了

- [x] src/upload/ssh-base.ts 作成
  - `SshBaseUploader` 抽象クラス
  - 共通オプション型 `SshBaseOptions`
  - `checkSshpass()`, `runWithSshpass()`, `buildSshArgs()` 共通化
  - `testConnection()`, `connect()`, `disconnect()` 共通化
  - `mkdir()`, `delete()`, `readFile()` 共通化（useSudoオプション付き）
- [x] src/upload/scp.ts を `SshBaseUploader` 継承に変更（468行→169行）
- [x] src/upload/rsync.ts を `SshBaseUploader` 継承に変更（773行→501行）
- [x] 既存テストが通ることを確認

### Phase 10.2: formatFileSize() の重複解消 ✅ 完了

- [x] src/utils/format.ts 作成
  - `formatFileSize()` を移動
  - `formatDuration()` も移動
- [x] src/file/collector.ts: utils/format.ts から再エクスポート
- [x] src/ui/logger.ts: utils/format.ts からインポート・再エクスポート
- [x] src/utils/mod.ts にエクスポート追加

### Phase 10.3: logger統一（優先度: 中）✅ 完了

**問題**: `console.error` が直接使用されている箇所がある

**対応内容**:

- [x] src/upload/mod.ts:130 - `console.error` を `logVerbose()` に置換
- [x] src/diff-viewer/server.ts - 直接 `console.error` を使用していた3箇所を
      `debugError()` に変更
- [x] src/cli/args.ts:79 - `console.warn` を `logWarning()` に置換

**除外した箇所**（意図的なconsole使用）:

- src/cli/args.ts:53 - ヘルプ表示（ログレベルに関係なく表示すべき）
- src/diff-viewer/\* - UI表示モジュール
- src/diff-viewer/static/html.ts - ブラウザ側JavaScript（対象外）
- src/ui/\* - logger自体のコア実装（console使用は正しい）

### Phase 10.4: 並列ターゲットアップロード ✅ 完了

**問題**: 複数ターゲットへのアップロードが順次処理

**対応内容**:

- [x] `--parallel` CLIオプション追加（src/cli/args.ts、src/types/cli.ts）
- [x] `UploadOptions` に `parallel` オプション追加（src/types/upload.ts）
- [x] `uploadToTargets()` で並列アップロード対応（src/upload/mod.ts）
- [x] main.ts から `parallel` オプションを渡す
- [x] テスト追加（tests/cli/args_test.ts）

### Phase 10.5: 複数ターゲット対応のUI改善 ✅ 完了

**問題**:

1. diff
   viewerで複数ターゲットがある場合、最初のターゲット（targets[0]）との差分しか表示されない
2. 並列アップロード時の進捗表示がどのホストの進捗か不明確

**対応内容**:

- [x] diff viewer: ターゲット選択UIを追加
  - [x] 現在表示中のターゲット名をヘッダーに明示
  - [x] ターゲット選択ドロップダウンを追加
  - [x] ターゲット切り替え時にリモート差分を再取得
  - [x] `WsSwitchTargetMessage` 型追加（src/types/diff-viewer.ts）
  - [x] サーバー側でターゲット切り替え処理追加（src/diff-viewer/server.ts）
- [x] 進捗表示: 複数ターゲットの並列表示
  - [x] diff viewer（ブラウザ）: ホストごとに進捗行を分けて表示
  - [x] CLI: 複数行表示でホストごとの進捗を表示（src/ui/logger.ts）

### Phase 10.6: 将来の改善項目対応 ✅ 完了

**対応内容**:

- [x] 空catchブロックでのverboseログ追加（9箇所）
  - src/ui/logger.ts: ログファイル書き込み/クローズ失敗時
  - src/upload/rsync.ts: 一時ファイル削除失敗時（3箇所）
  - src/upload/scp.ts: 一時ファイル削除失敗時
  - src/upload/ssh-base.ts: sshpassチェック失敗時、一時ディレクトリ削除失敗時
  - src/diff-viewer/server.ts:
    ステータスチェック失敗時（2箇所）、Uploader切断失敗時
- [x] Uploader接続のアイドルタイムアウト設定追加（diff-viewer対応）
  - `DiffViewerOptions.uploaderIdleTimeout` オプション追加（デフォルト: 5分）
  - 30秒ごとにアイドルチェックを実行
  - アイドル状態が続いた場合は自動切断
- [x] --verbose / --log-file 時のログ情報量を増加
  - main.ts: 設定読み込み、Git差分取得、ファイル収集、アップロード前後の詳細ログ
  - src/upload/mod.ts: 接続、削除、アップロード処理の詳細ログ
- [x] snake_case/camelCase 統一の確認
  - 設定ファイル（YAML）: snake_case（YAMLの慣例）
  - アップローダーオプション: camelCase（TypeScriptの慣例）
  - 変換は upload/mod.ts の createUploader() で一貫して行われており問題なし

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
