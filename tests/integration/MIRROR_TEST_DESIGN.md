# Phase I1: mirrorモード統合テスト設計

## 目的

Phase C1-C6で実装したmirrorモード機能の実機動作検証:

- リモート専用ファイルが正しく削除される
- ignoreパターンにマッチするファイルは削除されない
- prepareMirrorSync()が全プロトコルで正しく動作する

## テスト戦略

### テストファイル構成

- **ファイル名**: `tests/integration/5_mirror_mode_test.ts`
- **テスト対象**: rsync, sftp, scp, local の各プロトコル
- **テスト種類**: 統合テスト（Docker環境使用）

### テストシナリオ

#### Scenario 1: rsync + mirror + ignore (CUI)

**目的**: rsyncプロトコルでmirrorモード + ignoreパターンが動作することを検証

**準備**:

- ローカル: `file1.txt`, `file2.txt`
- リモート: `file1.txt`, `old.txt`, `debug.log`, `test.log`

**設定**:

- protocol: rsync
- sync_mode: mirror
- ignore: `["*.log"]`

**期待結果**:

- `old.txt` → 削除される（リモート専用、ignoreなし）
- `debug.log` → 削除されない（ignoreパターンにマッチ）
- `test.log` → 削除されない（ignoreパターンにマッチ）
- `file1.txt` → 残る（ローカルにも存在）
- `file2.txt` → アップロードされる（ローカルの新規ファイル）

**検証項目**:

- getDiff()の結果に削除対象が含まれる
- ignoreパターンが適用される
- 実際に削除が実行される

#### Scenario 2: sftp + mirror + ignore (GUI)

**目的**: sftpプロトコルでprepareMirrorSync()が動作することを検証

**準備**:

- ローカル: `src/index.ts`, `README.md`
- リモート: `src/index.ts`, `src/old.ts`, `node_modules/foo/index.js`,
  `dist/bundle.js`

**設定**:

- protocol: sftp
- sync_mode: mirror
- ignore: `["node_modules/", "dist/"]`

**期待結果**:

- `src/old.ts` → 削除される（リモート専用、ignoreなし）
- `node_modules/foo/index.js` → 削除されない（ignoreパターンにマッチ）
- `dist/bundle.js` → 削除されない（ignoreパターンにマッチ）
- `src/index.ts` → 残る（ローカルにも存在）
- `README.md` → アップロードされる（ローカルの新規ファイル）

**検証項目**:

- prepareMirrorSync()が呼ばれる
- listRemoteFiles()が実行される
- 削除対象ファイルが正しく特定される
- 実際に削除が実行される

#### Scenario 3: scp + mirror (ignore なし)

**目的**: scpプロトコルでmirrorモード（ignoreなし）が動作することを検証

**準備**:

- ローカル: `app.js`
- リモート: `app.js`, `old1.js`, `old2.js`, `legacy.txt`

**設定**:

- protocol: scp
- sync_mode: mirror
- ignore: `[]` (なし)

**期待結果**:

- `old1.js` → 削除される
- `old2.js` → 削除される
- `legacy.txt` → 削除される
- `app.js` → 残る（ローカルにも存在）

**検証項目**:

- 全てのリモート専用ファイルが削除される
- ignoreパターンなしで動作する

#### Scenario 4: local + mirror + ignore

**目的**: localプロトコルでmirrorモード + ignoreパターンが動作することを検証

**準備**:

- ローカル（ソース）: `index.html`, `style.css`
- ローカル（リモート）: `index.html`, `old.html`, `.git/config`, `.DS_Store`

**設定**:

- protocol: local
- sync_mode: mirror
- ignore: `[".git/", ".DS_Store"]`

**期待結果**:

- `old.html` → 削除される
- `.git/config` → 削除されない（ignoreパターンにマッチ）
- `.DS_Store` → 削除されない（ignoreパターンにマッチ）
- `index.html` → 残る（ソースにも存在）
- `style.css` → コピーされる（ソースの新規ファイル）

**検証項目**:

- ローカル間の同期でもmirrorが動作する
- ignoreパターンが適用される

## 実装計画

### 1. ヘルパー関数の追加 (helpers.ts)

```typescript
/** mirrorテスト用のリモートファイルを準備 */
export async function setupRemoteFiles(
  uploader: Uploader,
  testId: string,
  files: Array<{ path: string; content: string }>,
): Promise<void>;

/** リモートのファイル一覧を取得 */
export async function listRemoteFiles(
  uploader: Uploader,
  testId: string,
): Promise<string[]>;

/** リモートファイルの存在確認 */
export async function verifyRemoteFileExists(
  uploader: Uploader,
  path: string,
): Promise<boolean>;

/** リモートファイルの不存在確認 */
export async function verifyRemoteFileNotExists(
  uploader: Uploader,
  path: string,
): Promise<boolean>;
```

### 2. テストコードの実装 (5_mirror_mode_test.ts)

各シナリオを個別のテストステップとして実装:

```typescript
Deno.test({
  name: "Mirror Mode Integration Tests",
  fn: async (t) => {
    // Scenario 1: rsync + mirror + ignore
    await t.step("rsync + mirror + ignore", async () => {
      // テスト実装
    });

    // Scenario 2: sftp + mirror + ignore
    await t.step("sftp + mirror + ignore", async () => {
      // テスト実装
    });

    // Scenario 3: scp + mirror
    await t.step("scp + mirror (no ignore)", async () => {
      // テスト実装
    });

    // Scenario 4: local + mirror + ignore
    await t.step("local + mirror + ignore", async () => {
      // テスト実装
    });
  },
});
```

### 3. テスト実行コマンド

```bash
# Docker環境起動
docker compose -f docker-compose.test.yml up -d

# テスト実行
deno test --allow-all tests/integration/5_mirror_mode_test.ts

# クリーンアップ
docker compose -f docker-compose.test.yml down
```

## 期待される成果

- ✅ mirrorモードの実機動作を保証
- ✅ ignoreパターンとの組み合わせを検証
- ✅ 全プロトコルで一貫した動作を確認
- ✅ リグレッション防止

## リスク

- 🟡 中リスク: テスト環境のセットアップが複雑
- 🟡 中リスク: テストデータのクリーンアップ漏れ
- 🟢 低リスク: テスト時間が長くなる可能性

## 次のステップ

1. ヘルパー関数の実装
2. Scenario 1-4のテストコード実装
3. テスト実行・デバッグ
4. ドキュメント更新
