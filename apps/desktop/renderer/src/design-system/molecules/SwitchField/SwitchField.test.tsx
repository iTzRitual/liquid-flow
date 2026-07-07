import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SwitchField } from './SwitchField';

describe('SwitchField', () => {
  it('renders the label and a switch', () => {
    render(<SwitchField label="Zapamiętaj hasło" />);
    expect(screen.getByText('Zapamiętaj hasło')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('toggles the switch', async () => {
    const onCheckedChange = vi.fn();
    render(<SwitchField label="x" onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
