import React from "react";
import Sidebar from "./Sidebar.jsx";
import { MockApp } from "../../stories/mock.jsx";

export default {
    title: "Features/Sidebar",
    component: Sidebar,
    parameters: { layout: "fullscreen" },
    decorators: [
        (Story, c) => (
            <MockApp ctx={c.parameters.ctx || {}}>
                <div style={{ height: "100vh" }}>
                    <Story />
                </div>
            </MockApp>
        ),
    ],
};

export const Default = {};

export const Empty = {
    parameters: { ctx: { shops: [], currentShop: null } },
};
