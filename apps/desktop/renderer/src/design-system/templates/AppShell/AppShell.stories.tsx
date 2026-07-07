import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { AppShell } from './AppShell';

const meta = {
  title: 'Templates/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ height: 480 }}><Story /></div>],
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoColumn: Story = {
  args: {
    sidebar: (
      <div className="flex h-full w-72 items-center justify-center bg-surface-base font-ui text-[13px] text-text-secondary">
        sidebar
      </div>
    ),
    children: (
      <div className="flex h-full items-center justify-center font-ui text-[13px] text-text-secondary">
        obszar główny
      </div>
    ),
  },
};
