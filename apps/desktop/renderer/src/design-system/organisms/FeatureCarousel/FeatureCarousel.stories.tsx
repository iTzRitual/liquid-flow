import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Zap, Shuffle, PackageSearch } from '../../foundations/icons';
import { FeatureCarousel } from './FeatureCarousel';

const features = [
  { icon: Zap, title: 'Hot-reload na żywo', description: 'Zapisz plik — zmiana natychmiast trafia do sklepu.' },
  { icon: Shuffle, title: 'Wykrywanie konfliktów', description: 'Porównanie lokalne ↔ zdalne z jasnym wyborem wersji.' },
  { icon: PackageSearch, title: 'Automatyczne kopie', description: 'Każda zmiana wersjonowana w git.' },
];

const meta = {
  title: 'Organisms/FeatureCarousel',
  component: FeatureCarousel,
  parameters: { layout: 'centered' },
  args: { features },
} satisfies Meta<typeof FeatureCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

// Tall window: the full static list (what most windows show).
export const List: Story = {
  args: { compact: false },
};

// Short window (≤ 750px tall): one item, auto-rotating every few seconds.
export const Compact: Story = {
  args: { compact: true },
};
