import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { FormField } from './FormField';
import { Input } from '../../atoms/Input';

const meta = {
  title: 'Molecules/FormField',
  component: FormField,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 340 }}><Story /></div>],
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHint: Story = {
  render: () => (
    <FormField label="Nazwa sklepu" htmlFor="name" hint="Wprowadź dowolną nazwę dla lokalnej konfiguracji.">
      <Input id="name" placeholder="MójSklep" />
    </FormField>
  ),
};

export const WithError: Story = {
  render: () => (
    <FormField label="Url" htmlFor="url" error="Adres musi zaczynać się od https://">
      <Input id="url" defaultValue="sklep.pl" />
    </FormField>
  ),
};
