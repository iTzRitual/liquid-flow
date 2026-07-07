import React from "react";
import { SystemWindow, systemArgTypes, systemArgs } from "./systemPreview.jsx";

// Windows window chrome: square min/max/close top-right. Pick the screen to
// preview inside via the `screen` control (see systemPreview.jsx for the
// registry).
export default {
    title: "Systems/Windows",
    parameters: { layout: "fullscreen" },
    argTypes: systemArgTypes,
    args: systemArgs,
    render: (args) => <SystemWindow platform="windows" {...args} />,
};

export const Onboarding = {};

export const SelectTemplate = {
    args: {
        width: 1180,
        height: 800,
        screen: "selectTemplate"
    }
};
