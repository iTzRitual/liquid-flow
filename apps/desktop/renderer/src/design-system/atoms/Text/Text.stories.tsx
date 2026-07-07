import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Text } from './Text';

const meta = {
  title: 'Atoms/Text',
  component: Text,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

const roles = [
  'display-2xl', 'heading-xl', 'heading-lg', 'heading-md',
  'body-md', 'body-sm', 'label-md', 'caption-md', 'badge-xs',
] as const;

export const Scale: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {roles.map((r) => (
        <Text key={r} as="div" variant={r}>
          {r} — Liquid Flow
        </Text>
      ))}
    </div>
  ),
};

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Text variant="label-md" tone="primary">primary</Text>
      <Text variant="label-md" tone="secondary">secondary</Text>
      <Text variant="label-md" tone="muted">muted</Text>
    </div>
  ),
};
