import React from 'react';
import WindowChrome from './WindowChrome.jsx';
import Onboarding from './Onboarding.jsx';
import { MockApp } from '../stories/mock.jsx';

const ctx = { shops: [], currentShop: null, currentTemplate: null, version: '0.9.151' };

// Renderuje całe okno aplikacji jako „pływające" okno OS na tle pulpitu,
// z ekranem onboardingu w środku.
function AppWindow({ platform }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-300 to-slate-500 p-10 dark:from-slate-800 dark:to-slate-950">
      <div className="h-[80vh] max-h-[760px] w-full max-w-5xl">
        <MockApp ctx={ctx}>
          <WindowChrome platform={platform}>
            <Onboarding />
          </WindowChrome>
        </MockApp>
      </div>
    </div>
  );
}

export default {
  title: 'Ekrany/Okno aplikacji',
  component: WindowChrome,
  parameters: { layout: 'fullscreen' },
};

export const MacOS = { render: () => <AppWindow platform="mac" /> };
export const Windows = { render: () => <AppWindow platform="windows" /> };
export const Linux = { render: () => <AppWindow platform="linux" /> };
