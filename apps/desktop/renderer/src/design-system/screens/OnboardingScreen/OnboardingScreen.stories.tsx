import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../foundations/theme.css';
import { Zap, Shuffle, PackageSearch } from '../../foundations/icons';
import { OnboardingScreen } from './OnboardingScreen';

const meta = {
  title: 'Screens/OnboardingScreen',
  component: OnboardingScreen,
  parameters: { layout: 'fullscreen' },
  // Fill the viewport height (like the legacy Screens/Onboarding story) so the
  // screen's h-full chain is exercised — a fixed pixel height would leave the
  // right-hand ContentSurface short of the canvas.
  decorators: [(Story) => <div style={{ height: '100vh' }}><Story /></div>],
  args: {
    appName: 'Liquid Flow',
    version: '0.9.166',
    tagline: 'Edytuj szablony lokalnie — zmiany lecą do sklepu w czasie rzeczywistym.',
    previewSrc: 'dashboard-preview.png',
    features: [
      { icon: Zap, title: 'Hot-reload na żywo', description: 'Zapisz plik — zmiana natychmiast trafia do sklepu.' },
      { icon: Shuffle, title: 'Wykrywanie konfliktów', description: 'Porównanie lokalne ↔ zdalne z jasnym wyborem wersji.' },
      { icon: PackageSearch, title: 'Automatyczne kopie', description: 'Każda zmiana wersjonowana w git.' },
    ],
    labels: {
      title: 'Dodaj sklep',
      shopName: 'Nazwa sklepu',
      url: 'Adres URL',
      password: 'Hasło',
      savePassword: 'Zapamiętaj hasło',
      submit: 'Dodaj i zaloguj',
      or: 'lub',
      import: 'Importuj konfigurację',
    },
  },
} satisfies Meta<typeof OnboardingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Busy: Story = {
  args: { busy: true },
};
