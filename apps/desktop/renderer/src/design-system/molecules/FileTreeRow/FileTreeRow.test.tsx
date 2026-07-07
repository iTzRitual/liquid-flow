import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { FileTreeRow } from './FileTreeRow';

describe('FileTreeRow', () => {
  it('marks a folder as expandable and toggles on click', async () => {
    const onToggle = vi.fn();
    render(<FileTreeRow type="folder" name="components" expanded onToggle={onToggle} />);
    const row = screen.getByRole('treeitem');
    expect(row).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(row);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders a file without expand state', () => {
    render(<FileTreeRow type="file" name="main.js" />);
    expect(screen.getByRole('treeitem')).not.toHaveAttribute('aria-expanded');
    expect(screen.getByText('main.js')).toBeInTheDocument();
  });
});
