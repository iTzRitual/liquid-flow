import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SyncHeader } from './SyncHeader';

const base = {
  templateName: 'Topaz — Główny',
  templateId: 42,
  shopName: 'Sklep Demo',
  shopUrl: 'demo.comarch.pl',
  idLabel: 'ID',
  okLabel: 'Brak konfliktów',
  openFolderLabel: 'Otwórz folder',
  openShopLabel: 'Otwórz sklep',
  refreshLabel: 'Odśwież',
};

describe('SyncHeader', () => {
  it('shows the OK badge when there are no conflicts', () => {
    render(<SyncHeader {...base} conflictCount={0} />);
    expect(screen.getByText('Brak konfliktów')).toBeInTheDocument();
    expect(screen.getByText('ID 42')).toBeInTheDocument();
  });

  it('shows the conflict count when there are conflicts', () => {
    render(<SyncHeader {...base} conflictCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('Brak konfliktów')).not.toBeInTheDocument();
  });

  it('wires the three actions', async () => {
    const onOpenFolder = vi.fn();
    const onOpenShop = vi.fn();
    const onRefresh = vi.fn();
    render(
      <SyncHeader
        {...base}
        conflictCount={0}
        onOpenFolder={onOpenFolder}
        onOpenShop={onOpenShop}
        onRefresh={onRefresh}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz sklep' }));
    await userEvent.click(screen.getByRole('button', { name: 'Odśwież' }));
    expect(onOpenFolder).toHaveBeenCalledOnce();
    expect(onOpenShop).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('renders the expand button only when onExpandSidebar is set, and calls it', async () => {
    const onExpandSidebar = vi.fn();
    const { rerender } = render(<SyncHeader {...base} conflictCount={0} expandLabel="Rozwiń panel" />);
    expect(screen.queryByRole('button', { name: 'Rozwiń panel' })).not.toBeInTheDocument();

    rerender(
      <SyncHeader {...base} conflictCount={0} onExpandSidebar={onExpandSidebar} expandLabel="Rozwiń panel" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Rozwiń panel' }));
    expect(onExpandSidebar).toHaveBeenCalledOnce();
  });
});
