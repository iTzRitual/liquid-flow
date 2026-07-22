import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders the sidebar slot and the main content', () => {
    render(<AppShell sidebar={<nav>rail</nav>}><section>treść</section></AppShell>);
    expect(screen.getByText('rail')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByText('treść'));
  });

  it('renders a resize handle that starts a drag on pointer-down', () => {
    const onSidebarResizeStart = vi.fn();
    render(
      <AppShell
        sidebar={<nav>rail</nav>}
        onSidebarResizeStart={onSidebarResizeStart}
        resizeHandleLabel="Zmień szerokość"
      >
        <section>treść</section>
      </AppShell>,
    );
    fireEvent.pointerDown(screen.getByRole('separator', { name: 'Zmień szerokość' }));
    expect(onSidebarResizeStart).toHaveBeenCalledOnce();
  });

  it('removes the collapsed sidebar from the a11y tree (and drops its handle)', () => {
    render(
      <AppShell
        sidebar={<nav><button>Sklep</button></nav>}
        sidebarCollapsed
        onSidebarResizeStart={() => {}}
        resizeHandleLabel="Zmień szerokość"
      >
        <section>treść</section>
      </AppShell>,
    );
    expect(screen.queryByRole('button', { name: 'Sklep' })).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.getByText('treść')).toBeInTheDocument();
  });
});
