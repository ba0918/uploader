/**
 * コマンド実行の抽象化インターフェース
 *
 * 外部コマンドの実行を抽象化し、テスト時にモックを注入可能にする
 */

/** コマンド実行結果 */
export interface CommandResult {
  /** 終了コード */
  code: number;
  /** 標準出力 */
  stdout: Uint8Array;
  /** 標準エラー出力 */
  stderr: Uint8Array;
}

/** コマンド実行オプション */
export interface CommandOptions {
  /** 作業ディレクトリ */
  cwd?: string;
}

/** コマンド実行インターフェース */
export interface CommandExecutor {
  /**
   * コマンドを実行する
   * @param command コマンド名
   * @param args 引数
   * @param options オプション
   * @returns 実行結果
   */
  execute(
    command: string,
    args: string[],
    options?: CommandOptions,
  ): Promise<CommandResult>;
}

/**
 * デフォルトのコマンド実行クラス
 *
 * Deno.Command を使用してコマンドを実行する
 */
export class DenoCommandExecutor implements CommandExecutor {
  async execute(
    command: string,
    args: string[],
    options?: CommandOptions,
  ): Promise<CommandResult> {
    const cmd = new Deno.Command(command, {
      args,
      cwd: options?.cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await cmd.output();
    return { code, stdout, stderr };
  }
}

/** デフォルトのエグゼキュータインスタンス */
export const defaultExecutor = new DenoCommandExecutor();
