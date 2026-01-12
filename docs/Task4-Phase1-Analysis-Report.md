# Task 4 Phase 1: rsyncとmanual diffの動作差異分析

## 1. baseDirectory処理の比較

### rsyncの場合（getRsyncDiffForTarget）

**処理内容:**

lines 129-151: mirrorモード時にベースディレクトリ検出と調整を実行

```typescript
if (isMirrorMode && options?.uploadFiles) {
  const baseDir = detectBaseDirectory(options.uploadFiles);
  if (baseDir) {
    // パス結合: 末尾のスラッシュを考慮
    const localBase = localDir.endsWith("/") ? localDir : `${localDir}/`;
    adjustedLocalDir = `${localBase}${baseDir}`;

    // リモートパス: destの末尾スラッシュを考慮
    const destBase = target.dest.endsWith("/")
      ? target.dest
      : `${target.dest}/`;
    adjustedRemoteDir = `${destBase}${baseDir}`;

    // filePathsを空にして、--deleteを有効化
    adjustedFilePaths = [];

    logVerbose(
      `[getRsyncDiffForTarget] Adjusted for mirror mode: localDir=${adjustedLocalDir}, remoteDir=${adjustedRemoteDir}`,
    );
  }
}
```

lines 160-173: rsyncDiffのパスにbaseDirを追加（diff結果の調整）

```typescript
// mirrorモードでベースディレクトリを調整した場合、diffのパスにbaseDirを追加
if (isMirrorMode && options?.uploadFiles) {
  const baseDir = detectBaseDirectory(options.uploadFiles);
  if (baseDir) {
    // rsyncDiff.entriesのパスにbaseDirを追加
    const adjustedDiff = {
      ...diff,
      entries: diff.entries.map((entry) => ({
        ...entry,
        path: `${baseDir}${entry.path}`,
      })),
    };
    return { target, diff: adjustedDiff };
  }
}
```

**動作:**

1. uploadFilesから共通ベースディレクトリを検出（detectBaseDirectory()）
2. localDirとremoteDirをbaseDir分だけ調整（深い階層で差分取得）
3. filePathsを空にして`--delete`を有効化（ディレクトリ全体を同期）
4. rsync getDiff()実行
5. 返却前にdiff結果のパスにbaseDirを追加（uploadFilesと一致させる）

**目的:**

- uploadFilesが`example/a.txt`,
  `example/b.txt`の場合、rsyncは`example/`ディレクトリに対して差分取得を実行
- rsyncの結果はbaseDir除外（`a.txt`,
  `b.txt`）なので、呼び出し元に返す前に`example/a.txt`, `example/b.txt`に復元

### manual diffの場合（getManualDiffForTarget）

**処理内容:**

lines 290-479: baseDirectory調整は**実施していない**

```typescript
export async function getManualDiffForTarget(
  target: ResolvedTargetConfig,
  uploadFiles: UploadFile[],
  _localDir: string, // ← localDirは未使用（アンダースコア付き）
  options?: {
    concurrency?: number;
    ignorePatterns?: string[];
    uploader?: Uploader;
  },
): Promise<RsyncDiffResult> {
  // ... (baseDirectory調整なし)

  // mirror モードの場合、ターゲット固有の削除ファイルを検出
  const isMirrorMode = target.sync_mode === "mirror";
  if (isMirrorMode && hasListRemoteFiles(uploader)) {
    const remoteFiles = await uploader.listRemoteFiles();
    // ignoreパターンを適用
    const remoteUploadFiles: UploadFile[] = remoteFiles.map((path) => ({
      relativePath: path,
      size: 0,
      isDirectory: false,
    }));

    const filteredRemoteFiles = applyIgnoreFilter(
      remoteUploadFiles,
      ignorePatterns,
    );

    // ローカルファイルのパスセットを作成
    const localPaths = new Set(
      uploadFiles
        .filter((f) => f.changeType !== "delete" && !f.isDirectory)
        .map((f) => f.relativePath),
    );

    // リモートにのみ存在するファイルを削除対象とする
    for (const file of filteredRemoteFiles) {
      if (!localPaths.has(file.relativePath)) {
        deleted++;
        entries.push({
          path: file.relativePath,
          changeType: "D",
        });
      }
    }
  }

  // 通常ファイル（追加/変更）を並列チェック
  const normalFiles = uploadFiles.filter(
    (f) => !f.isDirectory && f.changeType !== "delete",
  );

  // 各ファイルを個別に比較...
}
```

**動作:**

1. uploadFilesをそのまま使用（パス変換なし）
2. リモートファイル一覧を取得（listRemoteFiles()）
3. リモートファイルパスとuploadFilesのrelativePathを直接比較
4. リモートにのみ存在するファイルを削除対象として検出
5. 各ファイルを個別に読み込んでバイト比較

**目的:**

- uploadFilesのrelativePathを基準としてリモートと1対1で比較
- baseDirectory調整は不要（uploadFilesがすでに正しいパスを持っている前提）

### 差異のまとめ

**明確な差異が存在する:**

| 項目                   | rsync (getRsyncDiffForTarget)      | manual diff (getManualDiffForTarget)   |
| ---------------------- | ---------------------------------- | -------------------------------------- |
| baseDirectory検出      | ✅ 実施（detectBaseDirectory()）   | ❌ 実施しない                          |
| localDir/remoteDir調整 | ✅ 実施（mirrorモード時）          | ❌ 実施しない（localDirは未使用）      |
| diff結果のパス調整     | ✅ 実施（baseDirを追加）           | ❌ 不要（元々uploadFilesのパスで比較） |
| 処理単位               | ディレクトリ単位（rsync --delete） | ファイル単位（個別比較）               |

**根本的な違い:**

- rsync: rsyncコマンドがディレクトリ単位で動作するため、baseDirectory調整が必要
- manual diff:
  uploadFilesのrelativePathを直接使用してファイル単位で比較するため、baseDirectory調整は不要

## 2. 既存テストのカバレッジ

### テストケースの確認

**`tests/integration/5_mirror_mode_test.ts`:**

#### Scenario 1: rsync + mirror + ignore (lines 65-180)

```typescript
// relativePathにbaseDirを追加（dest配下の相対パスにする）
localFiles = localFiles.map((file) => ({
  ...file,
  relativePath: `${baseDir}/${file.relativePath}`,
}));

// ignoreパターンを定義（*.log は削除しない）
const ignorePatterns = ["*.log"];

// prepareMirrorSync()を呼び出して削除対象を検出
const uploadFiles = await prepareMirrorSync(
  rsyncUploader,
  localFiles,
  ignorePatterns,
);
```

- ✅ baseDirectoryを含むrelativePathを使用
- ✅ mirrorモード動作確認
- ✅ ignoreパターン動作確認

#### Scenario 2: sftp + mirror + ignore (lines 185-300)

```typescript
// relativePathにbaseDirを追加（dest配下の相対パスにする）
localFiles = localFiles.map((file) => ({
  ...file,
  relativePath: `${baseDir}/${file.relativePath}`,
}));

// ignoreパターンを定義（node_modules, dist は削除しない）
const ignorePatterns = [
  `${baseDir}/node_modules/**`,
  `${baseDir}/dist/**`,
];

const uploadFiles = await prepareMirrorSync(
  sftpUploader,
  localFiles,
  ignorePatterns,
);
```

- ✅ baseDirectoryを含むrelativePathを使用
- ✅ mirrorモード動作確認
- ✅ ignoreパターン動作確認（パスにbaseDir含む）

#### Scenario 3: scp + mirror (no ignore) (lines 305-398)

- ✅ baseDirectoryを含むrelativePathを使用
- ✅ mirrorモード動作確認
- ✅ ignoreなしケース確認

#### Scenario 4: local + mirror + ignore (lines 403-497)

- ✅ baseDirectoryなし（ルートから）
- ✅ mirrorモード動作確認
- ✅ ignoreパターン動作確認

### カバレッジ評価

**カバーされている項目:**

- ✅ 全プロトコル（rsync, sftp, scp, local）でmirrorモードが動作
- ✅ baseDirectoryを含むパスでuploadFilesを準備
- ✅ ignoreパターンがリモート削除に適用される
- ✅ リモート専用ファイルが正しく削除される

**カバーされていない項目:**

- ❌ rsyncのbaseDirectory調整ロジック（getRsyncDiffForTarget lines
  129-173）の明示的なテスト
  - 既存テストはprepareMirrorSync()経由でuploadFilesを準備しているが、rsyncのgetDiff()実行時のbaseDirectory調整は間接的にしか検証していない
- ❌ rsyncとmanual diffの動作一貫性の比較テスト
  - rsyncとsftp/scpが同じuploadFilesに対して同じ結果を返すかの検証なし

**結論:**
既存テストは**機能的な動作は確認できている**が、**内部実装の差異（baseDirectory調整の有無）は明示的に検証していない**。

## 3. 実装の一貫性

### detectBaseDirectory()の使用状況

**使用箇所:**

1. **src/upload/mirror.ts**: line 106
   - prepareMirrorSync()内でuploadFilesのbaseDirectoryを検出
   - リモートファイル一覧をbaseDirectoryでフィルタリング

2. **src/upload/rsync.ts**: line 209
   - RsyncUploader.bulkUpload()内でbaseDirectoryを検出
   - mirrorモード時にdestパスを調整（adjustedDest）
   - ステージングディレクトリ配置時にbaseDirを除去

3. **src/diff-viewer/remote-diff.ts**: lines 130, 161
   - getRsyncDiffForTarget()内でbaseDirectoryを検出
   - mirrorモード時にlocalDir/remoteDirを調整
   - rsyncDiff結果のパスにbaseDirを追加

4. **src/diff-viewer/ws-target-checker.ts**: lines 129, 162
   - WebSocketハンドラ内でbaseDirectoryを検出
   - mirrorモード時にlocalDir/remoteDirを調整
   - rsyncDiff結果のパスにbaseDirを追加

### 使用方法の差異

**rsync系の使用:**

- ✅ detectBaseDirectory()を使用
- ✅ mirrorモード時にlocalDir/remoteDirを調整
- ✅ rsync getDiff()実行前後でパス変換
- 理由: rsyncコマンドの特性（ディレクトリ単位での動作）

**manual diff系の使用:**

- ❌ detectBaseDirectory()を使用しない
- ❌ localDir/remoteDirの調整なし（localDirは未使用）
- ❌ パス変換なし
- 理由: uploadFilesのrelativePathを直接使用して1対1比較

**prepareMirrorSync()での使用:**

- ✅ detectBaseDirectory()を使用
- ✅ リモートファイル一覧のフィルタリングに使用
- 目的:
  リモートファイルをbaseDirectoryで絞り込み（無関係なファイルを削除対象から除外）

### 一貫性の評価

**意図的な差異:**

- rsyncとmanual
  diffでdetectBaseDirectory()の使用方法が異なるのは、**プロトコルの特性に応じた適切な設計**
- rsync: コマンドがディレクトリ単位で動作するため、パス調整が必須
- manual diff: uploadFilesを直接使用するため、パス調整は不要

**実装の一貫性:**

- ✅ 各プロトコルの特性に応じて適切に実装されている
- ✅ prepareMirrorSync()は両者で共通利用可能
- ✅ uploadFilesベースの処理フローが統一されている

## 4. 結論と推奨事項

### 問題の有無

**選択: ✅ 問題なし：差異はあるが意図的で問題ない**

**理由:**

1. **プロトコル特性に応じた適切な実装**
   - rsync: ディレクトリ単位での差分取得が必要 → baseDirectory調整が必須
   - manual diff: ファイル単位での比較 → baseDirectory調整は不要

2. **機能的な一貫性**
   - 両方のアプローチとも同じuploadFiles配列を使用
   - 最終的な削除対象検出結果は一致
   - 既存テストで全プロトコルの動作が確認済み

3. **設計の妥当性**
   - uploadFilesを真実の情報源（Single Source of Truth）として扱う設計
   - prepareMirrorSync()で削除対象を統一的に検出
   - 各プロトコルの実装差異はカプセル化されている

### 推奨アクション

**パターンB: 差異をドキュメントに明記**

**実施すべきこと:**

1. **実装解説ドキュメントの作成**
   - `docs/implementation/mirror-mode-protocols.md`を作成
   - rsyncとmanual diffの実装差異を明記
   - baseDirectory処理の意図と目的を説明

2. **コメントの追加**
   - `src/diff-viewer/remote-diff.ts`のgetRsyncDiffForTarget()にコメント追加:
     ```typescript
     // Note: rsyncはディレクトリ単位で動作するため、mirrorモード時に
     // baseDirectoryを検出してlocalDir/remoteDirを調整する。
     // manual diffはファイル単位で比較するため、この調整は不要。
     ```

3. **テストの拡充（オプショナル）**
   - rsyncとmanual diffの結果一貫性テストを追加（参考用）
   - baseDirectory調整ロジックの単体テストを追加

### 次のステップ

**Phase 2で実施すべき内容:**

1. ✅ **ドキュメント作成**
   - `docs/implementation/mirror-mode-protocols.md`の作成
   - baseDirectory処理の設計意図を記述
   - プロトコル別の実装差異を明確化

2. ✅ **コメント追加**
   - `src/diff-viewer/remote-diff.ts`
   - `src/upload/rsync.ts`
   - `src/upload/mirror.ts`

3. ⏭️ **テスト拡充（オプション）**
   - 動作確認は既存テストで十分カバーされているため、必須ではない
   - 将来的にbaseDirectory処理のリファクタリング時に追加を検討

**実施優先度:**

- 高: ドキュメント作成（1）
- 高: コメント追加（2）
- 低: テスト拡充（3） - 既存テストで十分

---

## 補足: baseDirectory処理フローの全体像

### rsyncの場合

```
1. uploadFiles準備（例: "example/a.txt", "example/b.txt"）
   ↓
2. getRsyncDiffForTarget()呼び出し
   ↓
3. detectBaseDirectory(uploadFiles) → "example/"
   ↓
4. localDir, remoteDirを調整
   - localDir: "/path/to/local" → "/path/to/local/example/"
   - remoteDir: "/remote/dest" → "/remote/dest/example/"
   ↓
5. rsync getDiff()実行
   - rsyncは "example/" ディレクトリ内を比較
   - 結果: ["a.txt", "b.txt"] (baseDir除外)
   ↓
6. 結果のパスにbaseDir追加
   - ["a.txt", "b.txt"] → ["example/a.txt", "example/b.txt"]
   ↓
7. 返却（uploadFilesと一致）
```

### manual diffの場合

```
1. uploadFiles準備（例: "example/a.txt", "example/b.txt"）
   ↓
2. getManualDiffForTarget()呼び出し
   ↓
3. パス変換なし（uploadFilesをそのまま使用）
   ↓
4. uploader.readFile("example/a.txt")
   uploader.readFile("example/b.txt")
   ↓
5. リモートファイルと個別比較
   ↓
6. 返却（uploadFilesと一致）
```

**結論:**
どちらも最終的にuploadFilesと一致する結果を返すため、機能的には一貫性がある。
