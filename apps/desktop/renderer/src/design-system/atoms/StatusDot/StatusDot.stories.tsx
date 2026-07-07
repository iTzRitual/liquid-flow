import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { StatusDot } from './StatusDot';

const meta = {
  title: 'Atoms/StatusDot',
  component: StatusDot,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof StatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <StatusDot tone="success" size="md" />
      <StatusDot tone="info" size="md" />
      <StatusDot tone="warning" size="md" />
      <StatusDot tone="error" size="md" />
      <StatusDot tone="neutral" size="md" />
    </div>
  ),
};
