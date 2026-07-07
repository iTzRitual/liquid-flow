import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { ActivityLog } from './ActivityLog';

const meta = {
  title: 'Organisms/ActivityLog',
  component: ActivityLog,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ width: 560 }}><Story /></div>],
} satisfies Meta<typeof ActivityLog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Feed: Story = {
  args: {
    entries: [
      { id: 6, time: '12:03:24', tone: 'success', message: 'Plik został zmieniony — layout.css' },
      { id: 5, time: '12:03:21', tone: 'info', message: 'Utworzono punkt kontrolny git' },
      { id: 4, time: '12:03:18', tone: 'warning', message: 'Sprawdzono niezgodności — 1 konflikt' },
      { id: 3, time: '12:00:03', tone: 'success', message: 'Pobrano 128 plików szablonu', muted: true },
      { id: 2, time: '12:00:02', tone: 'info', message: 'Połączono ze sklepem Sklep Demo', muted: true },
      { id: 1, time: '12:00:01', tone: 'neutral', message: '── Nowa sesja ──────────────', muted: true },
    ],
  },
};

export const Empty: Story = {
  args: { entries: [], emptyLabel: 'Brak aktywności' },
};
