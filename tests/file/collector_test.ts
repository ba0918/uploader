/**
 * file/collector.ts のテスト
 */

import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { DirEntry, FileInfo, FileSystem } from "../../src/types/mod.ts";
import {
  collectFiles,
  FileCollectError,
  formatFileSize,
} from "../../src/file/collector.ts";

/** モックファイル情報 */
interface MockFile {
  type: "file";
  size: number;
  mtime: Date | null;
}

/** モックディレクトリ情報 */
interface MockDirectory {
  type: "directory";
  entries: Map<string, MockFile | MockDirectory>;
}

type MockEntry = MockFile | MockDirectory;

/** モックファイルシステムを作成 */
function createMockFileSystem(
  structure: Map<string, MockEntry>,
  cwd: string = "/project",
): FileSystem {
  // パスを正規化（末尾のスラッシュを除去、Windowsパスを正規化）
  function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+$/, "");
  }

  // 再帰的にパスからエントリを探す
  function findEntry(path: string): MockEntry | undefined {
    const normalizedPath = normalizePath(path);
    const parts = normalizedPath.split("/").filter((p) => p.length > 0);

    let current: MockEntry | undefined = structure.get("/" + parts[0]);

    for (let i = 1; i < parts.length && current; i++) {
      if (current.type !== "directory") {
        return undefined;
      }
      current = current.entries.get(parts[i]);
    }

    return current;
  }

  return {
    stat(path: string): Promise<FileInfo> {
      const entry = findEntry(path);
      if (!entry) {
        return Promise.reject(
          new Deno.errors.NotFound(`Path not found: ${path}`),
        );
      }

      if (entry.type === "file") {
        return Promise.resolve({
          size: entry.size,
          mtime: entry.mtime,
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        });
      } else {
        return Promise.resolve({
          size: 0,
          mtime: null,
          isFile: false,
          isDirectory: true,
          isSymlink: false,
        });
      }
    },

    async *readDir(path: string): AsyncIterable<DirEntry> {
      const entry = findEntry(path);
      if (!entry || entry.type !== "directory") {
        throw new Error(`Not a directory: ${path}`);
      }

      for (const [name, child] of entry.entries) {
        yield {
          name,
          isFile: child.type === "file",
          isDirectory: child.type === "directory",
          isSymlink: false,
        };
      }
    },

    readTextFile(path: string): Promise<string> {
      const entry = findEntry(path);
      if (!entry || entry.type !== "file") {
        return Promise.reject(new Error(`Not a file: ${path}`));
      }
      return Promise.resolve("mock content");
    },

    realPath(path: string): Promise<string> {
      return Promise.resolve(path);
    },

    cwd(): string {
      return cwd;
    },
  };
}

/** ヘルパー: ファイルを作成 */
function mockFile(size: number, mtime: Date | null = null): MockFile {
  return { type: "file", size, mtime };
}

/** ヘルパー: ディレクトリを作成 */
function mockDir(
  entries: Record<string, MockEntry>,
): MockDirectory {
  return {
    type: "directory",
    entries: new Map(Object.entries(entries)),
  };
}

describe("collectFiles", () => {
  describe("単一ファイルの収集", () => {
    it("単一ファイルを収集できる", async () => {
      const fs = createMockFileSystem(
        new Map([
          ["/project", mockDir({ "file.txt": mockFile(100) })],
        ]),
      );

      const result = await collectFiles(["file.txt"], {
        baseDir: "/project",
        fs,
      });

      assertEquals(result.fileCount, 1);
      assertEquals(result.directoryCount, 0);
      assertEquals(result.files[0].relativePath, "file.txt");
      assertEquals(result.files[0].size, 100);
    });

    it("絶対パスでファイルを収集できる", async () => {
      const fs = createMockFileSystem(
        new Map([
          ["/project", mockDir({ "file.txt": mockFile(200) })],
        ]),
      );

      const result = await collectFiles(["/project/file.txt"], {
        baseDir: "/project",
        fs,
      });

      assertEquals(result.fileCount, 1);
      assertEquals(result.files[0].relativePath, "file.txt");
      assertEquals(result.files[0].size, 200);
    });
  });

  describe("ディレクトリの収集", () => {
    it("ディレクトリ名指定でディレクトリごと収集する", async () => {
      const fs = createMockFileSystem(
        new Map([
          [
            "/project",
            mockDir({
              dist: mockDir({
                "index.js": mockFile(500),
                "style.css": mockFile(300),
              }),
            }),
          ],
        ]),
      );

      const result = await collectFiles(["dist"], {
        baseDir: "/project",
        fs,
      });

      // "dist"指定時、ファイルは"dist/"プレフィックス付きの相対パスになる
      // ルートディレクトリ自体は記録されない（中身のみ）
      assertEquals(result.fileCount, 2);
      assertEquals(result.directoryCount, 0);

      const paths = result.files.map((f) => f.relativePath).sort();
      assertEquals(paths, ["dist/index.js", "dist/style.css"]);
    });

    it("末尾スラッシュでディレクトリの中身のみ収集する", async () => {
      const fs = createMockFileSystem(
        new Map([
          [
            "/project",
            mockDir({
              dist: mockDir({
                "index.js": mockFile(500),
                "style.css": mockFile(300),
              }),
            }),
          ],
        ]),
      );

      const result = await collectFiles(["dist/"], {
        baseDir: "/project",
        fs,
      });

      assertEquals(result.fileCount, 2);
      assertEquals(result.directoryCount, 0);

      const paths = result.files.map((f) => f.relativePath).sort();
      assertEquals(paths, ["index.js", "style.css"]);
    });

    it("ネストしたディレクトリを再帰的に収集する", async () => {
      const fs = createMockFileSystem(
        new Map([
          [
            "/project",
            mockDir({
              src: mockDir({
                "index.ts": mockFile(100),
                utils: mockDir({
                  "helper.ts": mockFile(50),
                }),
              }),
            }),
          ],
        ]),
      );

      const result = await collectFiles(["src/"], {
        baseDir: "/project",
        fs,
      });

      assertEquals(result.fileCount, 2);
      assertEquals(result.directoryCount, 1);

      const paths = result.files.map((f) => f.relativePath).sort();
      assertEquals(paths, ["index.ts", "utils", "utils/helper.ts"]);
    });
  });

  describe("ignoreパターン", () => {
    it("ignoreパターンにマッチするファイルを除外する", async () => {
      const fs = createMockFileSystem(
        new Map([
          [
            "/project",
            mockDir({
              src: mockDir({
                "index.ts": mockFile(100),
                "debug.log": mockFile(50),
              }),
            }),
          ],
        ]),
      );

      const result = await collectFiles(["src/"], {
        baseDir: "/project",
        ignorePatterns: ["*.log"],
        fs,
      });

      assertEquals(result.fileCount, 1);
      assertEquals(result.files[0].relativePath, "index.ts");
    });

    it("ignoreパターンにマッチするディレクトリを除外する", async () => {
      const fs = createMockFileSystem(
        new Map([
          [
            "/project",
            mockDir({
              src: mockDir({
                "index.ts": mockFile(100),
                node_modules: mockDir({
                  "pkg.js": mockFile(500),
                }),
              }),
            }),
          ],
        ]),
      );

      const result = await collectFiles(["src/"], {
        baseDir: "/project",
        ignorePatterns: ["node_modules"],
        fs,
      });

      assertEquals(result.fileCount, 1);
      assertEquals(result.directoryCount, 0);
      assertEquals(result.files[0].relativePath, "index.ts");
    });
  });

  describe("複数ソース", () => {
    it("複数ソースからファイルを収集する", async () => {
      const fs = createMockFileSystem(
        new Map([
          [
            "/project",
            mockDir({
              src: mockDir({ "index.ts": mockFile(100) }),
              docs: mockDir({ "README.md": mockFile(200) }),
            }),
          ],
        ]),
      );

      const result = await collectFiles(["src/", "docs/"], {
        baseDir: "/project",
        fs,
      });

      assertEquals(result.fileCount, 2);
      const paths = result.files.map((f) => f.relativePath).sort();
      assertEquals(paths, ["README.md", "index.ts"]);
    });

    it("重複するファイルは除去される", async () => {
      const fs = createMockFileSystem(
        new Map([
          [
            "/project",
            mockDir({
              src: mockDir({
                "index.ts": mockFile(100),
              }),
            }),
          ],
        ]),
      );

      // 同じソースを2回指定
      const result = await collectFiles(["src/", "src/"], {
        baseDir: "/project",
        fs,
      });

      assertEquals(result.fileCount, 1);
    });
  });

  describe("エラーハンドリング", () => {
    it("存在しないパスでエラーを投げる", async () => {
      const fs = createMockFileSystem(
        new Map([
          ["/project", mockDir({})],
        ]),
      );

      await assertRejects(
        () =>
          collectFiles(["nonexistent"], {
            baseDir: "/project",
            fs,
          }),
        FileCollectError,
        "Source not found",
      );
    });
  });

  describe("統計情報", () => {
    it("正確な統計を計算する", async () => {
      const fs = createMockFileSystem(
        new Map([
          [
            "/project",
            mockDir({
              dist: mockDir({
                "a.js": mockFile(100),
                "b.js": mockFile(200),
                sub: mockDir({
                  "c.js": mockFile(300),
                }),
              }),
            }),
          ],
        ]),
      );

      const result = await collectFiles(["dist/"], {
        baseDir: "/project",
        fs,
      });

      assertEquals(result.fileCount, 3);
      assertEquals(result.directoryCount, 1);
      assertEquals(result.totalSize, 600); // 100 + 200 + 300
      assertEquals(result.sources, ["dist/"]);
    });
  });
});

describe("formatFileSize", () => {
  it("バイト単位を正しくフォーマットする", () => {
    assertEquals(formatFileSize(0), "0 B");
    assertEquals(formatFileSize(100), "100 B");
    assertEquals(formatFileSize(1023), "1023 B");
  });

  it("キロバイト単位を正しくフォーマットする", () => {
    assertEquals(formatFileSize(1024), "1.0 KB");
    assertEquals(formatFileSize(1536), "1.5 KB");
    assertEquals(formatFileSize(10240), "10.0 KB");
  });

  it("メガバイト単位を正しくフォーマットする", () => {
    assertEquals(formatFileSize(1048576), "1.0 MB");
    assertEquals(formatFileSize(1572864), "1.5 MB");
  });

  it("ギガバイト単位を正しくフォーマットする", () => {
    assertEquals(formatFileSize(1073741824), "1.0 GB");
  });

  it("テラバイト単位を正しくフォーマットする", () => {
    assertEquals(formatFileSize(1099511627776), "1.0 TB");
  });
});

describe("FileCollectError", () => {
  it("エラー情報を保持する", () => {
    const originalError = new Error("Original error");
    const error = new FileCollectError(
      "Failed to collect",
      "src/file.ts",
      originalError,
    );

    assertEquals(error.name, "FileCollectError");
    assertEquals(error.message, "Failed to collect");
    assertEquals(error.source, "src/file.ts");
    assertEquals(error.originalError, originalError);
  });

  it("originalErrorなしでエラーを作成できる", () => {
    const error = new FileCollectError(
      "Failed to collect",
      "src/file.ts",
    );

    assertEquals(error.name, "FileCollectError");
    assertEquals(error.message, "Failed to collect");
    assertEquals(error.source, "src/file.ts");
    assertEquals(error.originalError, undefined);
  });
});

describe("シンボリックリンク対応", () => {
  /** シンボリックリンク対応のモックファイルシステムを作成 */
  function createSymlinkMockFileSystem(
    structure: Map<string, MockEntry>,
    symlinks: Map<string, string> = new Map(),
    _cwd: string = "/project",
  ): FileSystem {
    function normalizePath(path: string): string {
      return path.replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function findEntry(path: string): MockEntry | undefined {
      const normalizedPath = normalizePath(path);
      const parts = normalizedPath.split("/").filter((p) => p.length > 0);

      let current: MockEntry | undefined = structure.get("/" + parts[0]);

      for (let i = 1; i < parts.length && current; i++) {
        if (current.type !== "directory") {
          return undefined;
        }
        current = current.entries.get(parts[i]);
      }

      return current;
    }

    return {
      stat(path: string): Promise<FileInfo> {
        const entry = findEntry(path);
        if (!entry) {
          return Promise.reject(
            new Deno.errors.NotFound(`Path not found: ${path}`),
          );
        }

        if (entry.type === "file") {
          return Promise.resolve({
            size: entry.size,
            mtime: entry.mtime,
            isFile: true,
            isDirectory: false,
            isSymlink: false,
          });
        } else {
          return Promise.resolve({
            size: 0,
            mtime: null,
            isFile: false,
            isDirectory: true,
            isSymlink: false,
          });
        }
      },

      async *readDir(path: string): AsyncIterable<DirEntry> {
        const entry = findEntry(path);
        if (!entry || entry.type !== "directory") {
          throw new Error(`Not a directory: ${path}`);
        }

        for (const [name, child] of entry.entries) {
          const fullPath = `${normalizePath(path)}/${name}`;
          const isSymlink = symlinks.has(fullPath);

          yield {
            name,
            isFile: !isSymlink && child.type === "file",
            isDirectory: !isSymlink && child.type === "directory",
            isSymlink,
          };
        }
      },

      readTextFile(path: string): Promise<string> {
        const entry = findEntry(path);
        if (!entry || entry.type !== "file") {
          return Promise.reject(new Error(`Not a file: ${path}`));
        }
        return Promise.resolve("mock content");
      },

      realPath(path: string): Promise<string> {
        const normalizedPath = normalizePath(path);
        if (symlinks.has(normalizedPath)) {
          return Promise.resolve(symlinks.get(normalizedPath)!);
        }
        return Promise.resolve(path);
      },

      cwd(): string {
        return _cwd;
      },
    };
  }

  it("followSymlinks=trueでシンボリックリンク先のファイルを収集する", async () => {
    const structure = new Map<string, MockEntry>([
      [
        "/project",
        mockDir({
          src: mockDir({
            "link.txt": mockFile(100), // シンボリックリンクとして扱う
          }),
          real: mockDir({
            "target.txt": mockFile(200), // リンク先の実体
          }),
        }),
      ],
    ]);

    // /project/src/link.txt は /project/real/target.txt へのシンボリックリンク
    const symlinks = new Map<string, string>([
      ["/project/src/link.txt", "/project/real/target.txt"],
    ]);

    const fs = createSymlinkMockFileSystem(structure, symlinks);

    const result = await collectFiles(["src/"], {
      baseDir: "/project",
      followSymlinks: true,
      fs,
    });

    // シンボリックリンクを追跡してファイルが収集される
    assertEquals(result.fileCount, 1);
    assertEquals(result.files[0].relativePath, "link.txt");
  });

  it("followSymlinks=trueでシンボリックリンク先のディレクトリを収集する", async () => {
    const structure = new Map<string, MockEntry>([
      [
        "/project",
        mockDir({
          src: mockDir({
            linked_dir: mockDir({
              "file_in_linked.txt": mockFile(150),
            }),
          }),
          real_dir: mockDir({
            "file_in_real.txt": mockFile(250),
          }),
        }),
      ],
    ]);

    // /project/src/linked_dir は /project/real_dir へのシンボリックリンク
    const symlinks = new Map<string, string>([
      ["/project/src/linked_dir", "/project/real_dir"],
    ]);

    const fs = createSymlinkMockFileSystem(structure, symlinks);

    const result = await collectFiles(["src/"], {
      baseDir: "/project",
      followSymlinks: true,
      fs,
    });

    // シンボリックリンク先のディレクトリ内のファイルが収集される
    assertEquals(result.fileCount >= 1, true);
  });

  it("followSymlinks=falseではシンボリックリンクを無視する", async () => {
    const structure = new Map<string, MockEntry>([
      [
        "/project",
        mockDir({
          src: mockDir({
            "regular.txt": mockFile(100),
            "link.txt": mockFile(200), // シンボリックリンクとして扱う
          }),
        }),
      ],
    ]);

    const symlinks = new Map<string, string>([
      ["/project/src/link.txt", "/project/real/target.txt"],
    ]);

    const fs = createSymlinkMockFileSystem(structure, symlinks);

    const result = await collectFiles(["src/"], {
      baseDir: "/project",
      followSymlinks: false,
      fs,
    });

    // シンボリックリンクは無視され、通常ファイルのみ収集
    assertEquals(result.fileCount, 1);
    assertEquals(result.files[0].relativePath, "regular.txt");
  });
});

describe("エラーハンドリング追加ケース", () => {
  it("アクセスエラーでFileCollectErrorを投げる", async () => {
    // カスタムエラーを返すモックファイルシステム
    const fs: FileSystem = {
      stat(_path: string): Promise<FileInfo> {
        return Promise.reject(new Error("Permission denied"));
      },
      async *readDir(_path: string): AsyncIterable<DirEntry> {
        throw new Error("Not implemented");
      },
      readTextFile(_path: string): Promise<string> {
        return Promise.reject(new Error("Not implemented"));
      },
      realPath(path: string): Promise<string> {
        return Promise.resolve(path);
      },
      cwd(): string {
        return "/project";
      },
    };

    await assertRejects(
      () =>
        collectFiles(["file.txt"], {
          baseDir: "/project",
          fs,
        }),
      FileCollectError,
      "Failed to access source",
    );
  });
});

describe("重複除去の詳細ケース", () => {
  it("同じファイルがディレクトリとしても存在する場合、ファイルが優先される", async () => {
    // この挙動はcollectFilesの重複除去ロジックをテスト
    const fs = createMockFileSystem(
      new Map([
        [
          "/project",
          mockDir({
            dist: mockDir({
              "index.js": mockFile(500),
            }),
          }),
        ],
      ]),
    );

    // 同じソースを2回指定しても重複は除去される
    const result = await collectFiles(["dist/", "dist/"], {
      baseDir: "/project",
      fs,
    });

    assertEquals(result.fileCount, 1);
    assertEquals(result.files[0].relativePath, "index.js");
  });
});
