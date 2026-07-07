import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Sidebar } from './Sidebar';

const shops = [
  { Id: 'demo-1', Name: 'Ogródek Dziadunia', Url: 'https://ogrodek.comarch.pl/sklep' },
  { Id: 'demo-2', Name: 'Topaz Testowy', Url: 'https://topaz.example.com' },
  { Id: 'demo-3', Name: 'One Page Shop', Url: 'https://ops.example.com' },
];

const meta = {
  title: 'Organisms/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ height: 480 }} className="flex bg-surface-app"><Story /></div>],
  args: { label: 'Sklepy', addLabel: 'Dodaj sklep', emptyLabel: 'Brak sklepów — dodaj pierwszy' },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithShops: Story = {
  args: { shops, currentShopId: 'demo-1' },
};

export const Empty: Story = {
  args: { shops: [] },
};
