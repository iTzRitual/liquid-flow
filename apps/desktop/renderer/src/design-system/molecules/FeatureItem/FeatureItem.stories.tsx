import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { FeatureItem } from './FeatureItem';
import { Zap, Shuffle, PackageSearch } from '../../foundations/icons';

const meta = {
  title: 'Molecules/FeatureItem',
  component: FeatureItem,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 380 }}><Story /></div>],
} satisfies Meta<typeof FeatureItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LiveLogging: Story = {
  args: {
    icon: Zap,
    title: 'Live Logging',
    description: 'Podgląd procesów synchronizacji i komunikacji SOAP w czasie rzeczywistym.',
  },
};

export const List: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <FeatureItem icon={Zap} title="Live Logging" description="Podgląd procesów w czasie rzeczywistym." />
      <FeatureItem icon={Shuffle} title="Bezpieczny Conflict Resolution" description="Wizualny panel diffów chroniący przed utratą danych." />
      <FeatureItem icon={PackageSearch} title="Gotowy do automatyzacji" description="Pełna kontrola nad strukturą szablonów." />
    </div>
  ),
};
