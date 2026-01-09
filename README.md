# uploader

Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイするCLIツール

## Features

- **Gitモード**: ブランチ間の差分ファイルのみを抽出してアップロード
- **Fileモード**: 指定したローカルファイル/ディレクトリをアップロード
- **Diff Viewer**:
  ブラウザベースの差分確認UI（アップロード前に変更内容を視覚的に確認）
- **複数プロトコル対応**: SFTP / SCP / rsync / ローカルコピー
- **複数ターゲット**: 1回の実行で複数サーバへ同時デプロイ
- **モダンなCUI**: プログレスバー、ツリー表示、カラー出力

## Requirements

- [Deno](https://deno.land/) 1.40+

## Installation

```sh
deno install --allow-read --allow-write --allow-net --allow-run --allow-env -n uploader ./main.ts
```

## Quick Start

1. 設定ファイル `uploader.yaml` を作成:

```yaml
_global:
  ignore:
    - ".git/"
    - "node_modules/"
    - "*.log"

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

2. アップロード実行:

```sh
uploader development
```

## Usage

```sh
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
| `--diff[=mode]`     | アップロード前にdiff viewerを開く (mode: git/remote/both) |
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
| `--version`         | バージョン表示                                            |
| `--help`            | ヘルプ表示                                                |

## Configuration

### 設定ファイルの検索パス

1. `--config` で指定されたパス
2. `./uploader.yaml`
3. `./uploader.yml`
4. `~/.config/uploader/config.yaml`

### 設定例

```yaml
_global:
  ignore:
    - "*.log"
    - ".git/"
    - "node_modules/"

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

```sh
# Gitモード: git diff（デフォルト）
uploader --diff development

# ローカル vs リモート比較
uploader --diff=remote development

# 両方（タブ切り替え）
uploader --diff=both development
```

### 機能

- ディレクトリツリー表示（追加:緑、変更:黄、削除:赤）
- Side-by-side / Unified 表示切替
- シンタックスハイライト
- リモートファイルとの差分比較
- 確認ダイアログ付きアップロード

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
