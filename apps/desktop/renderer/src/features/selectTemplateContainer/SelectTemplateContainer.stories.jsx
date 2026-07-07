import React from "react";
import SelectTemplateContainer from "./SelectTemplateContainer.jsx";
import { MockApp, templates as templatesFixture } from "../../stories/mock.jsx";

// Fetches templates asynchronously (like the real screen will), so the
// gallery api stub needs its own listTemplates/selectTemplate rather than the
// generic no-op Proxy.
function apiFor(templates) {
    return {
        listTemplates: async () => templates,
        selectTemplate: async (id) => templates.find((t) => t.Id === id),
    };
}

export default {
    title: "Features/Select Template Container",
    component: SelectTemplateContainer,
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

export const Default = {
    parameters: { ctx: { api: apiFor(templatesFixture) } },
};

export const Loading = {
    parameters: { ctx: { api: apiFor(new Promise(() => {})) } },
};

export const Empty = {
    parameters: { ctx: { api: apiFor([]) } },
};
