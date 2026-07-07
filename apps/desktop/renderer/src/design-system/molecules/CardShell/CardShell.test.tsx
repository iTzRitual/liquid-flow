import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CardShell } from './CardShell';

describe('CardShell', () => {
  it('renders children and surface classes', () => {
    render(<CardShell>zawartość</CardShell>);
    const el = screen.getByText('zawartość');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('bg-surface-base');
    expect(el.className).toContain('border-border');
  });
});
