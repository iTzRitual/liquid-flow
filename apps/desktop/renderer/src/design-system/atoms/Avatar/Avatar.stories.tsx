import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Avatar } from './Avatar';

const meta = {
  title: 'Atoms/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
  args: { name: 'Ogródek Dziadunia' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SingleWord: Story = { args: { name: 'Topaz' } };
export const Empty: Story = { args: { name: '' } };
