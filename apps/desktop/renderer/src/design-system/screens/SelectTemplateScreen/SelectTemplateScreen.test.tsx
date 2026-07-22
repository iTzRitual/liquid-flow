import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SelectTemplateScreen, type SelectTemplateScreenProps } from './SelectTemplateScreen';

const base: SelectTemplateScreenProps = {
  shops: [
    { Id: 'a', Name: 'Sklep A', Url: 'https://a.example.com' },
    { Id: 'b', Name: 'Sklep B', Url: 'https://b.example.com' },
  ],
  currentShopId: 'a',
  templates: [
    { Id: 1, Name: 'Topaz' },
    { Id: 2, Name: 'One Page Shop', Locked: true },
  ],
  labels: {
    shops: 'Sklepy',
    addShop: 'Dodaj sklep',
    heading: 'Wybierz szablon',
    collapseSidebar: 'Zwiń panel boczny',
    expandSidebar: 'Rozwiń panel boczny',
  },
};

describe('SelectTemplateScreen', () => {
  it('renders the heading, shops and templates', () => {
    render(<SelectTemplateScreen {...base} />);
    expect(screen.getByRole('heading', { name: 'Wybierz szablon' })).toBeInTheDocument();
    expect(screen.getByText('Sklep A')).toBeInTheDocument();
    expect(screen.getByText('Topaz [1]')).toBeInTheDocument();
  });

  it('wires template selection and shop switching', async () => {
    const onSelectTemplate = vi.fn();
    const onSelectShop = vi.fn();
    render(<SelectTemplateScreen {...base} onSelectTemplate={onSelectTemplate} onSelectShop={onSelectShop} />);
    await userEvent.click(screen.getByText('Topaz [1]'));
    expect(onSelectTemplate).toHaveBeenCalledWith(base.templates[0]);
    await userEvent.click(screen.getByRole('button', { name: /Sklep B/ }));
    expect(onSelectShop).toHaveBeenCalledWith(base.shops[1]);
  });

  it('collapses the shop rail and reopens it with the floating button', async () => {
    render(<SelectTemplateScreen {...base} />);
    expect(screen.getByRole('button', { name: /Sklep A/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Zwiń panel boczny' }));
    expect(screen.queryByRole('button', { name: /Sklep A/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Rozwiń panel boczny' }));
    expect(screen.getByRole('button', { name: /Sklep A/ })).toBeInTheDocument();
  });

  it('starts collapsed when defaultSidebarCollapsed is set', () => {
    render(<SelectTemplateScreen {...base} defaultSidebarCollapsed />);
    expect(screen.queryByRole('button', { name: /Sklep A/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rozwiń panel boczny' })).toBeInTheDocument();
  });
});
