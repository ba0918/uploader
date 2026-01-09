/**
 * diff-viewer/browser.ts のテスト
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  type BrowserCommandRunner,
  getBrowserCommand,
  openBrowser,
  parseYesNo,
  type PromptReader,
  promptYesNo,
} from "../../src/diff-viewer/browser.ts";

/** モック用のコマンドランナー */
class MockCommandRunner implements BrowserCommandRunner {
  calls: Array<{ command: string; args: string[] }> = [];
  results: Array<{ code: number }> = [];
  private callIndex = 0;

  constructor(results: Array<{ code: number }> = [{ code: 0 }]) {
    this.results = results;
  }

  run(command: string, args: string[]): Promise<{ code: number }> {
    this.calls.push({ command, args });
    const result = this.results[this.callIndex] ?? { code: 0 };
    this.callIndex++;
    return Promise.resolve(result);
  }
}

/** モック用のプロンプトリーダー */
class MockPromptReader implements PromptReader {
  private response: string | null;

  constructor(response: string | null) {
    this.response = response;
  }

  read(): Promise<string | null> {
    return Promise.resolve(this.response);
  }
}

describe("getBrowserCommand", () => {
  it("macOSでは'open'コマンドを返す", () => {
    const result = getBrowserCommand("darwin", "http://localhost:3000");
    assertEquals(result.command, "open");
    assertEquals(result.args, ["http://localhost:3000"]);
  });

  it("Windowsでは'cmd'コマンドを返す", () => {
    const result = getBrowserCommand("windows", "http://localhost:3000");
    assertEquals(result.command, "cmd");
    assertEquals(result.args, ["/c", "start", "http://localhost:3000"]);
  });

  it("Linuxでは'xdg-open'コマンドを返す", () => {
    const result = getBrowserCommand("linux", "http://localhost:3000");
    assertEquals(result.command, "xdg-open");
    assertEquals(result.args, ["http://localhost:3000"]);
  });

  it("その他のOSでは'xdg-open'をデフォルトとして返す", () => {
    const result = getBrowserCommand(
      "freebsd" as typeof Deno.build.os,
      "http://localhost:3000",
    );
    assertEquals(result.command, "xdg-open");
  });
});

describe("openBrowser", () => {
  describe("macOS", () => {
    it("'open'コマンドが成功したらtrueを返す", async () => {
      const runner = new MockCommandRunner([{ code: 0 }]);
      const result = await openBrowser("http://localhost:3000", {
        runner,
        platform: "darwin",
      });
      assertEquals(result, true);
      assertEquals(runner.calls.length, 1);
      assertEquals(runner.calls[0].command, "open");
    });

    it("'open'コマンドが失敗したらfalseを返す", async () => {
      const runner = new MockCommandRunner([{ code: 1 }]);
      const result = await openBrowser("http://localhost:3000", {
        runner,
        platform: "darwin",
      });
      assertEquals(result, false);
    });
  });

  describe("Windows", () => {
    it("'cmd'コマンドが成功したらtrueを返す", async () => {
      const runner = new MockCommandRunner([{ code: 0 }]);
      const result = await openBrowser("http://localhost:3000", {
        runner,
        platform: "windows",
      });
      assertEquals(result, true);
      assertEquals(runner.calls[0].command, "cmd");
      assertEquals(runner.calls[0].args, [
        "/c",
        "start",
        "http://localhost:3000",
      ]);
    });
  });

  describe("Linux", () => {
    it("'xdg-open'が成功したらtrueを返す", async () => {
      const runner = new MockCommandRunner([{ code: 0 }]);
      const result = await openBrowser("http://localhost:3000", {
        runner,
        platform: "linux",
      });
      assertEquals(result, true);
      assertEquals(runner.calls.length, 1);
      assertEquals(runner.calls[0].command, "xdg-open");
    });

    it("'xdg-open'が失敗したら'wslview'を試す", async () => {
      const runner = new MockCommandRunner([{ code: 1 }, { code: 0 }]);
      const result = await openBrowser("http://localhost:3000", {
        runner,
        platform: "linux",
      });
      assertEquals(result, true);
      assertEquals(runner.calls.length, 2);
      assertEquals(runner.calls[0].command, "xdg-open");
      assertEquals(runner.calls[1].command, "wslview");
    });

    it("両方失敗したらfalseを返す", async () => {
      const runner = new MockCommandRunner([{ code: 1 }, { code: 1 }]);
      const result = await openBrowser("http://localhost:3000", {
        runner,
        platform: "linux",
      });
      assertEquals(result, false);
      assertEquals(runner.calls.length, 2);
    });
  });
});

describe("parseYesNo", () => {
  it("'y'はtrueを返す", () => {
    assertEquals(parseYesNo("y"), true);
  });

  it("'Y'はtrueを返す", () => {
    assertEquals(parseYesNo("Y"), true);
  });

  it("'yes'はtrueを返す", () => {
    assertEquals(parseYesNo("yes"), true);
  });

  it("'YES'はtrueを返す", () => {
    assertEquals(parseYesNo("YES"), true);
  });

  it("'Yes'はtrueを返す", () => {
    assertEquals(parseYesNo("Yes"), true);
  });

  it("'n'はfalseを返す", () => {
    assertEquals(parseYesNo("n"), false);
  });

  it("'no'はfalseを返す", () => {
    assertEquals(parseYesNo("no"), false);
  });

  it("空文字はfalseを返す", () => {
    assertEquals(parseYesNo(""), false);
  });

  it("nullはfalseを返す", () => {
    assertEquals(parseYesNo(null), false);
  });

  it("前後の空白を無視する", () => {
    assertEquals(parseYesNo("  y  "), true);
    assertEquals(parseYesNo("  yes  "), true);
  });

  it("その他の入力はfalseを返す", () => {
    assertEquals(parseYesNo("maybe"), false);
    assertEquals(parseYesNo("yep"), false);
    assertEquals(parseYesNo("nope"), false);
  });
});

describe("promptYesNo", () => {
  it("'y'入力でtrueを返す", async () => {
    const reader = new MockPromptReader("y");
    const result = await promptYesNo("Test?", reader);
    assertEquals(result, true);
  });

  it("'yes'入力でtrueを返す", async () => {
    const reader = new MockPromptReader("yes");
    const result = await promptYesNo("Test?", reader);
    assertEquals(result, true);
  });

  it("'n'入力でfalseを返す", async () => {
    const reader = new MockPromptReader("n");
    const result = await promptYesNo("Test?", reader);
    assertEquals(result, false);
  });

  it("空入力でfalseを返す", async () => {
    const reader = new MockPromptReader("");
    const result = await promptYesNo("Test?", reader);
    assertEquals(result, false);
  });

  it("null入力でfalseを返す", async () => {
    const reader = new MockPromptReader(null);
    const result = await promptYesNo("Test?", reader);
    assertEquals(result, false);
  });
});
