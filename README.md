# uploader

Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイするCLIツール

## Why uploader?

### The Problem

従来のデプロイ方法には、それぞれ以下のような課題があるのだ。

**手動FTP/SFTP操作:**

- どのファイルを更新すべきか、毎回手動で確認が必要
- 削除すべきファイルの見落とし
- アップロード先の間違いによる事故

**rsyncコマンド直接実行:**

- サーバーごとにコマンドを変更・実行する手間
- 設定が分散し、管理が煩雑
- 複数環境への同時デプロイが困難

**CI/CDパイプライン（GitHub Actions、GitLab CI等）:**

- 小〜中規模プロジェクトには過剰なセットアップコスト
- 毎回の実行に時間がかかる
- ローカルでの検証が難しい

**Git pull方式:**

- 本番環境にGitリポジトリを配置するセキュリティリスク
- `.git/`ディレクトリの公開リスク
- ビルド成果物のみをデプロイしたい場合に不向き

### The Solution

uploaderは、これらの課題を解決するために設計された軽量なデプロイツールなのだ。

**Git差分ベースの安全なデプロイ:**

- ブランチ間の差分を自動検出し、変更ファイルのみをアップロード
- 不要なファイルの送信を削減し、デプロイ時間を短縮

**複数サーバへの一括デプロイ:**

- YAML設定ファイルで複数環境（dev/staging/prod）を一元管理
- 1コマンドで複数サーバへ同時デプロイ可能

**ブラウザUIでの事前確認:**

- `--diff` オプションでブラウザベースの差分ビューアを起動
- アップロード前に変更内容を視覚的に確認
- Side-by-sideまたはUnified形式で差分表示

**Dry-runによる安全性確保:**

- `--dry-run` で実際の変更内容を事前確認
- mirrorモード（完全同期）時の誤削除を防止

**プロトコル自動選択:**

- rsync / SFTP / SCP / ローカルコピーに対応
- 環境に応じて最適なプロトコルを選択可能
- 古いSSHサーバー向けのlegacy_mode対応

### Comparison with Other Tools

| 機能                     | uploader | rsync単体 | Deployer | Capistrano | Ansible |
| ------------------------ | -------- | --------- | -------- | ---------- | ------- |
| Git差分自動検出          | ✓        | ✗         | ✗        | ✗          | ✗       |
| ブラウザUI差分確認       | ✓        | ✗         | ✗        | ✗          | ✗       |
| 複数プロトコル対応       | ✓        | ✗         | ✗        | ✗          | ✓       |
| YAML設定ファイル         | ✓        | ✗         | ✓        | ✓          | ✓       |
| セットアップの容易さ     | ◎        | ◎         | ○        | △          | △       |
| 実行速度                 | ◎        | ◎         | ○        | ○          | △       |
| プログラミング言語の依存 | なし     | なし      | PHP必須  | Ruby必須   | Python  |

**uploaderの位置づけ:**

- **rsync単体より簡単**: 設定ファイルで管理、Git連携、ブラウザUI
- **DeployerやCapistranoより軽量**: 言語依存なし、最小限のセットアップ
- **Ansibleより特化**: デプロイに特化し、学習コストが低い

### When to Use uploader

uploaderが最適なユースケースなのだ。

**適用シーン:**

- 小〜中規模のWebサイト/アプリケーション
- 複数環境（dev/staging/prod）への定期的なデプロイ
- レンタルサーバーや古いSSHサーバーへのデプロイ
- Git履歴ベースでの変更ファイルのみのアップロード
- ビルド成果物（`dist/`等）のみをデプロイしたい場合

**不向きなシーン:**

- 超大規模アプリケーション（数万ファイル以上）
- コンテナオーケストレーション（Kubernetes等）が必要な環境
- 複雑なインフラ管理やプロビジョニングが必要な場合
  - → AnsibleやTerraformの使用を推奨

**uploaderは「銀の弾丸」ではないのだ。**
小〜中規模プロジェクトのシンプルなデプロイに特化し、セットアップと実行の容易さを重視しているのだ。

## Features

- **Gitモード**: ブランチ間の差分ファイルのみを抽出してアップロード
- **Fileモード**: 指定したローカルファイル/ディレクトリをアップロード
- **Diff Viewer**:
  ブラウザベースの差分確認UI（アップロード前に変更内容を視覚的に確認）
- **複数プロトコル対応**: SFTP / SCP / rsync / ローカルコピー
- **複数ターゲット**: 1回の実行で複数サーバへ同時デプロイ
- **階層的なIgnore設定**:
  名前付きグループでターゲットごとに異なる除外パターンを適用
- **モダンなCUI**: プログレスバー、ツリー表示、カラー出力

## Documentation

詳細なドキュメントは [docs/](docs/README.md) を参照してください。

**開発者向け:**

- [CLAUDE.md](CLAUDE.md) - プロジェクト概要とアーキテクチャ
- [SPEC.md](SPEC.md) - 詳細仕様
- [docs/implementation/](docs/implementation/) - 実装解説
- [docs/UX_REVIEW_REPORT.md](docs/UX_REVIEW_REPORT.md) - UXレビュー

## Requirements

- [Git](https://git-scm.com/) （gitモード使用時）
- [Deno](https://deno.land/) 2.0+（ソースから実行する場合のみ）

### プラットフォーム別の注意事項

#### Linux / macOS

sftp, scp, rsync は標準でインストールされているか、簡単に導入可能です。

#### Windows

このツールは内部で `sftp`, `scp`, `rsync` コマンドを使用します。

| プロトコル | 必要な準備                                                              |
| ---------- | ----------------------------------------------------------------------- |
| sftp / scp | OpenSSHの有効化（設定 → アプリ → オプション機能 → OpenSSHクライアント） |
| rsync      | Git Bash / cwRsync / WSL のいずれかをインストール                       |
| local      | 追加設定不要                                                            |

> **Tip**: rsyncを使わない場合は、OpenSSHの有効化のみで動作します。

## Installation

### ワンライナーインストール（推奨）

```sh
curl -fsSL https://raw.githubusercontent.com/ba0918/uploader/main/install.sh | sh
```

インストール先を変更する場合:

```sh
curl -fsSL https://raw.githubusercontent.com/ba0918/uploader/main/install.sh | INSTALL_DIR=~/.local/bin sh
```

### Denoから直接インストール

```sh
deno install --allow-read --allow-write --allow-net --allow-run --allow-env -n uploader \
  https://raw.githubusercontent.com/ba0918/uploader/main/main.ts
```

### ソースからビルド

```sh
git clone https://github.com/ba0918/uploader.git
cd uploader
deno task build
```

## Quick Start

初めての方は [Getting Started](docs/getting-started.md)
（約10分のチュートリアル）を推奨します。

1. 設定ファイルを生成:

```sh
uploader init
```

2. `uploader.yaml` を編集（最小限の例）:

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
```

3. アップロード実行:

```sh
uploader development
```

## Usage

```sh
# プロファイル一覧を表示
uploader --list

# 基本的な使い方
uploader <profile>

# diff viewerで確認してからアップロード
uploader --diff <profile>

# dry-run（実際のアップロードは行わない）
uploader --dry-run <profile>

# 設定ファイルを明示的に指定
uploader --config=path/to/config.yaml <profile>

# Gitモード用オプション（設定ファイルより優先）
uploader --base=develop --target=feature/xxx <profile>

# リモートの余分なファイルを削除（mirror同期）
uploader --delete <profile>

# 詳細ログ出力
uploader --verbose <profile>

# ログをファイルに出力
uploader --log-file=upload.log <profile>
```

## CLI Options

| オプション          | 説明                                                      |
| ------------------- | --------------------------------------------------------- |
| `--config <path>`   | 設定ファイルのパスを指定                                  |
| `--diff`            | アップロード前にdiff viewerを開く（リモートとの差分表示） |
| `--dry-run`         | 実際のアップロードを行わずシミュレーション                |
| `--delete`          | リモートにのみ存在するファイルを削除                      |
| `--base <branch>`   | Git比較元ブランチ                                         |
| `--target <branch>` | Git比較先ブランチ                                         |
| `--verbose`         | 詳細ログを出力                                            |
| `--quiet`           | エラーのみ出力                                            |
| `--port <number>`   | diff viewerのポート番号 (default: 3000)                   |
| `--no-browser`      | diff viewer起動時にブラウザを開かない                     |
| `--strict`          | ファイル転送エラー時に即座に終了                          |
| `--log-file <path>` | ログをファイルに出力                                      |
| `--list`            | 設定ファイルのプロファイル一覧を表示                      |
| `--version`         | バージョン表示                                            |
| `--help`            | ヘルプ表示                                                |

## Configuration

### 設定ファイルの検索パス

1. `--config` で指定されたパス
2. `./uploader.yaml`
3. `./uploader.yml`
4. `~/.config/uploader/config.yaml`
5. `~/.config/uploader/config.yml`

### 設定例

```yaml
_global:
  # 除外パターングループ定義
  ignore_groups:
    common:
      - "*.log"
      - ".git/"
      - "node_modules/"
  # デフォルトで適用するグループ
  default_ignore:
    - common

# Gitモード: ブランチ間の差分をアップロード
development:
  from:
    type: "git"
    base: "origin/main"
    target: "HEAD"

  to:
    targets:
      - host: "web1.example.com"
        protocol: "sftp"
        port: 22
        user: "${DEPLOY_USER}" # 環境変数から取得
        auth_type: "ssh_key"
        key_file: "~/.ssh/id_rsa"
        dest: "/var/www/html/"
        timeout: 30
        retry: 3

# Fileモード: 指定ファイルをアップロード
staging:
  from:
    type: "file"
    src:
      - "dist/"
      - "public/assets/"

  to:
    targets:
      - host: "staging.example.com"
        protocol: "sftp"
        port: 22
        user: "deployer"
        auth_type: "ssh_key"
        key_file: "~/.ssh/deploy_key"
        dest: "/var/www/staging/"
```

### 認証方式

#### SSH鍵認証（推奨）

```yaml
auth_type: "ssh_key"
key_file: "~/.ssh/id_rsa"
# パスフレーズ付き鍵の場合は実行時に入力を求める
```

#### パスワード認証

```yaml
auth_type: "password"
password: "${DEPLOY_PASSWORD}" # 必ず環境変数を使用
```

> **Note**: SCP/rsyncでパスワード認証を使用する場合は `sshpass`
> のインストールが必要です。
>
> ```sh
> # Debian/Ubuntu
> apt install sshpass
> # macOS
> brew install hudochenkov/sshpass/sshpass
> ```

### プロトコル

> **推奨**: 大規模プロジェクト（数千ファイル以上）では **rsync**
> を強く推奨します。
> 差分検出・一括転送が最適化されており、SFTP/SCPと比べて大幅に高速です。

#### SFTP

SSH File Transfer Protocol。最も安定しており、多くの環境で利用可能。

```yaml
protocol: "sftp"
auth_type: "ssh_key" # または "password"
```

#### SCP

Secure Copy Protocol。シンプルで高速。

```yaml
protocol: "scp"
auth_type: "ssh_key" # または "password"（sshpass必要）
```

#### rsync（大規模プロジェクト推奨）

差分転送に優れ、sudo対応やpermission/owner指定が可能。
大規模ファイル（数千件以上）でも高速な差分検出・一括転送が可能。

```yaml
protocol: "rsync"
auth_type: "ssh_key" # または "password"（sshpass必要）
rsync_path: "sudo rsync" # リモート側でsudo実行（権限問題の解決に有効）
rsync_options:
  - "--chmod=D755,F644" # ディレクトリ755、ファイル644
  - "--chown=www-data:www-data" # owner/group指定
  - "--compress" # 圧縮転送
```

#### local

ローカルファイルシステムへのコピー（テスト用）。

```yaml
protocol: "local"
dest: "/path/to/local/dest"
```

### ターゲットのデフォルト設定

複数ターゲットで共通の設定がある場合、`defaults` を使って冗長性を減らせます。

```yaml
staging:
  from:
    type: "file"
    src:
      - "dist/"

  to:
    defaults:
      host: "localhost"
      port: 2222
      protocol: "rsync"
      user: "deploy"
      password: "${DEPLOY_PASSWORD}"
      rsync_path: "sudo rsync"
      rsync_options:
        - "--compress"
      sync_mode: "update"
    targets:
      - dest: "/var/www/app1/"
      - dest: "/var/www/app2/"
      - dest: "/var/www/app3/"
        port: 3333 # 個別設定で上書き
        sync_mode: "mirror"
```

**マージルール:**

- 各ターゲットは `defaults` の設定を継承
- 個別に指定した設定が優先（上書き）
- 配列（`rsync_options` 等）は完全に置き換え（マージではない）
- `dest` は各ターゲットで必須（defaults には含められない）
- `host` と `protocol` は defaults か個別設定のどちらかで必須

### Ignore設定

除外パターンは階層的に設定でき、ターゲットごとに異なるパターンを適用できます。

#### 名前付きグループを使った設定

複数の環境で異なる除外パターンを使い分ける場合は、名前付きグループが便利です。

```yaml
_global:
  # 名前付きignoreグループを定義
  ignore_groups:
    common:
      - ".git/"
      - "node_modules/"
      - "*.log"
    development:
      - "tests/"
      - "*.test.ts"
      - ".env.local"
    cache:
      - ".cache/"
      - "tmp/"

  # デフォルトで適用するグループ
  default_ignore:
    - common

# 本番環境: commonグループのみ適用
production:
  from:
    type: "git"
    base: "origin/main"
  to:
    targets:
      - host: "prod.example.com"
        dest: "/var/www/html/"

# ステージング: commonに加えてcacheも除外
staging:
  from:
    type: "git"
    base: "origin/develop"
  to:
    defaults:
      ignore:
        use:
          - common
          - cache
    targets:
      - host: "staging1.example.com"
        dest: "/var/www/staging/"
      - host: "staging2.example.com"
        dest: "/var/www/staging/"
        # このターゲットだけ追加パターンを適用
        ignore:
          use:
            - common
          add:
            - "debug/"
```

#### Ignore設定の優先順位

1. **ターゲット個別の `ignore`** が最優先
2. **`defaults.ignore`** が次に優先
3. **`default_ignore`** がフォールバック

#### Ignore設定オプション

| 設定         | 説明                                   |
| ------------ | -------------------------------------- |
| `ignore.use` | 使用するグループ名の配列               |
| `ignore.add` | グループに加えて追加するパターンの配列 |

### ターゲット設定リファレンス

```yaml
targets:
  - host: "example.com" # ホスト名（必須）
    protocol: "sftp" # sftp / scp / rsync / local（必須）
    port: 22 # ポート番号（デフォルト: 22）
    user: "deploy" # ユーザー名
    dest: "/var/www/html" # アップロード先パス（必須）

    # 認証設定
    auth_type: "ssh_key" # ssh_key / password（デフォルト: ssh_key）
    key_file: "~/.ssh/id_rsa" # SSH秘密鍵のパス
    password: "${PASSWORD}" # パスワード（auth_type: password時）

    # 同期設定
    sync_mode: "update" # update / mirror（デフォルト: update）
    preserve_permissions: false # パーミッション保持
    preserve_timestamps: false # タイムスタンプ保持

    # 接続設定
    timeout: 30 # タイムアウト秒数（デフォルト: 30）
    retry: 3 # リトライ回数（デフォルト: 3）

    # rsync専用オプション
    rsync_path: "sudo rsync" # リモート側のrsyncパス
    rsync_options: # 追加のrsyncオプション
      - "--compress"

    # レガシーサーバー対応
    legacy_mode: false # 古いSSHアルゴリズムを有効化

    # ターゲット固有のignore設定
    ignore:
      use: # 使用するグループ名
        - common
      add: # 追加パターン
        - "local-only/"
```

### レガシーサーバー対応

古いSSHサーバー（CentOS 6、Ubuntu 14.04など）に接続する場合は `legacy_mode`
を有効化します。

```yaml
targets:
  - host: "old-server.example.com"
    protocol: "sftp"
    legacy_mode: true # 古いアルゴリズムを有効化
```

有効になるアルゴリズム:

- 鍵交換: `diffie-hellman-group14-sha1`, `diffie-hellman-group1-sha1`
- ホスト鍵: `ssh-rsa`
- 暗号（SFTPのみ）: `aes128-cbc`, `aes256-cbc`, `3des-cbc`

### 環境変数の展開

設定ファイル内で `${VAR_NAME}` 形式で環境変数を参照できます。

```yaml
user: "${DEPLOY_USER}"
password: "${DEPLOY_PASSWORD}"
key_file: "${SSH_KEY_PATH}"
```

## Diff Viewer

`--diff` オプションでブラウザベースの差分確認UIを起動できます。
ローカルファイルとリモートサーバー上のファイルを比較し、実際に変更があるファイルのみを表示します。

```sh
uploader --diff development
```

### 機能

- ローカル vs リモートの差分比較
- ディレクトリツリー表示（追加:緑、変更:黄、変更なし:灰）
- Side-by-side / Unified 表示切替
- シンタックスハイライト
- 複数ターゲット対応（ターゲット切り替え可能）
- 確認後にアップロード実行

## FAQ（よくある質問）

### 基本

**Q: uploaderとrsync/scpとの違いは？**

A: uploaderは以下の点で優れています：

- Git差分を自動検出してアップロード
- YAML設定ファイルで複数環境を管理
- ブラウザで差分を視覚的に確認
- 複数のプロトコル（rsync/sftp/scp/local）に対応
- mirrorモードで完全同期

従来のrsync/scpは手動でファイル指定が必要ですが、uploaderは自動化されています。

---

**Q: どのプロトコルを選べばいいですか？**

A: 用途に応じて選択してください：

- **rsync**: 高速・差分同期・権限維持 → **推奨**（リモートにrsync必要）
- **sftp**: 汎用性・多くのサーバーで利用可能 → バランス重視
- **scp**: 古いサーバー対応 → レガシー環境向け
- **local**: ローカルコピー → テスト・バックアップ

詳細: [プロトコル](#プロトコル)

---

**Q: updateとmirrorの違いは？**

A: 同期モードの違いです：

- **update**: 追加・更新のみ（削除しない） → **安全・推奨**
- **mirror**: 完全同期（リモート専用ファイルを削除） → 注意が必要

mirrorモードは、ローカルに存在しないファイルをリモートから**自動削除**します。
必ず `--dry-run` で確認してから実行してください。

---

### インストール・設定

**Q: Denoのインストールが必要ですか？**

A: はい、uploaderはDeno上で動作します。

インストール方法:

```bash
# macOS / Linux
curl -fsSL https://deno.land/install.sh | sh

# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex
```

詳細: [Requirements](#requirements)

---

**Q: 設定ファイルはどこに置けばいいですか？**

A: プロジェクトルートに `uploader.yaml` を配置してください。

```bash
cp uploader.example.yaml uploader.yaml
# uploader.yaml を編集
```

uploaderは以下の順序で設定ファイルを探します：

1. カレントディレクトリの `uploader.yaml`
2. `~/.config/uploader/config.yaml`

詳細: [設定ファイルの検索パス](#設定ファイルの検索パス)

---

**Q: 環境変数を使えますか？**

A: はい、`${VAR_NAME}` 形式で使用できます。

```yaml
user: "${DEPLOY_USER}"
password: "${DB_PASSWORD}"
```

`.env` ファイルまたはシェルで設定：

```bash
export DEPLOY_USER="myuser"
uploader production
```

詳細: [環境変数の展開](#環境変数の展開)

---

### ファイル除外

**Q: 特定のファイルを除外したい**

A: `_global.ignore_groups` で除外パターンを定義します。

```yaml
_global:
  ignore_groups:
    common:
      - "*.log"
      - ".git/"
      - "node_modules/"
  default_ignore:
    - common
```

詳細: [Ignore設定](#ignore設定)

---

**Q: ターゲットごとに異なる除外パターンを使いたい**

A: ターゲットの `ignore` 設定を使います。

```yaml
staging:
  to:
    targets:
      - host: "staging.example.com"
        dest: "/var/www/staging/"
        ignore:
          use:
            - common # デフォルトグループ
            - development # 追加グループ
          add:
            - "*.cache" # 個別パターン
```

詳細: [名前付きグループを使った設定](#名前付きグループを使った設定)

---

### トラブルシューティング

**Q: 「Permission denied」エラーが出る**

A: 以下を確認してください：

1. SSH鍵のパーミッション: `chmod 600 ~/.ssh/id_rsa`
2. リモートディレクトリの書き込み権限
3. rsyncの場合: `rsync_path: "sudo rsync"` の設定

---

**Q: 「Connection refused」エラーが出る**

A: SSH接続を確認してください：

```bash
ssh user@your-server.example.com
```

接続できない場合：

- ホスト名・IPアドレスが正しいか確認
- ポート番号が正しいか確認（デフォルト: 22）
- ファイアウォールでポートが開いているか確認

---

**Q: ファイルが予期せず削除された**

A: mirrorモードで実行した可能性があります。

mirrorモードは、ローカルに存在しないファイルを**自動削除**します。

**対策**:

1. 常に `--dry-run` で確認してから実行
2. バックアップを取る
3. updateモードの使用を検討

---

### 高度な使い方

**Q: 複数のサーバーに同時にアップロードしたい**

A: `defaults` と `targets` を使います。

```yaml
production:
  to:
    defaults:
      protocol: "rsync"
      user: "${DEPLOY_USER}"
      # ... 共通設定
    targets:
      - host: "web1.example.com"
        dest: "/var/www/html/"
      - host: "web2.example.com"
        dest: "/var/www/html/"
      - host: "web3.example.com"
        dest: "/var/www/html/"
```

詳細: [ターゲットのデフォルト設定](#ターゲットのデフォルト設定)

---

**Q: ブランチ以外の差分をアップロードしたい**

A: コミットハッシュやタグを指定できます。

```bash
# 特定のコミット間
uploader development --base abc123 --target def456

# タグ間
uploader production --base v1.0.0 --target v1.1.0
```

---

**Q: 特定のファイル・ディレクトリだけアップロードしたい**

A: fileモードを使います。

```yaml
staging:
  from:
    type: "file"
    src:
      - "dist/"
      - "public/assets/"
      - "config/*.json"
```

詳細: [Fileモード](#configuration)

---

**Q: dry-runの結果をファイルに保存したい**

A: リダイレクトを使います。

```bash
uploader development --dry-run > dry-run-result.txt 2>&1
```

---

### その他

**Q: ログファイルはどこに保存されますか？**

A: デフォルトではログファイルは作成されません。

`--log-file` オプションで指定できます：

```bash
uploader production --log-file=upload.log
```

---

**Q: プロファイル一覧を確認したい**

A: `--list` オプションを使います。

```bash
uploader --list
```

出力例：

```
Available profiles:
  - development
  - staging
  - production
  - legacy
  - local
```

---

**Q: バグを見つけた・機能要望がある**

A: GitHub Issuesで報告してください。

- バグ報告: [GitHub Issues](https://github.com/ba0918/uploader/issues)
- 機能要望: [GitHub Discussions](https://github.com/ba0918/uploader/discussions)

---

**まだ解決しない場合**

- [Getting Started](docs/getting-started.md) - 基本的な使い方
- [SPEC.md](SPEC.md) - 詳細な仕様
- [docs/](docs/README.md) - 全ドキュメント

## Exit Codes

| コード | 意味                 |
| ------ | -------------------- |
| 0      | 成功                 |
| 1      | 一般エラー           |
| 2      | 設定ファイルエラー   |
| 3      | 認証エラー           |
| 4      | 接続エラー           |
| 5      | 一部ファイル転送失敗 |

## Development

```sh
# 開発実行
deno run --allow-read --allow-write --allow-net --allow-run --allow-env main.ts <profile>

# または
deno task dev <profile>

# フォーマット
deno fmt

# Lint
deno lint

# 型チェック
deno check main.ts

# 単体テスト
deno test --allow-read --allow-write --allow-net --allow-env

# 結合テスト（Docker必須）
deno test --allow-all tests/integration/
```

### 結合テスト

SFTP/SCP転送の結合テストにはDockerが必要です。

```sh
# 1. SSH鍵を生成（初回のみ）
./tests/integration/scripts/setup-ssh-keys.sh

# 2. Dockerコンテナを起動
docker compose -f docker-compose.test.yml up -d

# 3. テストを実行
deno test --allow-all tests/integration/

# 4. コンテナを停止
docker compose -f docker-compose.test.yml down
```

Dockerが起動していない場合、SFTP/SCPテストは自動的にスキップされます。
Gitテストはローカル一時リポジトリを使用するため、Dockerなしで実行可能です。

## License

MIT
