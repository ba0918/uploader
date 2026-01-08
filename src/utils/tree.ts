/**
 * ツリー構造変換ユーティリティ
 *
 * ファイルパスのフラットリストをツリー構造に変換する
 */

import type { DiffFile } from "../types/mod.ts";
import type { DiffTreeNode } from "../types/diff-viewer.ts";

/**
 * ファイルパスの配列からツリー構造を構築
 *
 * @param files - DiffFileの配列
 * @returns ルートレベルのDiffTreeNode配列
 */
export function buildTree(files: DiffFile[]): DiffTreeNode[] {
  // パスをディレクトリ構造に分解してツリーを構築
  // 内部ではMapを使用して効率的に子ノードを管理
  interface InternalNode {
    node: DiffTreeNode;
    childMap: Map<string, InternalNode>;
  }

  const root: Map<string, InternalNode> = new Map();

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!currentLevel.has(part)) {
        const node: DiffTreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? "file" : "directory",
          status: isLast ? file.status : undefined,
          loaded: isLast ? undefined : true, // buildTree では loaded は true
          children: isLast ? undefined : [],
          fileCount: isLast ? undefined : 0,
        };
        currentLevel.set(part, {
          node,
          childMap: new Map(),
        });
      }

      const internal = currentLevel.get(part)!;

      // ディレクトリの場合、ファイル数をカウント
      if (internal.node.type === "directory") {
        internal.node.fileCount = (internal.node.fileCount ?? 0) + 1;
      }

      if (!isLast) {
        currentLevel = internal.childMap;
      }
    }
  }

  // 内部構造からDiffTreeNode[]に変換
  function convertToNodes(level: Map<string, InternalNode>): DiffTreeNode[] {
    const result: DiffTreeNode[] = [];
    for (const internal of level.values()) {
      const node = internal.node;
      if (node.type === "directory") {
        node.children = convertToNodes(internal.childMap);
      }
      result.push(node);
    }
    return result;
  }

  // Mapから配列に変換してソート
  return sortTree(convertToNodes(root));
}

/**
 * ツリーノードをソート（ディレクトリ優先、名前順）
 */
function sortTree(nodes: DiffTreeNode[]): DiffTreeNode[] {
  return nodes.sort((a, b) => {
    // ディレクトリを先に
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    // 名前順
    return a.name.localeCompare(b.name);
  }).map((node) => {
    if (node.children) {
      node.children = sortTree(node.children);
    }
    return node;
  });
}

/**
 * ツリーからルートレベルのノードのみを取得（子は未読み込み状態）
 *
 * @param files - DiffFileの配列
 * @returns ルートレベルのみのDiffTreeNode配列
 */
export function buildRootLevelTree(files: DiffFile[]): DiffTreeNode[] {
  // ルートレベルのディレクトリとファイルを集計
  const rootNodes: Map<string, DiffTreeNode> = new Map();

  for (const file of files) {
    const parts = file.path.split("/");
    const rootPart = parts[0];
    const isFile = parts.length === 1;

    if (!rootNodes.has(rootPart)) {
      const node: DiffTreeNode = {
        name: rootPart,
        path: rootPart,
        type: isFile ? "file" : "directory",
        status: isFile ? file.status : undefined,
        loaded: isFile ? undefined : false,
        children: isFile ? undefined : [],
        fileCount: isFile ? undefined : 0,
      };
      rootNodes.set(rootPart, node);
    }

    // ディレクトリの場合、ファイル数をインクリメント
    if (!isFile) {
      const node = rootNodes.get(rootPart)!;
      node.fileCount = (node.fileCount ?? 0) + 1;
    }
  }

  // ソートして返す
  return Array.from(rootNodes.values()).sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * 指定ディレクトリの直下の子ノードを取得
 *
 * @param files - DiffFileの配列
 * @param dirPath - ディレクトリパス
 * @returns 直下の子ノード配列
 */
export function getDirectChildren(
  files: DiffFile[],
  dirPath: string,
): DiffTreeNode[] {
  const prefix = dirPath + "/";
  const children: Map<string, DiffTreeNode> = new Map();

  for (const file of files) {
    // 指定ディレクトリ以下のファイルのみ
    if (!file.path.startsWith(prefix)) {
      continue;
    }

    const relativePath = file.path.slice(prefix.length);
    const parts = relativePath.split("/");
    const childName = parts[0];
    const isFile = parts.length === 1;
    const childPath = `${dirPath}/${childName}`;

    if (!children.has(childName)) {
      const node: DiffTreeNode = {
        name: childName,
        path: childPath,
        type: isFile ? "file" : "directory",
        status: isFile ? file.status : undefined,
        loaded: isFile ? undefined : false,
        children: isFile ? undefined : [],
        fileCount: isFile ? undefined : 0,
      };
      children.set(childName, node);
    }

    // ディレクトリの場合、ファイル数をインクリメント
    if (!isFile) {
      const node = children.get(childName)!;
      node.fileCount = (node.fileCount ?? 0) + 1;
    }
  }

  // ソートして返す
  return Array.from(children.values()).sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * ファイル数が閾値を超えているかチェック
 *
 * @param fileCount - ファイル数
 * @param threshold - 閾値（デフォルト: 100）
 * @returns 遅延読み込みを使用すべきか
 */
export function shouldUseLazyLoading(
  fileCount: number,
  threshold: number = 100,
): boolean {
  return fileCount > threshold;
}
