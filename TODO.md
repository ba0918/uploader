# uploader 実装TODO

過去の完了タスクはgit履歴を参照してください。

```bash
# 過去のTODO.mdを見る
git log -p TODO.md

# 特定のコミットを見る
git show <commit-hash>:TODO.md

# 削除前の最後のアーカイブを見る
git show c37630c:TODO_ARCHIVE.md
```

---

## コードベースリファクタリング計画（2026-01-12開始）

### 📊 現状分析結果

**全体評価**: ⭐⭐⭐⭐☆ (4.0/5.0) - 高品質で保守性が高いコードベース

**強み**:

- 型安全性が高い（ISP原則に基づいた設計）
- エラーハンドリングが充実
- 統一された処理フロー（uploadFiles配列ベース）
- TODO/FIXMEがゼロ
- ドキュメントが充実

**改善が必要な領域**:

- テストカバレッジが90%未満のファイルが存在
- main.tsの責務過多（623行）
- logger.tsの肥大化（1120行）
- 型安全性の小さな改善余地

---

## 🟢 P2: 低優先度タスク（即座に対応可能 - Quick Wins）

### Task 1: converters.tsのignorePatterns重複解消

**問題**: src/upload/converters.ts:19-56

```typescript
export async function diffFilesToUploadFiles(
  files: DiffFile[],
  targetRef: string,
  ignorePatterns: string[] = [], // ← パラメータとして受け取る
): Promise<UploadFile[]> {
  // ... 処理 ...
  return applyIgnoreFilter(uploadFiles, ignorePatterns); // ← 内部で適用
}
```

しかし main.ts:267 では：

```typescript
uploadFiles = await diffFilesToUploadFiles(diffResult.files, targetRef);
// ← ignorePatterns を渡していない（デフォルト []）
```

**影響**: ignoreパターン適用のタイミングが不明確、重複リスク

**実装内容**:

- [x] converters.tsから`ignorePatterns`パラメータを削除
- [x] `diffFilesToUploadFiles`は純粋な変換処理のみに専念
- [x] ignoreフィルタリングは呼び出し側で明示的に実施
- [x] テストケースの更新

**修正方針**:

```typescript
// 修正後: converters.ts
export async function diffFilesToUploadFiles(
  files: DiffFile[],
  targetRef: string,
): Promise<UploadFile[]> {
  // フィルタリングはしない、変換のみ
}

// 修正後: main.ts
uploadFiles = await diffFilesToUploadFiles(diffResult.files, targetRef);
uploadFiles = applyIgnoreFilter(uploadFiles, profile.ignore);
```

**所要時間**: 0.5日（実装0.3日、テスト0.2日）

---

### Task 2: removeUndefinedPropsの型安全化

**問題**: src/config/loader.ts:124-128

```typescript
function removeUndefinedProps<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  ) as Partial<T>; // ← 型アサーション
}
```

**影響**: 型アサーションは実行時の型安全性を損なう可能性がある

**実装内容**:

- [x] 型アサーション不要の実装に変更
- [x] より安全なループベースの実装に修正
- [x] テストケースの追加（型チェック含む）

**修正方針**:

```typescript
function removeUndefinedProps<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key as keyof T] = value;
    }
  }
  return result;
}
```

**所要時間**: 0.2日（実装0.1日、テスト0.1日）

---

### Task 3: filesByTargetのMap型改善

**問題**: main.ts:260, 429

```typescript
let filesByTarget: Map<number, UploadFile[]> | undefined;
// ↑ ターゲットインデックス（数値）ベース → 配列順序に依存
```

**影響**:

- ターゲットの順序が変わるとバグる
- `targets[0]` が削除されたらインデックスがずれる

**実装内容**:

- [x] インデックスベースから識別子ベースに変更
- [x] TargetIdまたはホスト:ポート:destの組み合わせをキーにする
- [x] 関連する処理の修正（uploadToTargets等）
- [x] テストケースの追加

**修正方針**:

```typescript
// オプション1: ターゲットIDをキーにする
type TargetId = string; // "host:port:dest" の一意識別子
let filesByTarget: Map<TargetId, UploadFile[]> | undefined;

// ヘルパー関数
function getTargetId(target: ResolvedTargetConfig): TargetId {
  return `${target.host}:${target.port || 22}:${target.dest}`;
}
```

**所要時間**: 0.5日（実装0.3日、テスト0.2日）

---

## 🟡 P3: 低優先度タスク（設計改善）

### Task 4: エラーハンドリング統一

**問題**: main.ts:565-614

- 50行のswitch/if文が密集
- エラーの種類ごとに処理が異なる
- 新しいエラータイプを追加しにくい

**影響**: 保守性が低い、拡張困難

**実装内容**:

- [x] `src/cli/error-handler.ts` を新規作成
- [x] ErrorHandlerクラスの実装
- [x] エラー種別ごとのハンドラーをMapで管理
- [x] main.tsのエラーハンドリング処理を移行
- [x] テストケースの追加（各エラー種別）

**修正方針**:

```typescript
// 新規: src/cli/error-handler.ts
export class ErrorHandler {
  private readonly errorMap = new Map<
    new (...args: any[]) => Error,
    (error: Error) => number
  >([
    [ConfigValidationError, (e) => this.handleConfigError(e)],
    [GitCommandError, (e) => this.handleGitError(e)],
    [UploadError, (e) => this.handleUploadError(e)],
  ]);

  handleError(error: unknown): number {
    for (const [ErrorClass, handler] of this.errorMap) {
      if (error instanceof ErrorClass) {
        return handler(error);
      }
    }
    return this.handleUnknownError(error);
  }

  private handleConfigError(error: ConfigValidationError): number {
    logError(`設定ファイルエラー: ${error.message}`);
    return EXIT_CODES.CONFIG_ERROR;
  }

  // ... 他のハンドラー
}

// 修正後: main.ts
} catch (error) {
  const handler = new ErrorHandler();
  return handler.handleError(error);
}
```

**所要時間**: 1.0日（実装0.5日、テスト0.5日）

---

## 🟣 Phase2: srcを単数のみに制限（破壊的変更）

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

#### 1. 型定義の変更

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

#### 2. バリデーションの変更

**対象**: `src/config/validator.ts`

- [x] Phase1の複数srcチェックを削除（不要になる）
- [ ] `source.src`の配列チェックを削除
- [ ] 文字列チェックに変更
- [ ] エラーメッセージの更新

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

#### 3. ファイル収集処理の変更

**対象**: `src/file/collector.ts`

- [ ] `collectFiles(sources: string[], ...)`を`collectFile(source: string, ...)`に変更
- [ ] 配列のループ処理を削除
- [ ] 重複除去処理を削除（単一srcなので不要）

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

#### 4. main.tsの変更

**対象**: `main.ts`

- [ ] `profile.from.src.join(", ")`を`profile.from.src`に変更
- [ ] `collectFiles(profile.from.src, ...)`の引数が単一文字列になる

```typescript
// Before
fromDetail = profile.from.src.join(", ");
fileResult = await collectFiles(profile.from.src, { ... });

// After
fromDetail = profile.from.src;
fileResult = await collectFiles(profile.from.src, { ... });
```

#### 5. list.tsの変更

**対象**: `src/cli/list.ts`

- [ ] `profile.from.src.join(", ")`を`profile.from.src`に変更

#### 6. テストケースの修正

**対象**:

- `tests/config/validator_test.ts`
- `tests/config/loader_test.ts`
- `tests/upload/ssh-base_test.ts`
- その他、FileSourceを使用するテスト全体

- [ ] 全テストで`src: ["..."]`を`src: "..."`に変更
- [ ] 配列関連のテストケースを削除
- [ ] Phase1の複数src禁止テストを削除（不要になる）

#### 7. 設定ファイルの更新

**対象**:

- `uploader.example.yaml`
- `uploader.test.yaml`
- ドキュメント内のサンプル

- [ ] 全ての設定例で`src: ["dist/"]`を`src: "dist/"`に変更

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

**所要時間**: 1.5日（実装0.8日、テスト修正0.5日、ドキュメント0.2日）

**ブランチ**: `feature/single-src-only`

**✅ 完了日**: 2026-01-12

---

## 🔴 P0: 高優先度タスク（テストカバレッジ向上）

### Task 5: テストカバレッジ90%達成

**問題**: 以下のファイルが90%未満

| ファイル                 | カバレッジ | 目標 |
| ------------------------ | ---------- | ---- |
| `src/upload/sftp.ts`     | 62.9%      | 90%+ |
| `src/upload/rsync.ts`    | 74.1%      | 90%+ |
| `src/upload/progress.ts` | 76.2%      | 90%+ |

**影響**: エッジケースの検証が不十分、バグ発見が遅れる

**実装内容**:

#### 5-1: sftp.tsのテスト追加

- [ ] `tests/upload/sftp_test.ts` の拡充
  - [ ] エラーケース: 接続タイムアウト（3件）
  - [ ] エラーケース: 認証失敗（3件）
  - [ ] エラーケース: ファイル転送失敗（5件）
  - [ ] エッジケース: 大容量ファイル（2件）
  - [ ] エッジケース: 特殊文字パス（3件）
  - [ ] エッジケース: 権限エラー（2件）
  - [ ] リトライロジック: リトライ成功（2件）
  - [ ] リトライロジック: リトライ失敗（2件）
  - [ ] listRemoteFiles機能のテスト（3件）
  - [ ] readFile機能のテスト（3件）
- [ ] モックを活用した単体テスト実装
- [ ] カバレッジ確認（90%以上）

**所要時間**: 1.0日（実装0.6日、テスト調整0.4日）

#### 5-2: rsync.tsのテスト追加

- [ ] `tests/upload/rsync_test.ts` の拡充
  - [ ] エラーケース: rsyncコマンド失敗（3件）
  - [ ] エラーケース: SSH接続失敗（2件）
  - [ ] エッジケース: sudo rsync（2件）
  - [ ] エッジケース: rsync_optionsの各種オプション（4件）
  - [ ] エッジケース: 大容量ファイル（2件）
  - [ ] getDiff機能: 正常系（5件）
  - [ ] getDiff機能: エラー系（3件）
  - [ ] getDiff機能: エラーコード23のハンドリング（2件）
  - [ ] bulkUpload機能のテスト（5件）
- [ ] モックを活用した単体テスト実装
- [ ] カバレッジ確認（90%以上）

**所要時間**: 1.2日（実装0.7日、テスト調整0.5日）

#### 5-3: progress.tsのテスト追加

- [ ] `tests/upload/progress_test.ts` の拡充
  - [ ] 進捗コールバックの動作確認（5件）
  - [ ] エッジケース: 大量ファイル（2件）
  - [ ] エッジケース: ファイルサイズ0（2件）
  - [ ] エッジケース: 転送失敗時の進捗（2件）
  - [ ] 複数ターゲット時の進捗表示（3件）
- [ ] カバレッジ確認（90%以上）

**所要時間**: 0.8日（実装0.5日、テスト調整0.3日）

**総所要時間**: 3.0日

**テスト目標**: 全ファイル90%以上のカバレッジ維持

---

## 🔵 P1: 中優先度タスク（大規模リファクタリング - 保留）

以下のタスクは影響範囲が大きいため、P0-P3完了後に実施を検討。

### Task 6: main.tsの責務分割

**問題**: 623行、複数の責務が混在

**実装内容**:

- [ ] `src/cli/orchestrator.ts` を新規作成
- [ ] メイン処理をクラスベースに分割
- [ ] 設定読み込み、ファイル収集、アップロード実行、結果表示を分離
- [ ] テストケースの追加

**所要時間**: 2.0日

---

### Task 7: logger.tsの分割

**問題**: 1120行、複数の責務が混在

**実装内容**:

- [ ] `src/ui/logger.ts` を基本ロギング機能のみに縮小
- [ ] `src/ui/progress-bar.ts` を新規作成
- [ ] `src/ui/formatters.ts` を新規作成
- [ ] テストケースの追加

**所要時間**: 1.5日

---

## 実施順序

1. **P2タスク（Quick Wins）**: Task 1-3を順次実施（1.2日）
2. **P3タスク（設計改善）**: Task 4を実施（1.0日）
3. **P0タスク（最優先）**: Task 5を実施（3.0日）
4. **P1タスク（大規模リファクタリング）**: Task 6-7は必要に応じて実施

**総所要時間**: 5.2日（P2-P0完了まで）

---

## 進捗管理

- [ ] Task 1: converters.tsのignorePatterns重複解消（0.5日）
- [ ] Task 2: removeUndefinedPropsの型安全化（0.2日）
- [ ] Task 3: filesByTargetのMap型改善（0.5日）
- [ ] Task 4: エラーハンドリング統一（1.0日）
- [ ] Task 5-1: sftp.tsのテスト追加（1.0日）
- [ ] Task 5-2: rsync.tsのテスト追加（1.2日）
- [ ] Task 5-3: progress.tsのテスト追加（0.8日）

---

## アーカイブ管理方針

### 現状

- TODO_ARCHIVE.md: 1215行（膨大）
- 古い完了タスクが蓄積

### 提案する管理方針

**オプションA: 定期的な圧縮**

- 6ヶ月以上前の完了タスクを削除
- 設計判断の記録など、重要なもののみ残す
- 削除基準: 単純な機能追加タスク、バグ修正タスク

**オプションB: 年単位での分割**

- TODO_ARCHIVE_2025.md、TODO_ARCHIVE_2026.mdのように分割
- 各年の完了タスクを別ファイルで管理
- メリット: 履歴が残る、参照しやすい

**オプションC: 重要度別の分割**

- TODO_ARCHIVE_IMPORTANT.md（設計判断、アーキテクチャ変更）
- TODO_ARCHIVE_MINOR.md（小規模な機能追加、バグ修正）
- 後者は定期的に削除

**推奨**: **オプションB + C のハイブリッド**

1. 年単位で分割（TODO_ARCHIVE_2026.md）
2. 各年のアーカイブ内で重要度をマーク（## 重要な設計判断、## 通常のタスク）
3. 2年以上前の「通常のタスク」は削除対象として検討

---

## 技術メモ

### テストカバレッジの確認方法

```bash
# カバレッジ測定
deno task test --coverage=coverage

# レポート生成
deno coverage coverage --lcov --output=coverage.lcov

# ファイル別カバレッジ確認
deno coverage coverage | grep "src/upload"
```

### 型チェック

```bash
deno check main.ts
deno lint
deno fmt --check
```
