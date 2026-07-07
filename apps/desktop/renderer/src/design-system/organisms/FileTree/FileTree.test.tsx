import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { FileTree, type FileTreeNode } from './FileTree';

const tree: FileTreeNode[] = [
  {
    name: 'components',
    children: [
      { name: 'mobile', children: [{ name: 'mobile1.min.css' }] },
      { name: 'header.liquid' },
    ],
  },
  { name: 'index.html' },
];

describe('FileTree', () => {
  it("with initialExpand='top' shows top-level folders but not their children", () => {
    render(<FileTree nodes={tree} initialExpand="top" />);
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('index.html')).toBeInTheDocument();
    // 'components' is expanded (top level) so its direct children show...
    expect(screen.getByText('header.liquid')).toBeInTheDocument();
    // ...but the nested 'mobile' folder stays collapsed, hiding its child.
    expect(screen.queryByText('mobile1.min.css')).not.toBeInTheDocument();
  });

  it("with initialExpand='none' hides every folder's contents", () => {
    render(<FileTree nodes={tree} initialExpand="none" />);
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.queryByText('header.liquid')).not.toBeInTheDocument();
  });

  it('expands a collapsed folder on click and collapses it again', async () => {
    render(<FileTree nodes={tree} initialExpand="none" />);
    const folder = screen.getByText('components').closest('[role="treeitem"]')!;

    expect(folder).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(folder);
    expect(folder).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('header.liquid')).toBeInTheDocument();

    await userEvent.click(folder);
    expect(folder).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('header.liquid')).not.toBeInTheDocument();
  });

  it('reveals nested folders only when their parent is expanded', async () => {
    render(<FileTree nodes={tree} initialExpand="top" />);
    // 'mobile' (nested folder) is visible but collapsed; its child is hidden.
    expect(screen.queryByText('mobile1.min.css')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('mobile'));
    expect(screen.getByText('mobile1.min.css')).toBeInTheDocument();
  });
});
