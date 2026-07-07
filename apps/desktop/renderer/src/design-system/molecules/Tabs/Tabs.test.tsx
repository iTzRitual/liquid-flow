import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Tabs } from './Tabs';

function Fixture() {
  return (
    <Tabs defaultValue="log">
      <Tabs.List>
        <Tabs.Tab value="log">Aktywność</Tabs.Tab>
        <Tabs.Tab value="git">Git</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="log">Panel aktywności</Tabs.Panel>
      <Tabs.Panel value="git">Panel git</Tabs.Panel>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('renders tabs and the default panel', () => {
    render(<Fixture />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByText('Panel aktywności')).toBeVisible();
  });

  it('switches panel on tab click', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByRole('tab', { name: 'Git' }));
    expect(screen.getByText('Panel git')).toBeVisible();
  });
});
