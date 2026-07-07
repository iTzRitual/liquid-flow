import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FormField } from './FormField';
import { Input } from '../../atoms/Input';

describe('FormField', () => {
  it('renders the label and hint', () => {
    render(
      <FormField label="Nazwa sklepu" htmlFor="name" hint="Podpowiedź">
        <Input id="name" />
      </FormField>,
    );
    expect(screen.getByText('Nazwa sklepu')).toBeInTheDocument();
    expect(screen.getByText('Podpowiedź')).toBeInTheDocument();
  });

  it('shows the error instead of the hint when both are given', () => {
    render(
      <FormField label="Url" htmlFor="url" hint="Podpowiedź" error="Błąd">
        <Input id="url" />
      </FormField>,
    );
    expect(screen.getByText('Błąd')).toBeInTheDocument();
    expect(screen.queryByText('Podpowiedź')).not.toBeInTheDocument();
  });
});
