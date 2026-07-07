import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { SwitchField } from './SwitchField';

const meta = {
  title: 'Molecules/SwitchField',
  component: SwitchField,
  parameters: { layout: 'centered' },
  args: { label: 'Zapamiętaj hasło' },
} satisfies Meta<typeof SwitchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
