import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { SelectTemplateScreen } from './SelectTemplateScreen';

const shops = [
  { Id: 'demo-1', Name: 'Ogródek Dziadunia', Url: 'https://ogrodek.comarch.pl/sklep' },
  { Id: 'demo-2', Name: 'Topaz Testowy', Url: 'https://topaz.example.com' },
];

const templates = [
  { Id: 1, Name: 'Topaz 2024.10.2' },
  { Id: 2, Name: 'Topaz 2023.5' },
  { Id: 3, Name: 'One Page Shop 2024.1', Locked: true },
  { Id: 4, Name: 'Custom Liquid' },
];

const meta = {
  title: 'Screens/SelectTemplateScreen',
  component: SelectTemplateScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ height: 600 }}><Story /></div>],
  args: {
    shops,
    currentShopId: 'demo-1',
    templates,
    labels: {
      shops: 'Sklepy',
      addShop: 'Dodaj sklep',
      heading: 'Wybierz szablon',
      emptyShops: 'Brak sklepów — dodaj pierwszy',
      emptyTemplates: 'Brak szablonów w tym sklepie',
    },
  },
} satisfies Meta<typeof SelectTemplateScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selecting: Story = {
  args: { selectingId: 2 },
};
