import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TemplateList } from './TemplateList';

const templates = [
  { Id: 1, Name: 'Topaz' },
  { Id: 2, Name: 'One Page Shop', Locked: true },
];

describe('TemplateList', () => {
  it('renders each template with its id', () => {
    render(<TemplateList templates={templates} />);
    expect(screen.getByText('Topaz [1]')).toBeInTheDocument();
    expect(screen.getByText('One Page Shop [2]')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked template', async () => {
    const onSelect = vi.fn();
    render(<TemplateList templates={templates} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Topaz [1]'));
    expect(onSelect).toHaveBeenCalledWith(templates[0]);
  });

  it('disables all rows while a selection is in flight', () => {
    render(<TemplateList templates={templates} selectingId={1} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('shows the empty label when there are no templates', () => {
    render(<TemplateList templates={[]} emptyLabel="Brak szablonów" />);
    expect(screen.getByText('Brak szablonów')).toBeInTheDocument();
  });
});
