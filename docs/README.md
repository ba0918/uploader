# uploader Documentation

uploaderの各種ドキュメント一覧なのだ。

---

## 📚 ユーザー向けドキュメント

初めての方、または日常的に使う方向けのドキュメントなのだ。

### 必読ドキュメント

| ドキュメント                                      | 説明                             | 所要時間 |
| ------------------------------------------------- | -------------------------------- | -------- |
| [README.md](../README.md)                         | プロジェクト概要とQuick Start    | 5分      |
| [uploader.example.yaml](../uploader.example.yaml) | 設定ファイルの詳細な例とコメント | -        |

### 推奨リソース

| ドキュメント                          | 説明                             | 所要時間 |
| ------------------------------------- | -------------------------------- | -------- |
| [Configuration](configuration.md)     | 設定ファイルの全項目リファレンス | 10分     |
| [Troubleshooting](troubleshooting.md) | よくある問題と解決方法           | -        |

今後追加予定のドキュメント:

- **Getting Started** - 初めての方向け。インストールから最初のアップロードまで
- **Use Cases** - 実践的な使用例とベストプラクティス

現時点では [README.md](../README.md) と
[uploader.example.yaml](../uploader.example.yaml) も参照してほしいのだ。

---

## 🔧 開発者向けドキュメント

uploaderの開発に参加する方、または内部実装を理解したい方向けなのだ。

### アーキテクチャ

| ドキュメント                                                                       | 説明                                         |
| ---------------------------------------------------------------------------------- | -------------------------------------------- |
| [CLAUDE.md](../CLAUDE.md)                                                          | プロジェクト概要、アーキテクチャ、開発ガイド |
| [SPEC.md](../SPEC.md)                                                              | 詳細仕様                                     |
| [implementation/mirror-mode-protocols.md](implementation/mirror-mode-protocols.md) | mirrorモードのプロトコル別実装解説           |

### レビュー・分析

| ドキュメント                                                                                             | 説明                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| [UX_REVIEW_REPORT.md](UX_REVIEW_REPORT.md)                                                               | 新規ユーザー視点のUXレビュー          |
| [review/uploader-example-yaml-review.md](review/uploader-example-yaml-review.md)                         | uploader.example.yamlレビュー         |
| [review/uploader-example-yaml-improvement-report.md](review/uploader-example-yaml-improvement-report.md) | uploader.example.yaml改善実施レポート |
| [Task4-Phase1-Analysis-Report.md](Task4-Phase1-Analysis-Report.md)                                       | rsync vs manual diff 動作差異分析     |

---

## 📖 ドキュメントの読み方

### 初めての方

1. [README.md](../README.md) を読む（5分）
2. [uploader.example.yaml](../uploader.example.yaml) を見て設定ファイルを作成
3. 実際に動かしてみる
4. 分からないことがあれば [README.md](../README.md) の該当セクションに戻る

### 設定を詳しく知りたい方

1. [Configuration](configuration.md) で全設定項目を確認
2. [uploader.example.yaml](../uploader.example.yaml) でコメント付き実例を参照

### 開発に参加したい方

1. [CLAUDE.md](../CLAUDE.md) でプロジェクト概要を把握
2. [SPEC.md](../SPEC.md) で詳細仕様を理解
3. [implementation/](implementation/) で実装の詳細を学ぶ
4. [UX_REVIEW_REPORT.md](UX_REVIEW_REPORT.md) でUX改善の視点を知る

---

## 🆘 困ったときは

| 問題                   | 参照先                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| エラーメッセージが出た | [Troubleshooting](troubleshooting.md)                                 |
| 動かない               | [README.md - Requirements](../README.md#requirements)                 |
| 設定方法が分からない   | [Configuration](configuration.md)                                     |
| プロトコルの選び方     | [Configuration - プロトコル別設定](configuration.md#プロトコル別設定) |
| Windowsで動かない      | [README.md - Windowsの注意事項](../README.md#windows)                 |
| 認証エラー             | [Troubleshooting - 認証エラー](troubleshooting.md#認証エラー)         |
| バグを見つけた         | [GitHub Issues](https://github.com/ba0918/uploader/issues)            |

---

## 📝 ドキュメントへの貢献

ドキュメントの改善提案は大歓迎なのだ！

- タイポや間違いを見つけた → [Issue](https://github.com/ba0918/uploader/issues)
- 新しいユースケースを追加したい → Pull Request
- 分かりにくい部分がある →
  [Discussion](https://github.com/ba0918/uploader/discussions)

---

**最終更新**: 2026-01-12 **バージョン**: v1.1.7
