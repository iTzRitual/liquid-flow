import React from "react";
import OrDivider from "./OrDivider.jsx";

export default {
    title: "Components/OrDivider",
    component: OrDivider,
    args: { label: "lub" },
    decorators: [
        (Story) => (
            <div className="w-full max-w-sm">
                <Story />
            </div>
        ),
    ],
};

export const Default = {};
