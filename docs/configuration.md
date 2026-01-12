# Configuration - 設定リファレンス

uploaderの全設定項目の詳細リファレンスです。

## 目次

1. [設定ファイルの基本](#設定ファイルの基本)
2. [_globalセクション](#_globalセクション)
3. [プロファイルセクション](#プロファイルセクション)
4. [fromセクション](#fromセクション)
5. [toセクション](#toセクション)
6. [ターゲット設定](#ターゲット設定)
7. [ignore設定](#ignore設定)
8. [プロトコル別設定](#プロトコル別設定)

---

## 設定ファイルの基本

### ファイル名と配置

**ファイル名**: `uploader.yaml` または `uploader.yml`

**配置場所**:
プロジェクトルート（uploaderは最大5階層まで親ディレクトリを遡って探します）

**検索パス**（優先順）:

1. `--config` で指定されたパス
2. `./uploader.yaml`
3. `./uploader.yml`
4. `~/.config/uploader/config.yaml`
5. `~/.config/uploader/config.yml`

### 基本構造

```yaml
_global:
# 全プロファイル共通設定

<profile>:
  from:
  # アップロード元の設定
  to:
# アップロード先の設定
```

### 設定の優先順位

```
CLIオプション > プロファイル設定 > defaults > _global
```

**例**:

```bash
# baseをCLIオプションで上書き
uploader development --base feature/new-feature
```

---

## _globalセクション

全プロファイルで共通の設定を定義します。

### ignore_groups

**型**: `object` **必須**: No **デフォルト**: なし

除外パターンのグループ定義です。

**例**:

```yaml
_global:
  ignore_groups:
    common:
      - "*.log"
      - ".git/"
      - "node_modules/"
    development:
      - "*.tmp"
      - "*.cache"
      - "tests/"
    build:
      - "dist/"
      - "build/"
```

**globパターンの書き方**:

- `*`: 任意の文字列（ディレクトリ区切りを除く）
- `**`: 任意の文字列（ディレクトリ区切りを含む）
- `?`: 任意の1文字
- `[abc]`: a, b, c のいずれか
- ディレクトリは末尾に `/` をつける

### default_ignore

**型**: `string[]` **必須**: No **デフォルト**: なし

デフォルトで適用する除外グループです。

**例**:

```yaml
_global:
  default_ignore:
    - common
```

---

## プロファイルセクション

実行時に指定するプロファイル（`uploader <profile>`）の設定です。

**例**:

```yaml
development:
# development プロファイルの設定

staging:
# staging プロファイルの設定
```

各プロファイルには `from` と `to` が必須です。

---

## fromセクション

アップロード元（ソース）の設定です。

### type

**型**: `"git" | "file"` **必須**: Yes

- `git`: Git差分モード（ブランチ間の差分をアップロード）
- `file`: ファイル指定モード（特定のファイル・ディレクトリをアップロード）

---

### gitモードの設定

```yaml
from:
  type: "git"
  base: "origin/main"
  target: "HEAD"
  include_untracked: false
```

#### base

**型**: `string` **必須**: Yes **デフォルト**: なし **CLIで上書き**: `--base`

比較元のブランチ、コミット、タグです。

**例**:

```yaml
base: "origin/main" # ブランチ
base: "abc123" # コミットハッシュ
base: "v1.0.0" # タグ
```

#### target

**型**: `string` **必須**: No **デフォルト**: `"HEAD"` **CLIで上書き**:
`--target`

比較先のブランチ、コミット、タグです。

**例**:

```yaml
target: "HEAD" # 現在のコミット
target: "feature/new" # ブランチ
target: "def456" # コミットハッシュ
```

#### include_untracked

**型**: `boolean` **必須**: No **デフォルト**: `false`

未追跡ファイル（git add されていないファイル）を含めるかどうかです。

**例**:

```yaml
include_untracked: true # 未追跡ファイルも含める
```

---

### fileモードの設定

```yaml
from:
  type: "file"
  src:
    - "dist/"
    - "public/assets/"
```

#### src

**型**: `string[]` **必須**: Yes **デフォルト**: なし

アップロード対象のファイル・ディレクトリ（globパターン対応）です。

**重要**: 末尾スラッシュの有無で動作が変わります。

**例**:

```yaml
src:
  - "dist/" # dist/ の中身のみアップロード
  - "dist" # dist ディレクトリ自体をアップロード（dest/distになる）
  - "public/**/*.jpg" # public/ 配下の全JPGファイル
  - "src/**/*.{ts,js}" # src/ 配下のTS/JSファイル
  - "config/*.json" # config/ 直下のJSONファイル
```

---

## toセクション

アップロード先の設定です。

### defaults

**型**: `object` **必須**: No **デフォルト**: なし

全ターゲット共通の設定です。個別ターゲットで上書き可能です。

**例**:

```yaml
to:
  defaults:
    protocol: "rsync"
    port: 22
    user: "${DEPLOY_USER}"
    sync_mode: "update"
  targets:
    - dest: "/var/www/html/"
      # defaultsを継承
```

**重要**: `dest` は各ターゲットで個別に指定する必要があります（defaults
に含めることはできません）。

### targets

**型**: `array` **必須**: Yes **デフォルト**: なし

アップロード先のターゲットリストです。

**例**:

```yaml
targets:
  - host: "web1.example.com"
    dest: "/var/www/html/"
  - host: "web2.example.com"
    dest: "/var/www/html/"
```

---

## ターゲット設定

個別のアップロード先の設定です。

### host

**型**: `string` **必須**: Yes（localプロトコルを除く） **デフォルト**: なし

サーバーのホスト名またはIPアドレスです。

**例**:

```yaml
host: "web1.example.com"
host: "192.168.1.100"
host: "localhost" # localプロトコルの場合
```

### dest

**型**: `string` **必須**: Yes **デフォルト**: なし

リモートの配置先ディレクトリです。

**重要**: 末尾スラッシュの有無で動作が変わります。

**例**:

```yaml
dest: "/var/www/html/" # html/ の中に配置
dest: "/var/www/html" # html として配置（html/html になる場合あり）
```

**推奨**: 末尾に `/` をつけます。

### protocol

**型**: `"rsync" | "sftp" | "scp" | "local"` **必須**: No **デフォルト**:
`"sftp"`

転送プロトコルです。

| プロトコル | 特徴                               | 推奨用途              |
| ---------- | ---------------------------------- | --------------------- |
| rsync      | 高速・差分同期・権限維持           | 本番環境（rsync必要） |
| sftp       | 汎用性高・多くのサーバーで利用可能 | 一般的な用途          |
| scp        | レガシーサーバー対応               | 古い環境              |
| local      | ローカルファイルコピー             | テスト・バックアップ  |

詳細: [プロトコル別設定](#プロトコル別設定)

### port

**型**: `number` **必須**: No **デフォルト**: `22`（SSH系）、不要（local）

SSHポート番号です。

**例**:

```yaml
port: 22 # デフォルト
port: 2222 # カスタムポート
```

### user

**型**: `string` **必須**: Yes（localプロトコルを除く） **デフォルト**: なし

SSH接続ユーザー名です。環境変数使用可能です。

**例**:

```yaml
user: "deployer"
user: "${DEPLOY_USER}" # 環境変数
```

### auth_type

**型**: `"ssh_key" | "password"` **必須**: No **デフォルト**: `"ssh_key"`

認証方式です。

**例**:

```yaml
auth_type: "ssh_key" # 秘密鍵認証（推奨）
auth_type: "password" # パスワード認証
```

### key_file

**型**: `string` **必須**: auth_type が "ssh_key" の場合は Yes **デフォルト**:
なし

SSH秘密鍵のパスです。`~` はホームディレクトリに展開されます。

**例**:

```yaml
key_file: "~/.ssh/id_rsa"
key_file: "~/.ssh/deploy_key"
key_file: "/absolute/path/to/key"
```

### password

**型**: `string` **必須**: auth_type が "password" の場合は Yes **デフォルト**:
なし

パスワードです。環境変数の使用を推奨します。

**例**:

```yaml
password: "${SERVER_PASSWORD}" # 推奨
```

**警告**: 平文でパスワードを書かないでください。

### sync_mode

**型**: `"update" | "mirror"` **必須**: No **デフォルト**: `"update"`

同期モードです。

| モード | 動作                                   | 推奨用途             |
| ------ | -------------------------------------- | -------------------- |
| update | 追加・更新のみ（削除しない）           | 通常使用（安全）     |
| mirror | 完全同期（リモート専用ファイルを削除） | 完全一致が必要な場合 |

**警告**:
mirrorモードは、ローカルに存在しないファイルをリモートから**自動削除**します。必ず
`--dry-run` で確認してください。

### timeout

**型**: `number` **必須**: No **デフォルト**: `30`

タイムアウト時間（秒）です。

**例**:

```yaml
timeout: 30 # デフォルト
timeout: 60 # 遅い接続の場合
timeout: 120 # 大量ファイルの場合
```

### retry

**型**: `number` **必須**: No **デフォルト**: `3`

リトライ回数です。

**例**:

```yaml
retry: 3 # デフォルト
retry: 5 # 不安定な接続の場合
retry: 0 # リトライなし
```

### preserve_permissions

**型**: `boolean` **必須**: No **デフォルト**: `false`

ファイル権限を維持するかどうか（rsync/localのみ有効）です。

**例**:

```yaml
preserve_permissions: true # rsync/local
preserve_permissions: false # sftp/scp（無視される）
```

### preserve_timestamps

**型**: `boolean` **必須**: No **デフォルト**: `false`

タイムスタンプを維持するかどうか（rsync/localのみ有効）です。

**例**:

```yaml
preserve_timestamps: true # rsync/local
preserve_timestamps: false # sftp/scp（無視される）
```

### legacy_mode

**型**: `boolean` **必須**: No **デフォルト**: `false`

古いSSHアルゴリズムを有効化します（レガシーサーバー向け）。

**例**:

```yaml
legacy_mode: true # CentOS 6など
```

有効になるアルゴリズム:

- 鍵交換: `diffie-hellman-group14-sha1`, `diffie-hellman-group1-sha1`
- ホスト鍵: `ssh-rsa`
- 暗号: `aes128-cbc`, `aes256-cbc`, `3des-cbc`

---

## ignore設定

ターゲット固有の除外パターン設定です。

### use

**型**: `string[]` **必須**: No **デフォルト**: なし

使用するグループ名です。

**重要**: `use` を指定すると、`_global.default_ignore`
は**上書き**されます（マージではありません）。

**例**:

```yaml
ignore:
  use:
    - common # _global.default_ignoreの内容を明示的に指定
    - development # 追加グループ
```

### add

**型**: `string[]` **必須**: No **デフォルト**: なし

個別のパターンを追加します（globパターン）。

**例**:

```yaml
ignore:
  use:
    - common
  add:
    - "*.cache" # 個別パターン追加
    - "debug/"
```

### 優先順位

1. **ターゲット個別の `ignore`** が最優先
2. **`defaults.ignore`** が次に優先
3. **`default_ignore`** がフォールバック

---

## プロトコル別設定

### rsync固有の設定

#### rsync_path

**型**: `string` **必須**: No **デフォルト**: `"rsync"`

リモート側で実行するrsyncコマンドです。sudo権限が必要な場合に使用します。

**例**:

```yaml
rsync_path: "sudo rsync" # sudo権限で実行
rsync_path: "/usr/local/bin/rsync" # カスタムパス
```

#### rsync_options

**型**: `string[]` **必須**: No **デフォルト**: なし

rsyncに渡す追加オプションです。

**例**:

```yaml
rsync_options:
  - "--compress" # 圧縮
  - "--chmod=D755,F644" # パーミッション設定
  - "--chown=www-data:www-data" # 所有者・グループ設定
  - "--exclude=*.tmp" # 追加除外
```

詳細: `man rsync` を参照してください。

---

## 完全な設定例

```yaml
_global:
  ignore_groups:
    common:
      - "*.log"
      - ".git/"
      - "node_modules/"
      - ".DS_Store"
    development:
      - "*.tmp"
      - "*.cache"
      - "tests/"
    build:
      - "dist/"
      - "build/"
  default_ignore:
    - common

development:
  from:
    type: "git"
    base: "origin/main"
    target: "HEAD"
    include_untracked: false
  to:
    targets:
      - host: "dev.example.com"
        protocol: "sftp"
        port: 22
        user: "${DEPLOY_USER}"
        auth_type: "ssh_key"
        key_file: "~/.ssh/id_rsa"
        dest: "/var/www/dev/"
        sync_mode: "update"
        timeout: 30
        retry: 3

production:
  from:
    type: "git"
    base: "origin/main"
  to:
    defaults:
      protocol: "rsync"
      port: 22
      user: "${DEPLOY_USER}"
      auth_type: "ssh_key"
      key_file: "~/.ssh/deploy_key"
      sync_mode: "mirror"
      timeout: 60
      retry: 3
      rsync_path: "sudo rsync"
      rsync_options:
        - "--compress"
        - "--chmod=D755,F644"
    targets:
      - host: "web1.example.com"
        dest: "/var/www/html/"
      - host: "web2.example.com"
        dest: "/var/www/html/"
      - host: "web3.example.com"
        dest: "/var/www/html/"
        timeout: 120 # 個別設定で上書き
```

---

## 関連ドキュメント

- [README.md](../README.md) - プロジェクト概要とQuick Start
- [uploader.example.yaml](../uploader.example.yaml) - コメント付きサンプル
- [docs/implementation/mirror-mode-protocols.md](implementation/mirror-mode-protocols.md) -
  mirrorモードの詳細
