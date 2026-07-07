import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { cn } from './cn';

// Guards the renderer test harness end to end: TypeScript + jsdom + Testing
// Library + jest-dom + automatic JSX, plus the `cn` utility itself.
describe('foundations harness', () => {
  it('cn merges classes and resolves Tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', false && 'hidden', 'font-ui')).toBe('text-sm font-ui');
  });

  it('renders into jsdom with jest-dom matchers available', () => {
    render(<button className={cn('font-ui')}>Klik</button>);
    expect(screen.getByRole('button', { name: 'Klik' })).toBeInTheDocument();
  });
});
