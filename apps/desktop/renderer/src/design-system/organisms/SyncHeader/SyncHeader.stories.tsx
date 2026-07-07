import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { SyncHeader } from './SyncHeader';

const meta = {
  title: 'Organisms/SyncHeader',
  component: SyncHeader,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="bg-surface-base"><Story /></div>],
  args: {
    templateName: 'Topaz — Główny',
    templateId: 42,
    shopName: 'Sklep Demo',
    shopUrl: 'demo.comarch.pl/sklep',
    idLabel: 'ID',
    okLabel: 'Brak konfliktów',
    openFolderLabel: 'Otwórz folder',
    openShopLabel: 'Otwórz sklep',
    refreshLabel: 'Odśwież',
  },
} satisfies Meta<typeof SyncHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoConflicts: Story = {
  args: { conflictCount: 0 },
};

export const WithConflicts: Story = {
  args: { conflictCount: 3 },
};
