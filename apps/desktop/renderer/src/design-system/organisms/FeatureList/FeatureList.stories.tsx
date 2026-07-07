import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Zap, Shuffle, PackageSearch } from '../../foundations/icons';
import { FeatureList } from './FeatureList';

const meta = {
  title: 'Organisms/FeatureList',
  component: FeatureList,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ width: 380 }}><Story /></div>],
} satisfies Meta<typeof FeatureList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Onboarding: Story = {
  args: {
    features: [
      {
        icon: Zap,
        title: 'Hot-reload w czasie rzeczywistym',
        description: 'Zapisz plik lokalnie, a zmiana natychmiast trafia do sklepu.',
      },
      {
        icon: Shuffle,
        title: 'Wykrywanie konfliktów',
        description: 'Porównanie lokalne ↔ zdalne z jasnym wyborem, którą wersję zachować.',
      },
      {
        icon: PackageSearch,
        title: 'Automatyczne kopie zapasowe',
        description: 'Każda zmiana wersjonowana w git — bez ręcznych commitów.',
      },
    ],
  },
};
