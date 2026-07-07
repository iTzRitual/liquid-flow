import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { ContentSurface } from './ContentSurface';

const meta = {
  title: 'Templates/ContentSurface',
  component: ContentSurface,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ height: 480 }} className="bg-surface-app"><Story /></div>],
} satisfies Meta<typeof ContentSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Centered: Story = {
  args: {
    center: true,
    className: 'p-8',
    children: (
      <div className="w-full max-w-sm text-center font-ui text-[13px] text-text-secondary">
        wyśrodkowana treść w ramce na pełną wysokość
      </div>
    ),
  },
};

export const Filled: Story = {
  args: {
    children: (
      <>
        <div className="border-b border-border px-6 py-3 font-ui text-[14px] text-text-primary">nagłówek</div>
        <div className="flex flex-1 items-center justify-center font-ui text-[13px] text-text-secondary">
          treść wypełniająca ramkę
        </div>
      </>
    ),
  },
};
