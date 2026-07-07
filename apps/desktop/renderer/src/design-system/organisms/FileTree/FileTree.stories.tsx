import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { FileTree, type FileTreeNode } from './FileTree';

const tree: FileTreeNode[] = [
  {
    name: 'components',
    children: [
      {
        name: 'mobile',
        children: [
          { name: 'mobile1.min.css' },
          { name: 'main.js' },
        ],
      },
      { name: 'header.liquid' },
      { name: 'footer.liquid' },
    ],
  },
  {
    name: 'css',
    children: [
      { name: 'layout.css' },
      { name: 'theme.css' },
    ],
  },
  { name: 'settings.liquid' },
  { name: 'index.html' },
];

const meta = {
  title: 'Organisms/FileTree',
  component: FileTree,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
  args: { nodes: tree },
} satisfies Meta<typeof FileTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TopLevelExpanded: Story = {
  args: { initialExpand: 'top' },
};

export const FullyExpanded: Story = {
  args: { initialExpand: 'all' },
};

export const Collapsed: Story = {
  args: { initialExpand: 'none' },
};
