import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Badge } from './Badge';
import { Check } from '../../foundations/icons';

const meta = {
  title: 'Atoms/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  args: { children: 'ID 3' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { variant: 'neutral', children: 'ID 3' } };
export const Success: Story = { args: { variant: 'success', children: 'Połączono' } };
export const SuccessSoft: Story = {
  args: {
    variant: 'successSoft',
    children: (
      <>
        <Check className="h-3 w-3" /> Brak konfliktów
      </>
    ),
  },
};
export const Warning: Story = { args: { variant: 'warning', children: '1 konflikt' } };

export const HeaderRow: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Badge variant="neutral">ID 3</Badge>
      <Badge variant="success">Połączono</Badge>
      <Badge variant="successSoft">
        <Check className="h-3 w-3" /> Brak konfliktów
      </Badge>
    </div>
  ),
};
