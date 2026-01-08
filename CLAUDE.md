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
deno test

# Run single test
deno test path/to/test.ts
```

## Architecture

詳細はSPEC.mdを参照。主要な機能:

- **gitモード**: ブランチ間の差分ファイルを抽出してアップロード
- **fileモード**: 指定したローカルファイル/ディレクトリをアップロード
- **diff viewer**: ブラウザベースの差分確認UI（WebSocket接続）
- **CUI**: モダンなターミナルUI（プログレスバー、ツリー表示、カラー出力）

### Key Configuration

設定ファイル: `uploader.yaml` (YAML形式)

- `_global.ignore`: グローバル除外パターン
- `<profile>.from`: ソース設定 (git/file)
- `<profile>.to.targets`: アップロード先サーバ設定

### CLI Priority

`CLI引数 > 設定ファイル > デフォルト値`
