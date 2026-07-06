import React from "react";

// An "or" separator between two form actions.
export default function OrDivider({ label }) {
    return (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {label}
            <span className="h-px flex-1 bg-border" />
        </div>
    );
}
