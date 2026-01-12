# Getting Started - uploader を始めよう

> 所要時間: 約10分 前提知識: Git、SSH、YAMLの基本

## 目次

1. [インストール](#インストール)
2. [設定ファイルの作成](#設定ファイルの作成)
3. [最初のアップロード](#最初のアップロード)
4. [次のステップ](#次のステップ)

---

## インストール

### 前提条件

以下がインストールされていることを確認してください。

- Deno 2.0以上
- Git（gitモードを使う場合）
- SSH接続可能なリモートサーバー

### Denoのインストール

まだDenoをインストールしていない場合は以下を実行してください。

```bash
# macOS / Linux
curl -fsSL https://deno.land/install.sh | sh

# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex
```

インストール後、新しいターミナルを開いて以下で動作確認します。

```bash
deno --version
```

### uploaderのインストール

ワンライナーでインストール（推奨）します。

```bash
curl -fsSL https://raw.githubusercontent.com/ba0918/uploader/main/install.sh | sh
```

動作確認をします。

```bash
uploader --help
```

---

## 設定ファイルの作成

### ステップ1: 設定ファイルを生成

プロジェクトのルートディレクトリで以下を実行します。

```bash
uploader init
```

これで `uploader.yaml` が生成されます（コメント付きのテンプレート）。

> **手動で作成する場合**
>
> リポジトリから直接ダウンロード:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/ba0918/uploader/main/uploader.example.yaml -o uploader.yaml
> ```
>
> またはローカルファイルをコピー:
>
> ```bash
> cp uploader.example.yaml uploader.yaml
> ```

### ステップ2: 設定を編集

`uploader.yaml` をテキストエディタで開き、`development`
プロファイルを編集します。

```yaml
development:
  from:
    type: "git"
    base: "origin/main" # 比較元ブランチ
    target: "HEAD" # 比較先（現在のブランチ）

  to:
    targets:
      - host: "your-server.example.com" # ← あなたのサーバーに変更
        protocol: "sftp"
        port: 22
        user: "your-username" # ← あなたのユーザー名に変更
        auth_type: "ssh_key"
        key_file: "~/.ssh/id_rsa" # ← あなたの秘密鍵パスに変更
        dest: "/var/www/html/" # ← アップロード先パスに変更
        sync_mode: "update"
        timeout: 30
        retry: 3
```

**設定のポイント**

- `host`: SSHで接続できるサーバーのホスト名またはIPアドレス
- `user`: SSH接続時のユーザー名
- `key_file`: SSH秘密鍵のパス（`~` は自動展開されます）
- `dest`: リモートの配置先ディレクトリ（末尾の `/` に注意）

### ステップ3: SSH接続の確認

uploaderを実行する前に、SSHで接続できることを確認します。

```bash
ssh your-username@your-server.example.com
```

接続できたら成功です。`exit` でログアウトしてください。

---

## 最初のアップロード

### ステップ1: Dry-run で確認（重要）

実際にアップロードする前に、何がアップロードされるか確認します。

```bash
uploader development --dry-run
```

**出力例**

```
🔍 Analyzing changes...
📊 Summary: 3 files changed
  + src/index.ts (added)
  M src/app.ts (modified)
  - old/deprecated.ts (deleted)

🚫 DRY RUN MODE - No files uploaded
```

**確認ポイント**

- [ ] 意図したファイルが含まれているか？
- [ ] 不要なファイル（`.log`, `node_modules/`など）が除外されているか？
- [ ] 削除ファイルは意図通りか？

### ステップ2: ブラウザで差分確認（オプション）

より視覚的に確認したい場合は、ブラウザで差分を確認できます。

```bash
uploader development --diff
```

ブラウザが自動的に開き、ファイル一覧と差分が表示されます。

- ディレクトリツリーでファイルをクリックすると差分が表示されます
- 追加ファイルは緑、変更ファイルは黄色で表示されます
- 確認後、ブラウザで「Upload」ボタンをクリックするとアップロードが実行されます

### ステップ3: 実際にアップロード

確認が完了したら、アップロードを実行します。

```bash
uploader development
```

**出力例**

```
📤 Uploading to your-server.example.com...
✓ src/index.ts [========================================] 100%
✓ src/app.ts [========================================] 100%
✅ Upload completed! (3 files, 2.1s)
```

おめでとうございます！最初のアップロードが完了しました。

---

## 次のステップ

### さらに学ぶ

uploaderの全機能を活用するために、以下のドキュメントを参照してください。

- **[README.md](../README.md)** - 全機能の概要とCLIオプション
- **[uploader.example.yaml](../uploader.example.yaml)** - 全ての設定項目の詳細

### よくある次の質問

**Q: 特定のファイルを除外したい**

`uploader.yaml` の `ignore` 設定を使用します。

```yaml
_global:
  ignore_groups:
    common:
      - ".git/"
      - "node_modules/"
      - "*.log"
  default_ignore:
    - common
```

詳細は [uploader.example.yaml の ignore 設定](../uploader.example.yaml#L29)
を参照してください。

**Q: 複数のサーバーにアップロードしたい**

`targets` に複数のサーバーを追加します。

```yaml
to:
  targets:
    - host: "web1.example.com"
      dest: "/var/www/html/"
    - host: "web2.example.com"
      dest: "/var/www/html/"
```

詳細は
[uploader.example.yaml の production プロファイル](../uploader.example.yaml#L164)
を参照してください。

**Q: mirrorモード（完全同期）を使いたい**

**注意**: mirrorモードは、ローカルに存在しないファイルをリモートから削除します。

```yaml
targets:
  - sync_mode: "mirror" # update → mirror に変更
```

必ず `--dry-run` で確認してから実行してください。

```bash
uploader development --dry-run
```

**Q: ローカルファイルを直接アップロードしたい（gitモード以外）**

`from.type` を `file` に変更します。

```yaml
from:
  type: "file"
  src:
    - "dist/"
    - "public/assets/"
```

詳細は
[uploader.example.yaml の staging プロファイル](../uploader.example.yaml#L99)
を参照してください。

---

## トラブルシューティング

動かない場合のチェックリストです。

### SSH接続の確認

```bash
ssh user@your-server.example.com
```

SSH接続ができることを確認してください。

### 秘密鍵のパス確認

```bash
ls -la ~/.ssh/id_rsa
```

鍵ファイルが存在し、権限が `600` または `400` であることを確認してください。

```bash
# 権限が間違っている場合は修正
chmod 600 ~/.ssh/id_rsa
```

### verbose モードで詳細確認

```bash
uploader development --verbose --dry-run
```

詳細なログが表示されます。エラーメッセージがあれば、それを基に対処してください。

### よくあるエラー

**エラー: `Config file not found`**

- 設定ファイルが存在することを確認してください
- カレントディレクトリに `uploader.yaml` があるか確認してください

```bash
ls -la uploader.yaml
```

**エラー: `Permission denied (publickey)`**

- SSH鍵のパスが正しいか確認してください
- SSH鍵の権限が `600` または `400` であることを確認してください
- `ssh-add` で鍵を追加してみてください

```bash
ssh-add ~/.ssh/id_rsa
```

**エラー: `Profile not found`**

- プロファイル名が正しいか確認してください
- `uploader --list` で利用可能なプロファイルを確認してください

---

## まとめ

このガイドで学んだこと

- Denoとuploaderのインストール
- 設定ファイルの作成と編集
- Dry-runでの安全確認
- 最初のアップロード実行
- 基本的なトラブルシューティング

**所要時間**: 約10分

次は [README.md](../README.md) で、より高度な機能やオプションを学びましょう！

---

**ヘルプが必要ですか？**

- [README.md - FAQ](../README.md#exit-codes)
- [uploader.example.yaml](../uploader.example.yaml) - 全設定項目の詳細
- [GitHub Issues](https://github.com/ba0918/uploader/issues) -
  バグ報告や機能要望
