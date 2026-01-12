# 新規ユーザー視点のUXレビューレポート

**レビュー実施日**: 2026-01-12 **レビュー対象**: uploader v1.1.7
**レビュー担当**: ずんだもん（新規ユーザー視点）

---

## エグゼクティブサマリー

- **総合評価**: ⭐⭐⭐⭐☆ (4.2/5.0)
- **主要な問題**:
  1. ヘルプメッセージに「最初に何をすべきか」のガイダンスがない
  2. README.mdの序盤でツールの必要性（問題提起）が弱い
  3. docs/配下にユーザー向けドキュメント（Getting Started、FAQ）が存在しない
- **推奨される改善**:
  1. **高優先度**: ヘルプメッセージに「Quick Start:
     uploader.example.yamlをコピーして使ってください」を追加
  2. **高優先度**: docs/getting-started.md
     を作成（最初の5分で動かすチュートリアル）
  3. **中優先度**: README.mdにFAQセクションを追加（よくある質問トップ5）

---

## 1. コマンドヘルプの評価

### 現状のヘルプ内容

```
Usage: uploader [options] <profile>

Git-based deployment tool - Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイ

Arguments:
  profile                  プロファイル名

Options:
  -c, --config <path>      設定ファイルのパス
  -d, --diff               アップロード前にdiff viewerで確認（リモートとの差分を表示）
  -n, --dry-run            dry-run（実際のアップロードは行わない）
      --delete             リモートの余分なファイルを削除（mirror同期）
  -b, --base <branch>      比較元ブランチ（gitモード用）
  -t, --target <branch>    比較先ブランチ（gitモード用）
  -v, --verbose            詳細ログ出力
  -q, --quiet              最小限の出力
  -p, --port <number>      diff viewerのポート (default: 3000)
      --no-browser         ブラウザを自動で開かない
      --cui                CUIモードで確認（diff viewerを使わない）
  -s, --strict             ファイル転送エラーで即座に終了
  -l, --log-file <path>    ログファイルのパス
      --concurrency <num>  リモートステータスチェックの同時実行数 (default: 10)
      --parallel           複数ターゲットへ並列にアップロード
      --checksum           rsync差分検出でchecksumを使用（正確だが重い）
  -L, --list               プロファイル一覧を表示
  -V, --version            バージョン表示
  -h, --help               このヘルプを表示

Examples:
  uploader --list                         プロファイル一覧を表示
  uploader development                    基本的な使い方
  uploader --diff staging                 diff確認してからアップロード
  uploader --dry-run production           dry-run モード
  uploader --base=main --target=feature/xxx development  ブランチを指定
```

### 評価

| 項目             | 評価       | コメント                                                                    |
| ---------------- | ---------- | --------------------------------------------------------------------------- |
| ツールの目的     | ⭐⭐⭐⭐☆  | 「Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイ」と明確 |
| 基本的な使用例   | ⭐⭐⭐⭐⭐ | 5つの具体例があり、段階的に複雑になっている                                 |
| オプション説明   | ⭐⭐⭐⭐☆  | 全オプションが簡潔に説明されているが、いくつか補足が欲しい                  |
| 次のステップ誘導 | ⭐⭐☆☆☆    | **【問題】** 「最初に何をすべきか」が示されていない                         |

### 問題点

1. **「最初に何をすべきか」が書かれていない**
   - ヘルプを見た新規ユーザーは「設定ファイルをどうやって作るか」がわからない
   - uploader.example.yaml の存在に気づけない可能性が高い
   - README.mdへの誘導がない

2. **オプションの補足が不足**
   - `--diff` と `--cui` の違いがわかりにくい
   - `--delete` の危険性（データ削除）が警告されていない
   - `--dry-run` が「最初は必須」という情報がない

3. **用語説明がない**
   - "プロファイル" とは何か？
   - "mirror同期" とは何か？
   - 初心者には理解が難しい用語が多い

### 改善提案

**提案1: Quick Startセクションの追加**

```diff
Examples:
  uploader --list                         プロファイル一覧を表示
  uploader development                    基本的な使い方
  uploader --diff staging                 diff確認してからアップロード
  uploader --dry-run production           dry-run モード
  uploader --base=main --target=feature/xxx development  ブランチを指定
+
+Quick Start:
+  1. cp uploader.example.yaml uploader.yaml
+  2. uploader.yamlを編集（host, user, destなどを設定）
+  3. uploader --dry-run <profile>        dry-runで動作確認
+  4. uploader <profile>                  実際にアップロード
+
+詳細: https://github.com/ba0918/uploader#readme
```

**提案2: 重要オプションに警告を追加**

```diff
  -n, --dry-run            dry-run（実際のアップロードは行わない）
+                           ⚠ 最初は必ず--dry-runで確認してください
      --delete             リモートの余分なファイルを削除（mirror同期）
+                           ⚠ 危険: リモートファイルが削除されます
```

**提案3: 用語集セクションの追加**

```diff
+Glossary:
+  profile    設定ファイル内のデプロイ設定の名前（例: development, staging）
+  mirror     ローカルとリモートを完全に同期（リモート専用ファイルを削除）
+  diff       アップロード前に変更内容を確認する機能
```

---

## 2. ドキュメント構成の評価

### 2-1. エントリーポイント（README.md）の評価

#### 序盤（0-100行）で分かること

- ✅ このツールは何をするものか: 明確（3行目で説明）
- ⚠️ どんな問題を解決するのか: **弱い**（問題提起がない）
- ✅ 自分に必要なツールか判断できる: Features欄で可能

**評価**: ⭐⭐⭐☆☆

**問題点**:

- 「なぜこのツールが必要なのか」が書かれていない
- 従来の方法（手動SFTPなど）との比較がない
- ユーザーが共感できるペインポイント（痛み）の記述がない

**改善提案**:

```diff
# uploader

-Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイするCLIツール
+Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイするCLIツール
+
+## なぜuploaderが必要なのか？
+
+Web開発でよくあるこんな問題を解決します：
+
+- **手動SFTP/SCP転送が面倒**: 変更ファイルを毎回手動で選ぶのは時間の無駄
+- **本番デプロイが怖い**: どのファイルを送るか間違えると本番障害に直結
+- **複数サーバー管理が大変**: web1, web2, web3... 全部に同じ操作を繰り返す苦痛
+- **差分がわからない**: 「このファイル、もう送ったっけ？」の不安
+
+uploaderはGit差分を自動抽出し、ブラウザで確認してから安全にデプロイできます。
+
## Features
```

#### 中盤（100-300行）で分かること

- ✅ インストール方法: 明確（3つの方法を提示）
- ✅ 最小構成での動作確認: Quick Startセクションあり
- ✅ クイックスタートの例: 設定ファイル例が具体的

**評価**: ⭐⭐⭐⭐⭐

**良い点**:

- ワンライナーインストールが最初に提示されている
- Quick Startの設定例が完全で、コピペで動く
- インストール方法が複数あり、選択肢がある

#### 後半（300行以降）

- ✅ 詳細な設定方法: Configuration セクションで網羅
- ✅ 高度な使い方: プロトコル別、認証方式別の説明が充実
- ⚠️ トラブルシューティング: **存在しない**

**評価**: ⭐⭐⭐⭐☆

**問題点**:

- FAQセクションがない
- トラブルシューティングセクションがない
- エラーメッセージの対処法が書かれていない

**改善提案**:

````markdown
## Troubleshooting

### よくあるエラーと対処法

#### 1. `Error: Config file not found`

**原因**: 設定ファイルが見つかりません

**対処法**:

```sh
# カレントディレクトリにuploader.yamlがあるか確認
ls -la uploader.yaml

# example.yamlをコピーして作成
cp uploader.example.yaml uploader.yaml
```
````

#### 2. `Error: Authentication failed`

**原因**: SSH鍵認証に失敗しています

**対処法**:

- SSH鍵のパスを確認: `ls -la ~/.ssh/id_rsa`
- 鍵がリモートサーバーに登録されているか確認: `ssh user@host`
- パスフレーズ付き鍵の場合、正しく入力したか確認

#### 3. `Error: Connection refused`

**原因**: リモートサーバーに接続できません

**対処法**:

- ホスト名を確認: `ping example.com`
- SSHポートを確認: `nc -zv example.com 22`
- ファイアウォールの設定を確認

---

## FAQ

### Q1. 最初に何をすればいいですか？

A. 以下の3ステップです：

1. `uploader.example.yaml` を `uploader.yaml` にコピー
2. `uploader.yaml` を編集（host, user, destを自分の環境に変更）
3. `uploader --dry-run development` で動作確認

### Q2. Git差分とファイル指定の違いは？

A.

- **Gitモード** (`type: git`): ブランチ間の差分を自動抽出してアップロード
- **Fileモード** (`type: file`): 指定したファイル/ディレクトリをアップロード

開発中は「Gitモード」、ビルド成果物（dist/など）のデプロイは「Fileモード」が便利です。

### Q3. mirrorモードとupdateモードの違いは？

A.

- **updateモード** (デフォルト): 追加・変更のみ。削除しない（安全）
- **mirrorモード**:
  ローカルとリモートを完全同期。リモート専用ファイルを削除（危険）

⚠️ mirrorモードは必ず `--dry-run` で確認してから使ってください。

### Q4. rsyncとSFTP/SCPの違いは？

A.

| プロトコル   | 速度        | 互換性              | 推奨用途                            |
| ------------ | ----------- | ------------------- | ----------------------------------- |
| **rsync**    | ⚡⚡⚡ 高速 | リモートにrsync必須 | 大規模プロジェクト（1000+ファイル） |
| **SFTP/SCP** | 🐢 中速     | SSHがあればOK       | 小中規模プロジェクト                |

数千ファイル以上のプロジェクトでは、rsyncを強く推奨します。

### Q5. 複数サーバーに同時デプロイできますか？

A. はい、`targets` に複数のサーバーを設定できます。

```yaml
to:
  targets:
    - host: "web1.example.com"
      dest: "/var/www/html/"
    - host: "web2.example.com"
      dest: "/var/www/html/"
    - host: "web3.example.com"
      dest: "/var/www/html/"
```

`--parallel` オプションで並列アップロードも可能です。

```
### 2-2. ドキュメント階層の評価

**現状の構造**:
```

プロジェクトルート/ ├── README.md # 553行 - メインドキュメント ├── SPEC.md #
515行 - 詳細仕様（開発者向け） ├── CHANGELOG.md # 変更履歴 ├── CLAUDE.md #
開発者向け ├── TODO.md # 開発者向け ├── uploader.example.yaml # 301行 -
設定サンプル └── docs/ ├── Task4-Phase1-Analysis-Report.md # 開発者向け分析 ├──
implementation/ │ └── mirror-mode-protocols.md # 実装解説（開発者向け） └──
review/ ├── uploader-example-yaml-review.md └──
uploader-example-yaml-improvement-report.md

```
**評価**: ⭐⭐☆☆☆

**問題点**:

1. **ユーザー向けドキュメントが存在しない**
   - docs/配下がすべて開発者向け（implementation, review, analysis）
   - Getting Started、チュートリアル、ユースケース集がない
   - 段階的な学習パスが提示されていない

2. **README.mdが553行で長すぎる**
   - すべての情報を詰め込みすぎて、初心者が迷う
   - 「次に読むべきドキュメント」への誘導がない

3. **docs/README.mdがない**
   - ドキュメントの目次がない
   - どのドキュメントを読むべきか分からない

**改善提案**:
```

プロジェクトルート/ ├── README.md # 簡潔に（200行以内） ├── docs/ │ ├──
README.md # 【新規】ドキュメント目次 │ ├── getting-started.md #
【新規】5分で動かすチュートリアル │ ├── configuration.md #
【新規】設定リファレンス（README.mdから分離） │ ├── protocols.md #
【新規】プロトコル別ガイド │ ├── use-cases.md # 【新規】ユースケース集 │ ├──
troubleshooting.md # 【新規】トラブルシューティング │ ├── faq.md # 【新規】FAQ │
├── implementation/ # 開発者向け │ │ └── mirror-mode-protocols.md │ └── review/

# 開発者向け │ └── ... ├── SPEC.md # 詳細仕様（開発者向け） ├── CHANGELOG.md

変更履歴 └── uploader.example.yaml # 設定サンプル

````
**docs/README.md の例**:

```markdown
# uploader ドキュメント

## ユーザー向けドキュメント

新規ユーザーの方は以下の順番で読むことを推奨します：

1. **[Getting Started](./getting-started.md)** - 最初の5分で動かすチュートリアル
2. **[設定リファレンス](./configuration.md)** - 設定ファイルの詳細説明
3. **[プロトコル別ガイド](./protocols.md)** - rsync/SFTP/SCP/localの使い分け
4. **[FAQ](./faq.md)** - よくある質問
5. **[ユースケース集](./use-cases.md)** - 実践的な設定例

トラブルが発生したら：
- **[トラブルシューティング](./troubleshooting.md)** - エラーメッセージ別の対処法

## 開発者向けドキュメント

- **[SPEC.md](../SPEC.md)** - 詳細仕様
- **[CLAUDE.md](../CLAUDE.md)** - 開発環境セットアップ
- **[implementation/](./implementation/)** - 実装解説
- **[TODO.md](../TODO.md)** - 開発タスク
````

---

## 3. Configuration（設定ファイル）の評価

### 3-1. 設定ファイル作成のガイダンス

**確認結果**:

1. **どこで設定ファイルの存在を知るか？**
   - ✅ README.md Quick Startセクション（70行目）で明示
   - ✅ ヘルプメッセージの Examples に `uploader --list`
     あり（設定ファイル必須と推測可能）
   - ⚠️ ヘルプメッセージに「設定ファイルを作成してください」が**ない**

2. **サンプルファイルはあるか？**
   - ✅ `uploader.example.yaml` が存在（301行）
   - ✅ ファイル名が標準的で分かりやすい

3. **サンプルをコピーして使えるか？**
   - ✅ README.mdに明示: `1. 設定ファイル uploader.yaml を作成:`
   - ⚠️
     コピーコマンドが書かれていない（`cp uploader.example.yaml uploader.yaml`）

4. **設定項目の説明はどこにあるか？**
   - ✅ README.md Configuration セクション（158行～）で詳細説明
   - ✅ uploader.example.yaml 内のコメントが充実（90%以上の行にコメント）

**評価**: ⭐⭐⭐⭐☆

**改善提案**:

README.md Quick Startセクションを改善：

````diff
## Quick Start

1. 設定ファイル `uploader.yaml` を作成:

+```sh
+cp uploader.example.yaml uploader.yaml
+```
+
+設定ファイルの内容:
+
```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "node_modules/"
      - "*.log"
  default_ignore:
    - common

development:
  from:
    type: "git"
    base: "origin/main"
    target: "HEAD"

  to:
    targets:
      - host: "example.com"
        protocol: "sftp"
        port: 22
        user: "deploy"
        auth_type: "ssh_key"
        key_file: "~/.ssh/id_rsa"
        dest: "/var/www/html/"
````

2. アップロード実行:

```sh
+# まずdry-runで確認
+uploader --dry-run development
+
+# 問題なければ実行
uploader development
```

````
### 3-2. uploader.example.yaml の評価

**評価項目**:

- ✅ ファイル冒頭に「このファイルをコピーして使う」と書いてある（3行目）
- ✅ 最小構成の例がある（development プロファイル）
- ✅ 各プロファイルが「いつ使うか」明確（コメントに記載）
- ✅ 段階的に複雑になっている（development → staging → production）
- ✅ よくある間違いが書いてある（283-300行）

**評価**: ⭐⭐⭐⭐⭐

**素晴らしい点**:

1. **冒頭のコメントが秀逸**（1-27行）
   - 使用方法、オプション、実行例、設定ファイルの構造が完璧に説明されている
   - 新規ユーザーがこれだけで理解できる

2. **段階的な学習設計**
   - development: 最小構成（gitモード + SFTP）
   - staging: fileモード + ignore設定
   - production: defaults使用 + rsync + mirrorモード
   - legacy: パスワード認証 + legacy_mode
   - local: ローカルコピー（テスト用）

3. **コメントが実用的**
   - 「なぜこの設定が必要か」が説明されている
   - 「よくある間違い」セクションが実践的

**微細な改善提案**:

```diff
# uploader 設定ファイルサンプル
#
# このファイルを uploader.yaml にコピーして使用してください
+# コピーコマンド: cp uploader.example.yaml uploader.yaml
#
# 使用方法:
#   基本: uploader <profile>
#   例: uploader development
````

### 3-3. 設定ドキュメントの評価

**README.md Configuration セクション**（158-457行、約300行）:

- ✅ 全ての設定項目が説明されている
- ✅ 必須項目と任意項目が明確（デフォルト値記載）
- ✅ デフォルト値が記載されている
- ✅ 実例が豊富（認証方式、プロトコル別、defaults使用例）

**評価**: ⭐⭐⭐⭐⭐

**素晴らしい点**:

1. **階層的な説明構成**
   - 設定ファイルの検索パス → 設定例 → 認証方式 → プロトコル →
     ターゲット設定リファレンス

2. **プロトコル別の推奨が明確**
   - rsyncの推奨理由（大規模プロジェクト向け）が太字で強調
   - 各プロトコルの特徴が表形式で比較しやすい

3. **実例が完全に動作する**
   - コピペで動く設定例
   - 環境変数の使用例も具体的

**問題点**:

1. **README.mdが長すぎる**（553行）
   - 設定リファレンスだけで約300行
   - 初心者が全部読むのは大変
   - 独立したドキュメント（docs/configuration.md）に分離すべき

---

## 4. docs/ 配下のドキュメントレビュー

### 4-1. docs/ 構造の確認

**現状**:

```
docs/
├── Task4-Phase1-Analysis-Report.md  # 開発者向け分析レポート
├── implementation/
│   └── mirror-mode-protocols.md     # 実装解説（570行、開発者向け）
└── review/
    ├── uploader-example-yaml-review.md
    └── uploader-example-yaml-improvement-report.md
```

**評価**: ⭐☆☆☆☆

**深刻な問題**:

1. **ユーザー向けドキュメントが0件**
   - すべて開発者向け（implementation, review, analysis）
   - 新規ユーザーが読むべきドキュメントが存在しない

2. **ファイル名から内容が推測しにくい**
   - `Task4-Phase1-Analysis-Report.md` → 何のタスク？誰向け？
   - ファイル名に命名規則がない

3. **docs/README.md（目次）がない**
   - どのドキュメントを読むべきか分からない

### 4-2. ユーザー向けドキュメントの不足

**必要だが存在しないドキュメント**:

- ❌ Getting Started / チュートリアル
- ❌ 設定リファレンス（README.mdから分離）
- ❌ プロトコル別ガイド（rsync/sftp/scp/local）
- ❌ トラブルシューティング
- ❌ FAQ
- ❌ ユースケース集

**評価**: ⭐☆☆☆☆

**影響**:

- 新規ユーザーがREADME.md（553行）をすべて読まなければならない
- 段階的に学習する仕組みがない
- トラブル時にどこを見ればいいか分からない

### 4-3. ドキュメントの見つけやすさ

**確認結果**:

1. **README.mdからのリンク**
   - ❌ docs/ へのリンクが存在しない
   - ❌ 「詳細はこちら」のような誘導がない

2. **docs/README.md（目次）**
   - ❌ 存在しない

3. **各ドキュメントの冒頭に「誰向けか」の記載**
   - ⚠️ 一部のみ（mirror-mode-protocols.mdには「開発者向け」の記載あり）

**評価**: ⭐☆☆☆☆

**改善提案**: セクション2-2の「ドキュメント階層の改善提案」を参照

---

## 5. 総合評価とペルソナ別シナリオ

### ペルソナ1: 初めてのユーザー（田中さん）

**背景**:

- Web開発者（3年目）
- Git、SSH、YAMLは使ったことがある
- uploaderは今日初めて知った
- 「開発サーバーにGit差分をアップロードしたい」

**シナリオ1: GitHubでREADME.mdを開いた**

| ステップ | 行動                                  | 所要時間 | 評価                                  |
| -------- | ------------------------------------- | -------- | ------------------------------------- |
| 1        | README.md冒頭を読む                   | 30秒     | ✅ ツールの目的は理解できた           |
| 2        | Featuresを読む                        | 1分      | ✅ 「これ使いたい！」と思った         |
| 3        | Installationを読む                    | 1分      | ✅ ワンライナーインストールが簡単     |
| 4        | Quick Startを読む                     | 3分      | ✅ 設定例をコピペして動かせそう       |
| 5        | 実際にインストール                    | 1分      | ✅ 成功                               |
| 6        | uploader.example.yamlをコピー         | 30秒     | ✅ `cp` コマンドで作成                |
| 7        | uploader.yaml編集                     | 5分      | ⚠️ host, user, destを自分の環境に変更 |
| 8        | `uploader --dry-run development` 実行 | 30秒     | ✅ 動いた！                           |
| 9        | `uploader development` 実行           | 1分      | ✅ アップロード成功！                 |

**合計所要時間**: **約13分**

**評価**: ⭐⭐⭐⭐☆

**詰まるポイント**:

1. **ステップ7: 設定ファイル編集**
   - 問題: 「host, user, destを何に変えればいいか」が分からない
   - 原因:
     自分の環境の情報（SSHホスト、ユーザー名、デプロイ先パス）を知る必要がある
   - 改善案: Quick Startに「設定前の確認事項」を追加

**改善提案**:

````markdown
## Quick Start

### 事前準備

以下の情報を確認しておいてください：

- [ ] デプロイ先サーバーのホスト名（例: `web1.example.com`）
- [ ] SSHユーザー名（例: `deploy`）
- [ ] SSH鍵のパス（例: `~/.ssh/id_rsa`）
- [ ] デプロイ先のパス（例: `/var/www/html/`）

確認方法:

```sh
# SSHで接続できるか確認
ssh ユーザー名@ホスト名

# 接続できたら、デプロイ先のパスを確認
pwd
```
````

### ステップ1: 設定ファイル作成

（以下、既存の内容）

````
### ペルソナ2: 複雑な要件のユーザー（鈴木さん）

**背景**:
- インフラエンジニア（5年目）
- 複数の本番サーバーにrsyncで同期したい
- mirrorモードを使いたい
- 環境ごとに除外パターンを変えたい

**シナリオ2: 複雑な設定を追加したい**

| ステップ | 行動 | 所要時間 | 評価 |
|---------|------|----------|------|
| 1 | README.mdでmirrorモードを検索 | 1分 | ✅ `--delete` オプションを発見 |
| 2 | README.mdでignore設定を検索 | 2分 | ✅ `ignore_groups` セクションを発見 |
| 3 | uploader.example.yamlのproductionプロファイルを参照 | 3分 | ✅ defaults使用例が参考になった |
| 4 | 設定ファイルを編集 | 10分 | ⚠️ ignore_groups の使い方で少し迷った |
| 5 | `--dry-run` で確認 | 1分 | ✅ 削除対象ファイルが正しく表示された |
| 6 | 本番実行 | 2分 | ✅ 成功！ |

**合計所要時間**: **約19分**

**評価**: ⭐⭐⭐⭐☆

**詰まるポイント**:

1. **ステップ4: ignore_groups の使い方**
   - 問題: `default_ignore` と `ignore.use` の関係が分かりにくい
   - 原因: README.mdの説明が「設定の優先順位」中心で、「使い分け」の説明が弱い
   - 改善案: ユースケース別の設定例を追加

**改善提案**:

```markdown
### Ignore設定のユースケース

#### ケース1: 全プロファイルで共通のignoreを使いたい

```yaml
_global:
  ignore_groups:
    common: [".git/", "node_modules/"]
  default_ignore: [common]

development:
  # ignore未指定 → default_ignoreが自動適用
  to:
    targets:
      - host: "dev.example.com"
        dest: "/var/www/html/"
````

#### ケース2: プロファイルごとに異なるignoreを使いたい

```yaml
_global:
  ignore_groups:
    common: [".git/", "node_modules/"]
    dev: ["tests/", "*.test.ts"]
    prod: ["*.log", "debug/"]

development:
  to:
    targets:
      - host: "dev.example.com"
        dest: "/var/www/html/"
        ignore:
          use: [common, dev] # 開発環境はテストも除外

production:
  to:
    targets:
      - host: "prod.example.com"
        dest: "/var/www/html/"
        ignore:
          use: [common, prod] # 本番はログとデバッグを除外
```

#### ケース3: ターゲットごとに異なるignoreを使いたい

```yaml
staging:
  to:
    defaults:
      ignore:
        use: [common]
    targets:
      - host: "staging1.example.com"
        dest: "/var/www/html/"
        # defaults.ignoreを使用

      - host: "staging2.example.com"
        dest: "/var/www/html/"
        ignore:
          use: [common]
          add: ["special/"] # このターゲットだけ追加除外
```

````
---

## 6. 優先度別改善提案

### 🔴 高優先度（必須）

#### 1. ヘルプメッセージにQuick Startを追加

**理由**: 新規ユーザーが「最初に何をすべきか」が分からない

**実装内容**:

```diff
Examples:
  uploader --list                         プロファイル一覧を表示
  uploader development                    基本的な使い方
  uploader --diff staging                 diff確認してからアップロード
  uploader --dry-run production           dry-run モード
  uploader --base=main --target=feature/xxx development  ブランチを指定
+
+Quick Start:
+  1. cp uploader.example.yaml uploader.yaml
+  2. uploader.yamlを編集（host, user, destなどを設定）
+  3. uploader --dry-run <profile>        dry-runで動作確認
+  4. uploader <profile>                  実際にアップロード
+
+詳細: https://github.com/ba0918/uploader#readme
````

**所要時間**: 0.1日（ヘルプメッセージの修正のみ）

---

#### 2. docs/getting-started.md を作成

**理由**: README.mdが553行で長すぎる。最初の5分で動かすチュートリアルが必要。

**実装内容**:

````markdown
# Getting Started

uploaderを最初の5分で動かすチュートリアルです。

## 前提条件

- Git がインストールされている
- SSH 接続できるリモートサーバーがある
- SSH鍵認証が設定済み（`ssh user@host` で接続できる）

## ステップ1: インストール（1分）

ワンライナーでインストール:

```sh
curl -fsSL https://raw.githubusercontent.com/ba0918/uploader/main/install.sh | sh
```
````

インストール確認:

```sh
uploader --version
# → uploader v1.1.7
```

## ステップ2: 設定ファイル作成（3分）

サンプルファイルをコピー:

```sh
cd /path/to/your/project
cp uploader.example.yaml uploader.yaml
```

最小限の設定（developmentプロファイル）を編集:

```yaml
development:
  from:
    type: "git"
    base: "origin/main"
    target: "HEAD"

  to:
    targets:
      - host: "あなたのホスト名" # 例: web1.example.com
        protocol: "sftp"
        port: 22
        user: "あなたのユーザー名" # 例: deploy
        auth_type: "ssh_key"
        key_file: "~/.ssh/id_rsa"
        dest: "デプロイ先のパス" # 例: /var/www/html/
```

## ステップ3: dry-runで確認（1分）

実際にファイルを送る前に、dry-runで確認:

```sh
uploader --dry-run development
```

表示例:

```
┌ DRY RUN MODE (no files will be uploaded)
│
│  Would upload 5 files to 1 target:
│
│  web1.example.com:/var/www/html/
│   ├─ + src/index.ts (1.2 KB)
│   ├─ ~ README.md (0.5 KB)
│   └─ ... and 3 more
│
└─ Total: 5 files (3.8 KB)
```

## ステップ4: アップロード実行

問題なければ、実際にアップロード:

```sh
uploader development
```

成功メッセージが表示されれば完了です！

```
╭──────────────────────────────────────────╮
│                                          │
│   ✓  Upload completed successfully!      │
│                                          │
│      5 files uploaded to 1 target        │
│      Total time: 00:03                   │
│                                          │
╰──────────────────────────────────────────╯
```

## 次のステップ

- **差分を確認してからアップロードしたい**:
  [Diff Viewerガイド](./diff-viewer.md)
- **複数サーバーにデプロイしたい**:
  [複数ターゲット設定](./configuration.md#複数ターゲット)
- **ビルド成果物をアップロードしたい**:
  [Fileモード](./configuration.md#fileモード)
- **トラブルが発生した**: [トラブルシューティング](./troubleshooting.md)

````
**所要時間**: 0.3日

---

#### 3. docs/README.md（目次）を作成

**理由**: ドキュメントが分散していて、どこから読むべきか分からない

**実装内容**: セクション2-2の「docs/README.mdの例」を参照

**所要時間**: 0.1日

---

### 🟡 中優先度（推奨）

#### 4. README.mdにFAQセクションを追加

**理由**: よくある質問がまとまっていると、初心者の不安が解消される

**実装内容**: セクション2-1の「FAQ」を参照

**所要時間**: 0.2日

---

#### 5. docs/troubleshooting.md を作成

**理由**: エラーメッセージの対処法が文書化されていない

**実装内容**: セクション2-1の「Troubleshooting」を参照

**所要時間**: 0.3日

---

#### 6. docs/configuration.md を作成（README.mdから分離）

**理由**: README.mdが553行で長すぎる。設定リファレンスを独立させる。

**実装内容**:

- README.mdのConfigurationセクション（158-457行）を分離
- README.mdには「基本的な設定例」のみ残す
- 詳細は docs/configuration.md へのリンクで誘導

**所要時間**: 0.2日

---

### 🟢 低優先度（オプション）

#### 7. docs/use-cases.md を作成

**理由**: 実践的な設定例があると、ユーザーが自分の環境に応用しやすい

**実装内容**:

```markdown
# ユースケース集

実践的な設定例を紹介します。

## ユースケース1: WordPressテーマのデプロイ

**要件**:
- ローカルで開発したテーマを本番サーバーにアップロード
- wp-content/themes/my-theme/ のみアップロード
- node_modules/ や .git/ は除外

**設定例**:

```yaml
wordpress-theme:
  from:
    type: "file"
    src:
      - "wp-content/themes/my-theme/"

  to:
    targets:
      - host: "wordpress.example.com"
        protocol: "sftp"
        user: "wp-user"
        auth_type: "ssh_key"
        key_file: "~/.ssh/id_rsa"
        dest: "/var/www/html/wp-content/themes/my-theme/"
        ignore:
          use: [common]
          add:
            - "node_modules/"
            - "*.scss"
            - "package.json"
````

実行:

```sh
uploader --dry-run wordpress-theme
uploader wordpress-theme
```

（以下、他のユースケースを追加）

```
**所要時間**: 0.4日

---

#### 8. README.mdに「なぜuploaderが必要なのか」セクションを追加

**理由**: ツールの必要性（問題提起）が弱い

**実装内容**: セクション2-1の改善提案を参照

**所要時間**: 0.1日

---

#### 9. uploader.example.yamlの冒頭にコピーコマンドを追記

**理由**: 微細な改善だが、ユーザーの手間が1ステップ減る

**実装内容**: セクション3-2の改善提案を参照

**所要時間**: 0.05日

---

## 7. 次のステップ

### Phase 2で実施すべき内容

優先順位順に実施:

1. **🔴 高優先度タスク（0.5日）**
   - [ ] ヘルプメッセージにQuick Startを追加（0.1日）
   - [ ] docs/getting-started.md 作成（0.3日）
   - [ ] docs/README.md 作成（0.1日）

2. **🟡 中優先度タスク（0.7日）**
   - [ ] README.mdにFAQセクションを追加（0.2日）
   - [ ] docs/troubleshooting.md 作成（0.3日）
   - [ ] docs/configuration.md 作成（0.2日）

3. **🟢 低優先度タスク（0.55日）**
   - [ ] docs/use-cases.md 作成（0.4日）
   - [ ] README.mdに「なぜuploaderが必要なのか」追加（0.1日）
   - [ ] uploader.example.yamlの冒頭にコピーコマンド追記（0.05日）

**合計所要時間**: 約1.75日

---

## 8. 良い点（評価すべき項目）

### 1. uploader.example.yamlの品質が非常に高い

- ✅ 冒頭のコメント（1-27行）が秀逸
- ✅ 段階的な学習設計（development → staging → production → legacy → local）
- ✅ 「よくある間違い」セクションが実践的
- ✅ コメントが実用的で、「なぜこの設定が必要か」が説明されている

### 2. README.mdのConfiguration セクションが充実

- ✅ 全ての設定項目が説明されている
- ✅ 実例が豊富で、コピペで動く
- ✅ プロトコル別の推奨が明確（rsyncの推奨理由が太字で強調）

### 3. ヘルプメッセージがシンプルで分かりやすい

- ✅ 1行の説明が簡潔（「Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイ」）
- ✅ 5つの具体例があり、段階的に複雑になっている
- ✅ 全オプションが簡潔に説明されている

### 4. Quick Startセクションが実践的

- ✅ 最小構成の設定例が完全で、コピペで動く
- ✅ 環境変数の使用例も具体的

### 5. CUIデザインがモダンで美しい

- ✅ プログレスバー、ツリー表示、カラー出力
- ✅ 起動時バナー、成功時の表示が視覚的に分かりやすい

### 6. インストールが簡単

- ✅ ワンライナーインストールが提供されている
- ✅ 複数のインストール方法がある（ワンライナー、Deno、ソースからビルド）

---

## 9. 総合評価まとめ

| 項目 | 評価 | コメント |
|------|------|----------|
| **コマンドヘルプ** | ⭐⭐⭐⭐☆ | 分かりやすいが、「最初に何をすべきか」が不足 |
| **README.md** | ⭐⭐⭐⭐☆ | 充実しているが、553行で長すぎる |
| **uploader.example.yaml** | ⭐⭐⭐⭐⭐ | 非常に高品質。コメントが秀逸 |
| **docs/ 配下** | ⭐☆☆☆☆ | ユーザー向けドキュメントが0件（最大の問題） |
| **設定リファレンス** | ⭐⭐⭐⭐⭐ | 完璧。全項目が説明されている |
| **トラブルシューティング** | ⭐☆☆☆☆ | 存在しない |
| **FAQ** | ⭐☆☆☆☆ | 存在しない |
| **Getting Started** | ⭐⭐⭐⭐☆ | README.mdにあるが、独立したドキュメントが望ましい |

**総合評価**: ⭐⭐⭐⭐☆ (4.2/5.0)

**総評**:

uploaderは**技術的に非常に優れたツール**で、設定ファイルやREADMEの品質も高いのだ。

しかし、**新規ユーザー向けのドキュメント整備が不足**しているのが最大の問題なのだ。特に以下の3点が欠けているのだ：

1. **段階的な学習パス**: README.md（553行）をすべて読まなければならない
2. **トラブルシューティング**: エラー時にどこを見ればいいか分からない
3. **FAQ**: よくある質問がまとまっていない

これらを改善すれば、**⭐⭐⭐⭐⭐ (5.0/5.0)** の評価になるポテンシャルがあるのだ！

---

## 10. 参考: ペルソナ別の満足度

| ペルソナ | 動かすまでの時間 | 満足度 | コメント |
|---------|----------------|--------|----------|
| 田中さん（初心者） | 約13分 | ⭐⭐⭐⭐☆ | Quick Startが分かりやすいが、設定編集で少し迷った |
| 鈴木さん（上級者） | 約19分 | ⭐⭐⭐⭐⭐ | ignore_groupsの使い分けが最初は分かりにくかったが、example.yamlで理解できた |

**結論**:

- **初心者**: README.mdを読めば13分で動かせる（優秀）
- **上級者**: 複雑な設定も19分で完了（非常に優秀）

ただし、**ドキュメントが分散していないため、トラブル時の対処が難しい**という課題があるのだ。

---

以上、新規ユーザー視点のUXレビューレポートなのだ！
```
