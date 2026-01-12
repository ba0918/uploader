# Use Cases and Best Practices

uploaderツールの実践的な使用例とベストプラクティスをまとめたのだ。
自分のユースケースに合った設定を見つけて、効率的なデプロイを実現してほしいのだ。

## 目次

1. [基本的なWebサイトデプロイ](#use-case-1-基本的なwebサイトデプロイ)
2. [開発→ステージング→本番の段階的デプロイ](#use-case-2-開発ステージング本番の段階的デプロイ)
3. [複数サーバへの同時デプロイ](#use-case-3-複数サーバへの同時デプロイ)
4. [大規模プロジェクトの高速デプロイ](#use-case-4-大規模プロジェクトの高速デプロイ)
5. [バックアップとリストア](#use-case-5-バックアップとリストア)
6. [古いSSHサーバーへのデプロイ](#use-case-6-古いsshサーバーへのデプロイ)
7. [ローカル環境でのmirrorモード検証](#use-case-7-ローカル環境でのmirrorモード検証)
8. [Git差分を使った効率的なデプロイ](#use-case-8-git差分を使った効率的なデプロイ)

---

## Use Case 1: 基本的なWebサイトデプロイ

### シナリオ

小規模なWebサイト（HTML/CSS/JavaScript）をレンタルサーバーにデプロイする最もシンプルなケースなのだ。
Git管理されているプロジェクトで、mainブランチとの差分のみを安全にアップロードするのだ。

### 対象プロジェクト

- 小規模サイト（100ファイル程度）
- レンタルサーバー（SSH接続可能）
- SFTP対応

### 設定例

```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "*.log"
      - ".DS_Store"
      - "Thumbs.db"
      - "node_modules/"
    development:
      - "src/" # ビルド前のソース
      - "*.md" # ドキュメント
  default_ignore:
    - common

development:
  from:
    type: "git"
    base: "origin/main" # mainブランチと比較
    target: "HEAD" # 現在のコミットまで
    include_untracked: false

  to:
    targets:
      - host: "example.com"
        protocol: "sftp"
        port: 22
        user: "myuser"
        auth_type: "ssh_key"
        key_file: "~/.ssh/id_rsa"
        dest: "/home/myuser/public_html/"
        sync_mode: "update" # 追加・更新のみ
        timeout: 30
        retry: 3
```

### 実行手順

```bash
# 1. 開発作業とコミット
git add .
git commit -m "Update homepage design"

# 2. dry-runで確認（推奨）
uploader development --dry-run

# 3. ブラウザで差分確認（推奨）
uploader development --diff

# 4. 実際にアップロード
uploader development
```

### ポイント

- **sync_mode: update** により、既存ファイルは削除されないため安全なのだ。
- **--dry-run** で事前確認してから実行するのがベストプラクティスなのだ。
- **--diff**
  オプションでブラウザ上で視覚的に差分を確認できるので、ミスを防げるのだ。
- **include_untracked: false** により、git
  addしていないファイルは誤ってアップロードされないのだ。

### 関連ドキュメント

- [Configuration - sync_mode](configuration.md#sync_mode)
- [Troubleshooting - dry-run の使い方](troubleshooting.md#dry-runで事前確認)

---

## Use Case 2: 開発→ステージング→本番の段階的デプロイ

### シナリオ

開発環境、ステージング環境、本番環境の3段階でWebアプリケーションをデプロイするケースなのだ。
各環境で異なる除外パターンを適用し、段階的に安全にリリースするのだ。

### 対象プロジェクト

- 中規模Webアプリケーション
- 開発/ステージング/本番の3環境
- テストファイルは本番に含めない

### 設定例

```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "*.log"
      - ".env"
      - "node_modules/"
    testing:
      - "tests/"
      - "*.test.ts"
      - "*.test.js"
      - "coverage/"
    documentation:
      - "docs/"
      - "*.md"
      - "README*"
  default_ignore:
    - common

# 開発環境: テストファイルも含める
development:
  from:
    type: "git"
    base: "origin/develop"
    target: "HEAD"

  to:
    targets:
      - host: "dev.example.com"
        protocol: "sftp"
        port: 22
        user: "${DEV_USER}"
        auth_type: "ssh_key"
        key_file: "~/.ssh/dev_key"
        dest: "/var/www/dev/"
        sync_mode: "update"
        # 開発環境: commonのみ除外

# ステージング環境: テストファイルを除外
staging:
  from:
    type: "git"
    base: "origin/develop"
    target: "HEAD"

  to:
    targets:
      - host: "staging.example.com"
        protocol: "sftp"
        port: 22
        user: "${STAGING_USER}"
        auth_type: "ssh_key"
        key_file: "~/.ssh/staging_key"
        dest: "/var/www/staging/"
        sync_mode: "update"
        ignore:
          use:
            - common
            - testing # テストファイル除外

# 本番環境: テストとドキュメントを除外
production:
  from:
    type: "git"
    base: "origin/main"
    target: "HEAD"

  to:
    targets:
      - host: "prod.example.com"
        protocol: "sftp"
        port: 22
        user: "${PROD_USER}"
        auth_type: "ssh_key"
        key_file: "~/.ssh/prod_key"
        dest: "/var/www/html/"
        sync_mode: "update"
        ignore:
          use:
            - common
            - testing
            - documentation # ドキュメントも除外
        timeout: 60 # 本番は長めに設定
        retry: 5
```

### 実行手順

```bash
# 環境変数を設定（.envrcやdirenv推奨）
export DEV_USER="devuser"
export STAGING_USER="staginguser"
export PROD_USER="produser"

# 1. 開発環境にデプロイ
git checkout develop
uploader development --dry-run
uploader development

# 2. ステージングで動作確認
uploader staging --dry-run
uploader staging --diff # 差分確認

# 3. 本番環境にデプロイ
git checkout main
git merge develop
uploader production --dry-run
uploader production --diff
uploader production --verbose # 詳細ログ出力
```

### ポイント

- **環境ごとにignoreパターンを変える**ことで、適切なファイルのみをデプロイできるのだ。
- **本番環境は--diffで必ず確認**してから実行するのがベストプラクティスなのだ。
- **環境変数**を使うことで、認証情報をYAMLに直接書かずに済むのだ。
- **base**を環境ごとに変える（develop/main）ことで、適切な差分を検出できるのだ。

### 関連ドキュメント

- [Configuration - ignore設定](configuration.md#ignore設定)
- [README - 環境変数の展開](../README.md#環境変数の展開)

---

## Use Case 3: 複数サーバへの同時デプロイ

### シナリオ

ロードバランサー配下の複数のWebサーバに同じファイルをデプロイするケースなのだ。
defaultsを使って共通設定を定義し、冗長性を減らすのだ。

### 対象プロジェクト

- 負荷分散構成（3台以上）
- 全サーバに同じファイルをデプロイ
- 設定の冗長性を減らしたい

### 設定例

```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "node_modules/"
      - "*.log"
      - ".DS_Store"
  default_ignore:
    - common

production:
  from:
    type: "git"
    base: "origin/main"
    target: "HEAD"

  to:
    # 全ターゲット共通の設定
    defaults:
      protocol: "rsync" # 高速転送
      port: 22
      user: "${DEPLOY_USER}"
      auth_type: "ssh_key"
      key_file: "~/.ssh/deploy_key"
      sync_mode: "update"
      timeout: 60
      retry: 3
      preserve_permissions: true
      preserve_timestamps: true
      rsync_options:
        - "--compress" # 圧縮転送

    # 各サーバの設定
    targets:
      - host: "web1.example.com"
        dest: "/var/www/html/"

      - host: "web2.example.com"
        dest: "/var/www/html/"

      - host: "web3.example.com"
        dest: "/var/www/html/"

      - host: "web4.example.com"
        dest: "/var/www/html/"
        timeout: 120 # この1台だけ長めに設定
```

### 実行手順

```bash
# 環境変数を設定
export DEPLOY_USER="deploy"

# 1. dry-runで全サーバ確認
uploader production --dry-run

# 2. 詳細ログで状況確認
uploader production --verbose

# 3. 本番デプロイ
uploader production
```

出力例:

```
┌ Upload Progress
│
│  web1.example.com  ████████████████████ 100% ✓
│  web2.example.com  ████████████████████ 100% ✓
│  web3.example.com  ████████████████████ 100% ✓
│  web4.example.com  ████████████░░░░░░░░  60%
│
└─ Total: 80/100 files
```

### ポイント

- **defaults**を使うことで、設定の重複を大幅に削減できるのだ。
- **rsyncプロトコル**は複数サーバへの同時デプロイで特に高速なのだ。
- **--compress**
  オプションで帯域を節約できるが、CPUを使うので環境に応じて調整するのだ。
- **個別にtimeoutを上書き**できるので、遅いサーバだけ調整できるのだ。
- 1つのサーバが失敗しても他のサーバは続行されるので安全なのだ。

### 関連ドキュメント

- [Configuration - ターゲットのデフォルト設定](configuration.md#defaults)
- [README - rsyncプロトコル](../README.md#rsync大規模プロジェクト推奨)

---

## Use Case 4: 大規模プロジェクトの高速デプロイ

### シナリオ

数千ファイル以上の大規模プロジェクトを高速にデプロイするケースなのだ。
rsyncの差分転送とsudo権限を使って、効率的かつ安全にデプロイするのだ。

### 対象プロジェクト

- 大規模プロジェクト（数千ファイル以上）
- パーミッション設定が必要
- 高速転送が必須

### 設定例

```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "*.log"
      - ".DS_Store"
    build_artifacts:
      - "node_modules/"
      - ".cache/"
      - "tmp/"
      - "*.tmp"
  default_ignore:
    - common
    - build_artifacts

production:
  from:
    type: "git"
    base: "origin/main"
    target: "HEAD"

  to:
    defaults:
      protocol: "rsync" # 大規模プロジェクトでは必須
      port: 22
      user: "${DEPLOY_USER}"
      auth_type: "ssh_key"
      key_file: "~/.ssh/deploy_key"
      sync_mode: "update"
      timeout: 120 # 大量ファイルは長めに
      retry: 3

      # パーミッション設定
      preserve_permissions: true
      preserve_timestamps: true

      # rsync固有設定
      rsync_path: "sudo rsync" # リモートでsudo実行
      rsync_options:
        - "--compress" # 圧縮転送
        - "--chmod=D755,F644" # ディレクトリ755、ファイル644
        - "--chown=www-data:www-data" # 所有者設定
        - "--progress" # 進捗表示
        - "--stats" # 統計情報

    targets:
      - host: "prod.example.com"
        dest: "/var/www/html/"
```

### 実行手順（リモートサーバーの準備）

```bash
# リモートサーバーで、パスワードなしsudoを設定
ssh deploy@prod.example.com
sudo visudo

# 以下を追加（deployユーザーがrsyncをsudoできるようにする）
# deploy ALL=(ALL) NOPASSWD: /usr/bin/rsync
```

### 実行手順（デプロイ）

```bash
# 環境変数を設定
export DEPLOY_USER="deploy"

# 1. dry-runで確認
uploader production --dry-run --verbose

# 2. 詳細ログを出力しながらデプロイ
uploader production --verbose --log-file=deploy.log

# 3. ログを確認
grep "stats" deploy.log
```

### ポイント

- **rsyncプロトコル**は大規模プロジェクトで圧倒的に高速なのだ（SFTP/SCPの10倍以上速い場合もあるのだ）。
- **rsync_path: "sudo rsync"** により、リモート側で権限問題を回避できるのだ。
- **--chmod/--chown**
  でパーミッション・所有者を一括設定できるのだ（手動chmodが不要になるのだ）。
- **preserve_permissions**
  により、ローカルのパーミッションをそのまま維持できるのだ。
- **--compress**
  は低速回線で有効だが、高速LAN内では無効化した方が速い場合もあるのだ。

### パフォーマンス参考値

| ファイル数 | 容量  | SFTP | rsync | 速度比 |
| ---------- | ----- | ---- | ----- | ------ |
| 1,000      | 100MB | 45秒 | 10秒  | 4.5倍  |
| 10,000     | 500MB | 6分  | 30秒  | 12倍   |
| 50,000     | 2GB   | 30分 | 3分   | 10倍   |

### 関連ドキュメント

- [README - rsyncプロトコル](../README.md#rsync大規模プロジェクト推奨)
- [Troubleshooting - Permission denied](troubleshooting.md#permission-denied)
- [Configuration - rsync固有の設定](configuration.md#rsync固有の設定)

---

## Use Case 5: バックアップとリストア

### シナリオ

本番サーバーのファイルをローカルにバックアップし、必要に応じてリストアするケースなのだ。
localプロトコルを使って、リモート→ローカルのコピーも実現できるのだ。

### 対象プロジェクト

- 定期的なバックアップが必要
- ディザスタリカバリ対策
- ローカル環境でのテスト

### 設定例

```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "*.log"
  default_ignore:
    - common

# ローカルへのバックアップ
backup:
  from:
    type: "file"
    src:
      - "public/" # 本番ファイルのローカルコピー

  to:
    targets:
      - host: "localhost"
        protocol: "local"
        dest: "/backup/website-$(date +%Y%m%d)/"
        sync_mode: "mirror" # 完全同期
        preserve_permissions: true
        preserve_timestamps: true

# バックアップからのリストア
restore:
  from:
    type: "file"
    src:
      - "/backup/website-20260110/" # バックアップディレクトリ

  to:
    targets:
      - host: "prod.example.com"
        protocol: "rsync"
        port: 22
        user: "${DEPLOY_USER}"
        auth_type: "ssh_key"
        key_file: "~/.ssh/deploy_key"
        dest: "/var/www/html/"
        sync_mode: "mirror" # 完全同期
        preserve_permissions: true
        preserve_timestamps: true
```

### 実行手順（バックアップ）

```bash
# 1. リモートサーバーからファイルをダウンロード
rsync -avz deploy@prod.example.com:/var/www/html/ ./public/

# 2. ローカルにバックアップ
uploader backup

# バックアップが作成される: /backup/website-20260112/
```

### 実行手順（リストア）

```bash
# 環境変数を設定
export DEPLOY_USER="deploy"

# 1. リストア内容を確認
uploader restore --dry-run

# 2. 差分確認
uploader restore --diff

# 3. リストア実行
uploader restore --verbose
```

### ポイント

- **localプロトコル** を使えば、リモート転送なしでローカルコピーができるのだ。
- **sync_mode: mirror** により、バックアップ先とソースを完全一致させられるのだ。
- **preserve_permissions/timestamps** により、元のファイル属性を保持できるのだ。
- **日付付きディレクトリ名**で履歴管理できるのだ（`$(date
  +%Y%m%d)`はシェル展開なのだ）。
- リストア前は**必ず--dry-runと--diff**で確認するのだ。

### 自動バックアップスクリプト例

```bash
#!/bin/bash
# daily-backup.sh

# 環境変数
export DEPLOY_USER="deploy"
REMOTE_HOST="prod.example.com"
REMOTE_PATH="/var/www/html/"
LOCAL_PATH="./public/"
BACKUP_DIR="/backup/website-$(date +%Y%m%d)"

# 1. リモートからダウンロード
rsync -avz ${DEPLOY_USER}@${REMOTE_HOST}:${REMOTE_PATH} ${LOCAL_PATH}

# 2. ローカルにバックアップ
uploader backup --quiet

# 3. 古いバックアップを削除（30日以上前）
find /backup -type d -name "website-*" -mtime +30 -exec rm -rf {} \;

echo "Backup completed: ${BACKUP_DIR}"
```

### 関連ドキュメント

- [README - localプロトコル](../README.md#local)
- [Configuration - sync_mode](configuration.md#sync_mode)

---

## Use Case 6: 古いSSHサーバーへのデプロイ

### シナリオ

CentOS 6、Ubuntu 14.04などの古いSSHサーバーにデプロイするケースなのだ。
legacy_modeを有効化して、古いSSHアルゴリズムでも接続できるようにするのだ。

### 対象プロジェクト

- レガシー環境（CentOS 6、Ubuntu 14.04など）
- 最新のSSHアルゴリズムに非対応
- サーバーのアップデートができない

### 設定例

```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "node_modules/"
      - "*.log"
  default_ignore:
    - common

legacy:
  from:
    type: "file"
    src:
      - "dist/"
      - "public/"

  to:
    targets:
      - host: "old-server.example.com"
        protocol: "scp" # 古いサーバーでも安定
        port: 22
        user: "admin"
        auth_type: "password"
        password: "${LEGACY_PASSWORD}" # 環境変数推奨
        dest: "/home/admin/public_html/"
        sync_mode: "update"
        timeout: 60
        retry: 5

        # 古いSSHアルゴリズムを有効化
        legacy_mode: true
```

### 実行手順

```bash
# 環境変数を設定
export LEGACY_PASSWORD="your_password_here"

# または.envファイルで管理（direnv推奨）
echo 'export LEGACY_PASSWORD="your_password_here"' > .envrc
direnv allow

# 1. 接続テスト
ssh admin@old-server.example.com

# 2. dry-runで確認
uploader legacy --dry-run

# 3. デプロイ実行
uploader legacy --verbose
```

### legacy_modeで有効化されるアルゴリズム

| 種類     | アルゴリズム                                            |
| -------- | ------------------------------------------------------- |
| 鍵交換   | diffie-hellman-group14-sha1, diffie-hellman-group1-sha1 |
| ホスト鍵 | ssh-rsa                                                 |
| 暗号     | aes128-cbc, aes256-cbc, 3des-cbc（SFTPのみ）            |

### ポイント

- **legacy_mode: true** により、古いSSHサーバーでも接続できるようになるのだ。
- **scpプロトコル**は古い環境でも安定して動作するのだ。
- **パスワード認証**は環境変数で管理し、YAMLに直接書かないのだ。
- **timeout/retryを多め**に設定すると、接続の不安定さに対応できるのだ。

### セキュリティ上の注意

- **legacy_modeのアルゴリズムは古く、セキュリティリスクがある**のだ。
- 可能な限り**サーバーのアップデートを推奨**するのだ。
- **本番環境では使用を避け**、一時的な移行期間のみ使用するのだ。
- **VPN経由の接続を検討**してセキュリティを高めるのだ。

### SSH設定で対応する場合

uploader設定だけでなく、SSH設定でも対応できるのだ。

```bash
# ~/.ssh/config
Host old-server
  HostName old-server.example.com
  User admin
  KexAlgorithms +diffie-hellman-group1-sha1,diffie-hellman-group14-sha1
  HostKeyAlgorithms +ssh-rsa
  Ciphers +aes128-cbc,aes256-cbc,3des-cbc
```

この場合、uploader設定で`legacy_mode: false`でも接続できるのだ。

### 関連ドキュメント

- [Configuration - legacy_mode](configuration.md#legacy_mode)
- [Troubleshooting - 古いSSHサーバーに接続できない](troubleshooting.md#古いsshサーバーに接続できない)
- [README - レガシーサーバー対応](../README.md#レガシーサーバー対応)

---

## Use Case 7: ローカル環境でのmirrorモード検証

### シナリオ

本番環境でmirrorモードを実行する前に、ローカル環境で安全に動作確認するケースなのだ。
localプロトコルを使って、リスクなしにmirrorモードの挙動を確認できるのだ。

### 対象プロジェクト

- mirrorモードの初回実行
- 削除対象ファイルの事前確認
- リスクなしでテストしたい

### 設定例

```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "*.log"
      - ".DS_Store"
  default_ignore:
    - common

# ローカルでのテスト
local-test:
  from:
    type: "file"
    src:
      - "dist/"

  to:
    targets:
      - host: "localhost"
        protocol: "local"
        dest: "/tmp/deploy-test/"
        sync_mode: "mirror" # 完全同期をテスト
        preserve_permissions: true
        preserve_timestamps: true

# 本番環境（テスト後に実行）
production:
  from:
    type: "file"
    src:
      - "dist/"

  to:
    targets:
      - host: "prod.example.com"
        protocol: "rsync"
        port: 22
        user: "${DEPLOY_USER}"
        auth_type: "ssh_key"
        key_file: "~/.ssh/deploy_key"
        dest: "/var/www/html/"
        sync_mode: "mirror" # 完全同期
        timeout: 60
        retry: 3
```

### 実行手順（ローカルテスト）

```bash
# 1. テスト用ディレクトリを準備
mkdir -p /tmp/deploy-test
echo "old-file.txt" > /tmp/deploy-test/old-file.txt
echo "keep-file.txt" > /tmp/deploy-test/keep-file.txt
echo "keep-file.txt" > dist/keep-file.txt

# 2. dry-runで削除対象を確認
uploader local-test --dry-run

# 出力例:
# [Dry-run] The following files will be deleted:
#   DELETE /tmp/deploy-test/old-file.txt

# 3. ブラウザで視覚的に確認
uploader local-test --diff

# 4. 実際にローカルテスト実行
uploader local-test --verbose

# 5. 結果確認
ls -la /tmp/deploy-test/
# old-file.txt が削除されている
# keep-file.txt が残っている

# 6. 期待通りなら本番実行
uploader production --dry-run
uploader production --diff
uploader production
```

### 実行手順（本番環境）

```bash
# 環境変数を設定
export DEPLOY_USER="deploy"

# 1. dry-runで確認（必須）
uploader production --dry-run --verbose

# 2. ブラウザで視覚的に確認（必須）
uploader production --diff

# 3. 本番デプロイ
uploader production --verbose --log-file=mirror-deploy.log

# 4. ログで削除されたファイルを確認
grep "DELETE" mirror-deploy.log
```

### ポイント

- **localプロトコル**でリスクなしにテストできるのだ。
- **mirrorモード**は削除を伴うので、**必ず事前にローカルテスト**するのだ。
- **--dry-runと--diff** の両方で確認することで、削除ミスを防げるのだ。
- **ログファイルに保存**することで、削除履歴を記録できるのだ。
- テストで期待通りなら、同じ設定を本番環境に適用できるのだ。

### mirrorモードの注意事項

| 項目         | 説明                                       |
| ------------ | ------------------------------------------ |
| 削除対象     | ローカルに存在しないファイル               |
| 危険性       | 予期しないファイル削除の可能性             |
| 必須手順     | dry-run → diff → ローカルテスト → 本番実行 |
| バックアップ | 初回実行前に必ず取得                       |
| 推奨用途     | クリーンデプロイ、ステージング環境         |

### 関連ドキュメント

- [Configuration - sync_mode](configuration.md#sync_mode)
- [Troubleshooting - ファイルが予期せず削除された](troubleshooting.md#ファイルが予期せず削除された)
- [README - sync_mode](../README.md#updateとmirrorの違い)

---

## Use Case 8: Git差分を使った効率的なデプロイ

### シナリオ

Git管理されているプロジェクトで、ブランチ間の差分のみを効率的にデプロイするケースなのだ。
CLIオプションで柔軟にブランチを切り替えて、必要な差分だけをアップロードするのだ。

### 対象プロジェクト

- Git管理されている
- 複数のフィーチャーブランチがある
- 差分のみを高速にデプロイしたい

### 設定例

```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "node_modules/"
      - "*.log"
    development:
      - "tests/"
      - "*.test.ts"
      - ".env.local"
  default_ignore:
    - common

# 開発環境: developブランチベース
development:
  from:
    type: "git"
    base: "origin/develop" # 開発ブランチと比較
    target: "HEAD"
    include_untracked: true # 新規ファイルも含める

  to:
    targets:
      - host: "dev.example.com"
        protocol: "rsync"
        port: 22
        user: "${DEV_USER}"
        auth_type: "ssh_key"
        key_file: "~/.ssh/dev_key"
        dest: "/var/www/dev/"
        sync_mode: "update"
        rsync_options:
          - "--compress"

# 本番環境: mainブランチベース
production:
  from:
    type: "git"
    base: "origin/main" # 本番ブランチと比較
    target: "HEAD"
    include_untracked: false

  to:
    targets:
      - host: "prod.example.com"
        protocol: "rsync"
        port: 22
        user: "${PROD_USER}"
        auth_type: "ssh_key"
        key_file: "~/.ssh/prod_key"
        dest: "/var/www/html/"
        sync_mode: "update"
        ignore:
          use:
            - common
            - development
        rsync_options:
          - "--compress"
```

### 実行手順（通常のデプロイ）

```bash
# 環境変数を設定
export DEV_USER="devuser"
export PROD_USER="produser"

# 1. フィーチャーブランチで開発
git checkout -b feature/new-feature
# 開発作業...
git add .
git commit -m "Add new feature"

# 2. developブランチとの差分を開発環境にデプロイ
uploader development --dry-run
uploader development

# 3. mainブランチにマージ
git checkout main
git merge feature/new-feature

# 4. mainブランチとの差分を本番環境にデプロイ
uploader production --diff
uploader production
```

### 実行手順（CLIオプションで柔軟に指定）

```bash
# 特定のブランチ間の差分をデプロイ
uploader development --base origin/main --target feature/new-feature

# 特定のコミット間の差分をデプロイ
uploader development --base abc123 --target def456

# タグ間の差分をデプロイ
uploader production --base v1.0.0 --target v1.1.0

# 直前のコミットとの差分をデプロイ
uploader development --base HEAD~1 --target HEAD

# 特定のブランチの全ファイルをデプロイ
uploader production --base $(git hash-object -t tree /dev/null) --target origin/main
```

### 実行手順（リリース手順の例）

```bash
# 1. developブランチで開発
git checkout develop
# ... 開発作業 ...
uploader development

# 2. ステージングで確認（仮にstaging環境がある場合）
git checkout staging
git merge develop
uploader staging --diff

# 3. 本番リリース
git checkout main
git merge staging
git tag v1.1.0
git push origin main --tags

# 4. 本番デプロイ
uploader production --base v1.0.0 --target v1.1.0 --dry-run
uploader production --base v1.0.0 --target v1.1.0 --diff
uploader production --base v1.0.0 --target v1.1.0 --verbose
```

### ポイント

- **gitモード**
  により、変更されたファイルのみを自動検出してアップロードできるのだ。
- **CLIオプション（--base/--target）**
  により、設定ファイルを変えずに柔軟にブランチを指定できるのだ。
- **include_untracked** を使えば、git
  addしていない新規ファイルも含められるのだ。
- **rsyncプロトコル**と組み合わせることで、高速な差分デプロイが可能なのだ。
- **タグ間の差分**を指定することで、リリース履歴を明確に管理できるのだ。

### Git差分の有効な使い方

| シナリオ             | base           | target      | 説明             |
| -------------------- | -------------- | ----------- | ---------------- |
| 通常のデプロイ       | origin/main    | HEAD        | mainとの差分     |
| フィーチャーブランチ | origin/develop | feature/xxx | developとの差分  |
| リリース差分         | v1.0.0         | v1.1.0      | タグ間の差分     |
| 直前のコミット       | HEAD~1         | HEAD        | 直前との差分     |
| 特定のコミット間     | abc123         | def456      | コミット間の差分 |
| ブランチ全体         | (空のツリー)   | origin/main | 全ファイル       |

### 関連ドキュメント

- [Configuration - gitモードの設定](configuration.md#gitモードの設定)
- [README - Gitモード](../README.md#gitモード)
- [SPEC.md - Git差分抽出](../SPEC.md#gitモード用オプション設定ファイルより優先)

---

## まとめ

各ユースケースで紹介した設定例は、実際に動作する構成なのだ。
自分のプロジェクトに合わせてカスタマイズして、効率的なデプロイを実現してほしいのだ。

### ベストプラクティスのチェックリスト

- [ ] **dry-runで必ず事前確認**してから本番実行
- [ ] **mirrorモードは--diffで視覚的に確認**してから実行
- [ ] **環境変数を使って認証情報を管理**（YAMLに平文で書かない）
- [ ] **ignoreパターンを適切に設定**して不要なファイルを除外
- [ ] **大規模プロジェクトではrsyncを使用**して高速化
- [ ] **複数サーバへのデプロイではdefaults**を活用
- [ ] **ログファイルに保存**して履歴を記録
- [ ] **レガシー環境では早めにアップデート計画**を立てる

### さらに詳しく知りたい場合

- [Getting Started](getting-started.md) - 基本的な使い方
- [Configuration](configuration.md) - 全設定項目の詳細リファレンス
- [Troubleshooting](troubleshooting.md) - よくある問題と解決方法
- [README.md](../README.md) - プロジェクト概要とQuick Start
- [uploader.example.yaml](../uploader.example.yaml) - コメント付き設定サンプル

---

**最終更新**: 2026-01-12
