/**
 * rsync-parser テスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  parseItemizeChanges,
  parseItemizeLine,
} from "../../src/utils/rsync-parser.ts";

describe("parseItemizeLine", () => {
  describe("new files (A)", () => {
    it("should parse >f+++++++++ as new file", () => {
      const result = parseItemizeLine(">f+++++++++ new-file.txt");
      assertEquals(result, { path: "new-file.txt", changeType: "A" });
    });

    it("should parse file with spaces", () => {
      const result = parseItemizeLine(">f+++++++++ path/to/new file.txt");
      assertEquals(result, { path: "path/to/new file.txt", changeType: "A" });
    });

    it("should parse nested path", () => {
      const result = parseItemizeLine(">f+++++++++ src/components/Button.tsx");
      assertEquals(result, {
        path: "src/components/Button.tsx",
        changeType: "A",
      });
    });
  });

  describe("modified files (M)", () => {
    it("should parse >f.st...... as modified file (size and timestamp)", () => {
      const result = parseItemizeLine(">f.st...... modified.txt");
      assertEquals(result, { path: "modified.txt", changeType: "M" });
    });

    it("should parse >f.s....... as modified file (size only)", () => {
      const result = parseItemizeLine(">f.s....... size-only.txt");
      assertEquals(result, { path: "size-only.txt", changeType: "M" });
    });

    it("should skip >f..t...... (timestamp only change)", () => {
      const result = parseItemizeLine(">f..t...... timestamp-only.txt");
      assertEquals(result, null);
    });

    it("should skip .f..t...... (attribute only change)", () => {
      const result = parseItemizeLine(".f..t...... attr-change.txt");
      assertEquals(result, null);
    });

    it("should parse >fc........ as modified file (checksum)", () => {
      const result = parseItemizeLine(">fc........ checksum.txt");
      assertEquals(result, { path: "checksum.txt", changeType: "M" });
    });
  });

  describe("deleted files (D)", () => {
    it("should parse *deleting as deleted file", () => {
      const result = parseItemizeLine("*deleting   deleted.txt");
      assertEquals(result, { path: "deleted.txt", changeType: "D" });
    });

    it("should parse *deleting with path", () => {
      const result = parseItemizeLine("*deleting   path/to/deleted.txt");
      assertEquals(result, { path: "path/to/deleted.txt", changeType: "D" });
    });

    it("should skip deleted directories", () => {
      const result = parseItemizeLine("*deleting   deleted-dir/");
      assertEquals(result, null);
    });
  });

  describe("directories (skipped)", () => {
    it("should skip new directory", () => {
      const result = parseItemizeLine(">d+++++++++ new-dir/");
      assertEquals(result, null);
    });

    it("should skip modified directory", () => {
      const result = parseItemizeLine(".d..t...... existing-dir/");
      assertEquals(result, null);
    });
  });

  describe("other types (skipped)", () => {
    it("should skip symlinks", () => {
      const result = parseItemizeLine(">L+++++++++ symlink");
      assertEquals(result, null);
    });

    it("should skip devices", () => {
      const result = parseItemizeLine(">D+++++++++ device");
      assertEquals(result, null);
    });

    it("should skip special files", () => {
      const result = parseItemizeLine(">S+++++++++ special");
      assertEquals(result, null);
    });
  });

  describe("invalid lines (skipped)", () => {
    it("should skip empty lines", () => {
      const result = parseItemizeLine("");
      assertEquals(result, null);
    });

    it("should skip whitespace-only lines", () => {
      const result = parseItemizeLine("   ");
      assertEquals(result, null);
    });

    it("should skip unrecognized lines", () => {
      const result = parseItemizeLine("some random text");
      assertEquals(result, null);
    });

    it("should skip rsync summary lines", () => {
      const result = parseItemizeLine("sent 1234 bytes  received 5678 bytes");
      assertEquals(result, null);
    });
  });
});

describe("parseItemizeChanges", () => {
  it("should parse multiple lines", () => {
    const output = `>f+++++++++ new1.txt
>f+++++++++ new2.txt
>f.st...... modified.txt
*deleting   deleted.txt
`;
    const result = parseItemizeChanges(output);

    assertEquals(result.entries.length, 4);
    assertEquals(result.added, 2);
    assertEquals(result.modified, 1);
    assertEquals(result.deleted, 1);

    assertEquals(result.entries[0], { path: "new1.txt", changeType: "A" });
    assertEquals(result.entries[1], { path: "new2.txt", changeType: "A" });
    assertEquals(result.entries[2], { path: "modified.txt", changeType: "M" });
    assertEquals(result.entries[3], { path: "deleted.txt", changeType: "D" });
  });

  it("should skip directories and only count files", () => {
    const output = `>d+++++++++ new-dir/
>f+++++++++ new-dir/file.txt
.d..t...... existing-dir/
>f.st...... existing-dir/modified.txt
`;
    const result = parseItemizeChanges(output);

    assertEquals(result.entries.length, 2);
    assertEquals(result.added, 1);
    assertEquals(result.modified, 1);
    assertEquals(result.deleted, 0);
  });

  it("should handle empty output", () => {
    const result = parseItemizeChanges("");

    assertEquals(result.entries.length, 0);
    assertEquals(result.added, 0);
    assertEquals(result.modified, 0);
    assertEquals(result.deleted, 0);
  });

  it("should handle Uint8Array input", () => {
    const output = new TextEncoder().encode(">f+++++++++ test.txt\n");
    const result = parseItemizeChanges(output);

    assertEquals(result.entries.length, 1);
    assertEquals(result.entries[0], { path: "test.txt", changeType: "A" });
  });

  it("should filter out rsync summary and skip invalid lines", () => {
    const output = `>f+++++++++ file.txt
sent 1234 bytes  received 5678 bytes  1234.56 bytes/sec
total size is 9012  speedup is 1.23
`;
    const result = parseItemizeChanges(output);

    assertEquals(result.entries.length, 1);
    assertEquals(result.entries[0], { path: "file.txt", changeType: "A" });
  });

  it("should handle real-world rsync output", () => {
    // Simulated real rsync --itemize-changes output
    // Note: timestamp-only changes (>f..t......, .f..t......) are skipped
    // because they don't represent content changes
    const output = `>f+++++++++ src/components/NewComponent.tsx
>f.st...... src/components/Button.tsx
>f..t...... src/utils/helper.ts
*deleting   src/deprecated/old.ts
>d+++++++++ src/new-feature/
>f+++++++++ src/new-feature/index.ts
.f..t...... README.md
`;
    const result = parseItemizeChanges(output);

    // helper.ts and README.md are skipped (timestamp-only changes)
    assertEquals(result.entries.length, 4);
    assertEquals(result.added, 2); // NewComponent.tsx, new-feature/index.ts
    assertEquals(result.modified, 1); // Button.tsx (has size+timestamp change)
    assertEquals(result.deleted, 1); // old.ts

    // Verify specific entries
    const paths = result.entries.map((e) => e.path);
    assertEquals(paths.includes("src/components/NewComponent.tsx"), true);
    assertEquals(paths.includes("src/components/Button.tsx"), true);
    assertEquals(paths.includes("src/deprecated/old.ts"), true);
    assertEquals(paths.includes("src/utils/helper.ts"), false); // Timestamp-only, skipped
    assertEquals(paths.includes("README.md"), false); // Timestamp-only, skipped
    assertEquals(paths.includes("src/new-feature/"), false); // Directory should be skipped
  });
});
