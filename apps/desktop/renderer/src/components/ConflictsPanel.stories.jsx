import React from 'react';
import ConflictsPanel from './ConflictsPanel.jsx';
import { MockApp } from '../stories/mock.jsx';

export default {
  title: 'Ekrany/ConflictsPanel',
  component: ConflictsPanel,
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

export const WithConflicts = {};

export const NoConflicts = {
  parameters: { ctx: { mismatches: [] } },
};
