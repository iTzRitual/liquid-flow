import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('renders its placeholder', () => {
    render(<Input placeholder="Url" />);
    expect(screen.getByPlaceholderText('Url')).toBeInTheDocument();
  });

  it('accepts typing', async () => {
    render(<Input placeholder="x" />);
    const el = screen.getByPlaceholderText('x');
    await userEvent.type(el, 'abc');
    expect(el).toHaveValue('abc');
  });

  it('respects disabled', () => {
    render(<Input placeholder="x" disabled />);
    expect(screen.getByPlaceholderText('x')).toBeDisabled();
  });
});
