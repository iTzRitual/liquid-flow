import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ActivityLog } from './ActivityLog';

describe('ActivityLog', () => {
  it('renders each entry as a log row', () => {
    render(
      <ActivityLog
        entries={[
          { id: 1, time: '12:00:01', tone: 'success', message: 'Połączono' },
          { id: 2, time: '12:00:02', tone: 'info', message: 'Pobrano pliki' },
        ]}
      />,
    );
    expect(screen.getByText('Połączono')).toBeInTheDocument();
    expect(screen.getByText('Pobrano pliki')).toBeInTheDocument();
  });

  it('shows the empty label when there are no entries', () => {
    render(<ActivityLog entries={[]} emptyLabel="Brak aktywności" />);
    expect(screen.getByText('Brak aktywności')).toBeInTheDocument();
  });
});
