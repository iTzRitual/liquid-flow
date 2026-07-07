import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusDot } from './StatusDot';

describe('StatusDot', () => {
  it('applies the tone class', () => {
    const { container } = render(<StatusDot tone="success" />);
    expect(container.firstElementChild?.className).toContain('bg-feedback-success');
  });
});
