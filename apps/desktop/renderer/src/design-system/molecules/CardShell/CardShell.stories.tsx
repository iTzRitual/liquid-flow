import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { CardShell } from './CardShell';
import { Text } from '../../atoms/Text';

const meta = {
  title: 'Molecules/CardShell',
  component: CardShell,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CardShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <CardShell className="w-80 p-5">
      <Text as="h3" variant="heading-md">Twoje Sklepy</Text>
      <Text as="p" variant="body-sm" tone="secondary" className="mt-1">
        Zawartość panelu.
      </Text>
    </CardShell>
  ),
};
