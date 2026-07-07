import React from "react";
import TemplateListItem from "./TemplateListItem.jsx";

export default {
    title: "Components/Template List Item",
    component: TemplateListItem,
    parameters: { layout: "padded" },
    render: (args) => (
        <div className="max-w-sm">
            <TemplateListItem {...args} />
        </div>
    ),
};

export const Default = {
    args: { template: { Id: 1, Name: "Topaz 2024.10.2" } },
};
export const Locked = {
    args: { template: { Id: 7, Name: "One Page Shop 2023.5", Locked: true } },
};
export const Selecting = {
    args: { template: { Id: 1, Name: "Topaz 2024.10.2" }, selecting: true },
};
