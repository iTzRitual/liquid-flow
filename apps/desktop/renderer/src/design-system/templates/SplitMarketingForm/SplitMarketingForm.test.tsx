import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SplitMarketingForm } from './SplitMarketingForm';

describe('SplitMarketingForm', () => {
  it('renders both the marketing and form slots', () => {
    render(
      <SplitMarketingForm marketing={<div>hero</div>}>
        <form>formularz</form>
      </SplitMarketingForm>,
    );
    expect(screen.getByText('hero')).toBeInTheDocument();
    expect(screen.getByText('formularz')).toBeInTheDocument();
  });
});
