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

### Phase 10.3: logger統一（優先度: 中）

**問題**: `console.error` が直接使用されている箇所がある

- src/upload/mod.ts:130

**タスク**:

- [ ] `console.error` を `logError()` または `logVerbose()` に置換
- [ ] 他のファイルでも同様の箇所がないか確認・修正

### Phase 10.4: 並列ターゲットアップロード（優先度: 中）

**問題**: 複数ターゲットへのアップロードが順次処理

- src/upload/mod.ts:356

**タスク**:

- [ ] `--parallel` CLIオプション追加
- [ ] `uploadToTargets()` で並列アップロード対応
- [ ] 進捗表示の並列対応

---

## 将来の改善（優先度: 低）

- [ ] snake_case/camelCase の統一（設定↔アップローダー間）
- [ ] 空catchブロックでのverboseログ追加
- [ ] Uploader接続のタイムアウト設定追加（diff-viewer長時間接続対策）

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
