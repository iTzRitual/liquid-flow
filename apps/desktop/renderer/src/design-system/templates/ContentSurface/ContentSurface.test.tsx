import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ContentSurface } from './ContentSurface';

describe('ContentSurface', () => {
  it('renders its children', () => {
    render(<ContentSurface><span>treść</span></ContentSurface>);
    expect(screen.getByText('treść')).toBeInTheDocument();
  });

  it('centers content when `center` is set, fills otherwise', () => {
    const { rerender } = render(<ContentSurface center><span>x</span></ContentSurface>);
    const card = screen.getByText('x').parentElement!;
    expect(card.className).toContain('items-center');
    expect(card.className).toContain('justify-center');

    rerender(<ContentSurface><span>x</span></ContentSurface>);
    const filled = screen.getByText('x').parentElement!;
    expect(filled.className).toContain('flex-col');
    expect(filled.className).not.toContain('items-center');
  });
});
