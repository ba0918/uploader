# uploader 完了済みタスク

このファイルには、完了したタスクを記録します。

---

## ✅ Phase2: srcを単数のみに制限（破壊的変更）

**完了日**: 2026-01-12 **ブランチ**: `feature/single-src-only` **所要時間**:
1.5日（実装0.8日、テスト修正0.5日、ドキュメント0.2日）

### 背景

Phase1で複数srcでmirrorモードを禁止したが、根本的な解決策として、srcを単数のみに制限する。

**Phase1で発見された問題**:

- 複数srcからのファイルが混在する場合、`detectBaseDirectory()`が空文字列を返す
- `prepareMirrorSync()`がリモート全体のファイルを削除対象として検出する危険性
- 複数srcの実際の需要が不明確

**設計判断**:

- 複数srcを1つのdestにマッピングする需要は少ない
- 複数同期したい場合は、各srcごとにプロファイルを分ければ対応可能
- 1:1マッピングで設計がシンプルになる

### 実装内容

#### 1. 型定義の変更 ✅

**対象**: `src/types/config.ts`

```typescript
// Before
export interface FileSource {
  type: "file";
  src: string[]; // 配列
}

// After
export interface FileSource {
  type: "file";
  src: string; // 単一の文字列
}
```

#### 2. バリデーションの変更 ✅

**対象**: `src/config/validator.ts`

- Phase1の複数srcチェックを削除（不要になる）
- `source.src`の配列チェックを削除
- 文字列チェックに変更
- エラーメッセージの更新

```typescript
// Before
if (!source.src || !Array.isArray(source.src)) {
  throw new ConfigValidationError(
    "file モードでは src (配列) は必須です",
    `${path}.src`,
  );
}

// After
if (!source.src || typeof source.src !== "string") {
  throw new ConfigValidationError(
    "file モードでは src (文字列) は必須です",
    `${path}.src`,
  );
}
```

#### 3. ファイル収集処理の変更 ✅

**対象**: `src/file/collector.ts`

- `collectFiles(sources: string[], ...)`を`collectFiles(source: string, ...)`に変更
- 配列のループ処理を削除
- 重複除去処理を削除（単一srcなので不要）

```typescript
// Before
export async function collectFiles(
  sources: string[], // 複数
  options: FileCollectOptions = {},
): Promise<FileCollectResult>;

// After
export async function collectFiles(
  source: string, // 単一
  options: FileCollectOptions = {},
): Promise<FileCollectResult>;
```

#### 4. main.tsの変更 ✅

**対象**: `main.ts`

- `profile.from.src.join(", ")`を`profile.from.src`に変更
- `collectFiles(profile.from.src, ...)`の引数が単一文字列になる

```typescript
// Before
fromDetail = profile.from.src.join(", ");
fileResult = await collectFiles(profile.from.src, { ... });

// After
fromDetail = profile.from.src;
fileResult = await collectFiles(profile.from.src, { ... });
```

#### 5. list.tsの変更 ✅

**対象**: `src/cli/list.ts`

- `profile.from.src.join(", ")`を`profile.from.src`に変更

#### 6. テストケースの修正 ✅

**対象**:

- `tests/config/validator_test.ts`
- `tests/config/loader_test.ts`
- `tests/upload/ssh-base_test.ts`
- その他、FileSourceを使用するテスト全体

- 全テストで`src: ["..."]`を`src: "..."`に変更
- 配列関連のテストケースを削除
- Phase1の複数src禁止テストを削除（不要になる）

#### 7. 設定ファイルの更新 ✅

**対象**:

- `uploader.example.yaml`
- `uploader.test.yaml`
- `uploader.yaml`

- 全ての設定例で`src: ["dist/"]`を`src: "dist/"`に変更
- 複数srcを使用していたプロファイルをコメントアウトし、代替案を提示

#### 8. ドキュメントの更新 ✅

- CHANGELOG.mdに破壊的変更を記載
- Migration Notesに詳細な移行ガイドを追加

### 移行ガイド

**既存ユーザー向け**:

```yaml
# Before（複数src）
development:
  from:
    type: file
    src:
      - "dist/"
      - "public/"
  to:
    targets:
      - dest: "/var/www/"

# After（プロファイル分割）
development_dist:
  from:
    type: file
    src: "dist/"
  to:
    targets:
      - dest: "/var/www/dist/"

development_public:
  from:
    type: file
    src: "public/"
  to:
    targets:
      - dest: "/var/www/public/"
```

### 破壊的変更の影響

**影響を受けるユーザー**:

- `src`を配列で定義しているユーザー（既存の設定ファイル）

**エラーメッセージ**:

```
設定ファイルエラー: development.from.src: file モードでは src (文字列) は必須です
```

### テスト結果

- ✅ 全148テストが通過（1012ステップ）
- ✅ 型チェック完了
- ✅ Lint エラー0件

### チェックリスト

- [x] 型定義の変更
- [x] バリデーション変更
- [x] ファイル収集処理の変更
- [x] main.tsの変更
- [x] list.tsの変更
- [x] テストケース修正（全体）
- [x] 設定ファイルサンプルの更新
- [x] ドキュメントの更新
- [x] CHANGELOG.mdへの記載（Breaking Change）

---
