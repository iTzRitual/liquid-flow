import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { LogRow } from './LogRow';

const meta = {
  title: 'Molecules/LogRow',
  component: LogRow,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ width: 520 }}><Story /></div>],
} satisfies Meta<typeof LogRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Feed: Story = {
  render: () => (
    <div>
      <LogRow time="12:03:21" tone="success" message="Plik został zmieniony - layout.css" />
      <LogRow time="12:03:21" tone="info" message="Utworzono punkt kontrolny git" />
      <LogRow time="12:03:21" tone="warning" message="Sprawdzono niezgodności - 1 konflikt" />
      <LogRow time="12:03:20" tone="success" message="Plik został zmieniony - layout2.css" muted />
      <LogRow time="12:03:20" tone="info" message="Utworzono punkt kontrolny git" muted />
    </div>
  ),
};
