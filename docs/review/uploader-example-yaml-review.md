# uploader.example.yaml レビューレポート

## 1. 構文の評価

### 現在の構文

`uploader.example.yaml` は**旧構文**を使用しているのだ:

```yaml
_global:
  ignore: # 除外パターン(glob形式)
    - "*.log"
    - ".git/"
    - ".claude/"
    - "node_modules/"
```

### 最新の構文

`uploader.test.yaml` で使用されている**新構文**なのだ:

```yaml
_global:
  ignore_groups:
    common:
      - "**/.*"
      - "**/.ignore_dir"
      - "**/.ignore_dir2"
  default_ignore:
    - common
```

型定義(`src/types/config.ts`)で確認した現在の仕様なのだ:

```typescript
export interface GlobalConfig {
  /** 名前付きignoreグループ */
  ignore_groups?: Record<string, string[]>;
  /** ignore未指定時に適用するデフォルトグループ名 */
  default_ignore?: string[];
}
```

### 判定

- [ ] 最新構文を使用している
- [x] **旧構文を使用している（更新が必要）**
- [ ] 構文が混在している

### 推奨アクション

**🔴 緊急度: 高**

`uploader.example.yaml` の `_global.ignore`
は現在の実装では**動作しない**のだ。以下の理由によるのだ:

1. `TODO_ARCHIVE.md` に「後方互換性機能は削除されました」と明記されているのだ
2. `GlobalConfig` 型定義に `ignore` プロパティが存在しないのだ
3. バリデーション処理(`src/config/validator.ts`)でも `ignore`
   配列は処理されないのだ

**必須対応**:

- `_global.ignore` → `_global.ignore_groups` + `default_ignore` に変更

**推奨される構文**:

```yaml
_global:
  ignore_groups:
    common:
      - "*.log"
      - ".git/"
      - ".claude/"
      - "node_modules/"
  default_ignore:
    - common
```

---

## 2. 各プロファイルの評価

### development プロファイル

**ユースケース**: ⭐⭐⭐⭐⭐

- gitモードの典型的な使用例を示しているのだ
- `origin/main`との差分をSFTPでデプロイする実用的なシナリオなのだ

**設定の完全性**: ⭐⭐⭐⭐☆

- 必要な設定項目はすべて揃っているのだ
- 環境変数の使用例(`${DEPLOY_USER}`)も示されているのだ
- ただし、以下の新機能が紹介されていないのだ:
  - `ignore` 設定（ターゲット固有の除外パターン）
  - `sync_mode: "mirror"` の使用例

**ベストプラクティス**: ⭐⭐⭐⭐☆

- 環境変数の使用を示しているのはgoodなのだ
- SSH鍵認証を推奨しているのもgoodなのだ

**改善提案**:

1. コメントで`sync_mode: "update"`の意味を説明（現在はupdateのみ記載）
2. `include_untracked`の説明をもう少し詳しく

### staging プロファイル

**ユースケース**: ⭐⭐⭐⭐⭐

- fileモードの基本的な使用例を示しているのだ
- ビルド成果物のデプロイという実用的なシナリオなのだ

**設定の完全性**: ⭐⭐⭐☆☆

- 基本設定は揃っているのだ
- しかし、以下の重要な説明が不足しているのだ:
  - `src: ["dist/"]` の末尾 `/` の意味（ディレクトリ中身のみ）
  - globパターンの使用例が不足

**ベストプラクティス**: ⭐⭐⭐⭐☆

- SSH鍵を使用しているのはgoodなのだ

**改善提案**:

1. `dist/` の末尾スラッシュの説明を追加
2. globパターンの使用例を追加（例: `"src/**/*.js"`）
3. 複数ソースの実用的な例を示す

### production プロファイル

**ユースケース**: ⭐⭐⭐⭐⭐

- **defaults** 機能の優れた使用例なのだ
- 複数ターゲットへの同時デプロイという実用的なシナリオなのだ
- rsyncプロトコルの高度な機能（sudo、chmod、chown）を示しているのだ

**設定の完全性**: ⭐⭐⭐⭐⭐

- defaultsとtargetsの継承関係が明確なのだ
- rsync固有のオプションも網羅されているのだ
- 個別上書きの例(`timeout: 120`)も示されているのだ

**ベストプラクティス**: ⭐⭐⭐⭐⭐

- パーミッション管理を示しているのだ
- sudo実行の例を示しているのだ
- 環境変数の使用を推奨しているのだ

**改善提案**:

1. `sync_mode: "mirror"` の危険性についての警告コメント追加
2. rsync固有の機能についての説明を充実

### legacy プロファイル

**ユースケース**: ⭐⭐⭐⭐☆

- 古いサーバー対応という特殊なケースを示しているのだ
- SCPプロトコルの使用例でもあるのだ

**設定の完全性**: ⭐⭐⭐⭐☆

- `legacy_mode`、パスワード認証の例を示しているのだ
- セキュリティ面での注意喚起（環境変数推奨）があるのだ

**ベストプラクティス**: ⭐⭐⭐⭐⭐

- パスワードを直接書かず環境変数を使うよう推奨しているのだ

**改善提案**:

1. SCPプロトコルの制限事項を説明（mirrorモード対応など）
2. `legacy_mode`が具体的に何を有効化するかの説明

### local プロファイル

**ユースケース**: ⭐⭐⭐⭐⭐

- テスト・検証用の実用的な例なのだ
- localプロトコルの使用例なのだ

**設定の完全性**: ⭐⭐⭐☆☆

- 基本設定は揃っているのだ
- しかし、以下の説明が不足しているのだ:
  - localプロトコルで不要な設定項目（port、user、auth_type等）
  - `sync_mode: "mirror"`の使用例

**ベストプラクティス**: ⭐⭐⭐⭐☆

- テスト用途を明確にしているのだ

**改善提案**:

1. localプロトコルでは認証不要であることを明記
2. mirror modeの例を追加（ローカルコピーでの完全同期）
3. テスト用途であることをコメントで強調

---

## 3. コメントの充実度

### 現状評価

- **セクション説明**: ⭐⭐⭐⭐☆
  - プロファイルごとのセクション区切りは明確なのだ
  - 各プロファイルの用途が見出しに記載されているのだ

- **設定項目説明**: ⭐⭐⭐☆☆
  - 一部の項目にインラインコメントがあるのだ
  - しかし、以下の重要な説明が不足しているのだ:
    - `sync_mode`の違い（update vs mirror）
    - `src`の末尾スラッシュの意味
    - `rsync_path`、`rsync_options`の詳細

- **使用例・注意事項**: ⭐⭐⭐☆☆
  - 環境変数の使用例があるのだ
  - しかし、以下が不足しているのだ:
    - mirrorモードの危険性の警告
    - 各プロトコルの制限事項
    - よくある間違いの注意喚起

- **相互参照**: ⭐⭐☆☆☆
  - 他のセクションへの参照がほとんどないのだ
  - 関連する設定項目への言及が不足しているのだ

### 不足しているコメント

#### 1. ファイル冒頭部分

現在:

```yaml
# uploader 設定ファイルサンプル
# このファイルを uploader.yaml にコピーして使用してください
```

推奨:

```yaml
# uploader 設定ファイルサンプル
#
# このファイルを uploader.yaml にコピーして使用してください
#
# 詳細なドキュメント: https://github.com/yourusername/uploader/blob/main/README.md
#
# 設定の優先順位:
#   CLI引数 > 設定ファイル > デフォルト値
#
# プロファイルの使い方:
#   uploader <profile_name>
#   例: uploader development
```

#### 2. `_global` セクション

現在:

```yaml
_global:
  ignore: # 除外パターン（glob形式）
    - "*.log"
```

推奨:

```yaml
_global:
  # 名前付き除外パターングループ
  # 環境ごとに異なる除外パターンを定義できます
  ignore_groups:
    common:
      - "*.log" # ログファイル
      - ".git/" # Gitディレクトリ
      - ".claude/" # Claudeディレクトリ
      - "node_modules/" # Node.js依存関係

    development:
      - "tests/" # テストファイル
      - "*.test.ts" # テストコード
      - ".env.local" # ローカル環境変数

  # デフォルトで適用するグループ（ignore未指定時）
  default_ignore:
    - common
```

#### 3. 各プロファイルの設定項目

**sync_mode**:

```yaml
sync_mode: "update" # update: 追加・更新のみ / mirror: 完全同期（リモート専用ファイルを削除）
```

**src**:

```yaml
src:
  - "dist/" # 末尾スラッシュ: ディレクトリの中身のみアップロード
  - "public/assets/" # 例: dist/内のファイルが直接destにアップロードされる
  # - "dist"          # スラッシュなし: ディレクトリ自体をアップロード（dest/distになる）
```

**rsync関連**:

```yaml
rsync_path: "sudo rsync" # リモート側でsudo権限でrsyncを実行
rsync_options: # rsync追加オプション（man rsyncで確認）
  - "--chmod=D755,F644" # パーミッション設定（ディレクトリ755、ファイル644）
  - "--chown=www-data:www-data" # 所有者・グループ変更
```

**defaults**:

```yaml
to:
  # 全ターゲット共通の設定
  # 各ターゲットで個別に指定すると上書きされます
  # 配列（rsync_options等）は完全に置き換え（マージではない）
  defaults:
  # ...

  targets:
    # destは各ターゲットで必須（defaultsに含められない）
    - host: "web1.example.com"
      dest: "/var/www/html/"
      # その他の設定はdefaultsから継承される
```

#### 4. セクションごとの使用例

各プロファイルに具体的な実行例を追加するのだ:

```yaml
# ===========================================
# プロファイル: development（gitモード）
# ===========================================
# 使い方: uploader development
# 説明: origin/mainとHEADの差分をSFTPでweb1.example.comにアップロード
development:
# ...
```

---

## 4. 他のドキュメントとの整合性

### uploader.test.yaml との比較

**構文の違い**:

- `uploader.example.yaml`: `_global.ignore` (旧構文)
- `uploader.test.yaml`: `_global.ignore_groups` + `default_ignore` (新構文)

**判定**: **更新漏れ**

- これは意図的な違いではなく、example.yamlの更新が追いついていないのだ
- test.yamlは最新の実装に基づいているのだ

### CLAUDE.md との整合性

CLAUDE.mdの記述:

```markdown
- `_global.ignore`: グローバル除外パターン
```

**矛盾点**:

- CLAUDE.mdも旧構文を記載しているのだ
- 最新の仕様(`ignore_groups` + `default_ignore`)に更新が必要なのだ

### README.md との整合性

README.mdには新旧両方の記述があるのだ:

**旧構文の記述**（後方互換として記載）:

```yaml
_global:
  # 基本的なignore設定（後方互換）
  ignore:
    - "*.log"
```

**新構文の記述**（推奨として記載）:

```yaml
_global:
  # 名前付きignoreグループを定義
  ignore_groups:
    common:
      - ".git/"
```

**問題点**:

- README.mdは「後方互換」と記載しているが、実装は削除済みなのだ
- ユーザーが誤解する可能性があるのだ

### SPEC.md との整合性

SPEC.mdにも同様の記述があるのだ:

```yaml
# 後方互換: 旧来のignore（非推奨）
# ignore:
#   - "*.log"
```

コメントアウトされているが、「非推奨」ではなく「動作しない」と明記すべきなのだ。

### 型定義との整合性

**使用可能な設定項目**（`src/types/config.ts`より）:

`TargetConfig`で定義されているすべての項目:

- ✅ host, protocol, port, user, auth_type, key_file, password
- ✅ dest, sync_mode, preserve_permissions, preserve_timestamps
- ✅ timeout, retry
- ✅ rsync_path, rsync_options
- ✅ legacy_mode
- ✅ ignore（ターゲット固有）

**example.yamlで使われていない機能**:

1. **ターゲット固有の`ignore`設定**:
   ```yaml
   targets:
     - host: "staging.example.com"
       dest: "/var/www/staging/"
       ignore:
         use:
           - common
         add:
           - "debug.log"
   ```

2. **gitモードの`include_untracked`**:
   - 設定はあるが、説明が不足しているのだ

3. **preserve_permissions / preserve_timestamps**:
   - rsyncプロファイルでのみ使用されているのだ
   - SFTP/SCPでも使えることを示すべきなのだ

---

## 5. 総合評価と改善提案

### 総合評価

- **構文**: ⭐⭐☆☆☆（旧構文使用、動作しない）
- **プロファイル**: ⭐⭐⭐⭐☆（実用的だが最新機能が不足）
- **コメント**: ⭐⭐⭐☆☆（基本的な説明はあるが詳細不足）
- **総合**: ⭐⭐⭐☆☆

**主な問題点**:

1. 🔴 **critical**: `_global.ignore`が動作しない（旧構文）
2. 🟡 ターゲット固有の`ignore`設定の例がない
3. 🟡 mirrorモードの危険性についての警告がない
4. 🟡 各設定項目の詳細な説明が不足
5. 🟡 README.md、CLAUDE.md、SPEC.mdとの整合性問題

### 優先度別の改善提案

#### 🔴 高優先度（必須）

1. **`_global.ignore` → `_global.ignore_groups` + `default_ignore` に変更**
   ```yaml
   _global:
     ignore_groups:
       common:
         - "*.log"
         - ".git/"
         - ".claude/"
         - "node_modules/"
     default_ignore:
       - common
   ```

2. **mirrorモードの危険性について警告を追加**
   ```yaml
   sync_mode: "mirror" # ⚠️ 注意: リモート専用ファイルを削除します！
   ```

3. **CLAUDE.mdの更新**
   - `_global.ignore` → `_global.ignore_groups` + `default_ignore`

4. **README.mdとSPEC.mdの「後方互換」記述を修正**
   - 「後方互換（非推奨）」→「❌ 削除済み: 使用できません」

#### 🟡 中優先度（推奨）

5. **ターゲット固有の`ignore`設定例を追加**
   ```yaml
   staging:
     from:
       type: "file"
       src:
         - "dist/"
     to:
       defaults:
         ignore:
           use:
             - common
       targets:
         - host: "staging1.example.com"
           dest: "/var/www/staging/"
         - host: "staging2.example.com"
           dest: "/var/www/staging/"
           # このターゲットだけ追加で除外
           ignore:
             use:
               - common
             add:
               - "debug/"
   ```

6. **各設定項目の詳細な説明を追加**
   - `sync_mode`の違い（update vs mirror）
   - `src`の末尾スラッシュの意味
   - `rsync_path`、`rsync_options`の詳細
   - `legacy_mode`の具体的な効果

7. **プロトコル別の制限事項を明記**
   - SCPはmirrorモードでディレクトリ削除に制限あり
   - localプロトコルは認証不要

8. **実行例を各プロファイルに追加**
   ```yaml
   # 使い方: uploader development --base origin/develop
   # 説明: origin/developとHEADの差分をデプロイ（--baseで上書き）
   ```

9. **複数の`ignore_groups`を使った高度な例を追加**
   ```yaml
   _global:
     ignore_groups:
       common:
         - "*.log"
         - ".git/"
       development:
         - "tests/"
         - "*.test.ts"
       cache:
         - ".cache/"
         - "tmp/"
     default_ignore:
       - common

   # ...

   staging:
     # commonとcacheを両方除外
     to:
       defaults:
         ignore:
           use:
             - common
             - cache
   ```

#### 🟢 低優先度（オプション）

10. **ファイル冒頭の説明を充実**
    - ドキュメントへのリンク
    - 設定の優先順位
    - プロファイルの使い方

11. **よくある間違いのセクションを追加**
    ```yaml
    # よくある間違い:
    # ❌ dest: "~/public_html"  # チルダは展開されません
    # ✅ dest: "/home/user/public_html"  # 絶対パスを使用
    ```

12. **環境変数のベストプラクティスを追加**
    ```yaml
    # 推奨: .envファイルで環境変数を管理
    # DEPLOY_USER=myuser
    # DEPLOY_PASSWORD=mypassword
    user: "${DEPLOY_USER}"
    password: "${DEPLOY_PASSWORD}"
    ```

13. **glob パターンの使用例を追加**
    ```yaml
    src:
      - "src/**/*.js" # src/以下のすべての.jsファイル
      - "public/assets/**" # public/assets/以下のすべてのファイル
      - "dist/" # dist/の中身のみ
    ```

---

## 6. 次のステップ

### Phase 2で実施すべき内容

1. **必須対応（高優先度）**
   - [ ] `uploader.example.yaml`を最新構文に更新
   - [ ] CLAUDE.mdのignore設定説明を更新
   - [ ] README.mdとSPEC.mdの「後方互換」記述を修正または削除

2. **推奨対応（中優先度）**
   - [ ] ターゲット固有の`ignore`設定例を追加
   - [ ] 各設定項目の詳細なコメントを追加
   - [ ] mirrorモードの警告を追加

3. **オプション対応（低優先度）**
   - [ ] よくある間違いセクションの追加
   - [ ] glob パターンの使用例追加

### 具体的な作業手順

1. `uploader.example.yaml`のバックアップを作成
2. 新構文に基づいた新しい`uploader.example.yaml`を作成
3. すべてのプロファイルにコメントを充実
4. 関連ドキュメント（CLAUDE.md、README.md、SPEC.md）を更新
5. テストして動作確認
6. コミット・プッシュ

### 検証事項

- [ ] 新しい`uploader.example.yaml`が正しくパースされるか
- [ ] ignore設定が期待通りに動作するか
- [ ] すべてのプロファイルが正常に実行できるか
- [ ] ドキュメントの整合性が取れているか

---

## 7. 参考情報

### 関連ファイル

- `/home/mizumi/develop/inv/uploader.example.yaml` - レビュー対象
- `/home/mizumi/develop/inv/uploader.test.yaml` - 最新構文の参考
- `/home/mizumi/develop/inv/src/types/config.ts` - 型定義
- `/home/mizumi/develop/inv/src/config/loader.ts` - 設定読み込み処理
- `/home/mizumi/develop/inv/src/config/validator.ts` - バリデーション処理
- `/home/mizumi/develop/inv/README.md` - ユーザー向けドキュメント
- `/home/mizumi/develop/inv/SPEC.md` - 仕様書
- `/home/mizumi/develop/inv/CLAUDE.md` - 開発者向けガイド
- `/home/mizumi/develop/inv/TODO_ARCHIVE.md` - 後方互換性削除の記録

### 技術的背景

**ignore設定の進化**:

1. **Phase 0（初期）**: `_global.ignore` 配列形式
   ```yaml
   _global:
     ignore:
       - "*.log"
   ```

2. **Phase C（現在）**: `ignore_groups` + `default_ignore`
   ```yaml
   _global:
     ignore_groups:
       common:
         - "*.log"
     default_ignore:
       - common
   ```

3. **後方互換性の削除**:
   - TODO_ARCHIVE.mdに記録
   - 実装から完全に削除済み

---

## まとめ

`uploader.example.yaml`は実用的なプロファイル例を提供しているものの、**致命的な問題として旧構文を使用しており、現在の実装では動作しない**のだ。

最優先で`_global.ignore`を`_global.ignore_groups` +
`default_ignore`に更新する必要があるのだ。また、関連ドキュメント（CLAUDE.md、README.md、SPEC.md）との整合性も取る必要があるのだ。

中優先度の改善として、ターゲット固有の`ignore`設定や各設定項目の詳細な説明を追加することで、ユーザーがより理解しやすいサンプルファイルになるのだ。
