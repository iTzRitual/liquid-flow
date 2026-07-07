import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Label } from './Label';

describe('Label', () => {
  it('renders its text and htmlFor association', () => {
    render(<Label htmlFor="url">Url</Label>);
    const label = screen.getByText('Url');
    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute('for', 'url');
  });
});
