# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

**uploader** -
Git差分またはローカルファイルをSFTP/SCPでリモートサーバにデプロイするCLIツール

## Tech Stack

- **Runtime**: Deno
- **Language**: TypeScript

## Commands

```sh
# Run (development)
deno run --allow-read --allow-write --allow-net --allow-run main.ts <profile>

# Install globally
deno install --allow-read --allow-write --allow-net --allow-run -n uploader ./main.ts

# Format
deno fmt

# Lint
deno lint

# Type check
deno check main.ts

# Test
deno task test

# Run single test
deno test --allow-read --allow-write --allow-net --allow-env --allow-run path/to/test.ts
```

## Architecture

詳細はSPEC.mdを参照。主要な機能:

- **gitモード**: ブランチ間の差分ファイルを抽出してアップロード
- **fileモード**: 指定したローカルファイル/ディレクトリをアップロード
- **mirrorモード**: リモート専用ファイルを削除して完全同期（fileモード + sync_mode: mirror）
- **diff viewer**: ブラウザベースの差分確認UI（WebSocket接続）
- **CUI**: モダンなターミナルUI（プログレスバー、ツリー表示、カラー出力）

### Key Modules (Phase C1-C6実装)

**統一処理モジュール**:
- `upload/filter.ts`: ignoreパターンフィルタリングの統一処理
- `upload/mirror.ts`: mirrorモード用の削除対象検出処理
- `upload/converters.ts`: DiffFile → UploadFile 変換（ignoreフィルタ適用）

**処理フロー**:
```
1. uploadFiles配列取得（git diff or file mode）
2. ignoreフィルタリング適用（filter.ts）
3. mirrorモード時: prepareMirrorSync()でリモート専用ファイルを削除対象に追加（mirror.ts）
4. CUI/GUIで差分表示（uploadFilesベース）
5. アップロード実行（全プロトコル共通）
```

**設計原則**:
- uploadFiles配列ベースの統一処理（getDiff不使用アプローチ）
- CUI/GUI完全一致、全プロトコル完全一致
- ignoreフィルタリングを一箇所に集約

### Key Configuration

設定ファイル: `uploader.yaml` (YAML形式)

- `_global.ignore`: グローバル除外パターン
- `<profile>.from`: ソース設定 (git/file)
- `<profile>.to.targets`: アップロード先サーバ設定
- `<target>.sync_mode`: 同期モード (update/mirror)
- `<target>.ignore`: ターゲット固有の除外パターン

### CLI Priority

`CLI引数 > 設定ファイル > デフォルト値`
