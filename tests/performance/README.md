# パフォーマンステスト

`getManualDiffForTarget()` 関数のパフォーマンスを計測するテストスイート。

## テストケース

### 1. 小規模: 100ファイル × 1KB
- **ファイル数**: 100 files
- **ファイルサイズ**: 1 KB (1,024 bytes)
- **総サイズ**: 約 0.1 MB
- **想定用途**: 小規模なコミット

### 2. 中規模: 1,000ファイル × 10KB
- **ファイル数**: 1,000 files
- **ファイルサイズ**: 10 KB (10,240 bytes)
- **総サイズ**: 約 10 MB
- **想定用途**: 中規模なリファクタリング

### 3. 大規模: 8,000ファイル × 10KB
- **ファイル数**: 8,000 files
- **ファイルサイズ**: 10 KB (10,240 bytes)
- **総サイズ**: 約 78 MB
- **想定用途**: 大規模なコードベース

### 4. 大容量: 10ファイル × 100MB
- **ファイル数**: 10 files
- **ファイルサイズ**: 100 MB (104,857,600 bytes)
- **総サイズ**: 約 1,000 MB (1 GB)
- **想定用途**: 大きなバイナリファイル（ビルド成果物など）

## 計測項目

各テストケースで以下の項目を計測します：

1. **実行時間**: `performance.now()` を使用して `getManualDiffForTarget()` の実行時間を計測
2. **メモリ使用量**: `Deno.memoryUsage()` を使用してテスト前後のヒープメモリ使用量の差分を計測
3. **スループット**: `files/sec` 単位でファイル処理速度を計算

## 実行方法

### 全テストケースを実行
```bash
deno test --allow-read --allow-write --allow-net --allow-env tests/performance/manual-diff_test.ts
```

### 環境変数でテストをスキップ

#### すべてのパフォーマンステストをスキップ
```bash
SKIP_PERFORMANCE_TESTS=true deno test --allow-read --allow-write --allow-net --allow-env tests/performance/manual-diff_test.ts
```

#### 大規模テストのみをスキップ（小規模・中規模は実行）
```bash
SKIP_LARGE_TESTS=true deno test --allow-read --allow-write --allow-net --allow-env tests/performance/manual-diff_test.ts
```

## 結果の見方

テスト実行時に以下の形式で結果が表示されます：

```
============================================================
テストケース: 小規模
============================================================
ファイル数:      100 files
ファイルサイズ:  1,024 bytes
総サイズ:        0.10 MB
実行時間:        4.77 ms
メモリ使用量:    0.66 MB
スループット:    20,952.88 files/sec

差分結果:
  追加:          100
  変更:          0
  削除:          0
============================================================
```

## 実装の詳細

- **MockUploader**: `tests/diff-viewer/remote-diff_test.ts` と同様のモックアップローダーを使用
- **一時ファイル**: `Deno.makeTempFile()` で一時ファイルを生成し、テスト後にクリーンアップ
- **ファイル内容**:
  - 小規模ファイル (≤ 65536 bytes): `crypto.getRandomValues()` でランダムバイトを生成
  - 大規模ファイル (> 65536 bytes): 固定パターンを繰り返して埋める（`crypto.getRandomValues()` の制限を回避）
- **並列実行**: `concurrency` パラメータで並列実行数を制御（デフォルト: 10、大容量: 5）

## 注意事項

- テストには `--allow-read --allow-write --allow-env` 権限が必要です
- 大容量テストは時間がかかるため、必要に応じて `SKIP_LARGE_TESTS=true` で無効化できます
- メモリ使用量は GC のタイミングにより負の値になることがあります（メモリが解放された場合）
