import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { WindowChrome } from './WindowChrome';

const meta = {
  title: 'Templates/WindowChrome',
  component: WindowChrome,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ width: 900, height: 560, padding: 24 }}><Story /></div>],
} satisfies Meta<typeof WindowChrome>;

export default meta;
type Story = StoryObj<typeof meta>;

const Fill = ({ label }: { label: string }) => (
  <div className="flex h-full w-full items-center justify-center bg-surface-base font-ui text-[14px] text-text-secondary">
    {label}
  </div>
);

export const Mac: Story = {
  args: { platform: 'mac', children: <Fill label="Obszar treści" /> },
};

export const Windows: Story = {
  args: { platform: 'win', children: <Fill label="Obszar treści" /> },
};

export const Linux: Story = {
  args: { platform: 'linux', children: <Fill label="Obszar treści" /> },
};
