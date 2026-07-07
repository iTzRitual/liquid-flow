import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('derives two initials from a multi-word name', () => {
    render(<Avatar name="Ogródek Dziadunia" />);
    expect(screen.getByText('OD')).toBeInTheDocument();
  });

  it('falls back to "?" for an empty name', () => {
    render(<Avatar name="" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
