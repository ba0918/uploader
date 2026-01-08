# uploader 実装TODO

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
  - 接続・切断テスト
  - ファイルアップロード（バッファ/ファイルパス）
  - ファイル読み取り
  - ファイル削除
  - エラーハンドリング（無効なホスト、認証失敗）
- [x] tests/integration/scp_test.ts - SCP転送テスト
  - SSH鍵認証による接続テスト
  - ファイルアップロード
  - ファイル読み取り/削除
  - エラーハンドリング
- [x] tests/integration/git_test.ts - 実Git操作テスト
  - getDiff（ブランチ間差分）
  - getFileContent（ファイル内容取得）
  - getStagedDiff（ステージング差分）
  - getUntrackedFiles（未追跡ファイル）
  - エラーハンドリング
  - リネーム検出

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

### 期待される動作

```bash
# gitモード
uploader --diff development          # git diff（従来通り）
uploader --diff=git development      # 明示的にgit diff
uploader --diff=remote development   # ローカル vs リモート
uploader --diff=both development     # 両方（タブ切り替え）

# fileモード
uploader --diff staging              # remote diff（デフォルト）
uploader --diff=remote staging       # 明示的（同じ動作）
uploader --diff=git staging          # エラー
```

---

## 完了済み (Phase 7.5: diff viewerリアルタイム進捗表示)

diff
viewerで「Upload」「Cancel」ボタン押下時に適切なフィードバックを表示する機能。

### 背景

従来は「Upload」「Cancel」押下後、画面下部に「Disconnected」と表示されるだけで、
実際の処理状況がブラウザ上で確認できなかった。

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

### 動作

**「Upload」ボタン押下時:**

1. 進捗モーダルが表示される
2. ホスト名、ファイル名、プログレスバーがリアルタイムで更新される
3. 完了時: 「Upload Complete」と統計情報（ファイル数、時間、サイズ）が表示される
4. エラー時: 「Upload Failed」とエラーメッセージが表示される

**「Cancel」ボタン押下時:**

- 「Upload Cancelled」モーダルが表示される
- 「You can close this page now.」メッセージが表示される

---

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

---

## 未着手 (Phase 9: diff viewer 大規模ファイル対応)

大量ファイル（数万件）時のdiff viewerパフォーマンス改善。

### 背景・問題

50,000ファイル規模のプロジェクトで `--diff=remote` を実行すると:

1. **SSH接続過負荷**: `Promise.all`で全ファイルのremote statusを同時チェック
   → SSHサーバーが `Connection reset by peer` で接続拒否
2. **ブラウザフリーズ**: 5万要素のDOM生成でブラウザがハング
3. **WebSocket過負荷**: 大量データの一括送信でメモリ不足

### Phase 9.1: 接続数制限（必須・優先度高）

**目的**: SSH接続の同時実行数を制限してサーバー負荷を軽減

- [ ] src/utils/batch.ts 作成
  ```typescript
  export async function batchAsync<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    concurrency: number = 10
  ): Promise<R[]>
  ```
- [ ] src/diff-viewer/server.ts: `Promise.all` を `batchAsync` に置換
- [ ] 設定可能なconcurrency値（環境変数 or CLIオプション）

### Phase 9.2: ツリー構造 + 遅延読み込み（推奨・優先度中）

**目的**: 初期ロード時間短縮、メモリ使用量削減

**コンセプト**:
```
初期表示:
  dir1/          ← ディレクトリのみ（子は未読み込み）
  root1.txt      ← ルート直下のファイルのみremote statusチェック
  root2.txt

dir1/を展開時:
  dir1/
    subdir1/     ← この時点で subdir1, subdir2 のstatusをチェック
    subdir2/
    1.txt
    2.txt
  root1.txt
  root2.txt
```

- [ ] 型定義追加（src/types/diff-viewer.ts）
  ```typescript
  interface DiffTreeNode {
    name: string;
    path: string;
    type: "file" | "directory";
    status?: "A" | "M" | "D" | "U";  // ファイルのみ
    loaded?: boolean;                 // ディレクトリのみ
    children?: DiffTreeNode[];        // ディレクトリのみ
  }
  ```
- [ ] WebSocketメッセージ追加
  - `expand_directory`: クライアント→サーバー（ディレクトリ展開リクエスト）
  - `directory_contents`: サーバー→クライアント（子要素レスポンス）
- [ ] サーバー側実装（src/diff-viewer/server.ts）
  - [ ] ファイル一覧をツリー構造に変換
  - [ ] 初期化時はルートレベルのみremote statusチェック
  - [ ] `expand_directory` ハンドラ実装
- [ ] フロントエンド実装（src/diff-viewer/static/html.ts）
  - [ ] ツリーUIの折りたたみ/展開対応
  - [ ] 展開時に `expand_directory` メッセージ送信
  - [ ] `directory_contents` 受信時にツリー更新

### Phase 9.3: rsync dry-run 最適化（オプション・優先度低）

**目的**: 差分検出を1回のSSHコマンドで完了

```bash
rsync -n --itemize-changes -r local/ user@host:/remote/
```

- [ ] rsync dry-runで変更ファイル一覧を取得する関数
- [ ] 出力パース（`>f+++++++++` = 新規, `>f.st......` = 変更 等）
- [ ] readFile()を使った個別チェックの代替として使用

### Phase 9.4: 仮想スクロール（オプション・優先度低）

**目的**: 大量ファイル表示時のブラウザパフォーマンス改善

- [ ] 表示範囲のDOMのみ生成
- [ ] スクロール位置に応じて動的にDOM更新
- [ ] または: ページネーション（100件ずつ表示）

### 実装順序

1. **Phase 9.1** - 即効性あり、実装コスト低
2. **Phase 9.2** - UX改善大、実装コスト中
3. **Phase 9.3** - 高速化効果大、rsyncプロトコル限定
4. **Phase 9.4** - 必要に応じて

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

### SSH接続（ssh2使用）

```typescript
import { Client, type SFTPWrapper } from "ssh2";
import { Buffer } from "node:buffer";

const client = new Client();
client.on("ready", () => {
  client.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
    // SFTP操作
    const writeStream = sftp.createWriteStream("/remote/path");
    writeStream.end(Buffer.from(data));
  });
});
client.connect({
  host: "example.com",
  username: "user",
  privateKey: await Deno.readTextFile("~/.ssh/id_rsa"),
});
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
