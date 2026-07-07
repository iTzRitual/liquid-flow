import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { OrDivider } from './OrDivider';

const meta = {
  title: 'Molecules/OrDivider',
  component: OrDivider,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof OrDivider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const CustomLabel: Story = { args: { label: 'albo' } };
