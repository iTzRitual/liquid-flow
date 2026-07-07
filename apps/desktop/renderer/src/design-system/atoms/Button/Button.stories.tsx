import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Button } from './Button';
import { RefreshCw } from '../../foundations/icons';

const meta = {
  title: 'Atoms/Button',
  component: Button,
  parameters: { layout: 'centered' },
  args: { children: 'Przycisk' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'outline', 'ghost'] },
    size: { control: 'select', options: ['md', 'sm'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Small: Story = { args: { size: 'sm' } };

export const WithIcon: Story = {
  args: {
    variant: 'outline',
    children: (
      <>
        <RefreshCw className="h-4 w-4" /> Odśwież
      </>
    ),
  },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button variant="primary">Dodaj i zaloguj</Button>
      <Button variant="outline">Zaimportuj konfigurację</Button>
      <Button variant="ghost">Odśwież</Button>
    </div>
  ),
};
