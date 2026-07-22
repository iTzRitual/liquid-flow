import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Zap, Shuffle } from '../../foundations/icons';
import { FeatureCarousel } from './FeatureCarousel';

const features = [
  { icon: Zap, title: 'Alpha', description: 'a' },
  { icon: Shuffle, title: 'Beta', description: 'b' },
];

describe('FeatureCarousel', () => {
  it('renders every feature as a static list when not compact', () => {
    render(<FeatureCarousel features={features} compact={false} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('starts the rotation on the first feature when compact', () => {
    render(<FeatureCarousel features={features} compact />);
    // The invisible sizer keeps a copy of every title; the visible rotator
    // begins on the first item, so it appears in addition to the sizer copy.
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(1);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});
