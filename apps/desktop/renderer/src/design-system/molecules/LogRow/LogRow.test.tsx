import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LogRow } from './LogRow';

describe('LogRow', () => {
  it('renders the time and message', () => {
    render(<LogRow time="12:03:21" tone="success" message="Plik został zmieniony" />);
    expect(screen.getByText('12:03:21')).toBeInTheDocument();
    expect(screen.getByText('Plik został zmieniony')).toBeInTheDocument();
  });
});
