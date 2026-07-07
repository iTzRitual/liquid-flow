import React from "react";
import WindowChrome from "./WindowChrome.jsx";
import Onboarding from "./Onboarding.jsx";
import { MockApp } from "../stories/mock.jsx";

const ctx = {
    shops: [],
    currentShop: null,
    currentTemplate: null,
    version: "0.9.151",
};

// Renders the whole application window as a "floating" OS window over a desktop
// background, with the onboarding screen inside. Width/height are driven by
// Storybook controls so layout can be checked against the Electron window's
// real bounds (default 1180x800, minWidth 900, minHeight 600 — see
// apps/desktop/electron/main.js createWindow()).
function AppWindow({ platform, width, height }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-300 to-slate-500 p-10 dark:from-slate-800 dark:to-slate-950">
            <div style={{ width, height }}>
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
    title: "Screens/Window Chrome",
    component: WindowChrome,
    parameters: { layout: "fullscreen" },
    argTypes: {
        width: {
            control: { type: "range", min: 900, max: 1600, step: 10 },
        },
        height: {
            control: { type: "range", min: 600, max: 1000, step: 10 },
        },
    },
    args: { width: 1180, height: 800 },
};

export const MacOS = {
    render: (args) => <AppWindow platform="mac" {...args} />,
};
export const Windows = {
    render: (args) => <AppWindow platform="windows" {...args} />,
};
export const Linux = {
    render: (args) => <AppWindow platform="linux" {...args} />,
};
