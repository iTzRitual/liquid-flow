import * as React from 'react';
import { FileTreeRow } from '../../molecules/FileTreeRow';
import { cn } from '../../foundations/cn';

/** A node in the file tree. A node is a FOLDER when `children` is an array
 * (even empty); otherwise it is a FILE. */
export interface FileTreeNode {
  name: string;
  children?: FileTreeNode[];
}

export type InitialExpand = 'all' | 'top' | 'none';

/** The Hub "Pliki" panel: a folder/file tree that expands and collapses on
 * click. Data-driven and self-contained — it owns only the expand/collapse UI
 * state (a set of folder paths); no IPC. The caller supplies the `nodes` tree
 * (mock fixtures in Storybook, real workspace files in the app container). */
export interface FileTreeProps {
  nodes: FileTreeNode[];
  initialExpand?: InitialExpand;
  className?: string;
}

/** Stable id for a node = its path from the root (`parent/child`). Sibling names
 * are unique within a folder, so this is collision-free for real file trees. */
function pathOf(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function collectFolderPaths(
  nodes: FileTreeNode[],
  depth: number,
  parentPath: string,
  mode: InitialExpand,
  out: Set<string>,
): void {
  if (mode === 'none') return;
  for (const node of nodes) {
    if (!Array.isArray(node.children)) continue;
    const path = pathOf(parentPath, node.name);
    if (mode === 'all' || depth === 0) out.add(path);
    collectFolderPaths(node.children, depth + 1, path, mode, out);
  }
}

interface FlatRow {
  node: FileTreeNode;
  path: string;
  depth: number;
  isFolder: boolean;
  isExpanded: boolean;
}

function flatten(
  nodes: FileTreeNode[],
  depth: number,
  parentPath: string,
  expanded: Set<string>,
  out: FlatRow[],
): void {
  for (const node of nodes) {
    const path = pathOf(parentPath, node.name);
    const isFolder = Array.isArray(node.children);
    const isExpanded = isFolder && expanded.has(path);
    out.push({ node, path, depth, isFolder, isExpanded });
    if (isFolder && isExpanded) flatten(node.children!, depth + 1, path, expanded, out);
  }
}

export function FileTree({ nodes, initialExpand = 'top', className }: FileTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const set = new Set<string>();
    collectFolderPaths(nodes, 0, '', initialExpand, set);
    return set;
  });

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const rows: FlatRow[] = [];
  flatten(nodes, 0, '', expanded, rows);

  return (
    <div role="tree" className={cn('flex flex-col', className)}>
      {rows.map((row) => (
        <FileTreeRow
          key={row.path}
          name={row.node.name}
          type={row.isFolder ? 'folder' : 'file'}
          depth={row.depth}
          expanded={row.isExpanded}
          onToggle={() => toggle(row.path)}
        />
      ))}
    </div>
  );
}
