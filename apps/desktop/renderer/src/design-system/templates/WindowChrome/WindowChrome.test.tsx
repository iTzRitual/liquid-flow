import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { WindowChrome } from './WindowChrome';

describe('WindowChrome', () => {
  it('renders its children', () => {
    render(<WindowChrome><span>Zawartość okna</span></WindowChrome>);
    expect(screen.getByText('Zawartość okna')).toBeInTheDocument();
  });

  it('wires the window controls', async () => {
    const onMinimize = vi.fn();
    const onMaximize = vi.fn();
    const onClose = vi.fn();
    render(<WindowChrome platform="win" onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'minimize' }));
    await userEvent.click(screen.getByRole('button', { name: 'maximize' }));
    await userEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onMinimize).toHaveBeenCalledOnce();
    expect(onMaximize).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders three macOS traffic lights', () => {
    render(<WindowChrome platform="mac" />);
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'minimize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'maximize' })).toBeInTheDocument();
  });

  it('shows the title centered in the Windows/Linux strip', () => {
    render(<WindowChrome platform="win" title="Liquid Flow v0.9.178" />);
    expect(screen.getByText('Liquid Flow v0.9.178')).toBeInTheDocument();
  });

  it('does not render a title strip on macOS', () => {
    render(<WindowChrome platform="mac" title="Liquid Flow v0.9.178" />);
    expect(screen.queryByText('Liquid Flow v0.9.178')).not.toBeInTheDocument();
  });
});
