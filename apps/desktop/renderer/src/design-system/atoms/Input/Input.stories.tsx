import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Input } from './Input';

const meta = {
  title: 'Atoms/Input',
  component: Input,
  parameters: { layout: 'centered' },
  args: { placeholder: 'https://' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Filled: Story = { args: { defaultValue: 'MójSklep' } };
export const Password: Story = { args: { type: 'password', defaultValue: 'secret42' } };
export const Disabled: Story = { args: { disabled: true, placeholder: 'Niedostępne' } };
