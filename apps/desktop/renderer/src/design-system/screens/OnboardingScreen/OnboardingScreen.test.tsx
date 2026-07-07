import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Zap } from '../../foundations/icons';
import { OnboardingScreen, type OnboardingScreenProps } from './OnboardingScreen';

const labels: OnboardingScreenProps['labels'] = {
  title: 'Dodaj sklep',
  shopName: 'Nazwa sklepu',
  url: 'Adres URL',
  password: 'Hasło',
  savePassword: 'Zapamiętaj hasło',
  submit: 'Dodaj i zaloguj',
  or: 'lub',
  import: 'Importuj konfigurację',
};

function setup(props: Partial<OnboardingScreenProps> = {}) {
  return render(
    <OnboardingScreen
      appName="Liquid Flow"
      version="0.9.166"
      tagline="Tagline"
      features={[{ icon: Zap, title: 'Hot-reload', description: 'opis' }]}
      labels={labels}
      {...props}
    />,
  );
}

describe('OnboardingScreen', () => {
  it('keeps submit disabled until every field is filled', async () => {
    setup();
    const submit = screen.getByRole('button', { name: 'Dodaj i zaloguj' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Nazwa sklepu'), 'MojSklep');
    await userEvent.type(screen.getByLabelText('Adres URL'), 'https://sklep.example.com');
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Hasło'), 'secret');
    expect(submit).toBeEnabled();
  });

  it('submits the collected values', async () => {
    const onSubmit = vi.fn();
    setup({ onSubmit });
    await userEvent.type(screen.getByLabelText('Nazwa sklepu'), 'MojSklep');
    await userEvent.type(screen.getByLabelText('Adres URL'), 'https://sklep.example.com');
    await userEvent.type(screen.getByLabelText('Hasło'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj i zaloguj' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'MojSklep',
      url: 'https://sklep.example.com',
      password: 'secret',
      savePassword: true,
    });
  });

  it('does not submit while busy', async () => {
    const onSubmit = vi.fn();
    setup({ onSubmit, busy: true });
    await userEvent.type(screen.getByLabelText('Nazwa sklepu'), 'MojSklep');
    await userEvent.type(screen.getByLabelText('Adres URL'), 'https://sklep.example.com');
    await userEvent.type(screen.getByLabelText('Hasło'), 'secret');
    expect(screen.getByRole('button', { name: 'Dodaj i zaloguj' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onImport from the import button', async () => {
    const onImport = vi.fn();
    setup({ onImport });
    await userEvent.click(screen.getByRole('button', { name: 'Importuj konfigurację' }));
    expect(onImport).toHaveBeenCalledOnce();
  });
});
