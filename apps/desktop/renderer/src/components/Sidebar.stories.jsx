import React from 'react';
import Sidebar from './Sidebar.jsx';
import { MockApp } from '../stories/mock.jsx';

export default {
  title: 'Ekrany/Sidebar',
  component: Sidebar,
  decorators: [
    (Story, c) => (
      <MockApp ctx={c.parameters.ctx || {}}>
        <div style={{ height: '100vh', width: 280 }}>
          <Story />
        </div>
      </MockApp>
    ),
  ],
};

export const Default = {};

export const Empty = {
  parameters: { ctx: { shops: [], currentShop: null, currentTemplate: null } },
};
