import React from "react";
import Sidebar from "../features/sidebar/Sidebar.jsx";
import SelectTemplateContainer from "../features/selectTemplateContainer/SelectTemplateContainer.jsx";

// Full "pick a template" page: the shop sidebar plus the template list,
// composed the same way the real app shell lays out sidebar + main content.
export default function SelectTemplateScreen() {
    return (
        <div className="flex h-full overflow-hidden bg-background">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-hidden px-2 pb-2 pt-2">
                <SelectTemplateContainer />
            </main>
        </div>
    );
}
