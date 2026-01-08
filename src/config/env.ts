/**
 * 環境変数の展開
 */

/** 環境変数パターン: ${VAR_NAME} */
const ENV_PATTERN = /\$\{([^}]+)\}/g;

/**
 * 文字列内の環境変数を展開する
 * @param value 展開対象の文字列
 * @returns 環境変数を展開した文字列、未設定の場合はundefined
 */
export function expandEnvVar(value: string): string | undefined {
  let result = value;
  let hasUnset = false;

  result = result.replace(ENV_PATTERN, (_, varName: string) => {
    const envValue = Deno.env.get(varName);
    if (envValue === undefined) {
      hasUnset = true;
      return `\${${varName}}`; // 未設定の場合はそのまま残す
    }
    return envValue;
  });

  // 未設定の環境変数がある場合はundefinedを返す
  if (hasUnset && result.includes("${")) {
    return undefined;
  }

  return result;
}

/**
 * オブジェクト内の全ての文字列値の環境変数を展開する
 * @param obj 展開対象のオブジェクト
 * @returns 環境変数を展開したオブジェクト
 */
export function expandEnvVarsInObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return expandEnvVar(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => expandEnvVarsInObject(item)) as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVarsInObject(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * チルダ(~)をホームディレクトリに展開する
 * @param filePath ファイルパス
 * @returns 展開されたパス
 */
export function expandTilde(filePath: string): string {
  if (filePath.startsWith("~/")) {
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
    return home + filePath.slice(1);
  }
  return filePath;
}

/**
 * 環境変数が設定されているか確認する
 * @param value チェック対象の文字列
 * @returns 未設定の環境変数名のリスト
 */
export function findUnsetEnvVars(value: string): string[] {
  const unset: string[] = [];
  let match;

  while ((match = ENV_PATTERN.exec(value)) !== null) {
    const varName = match[1];
    if (Deno.env.get(varName) === undefined) {
      unset.push(varName);
    }
  }

  return unset;
}
