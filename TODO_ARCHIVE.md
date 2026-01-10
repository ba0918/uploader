# uploader 実装TODO（アーカイブ）

このファイルは完了済みのタスクと不採用の提案のアーカイブです。
アクティブなタスクは [TODO.md](./TODO.md) を参照してください。

---

## 不採用: mirror + ignore 対応の代替案 (2026-01-11)

**背景**: fileモード +
mirrorモード時のリモートのみファイル表示対応において、複数の実装案を検討した結果、提案C
(getDiff不使用アプローチ) を採用。以下の提案は不採用となった。

**不採用理由の要約**:

- 提案A: diff時とupload時で2回staging作成が必要、パフォーマンスコスト
- 提案B: `--files-from`問題未解決、プロトコル間で不一致
- 提案D: 設計原則違反（プロトコル別分岐）

### 提案A: Staging Directory アプローチ【不採用】

**実現可能性**: ⭐⭐⭐⭐ (高い)

**参考実装**: `rsync.ts` の `bulkUpload()` (186-270行目)

- tempディレクトリ作成 → ファイルコピー → rsync転送 → temp削除

**実装手順**:

1. `upload/staging.ts` を新規作成
   ```typescript
   async function prepareStagingDirectory(
     uploadFiles: UploadFile[],
     ignorePatterns: string[],
   ): Promise<string> {
     const stagingDir = await Deno.makeTempDir({ prefix: "uploader_staging_" });
     const ignoreMatcher = new IgnoreMatcher(ignorePatterns);

     for (const file of uploadFiles) {
       if (ignoreMatcher.matches(file.relativePath)) continue;
       if (file.changeType === "delete") continue;

       const destPath = join(stagingDir, file.relativePath);
       // ファイルコピー処理
     }

     return stagingDir;
   }
   ```

2. `remote-diff.ts` と `ws-target-checker.ts` を修正
   - staging使用に変更
   - `getDiff(stagingDir, [])` で全体比較（`--delete`有効）

3. `executor.ts` を修正
   - staging経由のアップロードに変更

**影響範囲**:

- 新規: `upload/staging.ts` (約200行)
- 修正: `remote-diff.ts` (30行), `ws-target-checker.ts` (50行), `executor.ts`
  (100行)
- テスト: 新規テスト約300行

**所要時間見積もり**: 実装3日 + テスト2日 = **5日**

**要件適合性**:

- 要件1 (CUI/GUI一貫性): ⚠️ 条件付き（diff時とupload時で2回staging作成）
- 要件2 (プロトコル一貫性): ✅ 一致
- 要件3 (syncモード対応): ✅ 対応
- 要件4 (組み合わせ): ⚠️ 条件付き
- 要件5 (パフォーマンス): ⚠️ コピーコスト（10,000ファイルで10秒）

**不採用理由**:

- diff表示時とupload実行時で2回staging作成が必要
- 全ファイルをディスクにコピーするオーバーヘッド
- 提案Cの方がパフォーマンスが良い

---

### 提案B: 現在の実装を改善（段階的）【不採用】

**実現可能性**: ⭐⭐⭐ (中)

**実装手順**:

1. `remote-diff.ts` に ignore + mirror 追加
   ```typescript
   async function getRsyncDiffForTarget(...) {
     const ignoreMatcher = new IgnoreMatcher(target.ignore || []);

     // mirrorモード時はfilePathsを空にする
     const filePaths = target.sync_mode === "mirror"
       ? []
       : extractFilePaths(uploadFiles).filter(p => !ignoreMatcher.matches(p));

     const diff = await uploader.getDiff(localDir, filePaths, options);

     // diff結果をフィルタリング
     diff.entries = diff.entries.filter(e => !ignoreMatcher.matches(e.path));
   }
   ```

2. rsync.ts の `getDiff()` に `--exclude` 追加
   ```typescript
   if (ignorePatterns && ignorePatterns.length > 0) {
     for (const pattern of ignorePatterns) {
       args.push(`--exclude=${pattern}`);
     }
   }
   ```

3. gitモードに ignoreフィルタ追加
   - `converters.ts` の `diffFilesToUploadFiles()` を修正

**影響範囲**:

- 修正: `remote-diff.ts` (50行), `rsync.ts` (20行), `converters.ts` (10行)
- テスト: 新規テスト約200行

**所要時間見積もり**: 実装2日 + テスト1日 = **3日**

**要件適合性**:

- 要件1 (CUI/GUI一貫性): ❌ 不一致（rsyncのみgetDiff()、他は差分表示不可）
- 要件2 (プロトコル一貫性): ❌ 不一致（プロトコル間で機能差）
- 要件3 (syncモード対応): ⚠️ 部分的（`--files-from`問題が残る）
- 要件4 (組み合わせ): ❌ 多数の組み合わせで問題
- 要件5 (パフォーマンス): ✅ 良好

**不採用理由**:

- **`--files-from` + mirror の根本的矛盾が未解決**
- プロトコル間で動作が異なる（rsyncのみgetDiff()対応）
- フィルタリングが複数箇所に分散（保守性低下）
- 要件2, 3, 4を満たさない

---

### 提案D: rsync最適化 + 他プロトコル統一【不採用】

**実現可能性**: ⭐⭐ (低い)

**コンセプト**:

- rsync: `getDiff()` 使用 + `--exclude` 追加
- 他プロトコル: `listRemoteFiles()` 使用

**不採用理由**:

- プロトコル別の分岐が複雑化
- 一貫性の原則に反する（設計原則違反）
- rsyncと他プロトコルで処理フローが異なる
- テスト・保守が困難

---

## 完了済み: diff viewer ブラウザ自動起動制御 (2026-01-10)

**目的**: GUI diff
viewerのブラウザ自動起動を制御可能にし、タブの使い回しを可能にする

### 実装内容

- [x] `--cui`オプションの追加
  - `src/cli/args.ts`: booleanオプションに追加、ヘルプテキスト更新
  - `src/types/cli.ts`: `CliOptions`/`CliArgs`に`cui: boolean`を追加

- [x] `--no-browser`の動作変更
  - `src/diff-viewer/mod.ts`: `startDiffViewer()`の分岐ロジック変更
    - 変更前: `openBrowser === false` → CUIモード
    - 変更後: `cui === true` → CUIモード
    - 変更後: `openBrowser === false` → GUIサーバ起動、ブラウザ自動起動なし
  - `src/types/diff-viewer.ts`: `DiffViewerOptions`に`cui: boolean`を追加

- [x] main.tsでのオプション渡し方を変更
  - `cui: args.cui`を追加
  - `openBrowser`の計算ロジックは維持

- [x] テスト追加/更新
  - `tests/cli/args_test.ts`: `--cui`オプションのテスト3件追加
  - `tests/diff-viewer/server_test.ts`: `DiffViewerOptions`に`cui: false`を追加

### 動作仕様

```bash
# CUI確認なしアップロード
uploader <profile>

# CUI確認付きアップロード
uploader --diff --cui <profile>

# GUI確認（自動起動）
uploader --diff <profile>

# GUI確認（手動起動）
uploader --diff --no-browser <profile>
```

### テスト結果

- 全テスト通過: 83 passed (574 steps)
- lint エラー0件
- 型チェック通過

---

## 完了済み: diff viewer 全ターゲット事前チェック機能

**目的**: UX改善 -
全ターゲットの差分を事前にチェックし、正確なファイル数表示とアップロード動作の予測可能性を向上

### Phase 1: 全ターゲット並列チェック

- [x] 初回ローディング時に全ターゲットの差分を並列チェック
  - `checkAllTargetsDiff()` 関数を追加 (`ws-handler.ts`)
  - 同時実行数を制限（デフォルト: 3、`concurrency`オプションで調整可能）
  - 結果を `diffCacheByTarget` にキャッシュ

- [x] ローディング進捗の表示
  - WebSocketメッセージ `loading_progress` を追加 (`types/diff-viewer.ts`)
  - 現在チェック中のターゲット名を表示
  - 完了ターゲット数/全ターゲット数を表示
  - ブラウザUI側でプログレスバーとターゲット別結果を表示 (`scripts.ts`,
    `styles.ts`)

- [x] ターゲット切替時のキャッシュ参照
  - キャッシュがあればネットワーク通信なしで即時表示
  - `handleSwitchTarget()` を修正

### Phase 2: Confirm画面の改善

- [x] 各ターゲットのアップロード内容を明示
  - ターゲットごとのファイル数を表示
  - 変更種別ごとの内訳（追加/変更/削除）を表示
  - 例:
    `localhost:/var/www - 8228 files (+5000 new, ~3200 modified, -28 deleted)`

- [x] Confirmダイアログのレイアウト改善
  - 全ターゲットの概要を一覧表示
  - 0件のターゲットは「No changes」と明示
  - エラーが発生したターゲットはエラーメッセージを表示

---

## 完了済み: diff-viewer コード分割による保守性向上

### html.ts の分割

- [x] `styles.ts` に CSS を分離
- [x] `scripts.ts` に JavaScript を分離
- [x] `html.ts` を更新して分離したモジュールをインポート

### server.ts の責任分離

- [x] `ws-handler.ts` に WebSocket メッセージハンドラを分離
- [x] `file-content.ts` にローカル/リモートファイル取得ロジックを分離
- [x] `server.ts` を HTTP サーバ処理に集中

---

## 完了済み (Phase 11: ignore設定の階層化)

**目的**: ターゲットごとに柔軟なignoreパターンを設定可能にする

### 実装内容

- [x] **Phase 11.1: 型定義の更新** (src/types/config.ts)
  - `GlobalConfig` に `ignore_groups` と `default_ignore` を追加
  - `IgnoreConfig` 型を追加（`{ use?: string[]; add?: string[] }`）
  - `TargetConfig` に `ignore?: IgnoreConfig` を追加
  - `TargetDefaults` にも `ignore` が含まれる（派生型）
  - `ResolvedTargetConfig` に `ignore: string[]`（解決済みパターン配列）を追加

- [x] **Phase 11.2: 設定バリデーションの更新** (src/config/validator.ts)
  - `ignore_groups` のバリデーション（各グループは文字列配列）
  - `default_ignore` のバリデーション（存在するグループ名のみ）
  - `IgnoreConfig.use` のバリデーション（存在するグループ名のみ）
  - `IgnoreConfig.add` のバリデーション（文字列配列）

- [x] **Phase 11.3: 設定解決ロジックの実装** (src/config/loader.ts)
  - `getIgnoreGroups()` 関数追加（後方互換性対応）
  - `getDefaultIgnoreGroups()` 関数追加
  - `resolveIgnoreConfig()` 関数追加
  - `resolveTargetIgnore()` 関数追加
  - `resolveProfile()` 内でターゲットごとの ignore を解決

- [x] **Phase 11.4: 既存コードの更新**
  - `ResolvedTargetConfig.ignore` が各ターゲットで利用可能に
  - プロファイル共通の `ignore` は後方互換性のため維持

- [x] **Phase 11.5: テストの追加**
  - tests/config/validator_test.ts に ignore_groups 関連テスト追加
  - tests/config/loader_test.ts に ignore 解決ロジックのテスト追加
  - 優先順位テスト（target > defaults > default_ignore）

- [x] **Phase 11.6: ドキュメント更新**
  - SPEC.md の設定例を更新
  - 新しい ignore_groups 形式の使用例を追加

### 設定例

```yaml
_global:
  ignore_groups:
    common: ["*.log", ".git/"]
    template: ["template/"]
  default_ignore: [common]

profile:
  to:
    defaults:
      ignore:
        use: [common, template] # defaults での指定
    targets:
      - dest: /var/www/A # defaults.ignore を使用
      - dest: /var/www/B
        ignore:
          use: [common] # defaults を上書き
          add: ["special/"] # 追加パターン
      - dest: /var/www/C
        ignore:
          use: [] # 何も除外しない
```

### 後方互換性（削除済み）

~~既存の `_global.ignore`（文字列配列）は内部的に `_legacy` グループとして扱い、
`default_ignore: [_legacy]` として動作。既存の設定はそのまま動作する。~~

**注: 後方互換性機能は削除されました。** `_global.ignore_groups` +
`_global.default_ignore` を使用してください。

### 不具合修正: defaults.ignoreがprofile.ignoreに反映されない問題

**問題**:
`to.defaults.ignore`で設定したignoreパターンが`profile.ignore`に反映されず、
常に`_global.default_ignore`が使われていた。

**修正内容**: `resolveProfile()`で`profile.ignore`を解決する際に、
`defaults.ignore`が存在すればそれを優先的に使用するように変更。

**優先順位**:

1. `target.ignore` - ターゲット固有の設定
2. `to.defaults.ignore` - プロファイル内のデフォルト設定
3. `_global.default_ignore` - グローバルデフォルト設定

---

## 完了済み (Phase 1: ベース部分)

- [x] プロジェクト構造の作成
- [x] deno.json（インポートマップ、タスク定義）
- [x] 型定義（src/types/）
  - [x] config.ts - 設定ファイル型
  - [x] cli.ts - CLI引数型
- [x] CLI引数パーサー（src/cli/）
  - [x] @std/cli を使用（cliffyはDeno 2.x非対応のため）
  - [x] --help, --version, 各種オプション
- [x] 設定ファイル読込（src/config/）
  - [x] loader.ts - YAML読込、プロファイル解決
  - [x] validator.ts - 設定検証
  - [x] env.ts - 環境変数展開（${VAR}形式）、チルダ展開
- [x] UI基盤（src/ui/）
  - [x] colors.ts - カラー定義、ボックス文字、アイコン
  - [x] banner.ts - 起動バナー
  - [x] logger.ts - ログ出力（セクション、ツリー、ボックス表示）
- [x] main.ts エントリーポイント

## 完了済み (Phase 2: Git差分抽出)

- [x] src/git/mod.ts - Gitモジュール
- [x] src/git/diff.ts - git diff実行、差分ファイル一覧取得
  - `git diff --name-status <base>...<target>` でファイル一覧
  - 追加(A)、変更(M)、削除(D)、リネーム(R)の判定
- [x] src/git/file-reader.ts - 差分ファイルの内容取得
  - `git show <ref>:<path>` でファイル内容取得
- [x] CLI引数 --base, --target の反映
- [x] src/types/git.ts - Git関連の型定義
- [x] 差分サマリー表示機能（logDiffSummary）
- [x] GitCommandErrorのエラーハンドリング

## 完了済み (Phase 3: ファイルモード)

- [x] src/file/mod.ts - ファイルモジュール
- [x] src/file/collector.ts - ファイル収集
  - glob パターン対応
  - 末尾 `/` の処理（中身のみ vs ディレクトリごと）
  - ファイルサイズ・更新日時の取得
  - 重複除去
- [x] src/file/ignore.ts - ignoreパターンマッチング
  - _global.ignore との統合
  - IgnoreMatcherクラス（globパターンをRegExpにコンパイル）
- [x] src/types/file.ts - ファイルモード用型定義
  - CollectedFile, FileCollectResult, FileCollectOptions
- [x] src/ui/logger.ts - ファイルサマリー表示機能
  - logFileSummary, logNoFiles
- [x] main.ts にファイルモード処理を統合

## 完了済み (Phase 4: アップロード機能)

- [x] src/types/upload.ts - アップロード関連の型定義
  - UploadFile, TransferStatus, UploadResult等
  - UploadError (エラーコード付き)
- [x] src/upload/mod.ts - アップロードモジュール
  - createUploader: プロトコルに応じたアップローダー作成
  - diffFilesToUploadFiles: Git差分からUploadFileへ変換
  - collectedFilesToUploadFiles: ファイル収集結果からUploadFileへ変換
  - uploadToTargets: 複数ターゲットへの順次アップロード
- [x] src/upload/sftp.ts - SFTP転送（ssh2使用）
  - npm:ssh2 パッケージの導入
  - SSH鍵認証、パスワード認証
  - リトライ処理（指数バックオフ）
  - ディレクトリ自動作成
- [x] src/upload/scp.ts - SCP転送（外部コマンド）
  - ssh/scpコマンドを使用
  - SSH鍵認証対応
  - リトライ処理
- [x] src/upload/local.ts - ローカルコピー（Deno API使用）
  - ディレクトリ自動作成（ensureDir）
  - タイムスタンプ保持オプション
- [x] src/upload/progress.ts - 転送進捗管理
  - TransferProgressManager クラス
  - ファイル単位・ターゲット単位の進捗追跡
- [x] src/ui/logger.ts - アップロード進捗表示
  - logUploadStart, logUploadProgress, logUploadSuccess, logUploadFailure
  - プログレスバー表示
- [x] main.ts にアップロード処理を統合

## 完了済み (Phase 5: diff viewer)

- [x] src/diff-viewer/mod.ts - diff viewerモジュール
  - startDiffViewer: diff viewer起動の統合関数
  - ブラウザ自動起動 + CUIフォールバック
- [x] src/diff-viewer/server.ts - HTTPサーバ（Deno.serve）
  - 静的ファイル配信
  - WebSocketハンドラ統合
- [x] src/diff-viewer/browser.ts - ブラウザ起動
  - プラットフォーム対応（darwin/windows/linux）
  - WSL対応（wslview）
  - cuiConfirm: CUIモードでの差分確認
- [x] src/diff-viewer/static/html.ts - フロントエンドファイル
  - HTML/CSS/JS（TypeScript文字列として埋め込み）
  - ファイルツリー表示
  - side-by-side / unified 切替
  - LCSベースの簡易diffアルゴリズム
- [x] src/types/diff-viewer.ts - diff viewer用型定義
  - WebSocketメッセージ型
  - DiffViewerOptions, DiffViewerResult
- [x] main.ts に diff viewer 処理を統合
  - --diff オプション対応
  - ファイルモードでの警告表示

## 完了済み (Phase 6: UI強化)

- [x] src/ui/spinner.ts - スピナーアニメーション
  - createSpinner(): スピナーインスタンス作成
  - withSpinner(): 非同期処理をスピナー付きで実行
  - start/stop/update/succeed/fail/warn メソッド
- [x] src/ui/progress.ts - プログレスバー
  - createProgressBarString(): プログレスバー文字列生成
  - renderSingleTargetProgress(): 単一ターゲット用表示
  - renderMultiTargetProgress(): 複数ターゲット用並列表示
  - createProgressDisplay(): 上書き更新対応コントローラ
  - printInlineProgress(): 1行インライン表示
- [x] src/ui/prompt.ts - インタラクティブ確認
  - confirm(): Yes/No確認プロンプト
  - confirmUpload(): アップロード確認ダイアログ
  - input(): 文字列入力（パスワードマスク対応）
  - select(): 選択肢プロンプト
- [x] 成功/エラー時のボックス表示改善
  - 動的幅計算（コンテンツに応じた幅調整）
  - ANSIエスケープコード対応の文字幅計算
  - logWarningBox(): 警告ボックス追加

## 完了済み (Phase 7: リモート比較機能)

リモートサーバーとローカルファイルの差分を表示する機能。

### 概要

| モード | --diff=git     | --diff=remote        | デフォルト |
| ------ | -------------- | -------------------- | ---------- |
| git    | ブランチ間比較 | ローカル vs リモート | git        |
| file   | ❌ エラー      | ローカル vs リモート | remote     |

### タスク

- [x] CLIオプション拡張
  - [x] `--diff` を複数値対応に変更（git, remote, both）
  - [x] fileモードのデフォルトを `remote` に
  - [x] fileモードで `--diff=git` 指定時はエラー
  - [x] src/types/cli.ts: DiffMode, DiffOption 型追加
  - [x] src/cli/args.ts: parseDiffOption() 追加
- [x] リモートファイル取得機能（基盤実装）
  - [x] src/types/upload.ts: RemoteFileContent, Uploader.readFile() 追加
  - [x] src/upload/sftp.ts: readFile() 実装
  - [x] src/upload/scp.ts: readFile() 実装
  - [x] src/upload/local.ts: readFile() 実装
- [x] diff viewer 型定義拡張
  - [x] src/types/diff-viewer.ts: DiffViewerOptions.diffMode 追加
  - [x] src/types/diff-viewer.ts: DiffViewerOptions.targets, uploadFiles 追加
  - [x] src/types/diff-viewer.ts: FileRequestType 型追加
  - [x] src/types/diff-viewer.ts: WsFileResponseMessage 拡張（local/remote
        フィールド）
  - [x] src/types/diff-viewer.ts: WsInitMessage.data.diffMode, remoteTargets
        追加
- [x] diff viewer UI更新
  - [x] タブ切り替え: [Git Diff] [Remote Diff]
  - [x] diffModeに応じたタブ表示制御
  - [x] remote diff表示対応（Local vs Remote ヘッダー表示）
- [x] リモートファイル取得ロジック実装（server.ts）
  - [x] requestType: "remote" 対応
  - [x] requestType: "both" 対応
  - [x] Uploaderへの接続・取得処理（キャッシュ付き）
- [x] fileモードでのdiff viewer有効化
  - [x] main.ts: remote diffモードの完全実装
  - [x] 警告を削除
- [x] ファイルステータス動的更新（remoteStatusに基づく）
  - [x] src/types/diff-viewer.ts: WsFileResponseMessage.remoteStatus 追加
  - [x] src/diff-viewer/server.ts: getLocalAndRemoteContentsでremoteStatus計算
  - [x] src/diff-viewer/static/html.ts: updateFileStatus関数追加
  - [x] src/diff-viewer/static/html.ts: "U"（Unchanged）ステータスCSS追加
  - [x] 変更なしファイル選択時のメッセージ表示対応

## 完了済み (Phase 7.5: diff viewerリアルタイム進捗表示)

diff
viewerで「Upload」「Cancel」ボタン押下時に適切なフィードバックを表示する機能。

### タスク

- [x] 型定義の追加（src/types/diff-viewer.ts）
  - [x] DiffViewerProgressController インターフェース
  - [x] WsProgressMessage, WsCompleteMessage, WsCancelledMessage
  - [x] UploadCompleteData
- [x] サーバー側実装（src/diff-viewer/server.ts）
  - [x] createProgressController() 関数追加
  - [x] confirm時: WebSocket接続を維持し、progressController を返却
  - [x] cancel時: cancelled メッセージ送信後に切断
- [x] フロントエンドUI（src/diff-viewer/static/html.ts）
  - [x] 進捗モーダルのCSS追加
  - [x] showProgressModal(): アップロード開始時のモーダル表示
  - [x] updateProgress(): プログレスバー・ファイル名・ホスト名の更新
  - [x] showComplete(): 完了表示（統計情報付き）
  - [x] showCancelled(): キャンセル表示
  - [x] showUploadError(): エラー表示
  - [x] formatDuration(), formatSize() ヘルパー関数
  - [x] メッセージハンドラの拡張（progress, complete, cancelled）
- [x] main.tsへの統合
  - [x] diffViewerController の保存
  - [x] 進捗コールバックでWebSocket経由の送信追加
  - [x] 完了/エラー通知の送信
  - [x] 接続クローズ処理

## 完了済み (Phase 8: その他)

- [x] --log-file オプション実装
  - ログファイルへの書き込み機能
  - ANSIカラーコード除去によるプレーンテキスト出力
  - バッファリングによる効率的なファイルI/O
  - 開始/終了タイムスタンプの記録
- [x] --strict モード実装（Phase 4で実装済み）
  - ファイル転送エラー時の即座終了
  - uploadToTarget関数でoptions.strictをチェック
- [x] エラーハンドリング強化（Phase 4で実装済み）
  - 接続失敗時のリトライ（SFTP/SCPで指数バックオフ）
  - 認証失敗時の即時終了（AUTH_ERRORコードで検出）
  - 部分失敗時のサマリー（logUploadFailureで表示）

## 完了済み (Phase 9: diff viewer 大規模ファイル対応)

大量ファイル（数万件）時のdiff viewerパフォーマンス改善。

### Phase 9.1: 接続数制限 ✅ 完了

- [x] src/utils/batch.ts 作成
  - `batchAsync()`: 並行処理数を制限しながら非同期処理を実行
  - `batchAsyncWithProgress()`: 進捗コールバック付きのバッチ処理
- [x] src/diff-viewer/server.ts: `Promise.all` を `batchAsync` に置換
- [x] CLIオプション `--concurrency <num>` 追加（デフォルト: 10）
- [x] tests/utils/batch_test.ts テスト追加

### Phase 9.2: ツリー構造 + 遅延読み込み ✅ 完了

- [x] 型定義追加（src/types/diff-viewer.ts）
  - DiffTreeNode型（name, path, type, status, loaded, children, fileCount）
  - FileChangeType の再利用
- [x] WebSocketメッセージ追加
  - `expand_directory`: クライアント→サーバー（ディレクトリ展開リクエスト）
  - `directory_contents`: サーバー→クライアント（子要素レスポンス）
  - WsInitMessage に `tree`, `lazyLoading` フィールド追加
- [x] ツリー変換ユーティリティ（src/utils/tree.ts）
  - `buildTree()`: フラットリストから完全ツリー構造を構築
  - `buildRootLevelTree()`: ルートレベルのみのツリーを構築（遅延読み込み用）
  - `getDirectChildren()`: 指定ディレクトリの直下の子を取得
  - `shouldUseLazyLoading()`: 遅延読み込みを使用すべきか判定（閾値: 100）
- [x] サーバー側実装（src/diff-viewer/server.ts）
  - ファイル一覧をツリー構造に変換
  - 初期化時はルートレベルのみremote statusチェック（100ファイル以上の場合）
  - `expand_directory` ハンドラ実装
- [x] フロントエンド実装（src/diff-viewer/static/html.ts）
  - 遅延読み込みモード対応（state.lazyLoading, state.tree）
  - ツリーUIの折りたたみ/展開対応（renderLazyTree関数）
  - 展開時に `expand_directory` メッセージ送信
  - `directory_contents` 受信時にツリー更新（handleDirectoryContents関数）
  - ローディング表示（⏳アイコン）
- [x] テスト追加（tests/utils/tree_test.ts）

### Phase 9.2.5: rsync一括アップロード ✅ 完了

- [x] `Uploader`インターフェースに`bulkUpload`メソッド追加（オプション）
- [x] `RsyncUploader.bulkUpload()`実装
  - ステージングディレクトリ作成
  - 全ファイルを配置（content/sourcePathどちらも対応）
  - 1回のrsyncコマンドで一括転送
- [x] `uploadToTarget()`でbulkUpload自動検出・使用

### Phase 9.3: rsync dry-run 差分検出 ✅ 完了

- [x] `RsyncUploader.getDiff()`メソッド追加
  - `rsync -n --itemize-changes`実行
  - 出力パース（`>f+++++++++` = 新規A, `>f.st......` = 変更M, `*deleting` =
    削除D）
  - 変更ファイル一覧を返す
- [x] diff viewerの初期化時に`getDiff()`で変更ファイルのみ取得
- [x] fileモード + rsyncプロトコル時のみ有効化
- [x] 従来の個別readFile()チェックとの使い分け（rsync以外のプロトコル用）

**実装詳細**:

- src/types/upload.ts: `RsyncDiffResult`, `RsyncDiffEntry`,
  `RsyncDiffChangeType`型追加
- src/types/upload.ts: `Uploader.getDiff?()`オプションメソッド追加
- src/upload/rsync.ts: `RsyncUploader.getDiff()`実装
- src/utils/rsync-parser.ts: `parseItemizeChanges()`,
  `parseItemizeLine()`パーサー実装
- src/diff-viewer/server.ts: `tryRsyncGetDiff()`, `filterFilesByRsyncDiff()`追加
- src/types/diff-viewer.ts: `DiffViewerOptions.localDir`フィールド追加
- main.ts: fileモード時にlocalDirを算出してdiff viewerに渡す
- tests/utils/rsync_parser_test.ts: パーサーのユニットテスト追加

---

## 【常時タスク】単体テスト & リファクタリング

目標: コードカバレッジ90%以上

### Phase T1: リファクタリング不要のテスト ✅ 完了

| ファイル            | Branch % | Line % |
| ------------------- | -------- | ------ |
| cli/args.ts         | 100.0    | 100.0  |
| config/env.ts       | 100.0    | 100.0  |
| config/validator.ts | 90.9     | 89.7   |
| file/ignore.ts      | 92.0     | 95.8   |
| upload/progress.ts  | 87.5     | 94.9   |

- [x] tests/config/validator_test.ts - 設定検証テスト
- [x] tests/config/env_test.ts - 環境変数展開テスト
- [x] tests/file/ignore_test.ts - パターンマッチングテスト
- [x] tests/upload/progress_test.ts - 進捗管理テスト
- [x] tests/cli/args_test.ts - CLI引数パーステスト

### Phase T2: リファクタリング + テスト ✅ 完了

| ファイル          | Branch % | Line % |
| ----------------- | -------- | ------ |
| git/diff.ts       | 90.9     | 96.9   |
| file/collector.ts | 88.6     | 74.0   |
| config/loader.ts  | 89.5     | 72.8   |

- [x] CommandExecutor インターフェース導入
  - src/types/executor.ts - コマンド実行インターフェース
  - git/diff.ts の Deno.Command 呼び出しを抽象化
  - tests/git/diff_test.ts - Git差分抽出テスト（モック使用）
- [x] FileSystem インターフェース導入
  - src/types/filesystem.ts - ファイルシステムインターフェース
  - file/collector.ts の Deno.readDir/stat を抽象化
  - tests/file/collector_test.ts - ファイル収集テスト（モック使用）
- [x] config/loader.ts テスト
  - tests/config/loader_test.ts - 設定読込テスト（一時ファイル使用）

### Phase T3: 結合テスト（Docker環境） ✅ 完了

- [x] docker-compose.test.yml 作成
  - SFTPサーバ（atmoz/sftp）
  - SSH鍵セットアップスクリプト
- [x] tests/integration/sftp_test.ts - SFTP転送テスト
- [x] tests/integration/scp_test.ts - SCP転送テスト
- [x] tests/integration/git_test.ts - 実Git操作テスト

#### 結合テストの実行方法

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

Note: Dockerが起動していない場合、SFTP/SCPテストは自動的にスキップされる。
Gitテストはローカル一時リポジトリを使用するため、Dockerなしで実行可能。

#### 技術的注意事項

- **linuxserver/openssh-server**:
  atmoz/sftpではなくlinuxserver/openssh-serverを使用。
  SCPはフルSSHアクセスが必要なため。
- **PerSourcePenalties無効化**: OpenSSH 9.7+で導入された認証失敗ペナルティ機能を
  無効化する設定(`PerSourcePenalties no`)を`custom-cont-init.d/10-rate-limit.sh`で
  適用。これにより、失敗テスト後も他のテストが正常に実行される。
- **ホストキー変更時**: コンテナ再作成時にSSHホストキーが変わるため、
  `ssh-keygen -f ~/.ssh/known_hosts -R '[localhost]:2222'`で古いキーを削除する必要がある。

### テスト規約

- Denoの標準テスト（@std/testing）を使用
- ファイル命名: `*_test.ts`
- テスト構造: `Deno.test()` + `describe/it` パターン
- モック: 依存性注入でテスト用実装を渡す

---

## 完了済み (Phase 10: コードリファクタリング)

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
