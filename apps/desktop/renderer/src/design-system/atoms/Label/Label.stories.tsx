import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Label } from './Label';

const meta = {
  title: 'Atoms/Label',
  component: Label,
  parameters: { layout: 'centered' },
  args: { children: 'Nazwa sklepu' },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
