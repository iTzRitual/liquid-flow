import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { TemplateList } from './TemplateList';

const templates = [
  { Id: 1, Name: 'Topaz 2024.10.2' },
  { Id: 2, Name: 'Topaz 2023.5' },
  { Id: 3, Name: 'One Page Shop 2024.1', Locked: true },
  { Id: 4, Name: 'Custom Liquid' },
];

const meta = {
  title: 'Organisms/TemplateList',
  component: TemplateList,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ width: 560 }}><Story /></div>],
  args: { templates },
} satisfies Meta<typeof TemplateList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selecting: Story = {
  args: { selectingId: 2 },
};

export const Empty: Story = {
  args: { templates: [], emptyLabel: 'Brak szablonów w tym sklepie' },
};
