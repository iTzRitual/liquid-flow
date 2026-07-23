import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { HubScreen } from './HubScreen';
import type { FileTreeNode } from '../../organisms/FileTree';

const shops = [
  { Id: 'demo-1', Name: 'Ogródek Dziadunia', Url: 'https://ogrodek.comarch.pl/sklep' },
  { Id: 'demo-2', Name: 'Topaz Testowy', Url: 'https://topaz.example.com' },
];

const fileTree: FileTreeNode[] = [
  {
    name: 'components',
    children: [
      { name: 'mobile', children: [{ name: 'mobile1.min.css' }, { name: 'main.js' }] },
      { name: 'header.liquid' },
      { name: 'footer.liquid' },
    ],
  },
  { name: 'css', children: [{ name: 'layout.css' }, { name: 'theme.css' }] },
  { name: 'settings.liquid' },
  { name: 'index.html' },
];

const logEntries = [
  { id: 6, time: '12:03:24', tone: 'success' as const, message: 'Plik został zmieniony — layout.css' },
  { id: 5, time: '12:03:21', tone: 'info' as const, message: 'Utworzono punkt kontrolny git' },
  { id: 4, time: '12:03:18', tone: 'warning' as const, message: 'Sprawdzono niezgodności — 1 konflikt' },
  { id: 3, time: '12:00:03', tone: 'success' as const, message: 'Pobrano 128 plików szablonu', muted: true },
  { id: 2, time: '12:00:02', tone: 'info' as const, message: 'Połączono ze sklepem', muted: true },
];

const labels = {
  shops: 'Sklepy',
  addShop: 'Dodaj sklep',
  collapseSidebar: 'Zwiń panel boczny',
  expandSidebar: 'Rozwiń panel boczny',
  resizeSidebar: 'Zmień szerokość panelu bocznego',
  collapseHint: 'Kliknij, aby zwinąć',
  expandHint: 'Kliknij, aby rozwinąć',
  collapseShortcut: '⌘B',
  resizeHint: 'Przeciągnij, aby zmienić szerokość',
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
};

const meta = {
  title: 'Screens/HubScreen',
  component: HubScreen,
  parameters: { layout: 'fullscreen' },
  // Fill the viewport height so the header + file tree + tab area reach the full
  // canvas (a fixed pixel height would leave the screen short of it).
  decorators: [(Story) => <div style={{ height: '100vh' }}><Story /></div>],
  args: {
    shops,
    currentShopId: 'demo-1',
    templateName: 'Topaz — Główny',
    templateId: 42,
    shopName: 'Ogródek Dziadunia',
    shopUrl: 'ogrodek.comarch.pl/sklep',
    fileTree,
    logEntries,
    labels,
  },
} satisfies Meta<typeof HubScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithConflicts: Story = {
  args: { conflictCount: 3 },
};

export const NoConflicts: Story = {
  args: { conflictCount: 0 },
};

// Shop rail closed — the header's leading button reopens it.
export const SidebarCollapsed: Story = {
  args: { conflictCount: 3, defaultSidebarCollapsed: true },
};
