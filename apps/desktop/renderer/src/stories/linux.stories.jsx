import React from "react";
import { SystemWindow, systemArgTypes, systemArgs } from "./systemPreview.jsx";

// Linux window chrome: rounded min/max/close top-right. Pick the screen to
// preview inside via the `screen` control (see systemPreview.jsx for the
// registry).
export default {
    title: "Systems/Linux",
    parameters: { layout: "fullscreen" },
    argTypes: systemArgTypes,
    args: systemArgs,
    render: (args) => <SystemWindow platform="linux" {...args} />,
};

export const Onboarding = {
    args: {
        screen: "onboarding"
    }
};

export const SelectTemplate = {
    args: {
        width: 1180,
        height: 800,
        screen: "selectTemplate"
    }
};
