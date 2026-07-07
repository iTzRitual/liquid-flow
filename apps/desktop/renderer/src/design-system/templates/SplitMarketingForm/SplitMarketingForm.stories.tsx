import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { SplitMarketingForm } from './SplitMarketingForm';
import { ContentSurface } from '../ContentSurface';

const meta = {
  title: 'Templates/SplitMarketingForm',
  component: SplitMarketingForm,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ height: 560 }}><Story /></div>],
} satisfies Meta<typeof SplitMarketingForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Split: Story = {
  args: {
    marketing: (
      <div className="flex h-full flex-col justify-center gap-4 font-ui text-[13px] text-text-secondary">
        kolumna marketingowa
      </div>
    ),
    children: (
      <ContentSurface center className="p-8">
        <div className="w-full max-w-sm text-center font-ui text-[13px] text-text-secondary">
          karta formularza
        </div>
      </ContentSurface>
    ),
  },
};
