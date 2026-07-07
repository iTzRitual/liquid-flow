import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OrDivider } from './OrDivider';

describe('OrDivider', () => {
  it('renders its label', () => {
    render(<OrDivider />);
    expect(screen.getByText('lub')).toBeInTheDocument();
  });

  it('accepts a custom label', () => {
    render(<OrDivider label="albo" />);
    expect(screen.getByText('albo')).toBeInTheDocument();
  });
});
