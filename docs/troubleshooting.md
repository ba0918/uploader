# Troubleshooting - トラブルシューティング

uploaderで問題が発生したときの解決方法をまとめています。

## 目次

1. [エラーメッセージ別の解決方法](#エラーメッセージ別の解決方法)
2. [接続エラー](#接続エラー)
3. [認証エラー](#認証エラー)
4. [ファイル操作エラー](#ファイル操作エラー)
5. [設定ファイルエラー](#設定ファイルエラー)
6. [パフォーマンス問題](#パフォーマンス問題)
7. [デバッグ方法](#デバッグ方法)

---

## エラーメッセージ別の解決方法

### "Permission denied"

**症状**: ファイルのアップロードやリモート操作時に権限エラー

**原因と解決方法**:

#### 1. SSH鍵のパーミッション問題

```bash
# 確認
ls -la ~/.ssh/id_rsa

# 修正（600にする）
chmod 600 ~/.ssh/id_rsa
chmod 700 ~/.ssh
```

**重要**: SSH鍵のパーミッションが緩いとSSHが拒否します。

- 秘密鍵: `600` (所有者のみ読み書き)
- .sshディレクトリ: `700` (所有者のみアクセス)

#### 2. リモートディレクトリの書き込み権限

```bash
# リモートサーバーで確認
ls -ld /var/www/html/

# 所有者を確認・変更（リモートサーバーで）
sudo chown -R youruser:yourgroup /var/www/html/
```

#### 3. rsyncでsudo権限が必要な場合

```yaml
production:
  to:
    defaults:
      protocol: "rsync"
      rsync_path: "sudo rsync" # ← これを追加
```

リモート側のパーミッション設定:

```bash
# リモートサーバーで、パスワードなしsudoを設定
sudo visudo
# 以下を追加:
# youruser ALL=(ALL) NOPASSWD: /usr/bin/rsync
```

#### 4. SELinux/AppArmor の制限

リモートサーバーで SELinux が有効な場合：

```bash
# 状態確認
getenforce

# 一時的に無効化（テスト用）
sudo setenforce 0

# 恒久的な設定はシステム管理者に相談
```

---

### "Connection refused"

**症状**: サーバーに接続できない

**原因と解決方法**:

#### 1. ホスト名・IPアドレスの誤り

```bash
# 確認: pingで到達性チェック
ping your-server.example.com

# SSH接続テスト
ssh user@your-server.example.com
```

**確認ポイント**:

- ホスト名のタイプミス
- DNSの名前解決が正しく動作しているか
- ネットワーク接続があるか

#### 2. ポート番号の誤り

```yaml
# デフォルトは22
targets:
  - host: "your-server.example.com"
    port: 22 # ← カスタムポートの場合は変更
```

```bash
# SSHで確認
ssh -p 2222 user@your-server.example.com
```

#### 3. ファイアウォール・セキュリティグループ

**クラウドサービス（AWS/GCP/Azure）の場合**:

- セキュリティグループでSSHポート（22）を開放
- ソースIP制限がある場合、自分のIPを許可

**オンプレミスの場合**:

```bash
# ファイアウォール状態確認（リモートサーバーで）
sudo ufw status
sudo firewall-cmd --list-all

# ポート22を開放（ufw）
sudo ufw allow 22/tcp

# ポート22を開放（firewalld）
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

#### 4. SSHサービスが起動していない

```bash
# SSHサービス確認（リモートサーバーで）
sudo systemctl status sshd

# 起動
sudo systemctl start sshd

# 自動起動を有効化
sudo systemctl enable sshd
```

---

### "Authentication failed"

**症状**: 認証に失敗する

**原因と解決方法**:

#### 1. 秘密鍵のパスが間違っている

```yaml
targets:
  - key_file: "~/.ssh/id_rsa" # ← パスが正しいか確認
```

```bash
# 確認
ls -la ~/.ssh/id_rsa

# ない場合は鍵を生成
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
```

#### 2. 公開鍵がリモートに登録されていない

```bash
# 公開鍵をリモートに追加（推奨）
ssh-copy-id user@your-server.example.com

# または手動で追加
cat ~/.ssh/id_rsa.pub
# → リモートの ~/.ssh/authorized_keys に追加
```

**手動追加の手順**:

```bash
# ローカルで公開鍵をコピー
cat ~/.ssh/id_rsa.pub

# リモートサーバーにログイン（別の方法で）
ssh user@your-server.example.com

# authorized_keysに追加
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "公開鍵の内容" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

#### 3. パスワード認証の場合

```yaml
targets:
  - auth_type: "password"
    password: "${SERVER_PASSWORD}" # 環境変数を使用
```

```bash
# 実行時に環境変数を設定
SERVER_PASSWORD="your_password" uploader staging

# または事前にexport
export SERVER_PASSWORD="your_password"
uploader staging
```

**セキュリティ上の注意**:

- パスワードをYAMLに直接書かない
- 環境変数を使用する
- `.bashrc`や`.zshrc`に書くのも避ける（`.env`ファイル等を使用）

#### 4. SSH鍵のパスフレーズ

パスフレーズ付きの鍵を使用している場合：

```bash
# ssh-agentを使用
eval $(ssh-agent)
ssh-add ~/.ssh/id_rsa
# → パスフレーズを入力

# その後uploaderを実行
uploader development
```

**自動化する場合**:

```bash
# .bashrcや.zshrcに追加
if [ -z "$SSH_AUTH_SOCK" ]; then
  eval $(ssh-agent -s)
  ssh-add ~/.ssh/id_rsa 2>/dev/null
fi
```

---

### "No such file or directory"

**症状**: ファイルやディレクトリが見つからない

**原因と解決方法**:

#### 1. リモートパスの誤り

```yaml
targets:
  - dest: "/var/www/html/" # ← 存在するパスか確認
```

```bash
# リモートサーバーで確認
ssh user@your-server ls -la /var/www/

# ディレクトリを作成
ssh user@your-server mkdir -p /var/www/html/
```

#### 2. ローカルファイルパスの誤り（fileモード）

```yaml
from:
  type: "file"
  src:
    - "dist/" # ← 存在するか確認
```

```bash
# ローカルで確認
ls -la dist/

# カレントディレクトリ確認
pwd
```

**よくある間違い**:

```yaml
# ❌ プロジェクトルートにいないのにdist/を指定
from:
  type: "file"
  src:
    - "dist/"

# ✅ フルパスか、正しい相対パスを指定
from:
  type: "file"
  src:
    - "/home/user/project/dist/"
```

#### 3. チルダ（~）の展開問題

```yaml
# ❌ リモート側で ~ が展開されない場合がある
dest: "~/public_html/"

# ✅ フルパスで指定
dest: "/home/username/public_html/"
```

**チルダ展開の動作**:

- **ローカル（`src`, `key_file`）**: uploaderが自動展開
- **リモート（`dest`）**: プロトコルによって動作が異なる
  - rsync: 展開される
  - sftp/scp: 展開されない場合がある

---

### "YAML parse error"

**症状**: 設定ファイルの読み込みに失敗する

**原因と解決方法**:

#### 1. インデントの誤り

YAMLはインデント（2スペース）に厳密です。

```yaml
# ❌ インデントがずれている
development:
from:
  type: "git"

# ✅ 正しいインデント
development:
  from:
    type: "git"
```

**確認方法**:

```bash
# インデントを可視化（タブ/スペース混在チェック）
cat -A uploader.yaml

# ^Iがあればタブ文字（スペースに統一すべき）
```

#### 2. コロン（:）の後にスペースがない

```yaml
# ❌ コロンの後にスペースがない
host:"example.com"

# ✅ スペースを入れる
host: "example.com"
```

#### 3. クォートの誤り

```yaml
# ❌ クォートが閉じていない
user: "admin

# ✅ 正しく閉じる
user: "admin"

# ❌ シングルクォート内にシングルクォート
password: 'it's password'

# ✅ ダブルクォートを使用
password: "it's password"
```

#### 4. 予約語の使用

```yaml
# ❌ YAMLの真偽値と解釈される
deploy: yes # trueと解釈される

# ✅ クォートで囲む
deploy: "yes"
```

**YAMLの真偽値として解釈される単語**:

- `yes`, `no`
- `true`, `false`
- `on`, `off`

**デバッグ方法**:

```bash
# verbose モードでエラー詳細を確認
uploader development --verbose

# YAMLバリデーションツールを使用
deno run --allow-read - << 'EOF'
import { parse } from "jsr:@std/yaml";
const content = await Deno.readTextFile("uploader.yaml");
try {
  const result = parse(content);
  console.log("✓ Valid YAML");
} catch (e) {
  console.error("✗ Parse error:", e.message);
}
EOF
```

---

## 接続エラー

### タイムアウトする

**症状**: 接続が遅い、タイムアウトする

**解決方法**:

#### 1. タイムアウト時間を延長

```yaml
targets:
  - timeout: 60 # デフォルト: 30秒
```

**推奨値**:

- 通常のサーバー: `30`秒
- 低速な回線: `60`秒
- 海外サーバー: `90`秒

#### 2. ネットワーク状況を確認

```bash
# pingでレイテンシ確認
ping -c 5 your-server.example.com

# tracerouteでルート確認
traceroute your-server.example.com

# mtrでリアルタイム確認（推奨）
mtr your-server.example.com
```

**診断のポイント**:

- パケットロス率が10%以上 → ネットワーク不安定
- レイテンシが500ms以上 → タイムアウト延長を検討
- 途中のルーターで止まる → ファイアウォール/ルーティング問題

#### 3. プロキシ経由の接続

SSH設定（`~/.ssh/config`）でプロキシを設定：

```
Host your-server
  HostName your-server.example.com
  User youruser
  ProxyCommand nc -X connect -x proxy.example.com:8080 %h %p
```

**HTTP/SOCKSプロキシの使用**:

```
# SOCKS5プロキシ経由
ProxyCommand nc -x proxy.example.com:1080 %h %p

# HTTP CONNECTプロキシ経由（corkscrew使用）
ProxyCommand corkscrew proxy.example.com 8080 %h %p
```

#### 4. リトライ回数を増やす

```yaml
targets:
  - retry: 5 # デフォルト: 3回
```

---

### 古いSSHサーバーに接続できない

**症状**: レガシーなSSHサーバー（CentOS 6など）に接続できない

**エラーメッセージの例**:

```
Unable to negotiate with server: no matching key exchange method found
```

**解決方法**:

```yaml
targets:
  - legacy_mode: true # ← これを追加
```

legacy_mode を有効にすると、古いSSHアルゴリズムが使用可能になります：

- **鍵交換**: diffie-hellman-group14-sha1, diffie-hellman-group1-sha1
- **ホスト鍵**: ssh-rsa
- **暗号**: aes128-cbc, aes256-cbc, 3des-cbc

**セキュリティ上の注意**:

- これらのアルゴリズムは古く、セキュリティリスクがあります
- 可能な限りサーバーのアップデートを推奨
- 本番環境では使用を避けてください

**SSH設定でも対応可能**:

```
# ~/.ssh/config
Host old-server
  HostName old-server.example.com
  KexAlgorithms +diffie-hellman-group1-sha1
  HostKeyAlgorithms +ssh-rsa
  Ciphers +aes128-cbc,aes256-cbc
```

---

## 認証エラー

### "publickey authentication failed"

**症状**: SSH鍵認証が失敗する

**段階的な診断手順**:

#### ステップ1: SSH接続の確認

```bash
# 通常のSSH接続を試す
ssh -v user@your-server.example.com
```

**-vオプションの出力を確認**:

```
debug1: Trying private key: /home/user/.ssh/id_rsa
debug1: Authentications that can continue: publickey,password
debug1: No more authentication methods to try
```

#### ステップ2: 鍵が提供されているか確認

```bash
# より詳細なログ
ssh -vvv user@your-server.example.com 2>&1 | grep -i "Offering\|identity"
```

#### ステップ3: 公開鍵の確認

```bash
# リモートサーバーで確認
ssh user@your-server cat ~/.ssh/authorized_keys

# ローカルの公開鍵と比較
cat ~/.ssh/id_rsa.pub
```

**確認ポイント**:

- 公開鍵が完全一致しているか
- 改行やスペースが余分に入っていないか
- authorized_keysのパーミッションは600か

#### ステップ4: SSH鍵の形式確認

```bash
# 鍵の種類を確認
ssh-keygen -l -f ~/.ssh/id_rsa

# 古い形式の場合は変換
ssh-keygen -p -f ~/.ssh/id_rsa -m pem
```

---

### "password authentication failed"

**症状**: パスワード認証が失敗する

**原因と解決方法**:

#### 1. パスワードの誤り

```bash
# 手動でSSH接続してパスワード確認
ssh user@your-server.example.com
```

#### 2. パスワード認証が無効化されている

```bash
# リモートサーバーで確認
grep "PasswordAuthentication" /etc/ssh/sshd_config

# 無効化されている場合
PasswordAuthentication no

# SSH鍵認証に切り替えるか、設定変更
sudo vi /etc/ssh/sshd_config
# PasswordAuthentication yes
sudo systemctl restart sshd
```

#### 3. 環境変数の展開失敗

```yaml
password: "${SERVER_PASSWORD}"
```

```bash
# 環境変数が設定されているか確認
echo $SERVER_PASSWORD

# 設定されていない場合
export SERVER_PASSWORD="your_password"
```

---

## ファイル操作エラー

### ファイルが予期せず削除された

**症状**: mirrorモードでリモートファイルが削除された

**原因**: mirrorモードは、ローカルに存在しないファイルを**自動削除**します。

**対策**:

#### 1. 必ず dry-run で確認

```bash
uploader production --dry-run
```

出力例:

```
[Dry-run] The following files will be deleted:
  - /var/www/html/old-page.html
  - /var/www/html/config/legacy.json
```

削除されるファイルを確認してから実行。

#### 2. ブラウザで視覚的に確認

```bash
uploader production --browser
```

- 赤色の「DELETE」マークが削除対象
- リモート専用ファイルが一目で分かる

#### 3. バックアップを取る

mirrorモード実行前に、リモートサーバーのバックアップを取る。

```bash
# リモートサーバーでバックアップ
ssh user@your-server "tar czf /tmp/backup-$(date +%Y%m%d).tar.gz /var/www/html/"
```

#### 4. updateモードの使用を検討

削除が不要な場合は、updateモードを使用：

```yaml
targets:
  - sync_mode: "update" # 削除しない
```

**updateとmirrorの違い**:

| モード   | 追加 | 更新 | 削除 | 用途                       |
| -------- | ---- | ---- | ---- | -------------------------- |
| `update` | ✓    | ✓    | ✗    | 通常のデプロイ             |
| `mirror` | ✓    | ✓    | ✓    | 完全同期、クリーンデプロイ |

---

### ignoreパターンが効かない

**症状**: 除外したはずのファイルがアップロードされる

**原因と解決方法**:

#### 1. ignore_groupsの適用忘れ

```yaml
_global:
  ignore_groups:
    common:
      - "*.log"
  default_ignore:
    - common # ← これを忘れずに
```

#### 2. ターゲット固有ignoreの上書き

```yaml
targets:
  - ignore:
      use:
        - common # ← default_ignoreは無効になる
```

**重要**: `use` を指定すると、`default_ignore`
は**上書き**されます（マージではない）。

**正しい書き方**:

```yaml
targets:
  - ignore:
      use:
        - common # default_ignoreを明示的に指定
        - development # 追加グループ
```

#### 3. globパターンの誤り

```yaml
# ❌ これは効かない
- "node_modules"

# ✅ ディレクトリは末尾に/
- "node_modules/"

# ✅ 再帰的にマッチ
- "**/node_modules/"

# ✅ 特定の拡張子
- "*.log"
- "**/*.tmp"
```

**globパターンの基本**:

- `*`: 任意の文字列（ディレクトリ区切りを除く）
- `**`: ディレクトリを含む任意の文字列
- `?`: 任意の1文字
- `[abc]`: a, b, c のいずれか
- `{js,ts}`: js または ts

#### 4. デバッグ方法

```bash
# verbose モードで適用されたignoreパターンを確認
uploader development --verbose --dry-run

# 出力例:
# [verbose] Ignore patterns:
#   - *.log
#   - .git/
#   - node_modules/
```

---

### ファイル数が多すぎてエラー

**症状**: `node_modules/` などの大量ファイルでエラー

**エラーメッセージの例**:

```
Too many files to process
ENOMEM: out of memory
```

**解決方法**:

#### 1. ignoreパターンで除外

```yaml
_global:
  ignore_groups:
    common:
      - "node_modules/"
      - ".git/"
      - "vendor/" # PHP Composer
      - "bower_components/"
```

#### 2. fileモードで必要なファイルのみ指定

```yaml
from:
  type: "file"
  src:
    - "dist/" # ビルド成果物のみ
    - "public/"
    - "config/*.json"
```

gitモードで全ファイルを対象にせず、fileモードで明示的に指定する。

#### 3. rsyncの使用

rsyncは大量ファイルの処理が効率的です：

```yaml
targets:
  - protocol: "rsync"
```

---

## 設定ファイルエラー

### 「プロファイルが見つからない」

**症状**: `Profile "xxx" not found in uploader.yaml`

**解決方法**:

#### 1. プロファイル名の確認

```bash
# プロファイル一覧を確認
uploader --list
```

出力例:

```
Available profiles:
  - development
  - staging
  - production
```

#### 2. uploader.yamlの場所確認

```bash
# 現在のディレクトリに uploader.yaml があるか
ls -la uploader.yaml

# なければサンプルからコピー
cp uploader.example.yaml uploader.yaml
```

**設定ファイルの検索順序**:

1. `./uploader.yaml`
2. `./uploader.yml`
3. `~/.config/uploader/config.yaml`
4. `~/.config/uploader/config.yml`

#### 3. YAMLの構文エラー

```bash
# verbose モードで詳細確認
uploader development --verbose
```

**よくあるミス**:

```yaml
# ❌ プロファイル名がインデントされている
  development:
    from:
      type: "git"

# ✅ プロファイル名はインデントなし
development:
  from:
    type: "git"
```

---

### 「設定ファイルが見つかりません」

**症状**:
`設定ファイルが見つかりません。uploader.yaml を作成するか --config で指定してください`

**解決方法**:

#### 1. 設定ファイルを作成

```bash
# サンプルファイルをコピー（リポジトリにいる場合）
cp uploader.example.yaml uploader.yaml

# または最小構成で作成
cat > uploader.yaml << 'EOF'
development:
  from:
    type: "git"
    base: "origin/main"
  to:
    targets:
      - host: "example.com"
        protocol: "sftp"
        user: "deploy"
        auth_type: "ssh_key"
        key_file: "~/.ssh/id_rsa"
        dest: "/var/www/html/"
EOF
```

#### 2. 設定ファイルを明示的に指定

```bash
# 別の場所にある設定ファイルを使用
uploader --config=/path/to/config.yaml development

# ホームディレクトリの設定を使用
uploader --config=~/.config/uploader/config.yaml development
```

---

### 環境変数が展開されない

**症状**: `${VAR_NAME}` がそのまま使われる

**原因**: 環境変数が設定されていない

**解決方法**:

```bash
# 環境変数を設定
export DEPLOY_USER="myuser"
export SERVER_PASSWORD="mypassword"

# または実行時に指定
DEPLOY_USER="myuser" uploader development
```

**複数の環境変数を使う場合**:

```bash
# .envファイルを作成（Denoは未サポート）
cat > .env << 'EOF'
DEPLOY_USER=myuser
SERVER_PASSWORD=mypassword
EOF

# シェルで読み込んでから実行
set -a
source .env
set +a
uploader development
```

**direnv を使う（推奨）**:

```bash
# direnvをインストール
# macOS:
brew install direnv

# Linux:
apt-get install direnv

# .envrcを作成
cat > .envrc << 'EOF'
export DEPLOY_USER=myuser
export SERVER_PASSWORD=mypassword
EOF

# 許可
direnv allow

# ディレクトリに入ると自動で読み込まれる
cd /path/to/project
uploader development
```

---

## パフォーマンス問題

### アップロードが遅い

**原因と解決方法**:

#### 1. プロトコルの選択

**rsync** が最も高速です（差分同期）：

```yaml
protocol: "rsync" # ← scp/sftpより高速
```

**プロトコル別の速度比較**（1000ファイル、100MBの場合）:

- `rsync`: 約10秒（差分のみ）
- `sftp`: 約30秒
- `scp`: 約45秒
- `local`: 約5秒

#### 2. 圧縮オプションの使用

```yaml
protocol: "rsync"
rsync_options:
  - "--compress" # ← 圧縮を有効化
```

**圧縮の効果**:

- テキストファイル: 50-70%削減
- 画像ファイル: ほぼ効果なし（すでに圧縮済み）
- 低速回線では有効、高速回線では逆効果の場合も

#### 3. 並列転送の最適化

sftpとscpは自動的に並列転送しますが、ファイル数が多い場合はrsyncの方が効率的です。

#### 4. ファイル数を減らす

不要なファイルを ignore で除外：

```yaml
ignore_groups:
  common:
    - "*.log"
    - "*.tmp"
    - ".cache/"
    - "node_modules/"
    - ".git/"
```

#### 5. 差分のみアップロード

gitモードを使用：

```yaml
from:
  type: "git"
  base: "origin/main" # 前回デプロイ時点
```

全ファイルではなく、差分のみがアップロードされます。

---

### メモリ不足

**症状**: 大量ファイル（10,000+）のアップロードでメモリエラー

**エラーメッセージの例**:

```
JavaScript heap out of memory
ENOMEM: out of memory
```

**解決方法**:

#### 1. ファイル数を減らす

ignoreパターンで除外：

```yaml
ignore_groups:
  build:
    - "dist/"
    - "build/"
    - "node_modules/"
    - ".git/"
```

#### 2. fileモードで分割アップロード

```bash
# ディレクトリごとに分割（uploader.yamlに複数プロファイル作成）
uploader deploy-src    # src/ のみ
uploader deploy-public # public/ のみ
uploader deploy-config # config/ のみ
```

#### 3. rsyncを使用

rsyncは大量ファイルの処理が効率的（メモリ使用量が少ない）：

```yaml
protocol: "rsync"
```

---

## デバッグ方法

### verboseモードで詳細ログを確認

```bash
uploader development --verbose
```

出力例:

```
[verbose] Config loaded: uploader.yaml
[verbose] Profile: development
[verbose] Git diff: origin/main...HEAD
[verbose] Found 3 changed files:
[verbose]   - src/index.ts (modified)
[verbose]   - public/style.css (added)
[verbose]   - old/file.txt (deleted)
[verbose] Ignore patterns applied: *.log, .git/, node_modules/
[verbose] Connecting to example.com:22
[verbose] Authentication: ssh_key (/home/user/.ssh/id_rsa)
[verbose] Connected successfully
[verbose] Uploading: src/index.ts (1.2KB)
[verbose] → /var/www/html/src/index.ts
[verbose] Upload complete (3 files, 5.6KB)
```

### ログファイルに保存

```bash
uploader development --verbose --log-file=debug.log
```

ログファイルには全ての詳細情報が記録されます。

**ログの分析**:

```bash
# エラー行のみ抽出
grep -i error debug.log

# 特定のファイルの処理を追跡
grep "src/index.ts" debug.log
```

### SSH接続の詳細確認

```bash
# SSH接続をverboseモードで確認
ssh -vvv user@your-server.example.com

# 出力例:
# debug1: Connecting to example.com [192.168.1.1] port 22.
# debug1: Connection established.
# debug1: Authentications that can continue: publickey,password
# debug1: Trying private key: /home/user/.ssh/id_rsa
# debug1: Authentication succeeded (publickey).
```

**-vオプションの違い**:

- `-v`: 基本的な情報
- `-vv`: 詳細な情報
- `-vvv`: 全ての情報（デバッグ用）

### dry-runで事前確認

```bash
# 実際にアップロードせずに動作確認
uploader development --dry-run --verbose
```

出力例:

```
[Dry-run] The following files will be uploaded:
  ADD    src/index.ts → /var/www/html/src/index.ts
  MODIFY public/style.css → /var/www/html/public/style.css

[Dry-run] The following files will be deleted:
  DELETE /var/www/html/old/file.txt

[Dry-run] No actual upload performed
```

### ブラウザUIで視覚的に確認

```bash
uploader development --browser
```

ブラウザで確認できる内容:

- ファイル一覧（追加/変更/削除）
- ファイルの差分表示
- ignoreパターンの適用結果
- アップロード先パス

### プロトコル別の動作確認

#### SFTP/SCPの動作確認

```bash
# 手動でsftp接続
sftp user@your-server.example.com

# コマンド例:
# sftp> pwd           # リモートのカレントディレクトリ
# sftp> ls /var/www/html/
# sftp> put localfile.txt /var/www/html/
```

#### rsyncの動作確認

```bash
# dry-runモード
rsync -avz --dry-run dist/ user@your-server.example.com:/var/www/html/

# 実際の転送
rsync -avz dist/ user@your-server.example.com:/var/www/html/
```

---

## それでも解決しない場合

### 1. GitHub Issuesで検索

既知の問題かもしれません：

https://github.com/ba0918/uploader/issues

**検索のコツ**:

- エラーメッセージの一部で検索
- `is:issue` `is:open` で未解決の問題を検索
- `is:issue` `is:closed` で解決済みの問題を検索

### 2. 新しいIssueを作成

以下の情報を含めてください：

```markdown
## Environment

- uploader version: `uploader --version`
- Deno version: `deno --version`
- OS: macOS 14.1 / Ubuntu 22.04 / Windows 11
- Protocol: sftp / scp / rsync / local

## Error message

(完全なエラーメッセージを貼り付け)

## Configuration

(機密情報を削除した設定ファイル)

## Steps to reproduce

1. Run `uploader development`
2. Error occurs

## Expected behavior

(期待される動作)

## Actual behavior

(実際の動作)

## Verbose log

(--verbose オプションの出力)
```

### 3. Discussions で質問

一般的な質問や使い方：

https://github.com/ba0918/uploader/discussions

**質問の際のテンプレート**:

```markdown
## What I want to do

(やりたいこと)

## What I tried

(試したこと)

## Configuration

(設定ファイル)

## Question

(質問)
```

---

## 関連ドキュメント

- [Getting Started](getting-started.md) - 基本的な使い方
- [Configuration](configuration.md) - 設定リファレンス
- [Use Cases](use-cases.md) - 実践例
- [README.md](../README.md) - プロジェクト概要
- [uploader.example.yaml](../uploader.example.yaml) - 設定ファイルサンプル

---

**最終更新**: 2026-01-12
