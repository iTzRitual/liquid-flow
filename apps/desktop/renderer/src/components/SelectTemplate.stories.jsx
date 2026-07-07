import React from 'react';
import SelectTemplate from './SelectTemplate.jsx';
import { MockApp, shops, templates, mockApi } from '../stories/mock.jsx';

const api = mockApi({ listTemplates: async () => templates });

export default {
  title: 'Screens/Select Template',
  component: SelectTemplate,
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

// One connected shop, its template list loaded.
export const Default = {
  parameters: {
    ctx: { shops, currentShop: shops[0], currentTemplate: null, api },
  },
};

// No shops yet — sidebar shows the empty-state hint instead of a shop card.
export const NoShops = {
  parameters: { ctx: { shops: [], currentShop: null, currentTemplate: null, api } },
};
