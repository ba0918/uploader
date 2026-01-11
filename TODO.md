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

## リファクタリング: コードレビュー指摘事項

**目的**: コード品質向上と保守性改善

### 高優先度（完了）

- [x] 未使用の `getErrorMessage()` 関数を削除 (`utils/retry.ts`)
  - `utils/mod.ts` からのエクスポートを削除
  - テストも同時に削除

- [x] `formatFileSize` の二重命名問題を解消 (`ui/logger.ts`)
  - `formatFileSizeExport` を廃止
  - `ui/progress.ts`, `ui/prompt.ts` で `utils/format.ts` から直接インポート

- [x] `ws-handler.ts` を分割 (1,088行 → 242行)
  - `ws-constants.ts`: 定数定義 (16行)
  - `ws-utils.ts`: ユーティリティ関数 (62行)
  - `ws-target-checker.ts`: ターゲット差分チェック (350行)
  - `ws-init-handler.ts`: 初期化処理 (497行)
  - `ws-handler.ts`: メッセージルーティング (242行)

- [x] `upload/mod.ts` を分割 (458行 → 24行)
  - `upload/factory.ts`: アップローダー作成 (82行)
  - `upload/converters.ts`: ファイル変換処理 (90行)
  - `upload/executor.ts`: アップロード実行 (300行)
  - `upload/mod.ts`: 再エクスポート (24行)

- [ ] `logger.ts` を分割 (1,123行) ※次回PRで対応
  - 内部状態（config, ファイルハンドル等）の共有が複雑
  - 別PRで慎重に対応予定

### 中優先度（完了）

- [x] setTimeout のマジックナンバーを定数化
  - `BROWSER_STARTUP_DELAY` を `ws-constants.ts` に追加

- [x] エラーキャッチ時の詳細ログを追加
  - `upload/converters.ts` でエラーメッセージを記録

---

## fileモード + mirror時のリモートのみファイル表示対応【設計見直し中】

**目的**: fileモード +
mirrorモード時に、リモートにのみ存在するファイル（削除対象）をdiff-viewerに表示

**背景**:

- 現在の実装では、ローカル→リモートの差分のみ表示される
- mirrorモードではリモートにのみ存在するファイルは削除されるべきだが、diff-viewerに表示されない
- Uploadボタンが有効にならず、同期を実行できない

**実装後に発見された重大な問題**:

1. **GUI/CUI間の実装不一致**
   - GUI mode (`ws-target-checker.ts`): ignore + mirror 対応済み
   - CUI mode (`remote-diff.ts` + `browser.ts`): **未対応**
   - → 同じ設定でもインターフェースで異なる結果になる
2. **rsyncのignore処理の欠如**
   - `getDiff()`で`--exclude`オプションを使っていない
   - ターゲットの`ignore`設定が全く反映されない
3. **mirror + `--files-from`の根本的矛盾**
   - `--files-from`指定時は指定ファイルのみ比較対象
   - リモート専用ファイル（削除対象）が検出できない
   - mirrorモードで正しく動作しない
4. **テストカバレッジ不足**
   - mirror + ignoreの組み合わせテストなし
   - CUI modeのテストなし
   - 実際の削除動作の統合テストなし

**設計原則違反**:

- sync_mode (update/mirror) やインターフェース (GUI/CUI)
  で動作が変わってはいけない
- すべてのプロトコル (rsync/scp/sftp/local) で同じ挙動を保証すべき

---

### 設計見直し案（不採用の詳細は TODO_ARCHIVE.md を参照）

提案A（Staging
Directory）、提案B（段階的改善）、提案D（rsync最適化）の詳細な実装計画は不採用のため、TODO_ARCHIVE.md
に移動しました。

---

### 要件適合性の検証結果

**ユーザー要件**:

1. CUI/GUIでDiff/Uploadの内容がぶれないこと
2. プロトコル(rsync/scp/sftp/local)でDiff/Uploadがぶれないこと
3. syncモード(update/mirror)で問題が起きないこと
4. それぞれの組み合わせで問題が起きないこと
5. パフォーマンスはある程度までは許容するが、致命的に遅くないこと

**検証結果サマリー**:

| 要件                    | 提案A (Staging) | 提案B (段階的) | 提案C (getDiff不使用) |
| ----------------------- | --------------- | -------------- | --------------------- |
| **1. CUI/GUI一貫性**    | ⚠️ 条件付き     | ❌ 不一致      | ✅ 完全一致           |
| **2. プロトコル一貫性** | ✅ 一致         | ❌ 不一致      | ✅ 完全一致           |
| **3. syncモード対応**   | ✅ 対応         | ⚠️ 部分的      | ✅ 完全対応           |
| **4. 組み合わせ**       | ⚠️ 条件付き     | ❌ 問題あり    | ✅ 問題なし           |
| **5. パフォーマンス**   | ⚠️ コピーコスト | ✅ 良好        | ⚠️ 許容範囲           |

**採用決定**: **提案C: getDiff不使用アプローチ** ⭐⭐⭐⭐⭐

- ✅ 全要件を完全に満たす唯一の提案
- ✅ CUI/GUI完全一致、全プロトコル完全一致
- ✅ パフォーマンスも提案Aより良好
- ✅ コード量削減、テスト容易
- ✨ 副次効果: rsync以外でも差分表示可能

詳細な分析結果は上記セクション、不採用案の詳細は TODO_ARCHIVE.md を参照。

---

## 実装計画: 提案C (getDiff不使用アプローチ)【採用】

### 実装方針

**コンセプト**:

- rsync `getDiff()` に依存せず、uploadFiles配列だけで完結
- CUI/GUIで完全に同じロジック
- 全プロトコルで完全に同じロジック
- ignoreフィルタリングを一箇所に集約
- mirrorモードは `listRemoteFiles()` でリモート一覧取得

**処理フロー**:

```
1. uploadFiles配列取得（git diff or file mode）
2. ignoreフィルタリング適用（統一処理）
3. mirrorモード時:
   - listRemoteFiles() でリモート一覧取得
   - ignoreフィルタリング適用
   - ローカルにないファイルを削除対象に追加
4. 結果を使用:
   - diff表示: uploadFilesをそのまま表示
   - upload: uploadFilesをそのまま実行
```

### Phase C1: ignoreフィルタリングの統一 【高優先度】✅ 完了

**目的**: ignoreパターンフィルタリングを一箇所に集約

- [x] `upload/filter.ts` を新規作成
  - [x] `applyIgnoreFilter(files: UploadFile[], patterns: string[]): UploadFile[]`
        実装
  - [x] IgnoreMatcher を使用
  - [x] git/file両モードで使用可能な設計
- [x] `converters.ts` を修正（gitモードにignore適用）
  - [x] `diffFilesToUploadFiles()` にignorePatterns引数追加
  - [x] フィルタリング処理を `applyIgnoreFilter()` に委譲
- [x] `file/collector.ts` との整合性確認
  - [x] fileモードは既にcollector内でフィルタリング済み
  - [x] gitモードでもフィルタリングが適用されることを確認
- [x] テスト作成
  - [x] `upload/filter_test.ts` を新規作成
  - [x] gitモード + ignoreパターンのテスト
  - [x] 様々なパターン（*.log, node_modules/**, .git/**等）のテスト
  - [x] `converters_test.ts` にignoreパターンのテスト追加

**影響範囲**:

- 新規: `upload/filter.ts` (45行)
- 修正: `converters.ts` (10行)
- テスト: `upload/filter_test.ts` (198行)
- テスト: `converters_test.ts` (追加65行)

**実装内容**:

- `applyIgnoreFilter()` 関数を実装し、ignoreパターンフィルタリングを統一
- `diffFilesToUploadFiles()` に `ignorePatterns` 引数を追加（デフォルト:
  空配列）
- 10個のテストケースで様々なパターンをカバー（_.log, node_modules/, **/_.map,
  .git/ など）
- 全テスト通過（229 passed）、テストカバレッジ維持

### Phase C2: mirrorモード処理の統一 【高優先度】✅ 完了

**目的**: mirrorモード時の削除対象検出を統一

- [x] `upload/mirror.ts` を新規作成
  - [x] `prepareMirrorSync()` 実装
    ```typescript
    export async function prepareMirrorSync(
      uploader: Uploader,
      uploadFiles: UploadFile[],
      ignorePatterns: string[],
    ): Promise<UploadFile[]>;
    ```
  - [x] `listRemoteFiles()` でリモート一覧取得
  - [x] ignoreフィルタリング適用
  - [x] ローカルにないファイルを削除対象として追加
  - [x] `hasListRemoteFiles()` 型ガードで分岐
  - [x] uploadFiles に既に含まれているファイルの重複を防止
- [x] エラーハンドリング
  - [x] `listRemoteFiles()` 失敗時の graceful degradation
  - [x] ログ出力
- [x] テスト作成
  - [x] `upload/mirror_test.ts` を新規作成
  - [x] モックUploaderを使用したユニットテスト
  - [x] 削除対象ファイル検出のテスト
  - [x] ignoreパターン適用のテスト
  - [x] エラーハンドリングのテスト
  - [x] 複雑なケース（追加、変更、削除、ignoreの組み合わせ）のテスト

**影響範囲**:

- 新規: `upload/mirror.ts` (118行)
- テスト: `upload/mirror_test.ts` (245行)

**実装内容**:

- `prepareMirrorSync()` 関数を実装し、mirrorモード時の削除対象検出を統一
- `hasListRemoteFiles()` 型ガードで対応しているアップローダーのみ処理
- リモートファイルにもignoreパターンを適用
- uploadFiles に既に含まれているファイルの重複を防止
- エラー時は警告を出して続行（graceful degradation）
- 9個のテストケースで様々なシナリオをカバー
- 全テスト通過（238 passed）、テストカバレッジ維持

### Phase C3: main処理フローの修正 【高優先度】✅ 完了

**目的**: main.tsでignore+mirror処理を適用

- [x] `main.ts` を修正
  - [x] fileモード + mirrorモード時、`prepareMirrorSync()` を呼び出し
  - [x] リモートにのみ存在するファイルを削除対象として追加
  - [x] プロファイルのignoreパターンを使用
- [x] 処理フロー整理
  - [x] uploadFiles取得後にmirrorモード処理を追加
  - [x] ignoreフィルタリングは既にgetDiff/collectFilesで適用済み
- [x] ログ出力改善
  - [x] 削除対象ファイル数を表示

**影響範囲**:

- 修正: `main.ts` (47行追加: インポート2行 + mirrorモード処理45行)

**実装内容**:

- fileモード + いずれかのターゲットがmirrorモードの場合、mirror処理を実行
- 最初のmirrorモードターゲットを使用してリモートファイル一覧を取得
- `prepareMirrorSync()` を呼び出してuploadFilesに削除対象を追加
- 削除対象ファイル数をlogInfo()で表示
- エラー時はgraceful degradation（prepareMirrorSync内で処理）
- gitモードの場合は既存の処理（getDiffで削除ファイルを取得）を使用
- テスト通過（237 passed）

### Phase C4: diff-viewer修正（GUI） 【中優先度】✅ 完了

**目的**: ws-target-checker.tsを簡素化、統一処理を使用

- [x] `ws-target-checker.ts` を大幅簡素化
  - [x] 既存のmirror+ignore処理を削除（約30行簡素化）
  - [x] `prepareMirrorSync()` を使用するように変更
  - [x] rsyncのignoreフィルタリングは保持（IgnoreMatcher使用）
- [x] `ws-init-handler.ts` を確認
  - [x] deleteFiles処理が統一ロジックと整合することを確認（修正不要）
- [x] テスト確認
  - [x] 既存テストが全て通過（238 passed）
  - [x] lintエラー修正（tests/upload/mirror_test.ts）

**影響範囲**:

- 修正: `ws-target-checker.ts` (約30行簡素化: 183-236行を187-231行に)
- 修正: `tests/upload/mirror_test.ts` (lintエラー修正: async削除)
- 確認: `ws-init-handler.ts` (修正不要)

**実装内容**:

- 非rsyncプロトコルでのmirrorモード処理（183-231行）を`prepareMirrorSync()`を使用するように変更
- 独自のリモートファイル一覧取得・ignoreフィルタリング処理を削除
- `prepareMirrorSync()`が返すUploadFileから削除対象ファイルを抽出
- 全テスト通過（238 passed）、lintエラー0件、フォーマットOK

### Phase C5: diff-viewer修正（CUI） 【中優先度】✅ 完了

**目的**: CUI側をuploadFiles配列ベースの処理に変更

- [x] `browser.ts` を修正
  - [x] `cuiConfirm()`をuploadFilesベースの処理に変更
  - [x] uploadFilesから直接サマリーを作成するヘルパー関数を追加
  - [x] rsync以外でも差分表示できることを確認
- [x] `remote-diff.ts` を確認
  - [x] 既存のgetDiff()関連機能は維持（rsync用）
  - [x] 修正不要と判断
- [x] テスト確認
  - [x] 既存テストが全て通過（238 passed）
  - [x] lintエラー0件、フォーマットOK

**影響範囲**:

- 修正: `browser.ts` (約45行追加: ヘルパー関数2つ + cuiConfirm修正)
- 確認: `remote-diff.ts` (修正不要)

**実装内容**:

- `createSummaryFromUploadFiles()`: uploadFilesからサマリーを作成
- `uploadFilesToDiffFiles()`: uploadFilesをDiffFile形式に変換
- `cuiConfirm()`: uploadFilesがある場合はそこから直接サマリーを作成して表示
- rsyncの場合も引き続きgetDiff()を使用可能（従来の動作を維持）
- **副次効果**: sftp/scp/local プロトコルでもCUI差分表示が可能に

### Phase C6: 統合テスト 【高優先度】✅ 完了（ユニットテストレベル）

**目的**: 全ての組み合わせで動作確認

**実施内容**:

- [x] エッジケーステスト
  - [x] ignoreパターンで全ファイル除外
  - [x] リモートにファイルがない場合
  - [x] ローカルにファイルがない場合（mirrorで全削除）
- [x] 既存のテストカバレッジ分析
  - [x] filter_test.ts: ignoreフィルタリング（10テスト）
  - [x] mirror_test.ts: mirrorモード処理（12テスト、エッジケース3つ追加）
  - [x] converters_test.ts: gitモード + ignoreパターン
  - [x] browser.ts/ws-target-checker.ts: GUI/CUI処理（既存テストでカバー）

**未実施（今後の課題）**:

#### 現状分析

**既存の統合テスト状況**（tests/integration/）:

- ✅ 基本的なファイル転送（SFTP/SCP/rsync/local）
- ✅ getDiff機能（rsync）
- ✅ gitignore（gitモード）
- ✅ エラーハンドリング（9_failure_test.ts）
- ❌ **mirrorモード**（未テスト）
- ❌ **targetのignoreパターン**（未テスト）
- ❌ **mirror + ignoreの組み合わせ**（未テスト）
- ❌ **CUI/GUI差分表示**（未テスト）
- ❌ **パフォーマンス**（未計測）

**ユニットテスト状況**:

- ✅ prepareMirrorSync(): 12テスト（mirror_test.ts）
- ✅ applyIgnoreFilter(): 10テスト（filter_test.ts）
- ✅ エッジケース: 3テスト追加済み

**リスク評価**:

- 🟡 中リスク: mirrorモード + ignoreパターンの実機動作未検証
- 🟡 中リスク: 大量ファイル時のパフォーマンス未計測
- 🟢 低リスク: ユニットテストで論理は検証済み

#### 実装計画

**Phase I1: mirrorモード統合テスト** 【高優先度】✅ **完了**

目的: Phase C1-C6で実装したmirror機能の実機動作検証

**実装完了**:
- ✅ テストファイル作成: `tests/integration/5_mirror_mode_test.ts` (約500行)
- ✅ ヘルパー関数実装: `tests/integration/helpers.ts` に追加
  - `collectLocalFiles()`: ローカルファイル収集
  - `executeUploadFiles()`: uploadFiles配列を実行
  - `setupRemoteFiles()`: リモートファイル準備（アプローチB採用）
  - `verifyRemoteFileExists()`, `verifyRemoteFileNotExists()`: 検証用
  - `cleanupRemoteDir()`: クリーンアップ
- ✅ 4つのテストケース実装・動作確認完了

**テスト結果（全て成功）**:
- ✅ rsync + mirror + ignore（CUI）: リモート専用ファイル削除、ignoreパターン適用
- ✅ sftp + mirror + ignore（GUI）: prepareMirrorSync()動作、ignoreパターン適用
- ✅ scp + mirror（ignoreなし、CUI）: 全リモート専用ファイル削除
- ✅ local + mirror + ignore（GUI）: ローカルプロトコルでmirror動作

**採用したアプローチ**:

アプローチB（テスト設計変更）を採用:
- uploaderのdestを `/upload` に固定
- `setupRemoteFiles(uploader, baseDir, files)` の形で実装
- baseDir を明示的に作成してから、`baseDir/file.path` でアップロード
- localFilesのrelativePathに`baseDir`を追加して、dest配下の相対パスに統一
- ignoreパターンも`baseDir`を考慮した形に調整

**解決した課題**:

1. **destディレクトリ問題**: setupRemoteFiles()でbaseDirを明示的に作成
2. **relativePathの不一致**: localFilesとremoteFilesのrelativePathを統一
3. **ignoreパターンの不一致**: baseDirを含むパスに対応したパターンに調整

**成果**:

- mirrorモードの実機動作を全プロトコル（rsync/sftp/scp/local）で検証完了
- ignoreパターンとの組み合わせも正しく動作
- Phase C1-C6の実装が統合テストレベルで検証された

**Phase I2: CUI/GUI差分表示統合テスト** 【中優先度】⚠️ **重要な問題を発見・修正**

目的: uploadFilesベースの差分表示が全プロトコルで動作することを検証

---

### Phase I2: 問題の詳細分析と修正（2026-01-11更新）

**実際の手動テスト結果**:

テスト環境:
- コマンド: `RSYNC_PASSWORD=testpass deno run dev --config=uploader.test.yaml -v --diff --no-browser test_mirror_sftp`
- 設定ファイル: `uploader.test.yaml`
- プロトコル: sftp（mirrorモード）
- ignoreパターン: `.*`, `.ignore_dir`, `.ignore_dir2`

**発見された問題と修正**:

#### ✅ 問題3: sftp/mirrorモード時の謎の表示（修正完了）

**現象**:
- ログに `example/` ではなく `xample/a.txt` のような謎のパスが表示される
- 1文字ずれている

**原因**:
- `sftp.ts:642-644` の相対パス計算で、destの末尾スラッシュを考慮していなかった
- `fullPath.slice(this.options.dest.length + 1)` で計算
- `dest="/upload/"` (8文字) の場合、`slice(9)` となり、1文字ずれる

**修正内容** (src/upload/sftp.ts:642-649):
```typescript
// destの末尾スラッシュを考慮した相対パス計算
const destBase = this.options.dest.endsWith("/")
  ? this.options.dest
  : this.options.dest + "/";
const relativePath = fullPath.slice(destBase.length);
```

---

#### ✅ 問題2: ignore設定が適用されない（修正完了）

**現象**:
- ユーザー報告: `**/.ignore_dir`, `**/.ignore_dir2` を指定してもディレクトリ配下のファイルが無視されない
- `**/.*` は適用された

**原因**:
- `src/file/ignore.ts` の IgnoreMatcher 実装で、`**/.ignore_dir`（末尾スラッシュなし）の場合、ディレクトリ自体にはマッチするが、ディレクトリ配下のファイルにはマッチしなかった
- globToRegExp() が生成する正規表現が `/^(?:[^/]*(?:\/|$)+)*\.ignore_dir\/*$/` となり、`example/.ignore_dir/a.txt` にマッチしない

**修正内容** (src/file/ignore.ts:112-122):
```typescript
// **を含むパターンの場合、ディレクトリ配下のファイルにもマッチするようにする
// （例: **/.ignore_dir は example/.ignore_dir/a.txt にマッチすべき）
if (pattern.includes("**")) {
  const parts = normalizedPath.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    const partialPath = parts.slice(0, i + 1).join("/");
    if (regex.test(partialPath)) {
      return true;
    }
  }
}
```

**効果**:
- `**/.ignore_dir` でもディレクトリ配下のファイル（`example/.ignore_dir/a.txt`）にマッチするようになった
- .gitignoreの慣習に近い動作

---

#### ✅ 問題1: checksum問題（一部修正完了）

**現象**:
- rsyncのgetDiff()で、サイズが同じで内容が異なるファイル（`dir2/b.txt`: local=`aaaaaa`, remote=`bbbbbb`）が検出されない
- ユーザー報告: 「rsyncのデフォルト挙動は --size-only で判定する」

**原因分析**:

1. **パーサーの問題（修正完了）**:
   - `src/utils/rsync-parser.ts:76-84` で、内容変更の判定が `checksum` または `size` フラグのみで、`time` フラグを見ていなかった
   - そのため、mtimeが異なるファイルが検出されなかった

   **修正内容** (src/utils/rsync-parser.ts:76-80):
   ```typescript
   // 内容変更: checksumまたはsizeまたはtimeフラグがある場合
   // flags[0] = checksum (c/C), flags[1] = size (s/S), flags[2] = time (t/T)
   const hasContentChange = flags[0] === "c" || flags[0] === "C" ||
     flags[1] === "s" || flags[1] === "S" ||
     flags[2] === "t" || flags[2] === "T";
   ```

2. **rsyncの仕様上の制限（修正不可）**:
   - rsyncはデフォルトでサイズ+mtimeで比較する（size-onlyではない）
   - サイズとmtimeが**両方同じ**で内容が異なるファイルは、`--checksum`オプションを使わないと検出できない
   - これはrsyncの仕様なので、ツールとしては対処不可

**対応策**:
- `--checksum` オプションは既に実装済み（rsync.ts:380-381）
- CLI引数: `--checksum` を指定すれば、チェックサムで比較できる
- ドキュメントで説明する必要がある

**scp/sftpで問題が発生しない理由**:
- fileモード（scp/sftp）では、`getDiff()` を使わず、uploadFiles配列をそのまま表示する
- すべてのローカルファイルがアップロード対象として表示されるため、「検出された」ように見える
- ただし、実際にはリモートとの差分を取っていない

---

#### ⚠️ 未修正の問題: rsyncのgetDiff()でignoreパターンが適用されない

**現象**（TODO.mdに既に記載）:
- rsyncの `getDiff()` で `--exclude` オプションを使っていない
- ignoreパターンがrsyncコマンドに渡されないため、ignoreすべきファイルが差分として検出される

**修正が必要**:
1. `getDiff()` に `ignorePatterns` パラメータを追加
2. 各パターンを `--exclude='pattern'` の形でrsyncコマンドに追加

**影響範囲**:
- rsync mirrorモード時：ignore設定が適用されずdiff-viewerに表示される

**所要時間見積もり**: 0.5日

---

**手動テスト結果（2026-01-11 - 旧記録）**:

テスト環境:
- 設定ファイル: `uploader.test.yaml`
- プロファイル: `test_update` (sync_mode:update), `test_mirror` (sync_mode:mirror)
- プロトコル: rsync
- ignoreパターン: `".*"`, `.ignore_dir`, `.ignore_dir2`

**発見された致命的な問題**:

### 問題1: checksum問題（最重要・設計上の欠陥）

**現象**:
- `example/dir2/b.txt` がremote側で変更されている（内容: `aaaaaa` → `bbbbbb`）のに検知されない
- sync_mode:update でも sync_mode:mirror でも検知されない

**原因分析**:
fileモードの根本的な設計問題:
1. `collectFiles()` は**ローカルのファイルのみ**を収集
2. remoteとの比較は**一切していない**
3. `listRemoteFiles()` はファイルパスのリストのみを返す（サイズ・mtime・checksum情報なし）
4. → **remote側の変更を検知することは構造上不可能**

**検証**:
```bash
# local
cat tests/integration/fixtures/testdata/local/example/dir2/b.txt
# → aaaaaa (6 bytes)

# remote
ssh testuser@localhost "cat /upload/example/dir2/b.txt"
# → bbbbbb (6 bytes)
```
サイズは同じだが内容が異なる。現在の実装では検知不可能。

**影響範囲**:
- fileモード全体（Phase C1-C7で実装した内容が不完全）
- 全プロトコル（rsync/sftp/scp/local）
- sync_mode（update/mirror）両方

**修正に必要な作業**:
1. `listRemoteFiles()` のインターフェース変更:
   - `Promise<string[]>` → `Promise<RemoteFileInfo[]>`
   - RemoteFileInfo = { path, size, mtime?, checksum? }
2. 各アップローダーの実装変更（rsync/sftp/scp/local）
3. ローカルとリモートのファイルを比較するロジック追加
4. checksumオプションの実装（オプション）
5. 大量のテストケース修正

**所要時間見積もり**: 3-5日（大規模な設計変更）

**対応方針の選択肢**:
- **A. 修正する**: 大規模な設計変更を実施（所要時間: 3-5日）
- **B. 制限として受け入れる**: fileモードでは「ローカルのファイルのみをアップロード」として文書化
- **C. rsyncのみ対応**: rsyncは`getDiff()`があるので、rsync限定で対応

---

### 問題2: ignoreパターン問題

**現象**:
sync_mode:mirror で以下のファイルが検出されている:
- `example/.ignore_dir/a.txt` （設定: `.ignore_dir` で無視すべき）
- `example/dir1/.ignore_dir2/a.txt` （設定: `.ignore_dir2` で無視すべき）

**想定される原因**:
- ignoreパターンのマッチングロジックの問題
- `.*` パターンがディレクトリに適用されていない可能性

**調査すべき箇所**:
- `src/file/ignore.ts` の IgnoreMatcher 実装
- `upload/filter.ts` の `applyIgnoreFilter()` 実装
- mirrorモードでの `prepareMirrorSync()` のignore適用

---

### 問題3: 同期対象外ファイル問題

**現象**:
sync_mode:mirror で以下のファイルが検出されている:
- `a.txt` （`example/` 外のファイル）
- `b.txt` （`example/` 外のファイル）

**設定**:
```yaml
from:
  src:
    - "./tests/integration/fixtures/testdata/local/example"
```

**想定される原因**:
- ファイル収集時のbaseDirの処理が不正
- `collectFiles()` または `collectedFilesToUploadFiles()` のバグ

**調査すべき箇所**:
- `src/file/collector.ts` の `collectFiles()` 実装
- baseDir とrelativePathの計算ロジック

---

## 今後の方針

**即座に必要な判断**:
1. 問題1（checksum問題）をどう扱うか？
   - 修正するか、制限として受け入れるか

**Phase I2の扱い**:
- 現状では統合テストを進めることに意味がない（致命的なバグがあるため）
- 問題1-3を修正してから、改めてPhase I2を実施すべき

**元のテストケース（参考）**:

- [ ] CUI差分表示（rsync以外）
  - sftp: cuiConfirm()がuploadFilesから差分を表示
  - scp: 同上
  - local: 同上
- [ ] GUI差分表示（全プロトコル）
  - WebSocket経由の差分送信
  - ターゲット別の差分集計
  - アップロードボタンの有効/無効制御

**Phase I3: パフォーマンステスト** 【低優先度】

目的: 大量ファイル処理時の性能計測とボトルネック特定

テストケース:

- [ ] ファイル数別パフォーマンス
  - 100ファイル: ベースライン
  - 1,000ファイル: 通常使用想定
  - 10,000ファイル: 大規模プロジェクト
- [ ] モード別比較
  - updateモード: listRemoteFiles()なし
  - mirrorモード: listRemoteFiles()あり
- [ ] プロトコル別比較
  - rsync: getDiff()使用
  - sftp/scp/local: uploadFilesベース
- [ ] 計測項目
  - diff取得時間
  - アップロード時間
  - メモリ使用量

所要時間: 2.0日

- テストデータ生成: 0.5日
- テストコード実装: 0.8日
- 実行・計測・分析: 0.7日

期待される効果:

- パフォーマンスボトルネックの特定
- 最適化の優先順位決定
- 要件5（致命的に遅くないこと）の検証

#### 優先順位と実施判断

**優先度順**:

1. 🔴 **Phase I1** (mirrorモード統合テスト) - 1.5日
   - 新機能の動作保証に必須
2. 🟡 **Phase I2** (CUI/GUI差分表示) - 1.0日
   - Phase C5の検証に有用
3. 🟢 **Phase I3** (パフォーマンステスト) - 2.0日
   - 現状で大きな問題報告なし、優先度低

**実施タイミング**:

- Phase I1: 次のリリース前に実施推奨
- Phase I2: Phase I1と同時または直後に実施
- Phase I3: ユーザーからパフォーマンス問題の報告があった場合に実施

**スキップ判断**:

- ユニットテストで論理は検証済み
- Phase C1-C6で段階的に実装・検証済み
- 破壊的変更なし、後方互換性維持
- → 実機統合テストなしでもリリース可能
- ただし、Phase I1は実施推奨（新機能の動作保証のため）

#### 旧リスト（参考）

- [ ] Docker環境での実機統合テスト
  - [ ] CUI + rsync + update + ignore
  - [ ] CUI + rsync + mirror + ignore
  - [ ] CUI + scp + mirror + ignore
  - [ ] GUI + sftp + mirror + ignore
  - [ ] GUI + local + update + ignore
  - [ ] CUI + scp + mirror（ignoreなし）
- [ ] パフォーマンステスト
  - [ ] 100ファイル、1,000ファイル、10,000ファイルで計測
  - [ ] updateモード vs mirrorモードの比較

**影響範囲**:

- 修正: `tests/upload/mirror_test.ts` (エッジケース3つ追加、合計12テスト)

**実装内容**:

- mirror_test.tsにエッジケーステストを3つ追加
  - ignoreパターンで全ファイル除外
  - ローカルにファイルがない（mirrorで全削除）
  - ローカルにファイルがなく、ignoreパターン適用
- 全テスト通過（**241 passed**, 238→241に増加）
- lintエラー0件、フォーマットOK

**評価**:

- ✅ ユニットレベルでの組み合わせテストは十分
- ✅ エッジケースは完全にカバー
- ⚠️ Docker環境での実機統合テストは今後の課題
- 💡 Phase C1-C5の実装により、各機能のユニットテストは十分に検証済み

### Phase C7: ドキュメント更新とクリーンアップ 【低優先度】✅ 完了

**目的**: 不要なコードの削除とドキュメント更新

**実施内容**:

- [x] 不要なコードの確認
  - [x] rsync `getDiff()` の使用箇所を確認 → Phase C1-C6で既に統一処理に移行済み
  - [x] 重複したignoreフィルタリング処理の確認 → Phase C1で`filter.ts`に統一済み
  - ✅ 追加の削除は不要と判断
- [x] ドキュメント更新
  - [x] CHANGELOG.md を新規作成
    - Phase C1-C6の変更内容を記載
    - 破壊的変更なし、後方互換性を維持
    - 新機能（rsync以外での差分表示、mirrorモード対応）を記載
  - [x] CLAUDE.md を更新
    - Phase C1-C6で追加したモジュール（filter.ts、mirror.ts）の説明を追加
    - 処理フローと設計原則を追記
  - [x] SPEC.md を確認
    - 要件仕様書として既に十分な記述あり
    - 大幅な変更は不要と判断

**影響範囲**:

- 新規作成: `CHANGELOG.md` (約200行)
- 修正: `CLAUDE.md` (Phase C1-C6の実装内容を追記)
- 確認: `SPEC.md` (修正不要)

**実装内容**:

- CHANGELOG.mdに以下を記載:
  - Added: fileモード +
    mirrorモード対応、全プロトコル差分表示対応、エッジケーステスト追加
  - Changed: 処理フローの統一、diff-viewerの簡素化
  - Fixed: gitモードでのignoreパターン適用、mirrorモード時の削除対象ファイル検出
  - Technical Details: テストカバレッジ向上（238→241 passed）
  - Design Principles: 要件と採用したアプローチの説明
  - Migration Notes: 破壊的変更なし、後方互換性を維持
- CLAUDE.mdに処理フローと統一処理モジュールの説明を追加

**評価**:

- ✅ Phase C1-C6の実装により、コードは既に統一・簡素化済み
- ✅ ドキュメントは十分に更新され、変更内容が明確に記録された
- ✅ 後方互換性を維持し、破壊的変更なし

### 実装の優先順位

1. ✅ **Phase C1**: ignoreフィルタリング統一（基盤） - 完了
2. ✅ **Phase C2**: mirrorモード処理統一（基盤） - 完了
3. ✅ **Phase C3**: main処理フロー修正（統合） - 完了
4. ✅ **Phase C4**: GUI修正（改善） - 完了
5. ✅ **Phase C5**: CUI修正（改善） - 完了
6. ✅ **Phase C6**: 統合テスト（検証） - 完了（ユニットテストレベル）
7. ✅ **Phase C7**: ドキュメント更新（仕上げ） - 完了

### 所要時間見積もり

| Phase    | 実装      | テスト    | 合計      |
| -------- | --------- | --------- | --------- |
| C1       | 0.5日     | 0.3日     | 0.8日     |
| C2       | 0.8日     | 0.5日     | 1.3日     |
| C3       | 0.5日     | 0.2日     | 0.7日     |
| C4       | 0.5日     | 0.2日     | 0.7日     |
| C5       | 0.3日     | 0.2日     | 0.5日     |
| C6       | 0.2日     | 0.5日     | 0.7日     |
| C7       | 0.2日     | -         | 0.2日     |
| **合計** | **3.0日** | **1.9日** | **4.9日** |

### リスクと対策

**リスク1**: `listRemoteFiles()` が大量ファイルで遅い

- **対策**: パフォーマンステストで計測、必要に応じてキャッシュ機構追加

**リスク2**: 既存の動作が変わる可能性

- **対策**: 統合テストを十分に実施、phase単位で慎重に進める

**リスク3**: rsync getDiff()を使わないことでパフォーマンス低下

- **対策**: パフォーマンス比較テスト、updateモードではオーバーヘッドなし

### 期待される効果

1. ✅ CUI/GUI完全一致（要件適合）
2. ✅ 全プロトコル完全一致（要件適合）
3. ✅ syncモード完全対応（要件適合）
4. ✅ コード量削減（ws-target-checker: -100行）
5. ✅ テスト容易性向上
6. ✨ **副次効果**: rsync以外でも差分表示可能

---

### 過去の実装（Phase 1-4）【提案Cで活用】

- [x] Phase 1: Uploaderインターフェース拡張
  - [x] `ListRemoteFilesCapable`インターフェース追加
  - [x] `hasListRemoteFiles()`型ガード追加
- [x] Phase 2: 各アップローダーの実装
  - [x] `listRemoteFiles()`実装（local/ssh-base/sftp）
- [x] Phase 3: diff-viewer修正（GUI modeのみ）
  - [x] `ws-target-checker.ts`: mirror + ignore対応
  - [x] `ws-init-handler.ts`: deleteFiles表示対応
- [x] Phase 4: テスト（不十分）
  - [x] `listRemoteFiles()`基本テスト
  - [x] 型ガードテスト
  - [ ] mirror + ignoreテスト **未実装**
  - [ ] CUI modeテスト **未実装**
  - [ ] 統合テスト **未実装**

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
