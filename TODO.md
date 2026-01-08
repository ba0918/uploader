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

## Phase 3: ファイルモード

- [ ] src/file/mod.ts - ファイルモジュール
- [ ] src/file/collector.ts - ファイル収集
  - glob パターン対応
  - 末尾 `/` の処理（中身のみ vs ディレクトリごと）
- [ ] src/file/ignore.ts - ignoreパターンマッチング
  - _global.ignore との統合

## Phase 4: アップロード機能

- [ ] src/upload/mod.ts - アップロードモジュール
- [ ] src/upload/sftp.ts - SFTP転送（ssh2使用）
  - npm:ssh2 パッケージの導入
  - SSH鍵認証、パスワード認証
  - リトライ処理
- [ ] src/upload/scp.ts - SCP転送（外部コマンド or ssh2）
- [ ] src/upload/local.ts - ローカルコピー（Deno.copyFile）
- [ ] src/upload/progress.ts - 転送進捗管理
- [ ] 複数ターゲットへの順次/並列アップロード

## Phase 5: diff viewer

- [ ] src/diff-viewer/mod.ts - diff viewerモジュール
- [ ] src/diff-viewer/server.ts - HTTPサーバ（Deno.serve）
- [ ] src/diff-viewer/websocket.ts - WebSocket接続管理
- [ ] src/diff-viewer/static/ - フロントエンドファイル
  - HTML/CSS/JS
  - ディレクトリツリー表示
  - side-by-side / unified 切替
  - シンタックスハイライト
- [ ] ブラウザ自動起動
- [ ] フォールバック（CUIでの差分確認）

## Phase 6: UI強化

- [ ] src/ui/spinner.ts - スピナーアニメーション
- [ ] src/ui/progress.ts - プログレスバー
  - 単一ターゲット用
  - 複数ターゲット用（並列表示）
- [ ] src/ui/prompt.ts - インタラクティブ確認（y/n）
- [ ] 成功/エラー時のボックス表示改善

## Phase 7: その他

- [ ] --log-file オプション実装
- [ ] --strict モード実装
- [ ] エラーハンドリング強化
  - 接続失敗時のリトライ
  - 認証失敗時の即時終了
  - 部分失敗時のサマリー
- [ ] テストコード作成
  - 設定読込のテスト
  - Git差分抽出のテスト
  - モック使用のアップロードテスト

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
    "ssh2": "npm:ssh2@^1" // Phase 4で追加
  }
}
```

### SSH接続（ssh2使用予定）

```typescript
import { Client } from "npm:ssh2";

const conn = new Client();
conn.on("ready", () => {
  conn.sftp((err, sftp) => {
    // SFTP操作
  });
});
conn.connect({
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
