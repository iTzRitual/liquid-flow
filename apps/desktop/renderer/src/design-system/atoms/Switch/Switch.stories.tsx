import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Switch } from './Switch';

const meta = {
  title: 'Atoms/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = { args: { defaultChecked: false } };
export const On: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };

export const WithLabel: Story = {
  render: () => (
    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
      <Switch defaultChecked />
      <span style={{ fontFamily: 'Inter', fontSize: 14 }}>Zapamiętaj hasło</span>
    </label>
  ),
};
