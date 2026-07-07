import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from './Sidebar';

const shops = [
  { Id: 'a', Name: 'Sklep A', Url: 'https://a.example.com' },
  { Id: 'b', Name: 'Sklep B', Url: 'https://b.example.com' },
];

describe('Sidebar', () => {
  it('marks the active shop with aria-current', () => {
    render(<Sidebar shops={shops} currentShopId="b" label="Sklepy" addLabel="Dodaj sklep" />);
    expect(screen.getByRole('button', { name: /Sklep B/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Sklep A/ })).not.toHaveAttribute('aria-current');
  });

  it('calls onSelectShop with the clicked shop', async () => {
    const onSelectShop = vi.fn();
    render(<Sidebar shops={shops} onSelectShop={onSelectShop} label="Sklepy" addLabel="Dodaj sklep" />);
    await userEvent.click(screen.getByRole('button', { name: /Sklep A/ }));
    expect(onSelectShop).toHaveBeenCalledWith(shops[0]);
  });

  it('calls onAddShop from the add action', async () => {
    const onAddShop = vi.fn();
    render(<Sidebar shops={shops} onAddShop={onAddShop} label="Sklepy" addLabel="Dodaj sklep" />);
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj sklep' }));
    expect(onAddShop).toHaveBeenCalledOnce();
  });

  it('shows the empty label when there are no shops', () => {
    render(<Sidebar shops={[]} label="Sklepy" addLabel="Dodaj sklep" emptyLabel="Brak sklepów" />);
    expect(screen.getByText('Brak sklepów')).toBeInTheDocument();
  });
});
