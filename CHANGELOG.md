# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **fileモード + mirrorモード時のリモート専用ファイル削除対応** (Phase C1-C5)
  - uploadFiles配列ベースの統一処理により、全プロトコル・全インターフェースで一貫した差分表示・削除対応を実現
  - `upload/filter.ts`: ignoreパターンフィルタリングの統一処理を追加
  - `upload/mirror.ts`: mirrorモード用の`prepareMirrorSync()`関数を追加
  - リモートにのみ存在するファイル（削除対象）をdiff-viewerに表示可能に

- **全プロトコルでの差分表示対応**
  - sftp/scp/local プロトコルでもCUI差分表示が可能に（Phase C5）
  - rsync以外のプロトコルでもdiff-viewerが正常に動作

- **エッジケーステスト追加** (Phase C6)
  - ignoreパターンで全ファイル除外
  - ローカルにファイルがない（mirrorで全削除）
  - ローカルにファイルがなく、ignoreパターン適用

### Changed

- **処理フローの統一** (Phase C1-C5)
  - ignoreフィルタリングを一箇所に集約（`applyIgnoreFilter()`）
  - mirrorモード処理を統一（`prepareMirrorSync()`）
  - CUI/GUI完全一致、全プロトコル完全一致を実現

- **diff-viewerの簡素化** (Phase C4-C5)
  - GUI側（ws-target-checker.ts）: 独自のmirror+ignore処理を削除（約30行簡素化）
  - CUI側（browser.ts）: uploadFilesベースの差分表示に対応（約45行追加）

### Fixed

- **gitモードでのignoreパターン適用** (Phase C1)
  - `diffFilesToUploadFiles()`にignorePatterns引数を追加
  - gitモードでもignoreパターンが正しく適用されるように修正

- **mirrorモード時の削除対象ファイル検出** (Phase C2-C3)
  - fileモード + mirrorモード時、リモート専用ファイルが削除対象として正しく検出されるように修正
  - main.tsで`prepareMirrorSync()`を呼び出し、uploadFilesに削除対象を追加

### Technical Details

- **テストカバレッジ向上**: 238 passed → 241 passed
  - `filter_test.ts`: 10テスト（ignoreフィルタリング）
  - `mirror_test.ts`: 12テスト（mirrorモード処理、エッジケース3つ追加）
  - `converters_test.ts`: gitモード + ignoreパターン

- **コード品質**: lintエラー0件、フォーマットOK

## Design Principles

### 要件

1. ✅ CUI/GUIでDiff/Uploadの内容がぶれないこと
2. ✅ プロトコル(rsync/scp/sftp/local)でDiff/Uploadがぶれないこと
3. ✅ syncモード(update/mirror)で問題が起きないこと
4. ✅ それぞれの組み合わせで問題が起きないこと
5. ✅ パフォーマンスはある程度までは許容するが、致命的に遅くないこと

### 採用したアプローチ

**提案C: getDiff不使用アプローチ**

- rsync `getDiff()` に依存せず、uploadFiles配列だけで完結
- CUI/GUIで完全に同じロジック
- 全プロトコルで完全に同じロジック
- ignoreフィルタリングを一箇所に集約
- mirrorモードは `listRemoteFiles()` でリモート一覧取得

### 処理フロー

```
1. uploadFiles配列取得（git diff or file mode）
2. ignoreフィルタリング適用（統一処理）
3. mirrorモード時:
   - listRemoteFiles() でリモート一覧取得
   - ignoreフィルタリング適用
   - ローカルにないファイルを削除対象に追加
4. 結果を使用:
   - diff表示: uploadFilesをそのまま表示
   - upload: uploadFilesをそのまま実行
```

## Migration Notes

### Breaking Changes

なし。後方互換性を維持。

### Deprecations

なし。

## Future Work

- Docker環境での実機統合テスト（CUI/GUI × 各プロトコル × update/mirror × ignore）
- パフォーマンステスト（100/1,000/10,000ファイル）
