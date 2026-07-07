import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { FileTreeRow } from './FileTreeRow';

const meta = {
  title: 'Molecules/FileTreeRow',
  component: FileTreeRow,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ width: 300 }}><Story /></div>],
} satisfies Meta<typeof FileTreeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tree: Story = {
  render: () => (
    <div>
      <FileTreeRow type="folder" name="components" expanded />
      <FileTreeRow type="folder" name="mobile" depth={1} expanded />
      <FileTreeRow type="file" name="mobile1.min.css" depth={2} />
      <FileTreeRow type="file" name="main.js" depth={2} />
      <FileTreeRow type="folder" name="css" />
      <FileTreeRow type="file" name="settings.liquid" />
      <FileTreeRow type="file" name="index.html" />
    </div>
  ),
};
