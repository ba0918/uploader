/**
 * ファイルシステム操作の抽象化インターフェース
 *
 * ファイルシステムへのアクセスを抽象化し、テスト時にモックを注入可能にする
 */

/** ファイル/ディレクトリの情報 */
export interface FileInfo {
  /** ファイルサイズ */
  size: number;
  /** 最終更新日時 */
  mtime: Date | null;
  /** ファイルかどうか */
  isFile: boolean;
  /** ディレクトリかどうか */
  isDirectory: boolean;
  /** シンボリックリンクかどうか */
  isSymlink: boolean;
}

/** ディレクトリエントリ */
export interface DirEntry {
  /** エントリ名 */
  name: string;
  /** ファイルかどうか */
  isFile: boolean;
  /** ディレクトリかどうか */
  isDirectory: boolean;
  /** シンボリックリンクかどうか */
  isSymlink: boolean;
}

/** ファイルシステムインターフェース */
export interface FileSystem {
  /**
   * ファイル/ディレクトリの情報を取得
   * @param path パス
   * @returns ファイル情報
   * @throws NotFoundError パスが存在しない場合
   */
  stat(path: string): Promise<FileInfo>;

  /**
   * ディレクトリ内のエントリを取得
   * @param path ディレクトリパス
   * @returns エントリのイテレータ
   */
  readDir(path: string): AsyncIterable<DirEntry>;

  /**
   * ファイル内容を読み込む
   * @param path ファイルパス
   * @returns ファイル内容
   */
  readTextFile(path: string): Promise<string>;

  /**
   * シンボリックリンクの実際のパスを取得
   * @param path シンボリックリンクのパス
   * @returns 実際のパス
   */
  realPath(path: string): Promise<string>;

  /**
   * 現在の作業ディレクトリを取得
   * @returns 作業ディレクトリ
   */
  cwd(): string;
}

/**
 * デフォルトのファイルシステム実装
 *
 * Deno API を使用してファイルシステムにアクセスする
 */
export class DenoFileSystem implements FileSystem {
  async stat(path: string): Promise<FileInfo> {
    const stat = await Deno.stat(path);
    return {
      size: stat.size,
      mtime: stat.mtime,
      isFile: stat.isFile,
      isDirectory: stat.isDirectory,
      isSymlink: stat.isSymlink,
    };
  }

  async *readDir(path: string): AsyncIterable<DirEntry> {
    for await (const entry of Deno.readDir(path)) {
      yield {
        name: entry.name,
        isFile: entry.isFile,
        isDirectory: entry.isDirectory,
        isSymlink: entry.isSymlink,
      };
    }
  }

  async readTextFile(path: string): Promise<string> {
    return await Deno.readTextFile(path);
  }

  async realPath(path: string): Promise<string> {
    return await Deno.realPath(path);
  }

  cwd(): string {
    return Deno.cwd();
  }
}

/** デフォルトのファイルシステムインスタンス */
export const defaultFileSystem = new DenoFileSystem();
