import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { HubScreen, type HubScreenProps } from './HubScreen';

const base: HubScreenProps = {
  shops: [{ Id: 'a', Name: 'Sklep A', Url: 'https://a.example.com' }],
  currentShopId: 'a',
  templateName: 'Topaz — Główny',
  templateId: 42,
  shopName: 'Sklep A',
  shopUrl: 'a.example.com',
  conflictCount: 3,
  fileTree: [
    { name: 'components', children: [{ name: 'header.liquid' }] },
    { name: 'index.html' },
  ],
  logEntries: [
    { id: 1, time: '12:00:01', tone: 'success', message: 'Połączono ze sklepem' },
    { id: 2, time: '12:00:02', tone: 'info', message: 'Pobrano pliki szablonu' },
  ],
  labels: {
    shops: 'Sklepy',
    addShop: 'Dodaj sklep',
    id: 'ID',
    ok: 'Brak konfliktów',
    openFolder: 'Otwórz folder',
    openShop: 'Otwórz sklep',
    refresh: 'Odśwież',
    files: 'Pliki',
    tabActivity: 'Aktywność',
    tabConflicts: 'Konflikty',
    tabGit: 'Git-Backup',
    emptyLog: 'Brak aktywności',
    placeholder: 'Wkrótce',
  },
};

describe('HubScreen', () => {
  it('renders the header, file tree and activity log by default', () => {
    render(<HubScreen {...base} />);
    expect(screen.getByRole('heading', { name: 'Topaz — Główny' })).toBeInTheDocument();
    expect(screen.getByText('ID 42')).toBeInTheDocument();
    // file tree "Pliki" panel
    expect(screen.getByText('components')).toBeInTheDocument();
    // activity tab is selected by default
    expect(screen.getByText('Połączono ze sklepem')).toBeInTheDocument();
  });

  it('switches to the conflicts tab and shows its placeholder', async () => {
    render(<HubScreen {...base} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Konflikty' }));
    expect(screen.getByText('Wkrótce')).toBeInTheDocument();
    expect(screen.queryByText('Połączono ze sklepem')).not.toBeInTheDocument();
  });

  it('renders a provided conflicts slot instead of the placeholder', async () => {
    render(<HubScreen {...base} conflictsSlot={<div>lista konfliktów</div>} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Konflikty' }));
    expect(screen.getByText('lista konfliktów')).toBeInTheDocument();
    expect(screen.queryByText('Wkrótce')).not.toBeInTheDocument();
  });

  it('wires the header refresh action', async () => {
    const onRefresh = vi.fn();
    render(<HubScreen {...base} onRefresh={onRefresh} />);
    await userEvent.click(screen.getByRole('button', { name: 'Odśwież' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
