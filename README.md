# uploader

Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイするCLIツール

## Features

- **Gitモード**: ブランチ間の差分ファイルのみを抽出してアップロード
- **Fileモード**: 指定したローカルファイル/ディレクトリをアップロード
- **Diff Viewer**: ブラウザベースの差分確認UI（アップロード前に変更内容を視覚的に確認）
- **複数プロトコル対応**: SFTP / SCP / ローカルコピー
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

| オプション | 説明 |
|-----------|------|
| `--config <path>` | 設定ファイルのパスを指定 |
| `--diff[=mode]` | アップロード前にdiff viewerを開く (mode: git/remote/both) |
| `--dry-run` | 実際のアップロードを行わずシミュレーション |
| `--delete` | リモートにのみ存在するファイルを削除 |
| `--base <branch>` | Git比較元ブランチ |
| `--target <branch>` | Git比較先ブランチ |
| `--verbose` | 詳細ログを出力 |
| `--quiet` | エラーのみ出力 |
| `--port <number>` | diff viewerのポート番号 (default: 3000) |
| `--no-browser` | diff viewer起動時にブラウザを開かない |
| `--strict` | ファイル転送エラー時に即座に終了 |
| `--log-file <path>` | ログをファイルに出力 |
| `--version` | バージョン表示 |
| `--help` | ヘルプ表示 |

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
        user: "${DEPLOY_USER}"        # 環境変数から取得
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
password: "${DEPLOY_PASSWORD}"  # 必ず環境変数を使用
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

| コード | 意味 |
|--------|------|
| 0 | 成功 |
| 1 | 一般エラー |
| 2 | 設定ファイルエラー |
| 3 | 認証エラー |
| 4 | 接続エラー |
| 5 | 一部ファイル転送失敗 |

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

# テスト
deno test --allow-read --allow-write --allow-net --allow-env
```

## License

MIT
