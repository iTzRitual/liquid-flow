import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('renders the requested element via `as`', () => {
    render(<Text as="h1" variant="heading-xl">Tytuł</Text>);
    const el = screen.getByRole('heading', { level: 1, name: 'Tytuł' });
    expect(el).toBeInTheDocument();
  });

  it('applies variant and tone classes', () => {
    render(<Text as="p" variant="caption-md" tone="muted">x</Text>);
    const el = screen.getByText('x');
    expect(el.className).toContain('font-ui');
    expect(el.className).toContain('text-text-muted');
  });
});
