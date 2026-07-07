import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its content', () => {
    render(<Badge>Połączono</Badge>);
    expect(screen.getByText('Połączono')).toBeInTheDocument();
  });

  it('applies the variant class', () => {
    render(<Badge variant="success">ok</Badge>);
    expect(screen.getByText('ok').className).toContain('bg-feedback-success');
  });
});
