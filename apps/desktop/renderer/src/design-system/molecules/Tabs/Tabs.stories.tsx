import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Tabs } from './Tabs';
import { Lightbulb, GitBranch, Frown } from '../../foundations/icons';

const meta = {
  title: 'Molecules/Tabs',
  component: Tabs,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Segmented: Story = {
  render: () => (
    <Tabs defaultValue="log">
      <Tabs.List>
        <Tabs.Tab value="log">
          <Lightbulb className="h-4 w-4" /> Aktywność
        </Tabs.Tab>
        <Tabs.Tab value="git">
          <GitBranch className="h-4 w-4" /> Git/Backup
        </Tabs.Tab>
        <Tabs.Tab value="conflicts">
          <Frown className="h-4 w-4" /> Konflikty (0)
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="log">Panel aktywności</Tabs.Panel>
      <Tabs.Panel value="git">Panel Git/Backup</Tabs.Panel>
      <Tabs.Panel value="conflicts">Brak konfliktów</Tabs.Panel>
    </Tabs>
  ),
};
