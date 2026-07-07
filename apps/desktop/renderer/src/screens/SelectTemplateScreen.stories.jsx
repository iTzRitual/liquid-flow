import React from "react";
import WindowChrome from "../components/WindowChrome.jsx";
import SelectTemplateScreen from "./SelectTemplateScreen.jsx";
import { MockApp, templates as templatesFixture } from "../stories/mock.jsx";

const ctx = {
    api: {
        listTemplates: async () => templatesFixture,
        selectTemplate: async (id) => templatesFixture.find((t) => t.Id === id),
    },
};

// Renders the screen as a floating OS window over a desktop background, the
// same treatment as Screens/Window Chrome, so the layout can be checked
// against the real Electron window bounds.
function AppWindow({ platform, width, height }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-300 to-slate-500 p-10 dark:from-slate-800 dark:to-slate-950">
            <div style={{ width, height }}>
                <MockApp ctx={ctx}>
                    <WindowChrome platform={platform}>
                        <SelectTemplateScreen />
                    </WindowChrome>
                </MockApp>
            </div>
        </div>
    );
}

export default {
    title: "Screens/Select Template",
    component: SelectTemplateScreen,
    parameters: { layout: "fullscreen" },
    argTypes: {
        width: { control: { type: "range", min: 900, max: 1600, step: 10 } },
        height: { control: { type: "range", min: 600, max: 1000, step: 10 } },
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
