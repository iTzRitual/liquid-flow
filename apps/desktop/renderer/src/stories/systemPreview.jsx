import React from "react";
import WindowChrome from "../components/WindowChrome.jsx";
import Onboarding from "../components/Onboarding.jsx";
import SelectTemplate from "../components/SelectTemplate.jsx";
import { MockApp, shops, templates, mockApi } from "./mock.jsx";

// Which screen to preview inside the window chrome, and the mock context each
// one needs to render meaningfully — shared across the per-OS system stories
// (Systems/macOS, Systems/Windows, Systems/Linux) so adding a future screen is
// just one more entry here.
export const SCREENS = {
    onboarding: {
        component: Onboarding,
        ctx: {
            shops: [],
            currentShop: null,
            currentTemplate: null,
            version: "0.9.151",
        },
    },
    selectTemplate: {
        component: SelectTemplate,
        ctx: {
            shops,
            currentShop: shops[0],
            currentTemplate: null,
            version: "0.9.151",
            api: mockApi({ listTemplates: async () => templates }),
        },
    },
};

// Renders the whole application window as a "floating" OS window over a desktop
// background, with the chosen screen inside. Width/height are driven by
// Storybook controls so layout can be checked against the Electron window's
// real bounds (default 1180x800, minWidth 900, minHeight 600 — see
// apps/desktop/electron/main.js createWindow()). `platform` is fixed per
// story file (Systems/macOS, Systems/Windows, Systems/Linux) — only the
// screen inside the window is a control.
export function SystemWindow({ platform, width, height, screen }) {
    const { component: Screen, ctx } = SCREENS[screen];
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-300 to-slate-500 p-10 dark:from-slate-800 dark:to-slate-950">
            <div style={{ width, height }}>
                <MockApp ctx={ctx}>
                    <WindowChrome platform={platform}>
                        <Screen />
                    </WindowChrome>
                </MockApp>
            </div>
        </div>
    );
}

// Storybook's CSF indexer statically parses each file's default export, so it
// must be a literal object — a factory function returning one isn't
// analyzable ("CSF: default export must be an object"). This shared shape is
// spread into each Systems/* file's own object literal instead.
export const systemArgTypes = {
    width: { control: { type: "range", min: 900, max: 1600, step: 10 } },
    height: { control: { type: "range", min: 600, max: 1000, step: 10 } },
    screen: { control: { type: "select" }, options: Object.keys(SCREENS) },
};
export const systemArgs = { width: 1180, height: 800, screen: "onboarding" };
