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

  it('shows the cursor-following hint tooltip while the handle is hovered', () => {
    render(
      <AppShell
        sidebar={<nav>rail</nav>}
        onSidebarResizeStart={() => {}}
        resizeHandleLabel="Zmień szerokość"
        collapseHint="Kliknij, aby zwinąć"
        collapseShortcut="⌘B"
        resizeHint="Przeciągnij, aby zmienić szerokość"
      >
        <section>treść</section>
      </AppShell>,
    );
    const handle = screen.getByRole('separator', { name: 'Zmień szerokość' });
    // Hidden until the pointer is over the handle (position-driven, not CSS hover).
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.pointerEnter(handle, { clientY: 100 });
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Kliknij, aby zwinąć');
    expect(tip).toHaveTextContent('⌘B');
    expect(tip).toHaveTextContent('Przeciągnij, aby zmienić szerokość');
    fireEvent.pointerLeave(handle);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps a reopen handle when collapsed but drops the rail from the a11y tree', () => {
    render(
      <AppShell
        sidebar={<nav><button>Sklep</button></nav>}
        sidebarCollapsed
        onSidebarResizeStart={() => {}}
        resizeHandleLabel="Zmień szerokość"
        expandHint="Kliknij, aby rozwinąć"
      >
        <section>treść</section>
      </AppShell>,
    );
    expect(screen.queryByRole('button', { name: 'Sklep' })).not.toBeInTheDocument();
    // The handle stays so a collapsed rail can be dragged/clicked back open.
    const handle = screen.getByRole('separator', { name: 'Zmień szerokość' });
    fireEvent.pointerEnter(handle, { clientY: 100 });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Kliknij, aby rozwinąć');
    expect(screen.getByText('treść')).toBeInTheDocument();
  });
});
