# UX-1: ヘルプメッセージ改善 実施レポート

実施日: 2026-01-12

## 変更内容

### before

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

### after

```
uploader - Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイ

USAGE
  uploader [options] <profile>

QUICK START
  1. 設定ファイルを作成:
     cp uploader.example.yaml uploader.yaml

  2. uploader.yaml を編集して、あなたの環境に合わせて設定

  3. 実行してみる（dry-runで安全確認）:
     uploader <profile> --dry-run

  4. 実際にアップロード:
     uploader <profile>

  詳細: docs/getting-started.md (近日公開予定)
  設定: uploader.example.yaml（コメント付きサンプル）

OPTIONS
  -c, --config <path>      設定ファイルのパス
  -d, --diff               アップロード前にdiff viewerで確認（リモートとの差分を表示）
  -n, --dry-run            dry-run（実際のアップロードは行わない）
                           ⚠ 最初は必ず --dry-run で確認してください
      --delete             リモートの余分なファイルを削除（mirror同期）
                           ⚠ 危険: リモートファイルが削除されます
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

EXAMPLES
  uploader --list                                      プロファイル一覧を表示
  uploader development --dry-run                       dry-runで安全確認
  uploader development                                 基本的な使い方
  uploader --diff staging                              diff確認してからアップロード
  uploader --base=main --target=feature/xxx development  ブランチを指定

CONFIGURATION
  設定ファイル: uploader.yaml
  サンプル: uploader.example.yaml
  詳細: README.md (Configuration セクション)

MORE INFO
  GitHub: https://github.com/yourusername/uploader
  Docs: README.md
```

## 主な改善点

### 1. QUICK STARTセクション追加

- **設定ファイル作成の手順を明記**: `cp uploader.example.yaml uploader.yaml`
  というコマンドを明示
- **4ステップの明確な手順**: 初心者が迷わず最初の一歩を踏み出せる
- **uploader.example.yamlの存在を明示**: サンプルファイルがあることに気づける

### 2. 構成の改善

- **セクション見出しを大文字に統一**: USAGE、QUICK
  START、OPTIONS、EXAMPLES、CONFIGURATION、MORE INFO
- **論理的な順序**: 使い方 → Quick Start → オプション詳細 → 例 → 設定 → 追加情報
- **読みやすさ向上**: セクション分けで情報が整理され、目的の情報を見つけやすい

### 3. 重要オプションへの警告追加

- **--dry-run**: "⚠ 最初は必ず --dry-run で確認してください" を追加
- **--delete**: "⚠ 危険: リモートファイルが削除されます" を追加
- **安全性の向上**: 初心者がいきなり本番環境で破壊的操作を実行するリスクを低減

### 4. EXAMPLESの順序改善

- **--listを最初に**: プロファイル一覧の確認から始めることを推奨
- **--dry-runの例を追加**: 安全確認の重要性を強調
- **実用的な順序**: 確認 → 試行 → 実行という流れを意識

### 5. CONFIGURATIONとMORE INFOセクション追加

- **設定ファイル関連情報を集約**: どこを見れば詳細が分かるか明示
- **ドキュメントへの誘導**: README.mdやdocs/へのリンクで更なる学習を促進

## 新規ユーザーへの効果

### Before（旧ヘルプメッセージの問題点）

1. **設定ファイルの作り方が分からない**:
   "設定ファイルのパス"とあるだけで、どう作るか不明
2. **次に何をすべきか不明**: オプションの羅列だけで、最初の一歩が見えない
3. **uploader.example.yamlの存在に気づけない**:
   サンプルファイルがあることが伝わらない
4. **危険な操作への警告がない**:
   --deleteや--dry-runなしの実行がどれほど危険か分からない

### After（改善後の効果）

1. **設定ファイル作成方法が一目瞭然**: コピーコマンドが明示され、迷わない
2. **最初の一歩が明確**: QUICK STARTの4ステップで、何をすれば動くか分かる
3. **uploader.example.yamlの存在に気づける**: "設定:
   uploader.example.yaml（コメント付きサンプル）"で認識
4. **安全意識が向上**:
   --dry-runの推奨と--deleteの危険性が明示され、慎重に操作できる

### 想定される時間短縮効果

- **Before**: 約13分（UXレビューの田中さんの例）
  - 設定ファイルの場所を探す: 3分
  - uploader.example.yamlに気づく: 2分
  - 設定を理解する: 5分
  - 実行を試みる: 3分

- **After**: 約7分（推定）
  - QUICK STARTを読む: 1分
  - 設定ファイルをコピー: 1分
  - 設定を理解する: 3分
  - dry-runで試す: 2分

**改善効果: 約6分（46%）の時間短縮**

## 次のステップ

### UX-2（Getting Started作成）との連携

- QUICK STARTで "詳細: docs/getting-started.md (近日公開予定)" と記載
- UX-2でgetting-started.mdを作成すれば、さらに詳細なチュートリアルへ誘導可能
- ヘルプメッセージ → Getting Started → README詳細 という学習パスの完成

### UX-9（uploader.example.yamlへのコピーコマンド追記）との連携

- ヘルプとサンプルファイルの両方にコピーコマンドが書かれることで、より気づきやすい
- 相乗効果で初期設定の障壁がさらに下がる

## 変更ファイル

- `/home/mizumi/develop/inv/src/cli/args.ts` - HELP_TEXT定数を更新（46行 →
  68行）

## テスト

```bash
deno run --allow-read --allow-write --allow-net --allow-run /home/mizumi/develop/inv/main.ts --help
```

動作確認済み: ヘルプメッセージが正しく表示されることを確認

## 結論

**UX-1は完了し、新規ユーザーの初期体験が大幅に改善された。**

- ヘルプメッセージが初心者フレンドリーに
- 最初の一歩が明確になり、設定ファイル作成の障壁を低減
- 安全性への意識向上により、誤操作リスクを軽減
- 他のUXタスク（UX-2、UX-9）との連携により、さらなる改善が期待できる

**所要時間: 約0.1日（推定通り）**
