import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FeatureItem } from './FeatureItem';
import { Zap } from '../../foundations/icons';

describe('FeatureItem', () => {
  it('renders the title and description', () => {
    render(<FeatureItem icon={Zap} title="Live Logging" description="Opis funkcji." />);
    expect(screen.getByText('Live Logging')).toBeInTheDocument();
    expect(screen.getByText('Opis funkcji.')).toBeInTheDocument();
  });
});
