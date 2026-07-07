import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Zap, Shuffle } from '../../foundations/icons';
import { FeatureList } from './FeatureList';

describe('FeatureList', () => {
  it('renders one entry per feature', () => {
    render(
      <FeatureList
        features={[
          { icon: Zap, title: 'Hot-reload', description: 'Natychmiastowa synchronizacja' },
          { icon: Shuffle, title: 'Konflikty', description: 'Porównanie wersji' },
        ]}
      />,
    );
    expect(screen.getByText('Hot-reload')).toBeInTheDocument();
    expect(screen.getByText('Konflikty')).toBeInTheDocument();
  });
});
