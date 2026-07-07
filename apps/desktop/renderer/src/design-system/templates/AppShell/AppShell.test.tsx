import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders the sidebar slot and the main content', () => {
    render(<AppShell sidebar={<nav>rail</nav>}><section>treść</section></AppShell>);
    expect(screen.getByText('rail')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByText('treść'));
  });
});
