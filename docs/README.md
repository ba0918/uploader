# uploader Documentation

uploaderの各種ドキュメント一覧です。

---

## 📚 ユーザー向けドキュメント

初めての方、または日常的に使う方向けのドキュメントです。

### 必読ドキュメント

| ドキュメント                                      | 説明                             | 所要時間 |
| ------------------------------------------------- | -------------------------------- | -------- |
| [README.md](../README.md)                         | プロジェクト概要とQuick Start    | 5分      |
| [uploader.example.yaml](../uploader.example.yaml) | 設定ファイルの詳細な例とコメント | -        |

### 推奨リソース

| ドキュメント                          | 説明                               | 所要時間 |
| ------------------------------------- | ---------------------------------- | -------- |
| [Getting Started](getting-started.md) | 初めての方向けのチュートリアル     | 10分     |
| [Configuration](configuration.md)     | 設定ファイルの全項目リファレンス   | 10分     |
| [Troubleshooting](troubleshooting.md) | よくある問題と解決方法             | -        |
| [Use Cases](use-cases.md)             | 実践的な使用例とベストプラクティス | 15分     |

---

## 🔧 開発者向けドキュメント

uploaderの開発に参加する方、または内部実装を理解したい方向けです。

### アーキテクチャ

| ドキュメント                                                                       | 説明                                         |
| ---------------------------------------------------------------------------------- | -------------------------------------------- |
| [CLAUDE.md](../CLAUDE.md)                                                          | プロジェクト概要、アーキテクチャ、開発ガイド |
| [SPEC.md](../SPEC.md)                                                              | 詳細仕様                                     |
| [implementation/mirror-mode-protocols.md](implementation/mirror-mode-protocols.md) | mirrorモードのプロトコル別実装解説           |

---

## 📖 ドキュメントの読み方

### 初めての方

1. [README.md](../README.md) を読む（5分）
2. [Getting Started](getting-started.md) で基本的な使い方を学ぶ（10分）
3. [uploader.example.yaml](../uploader.example.yaml) を見て設定ファイルを作成
4. 実際に動かしてみる
5. 分からないことがあれば [Troubleshooting](troubleshooting.md) を参照

### 設定を詳しく知りたい方

1. [Configuration](configuration.md) で全設定項目を確認
2. [uploader.example.yaml](../uploader.example.yaml) でコメント付き実例を参照
3. [Use Cases](use-cases.md) で実践例を確認

### 開発に参加したい方

1. [CLAUDE.md](../CLAUDE.md) でプロジェクト概要を把握
2. [SPEC.md](../SPEC.md) で詳細仕様を理解
3. [implementation/](implementation/) で実装の詳細を学ぶ

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

ドキュメントの改善提案は大歓迎です。

- タイポや間違いを見つけた → [Issue](https://github.com/ba0918/uploader/issues)
- 新しいユースケースを追加したい → Pull Request
- 分かりにくい部分がある →
  [Discussion](https://github.com/ba0918/uploader/discussions)

---

**最終更新**: 2026-01-12 **バージョン**: v1.1.7
