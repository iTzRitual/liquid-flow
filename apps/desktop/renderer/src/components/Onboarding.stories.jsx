import React from 'react';
import Onboarding from './Onboarding.jsx';
import { MockApp } from '../stories/mock.jsx';

export default {
  title: 'Screens/Onboarding',
  component: Onboarding,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, c) => (
      <MockApp ctx={c.parameters.ctx || {}}>
        <div style={{ height: '100vh' }}>
          <Story />
        </div>
      </MockApp>
    ),
  ],
};

// Pierwsze uruchomienie — brak sklepów.
export const FirstRun = {
  parameters: { ctx: { shops: [], currentShop: null, currentTemplate: null, version: '0.9.150' } },
};
