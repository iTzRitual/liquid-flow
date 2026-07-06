import React from "react";

// Separator "lub" między dwiema akcjami formularza.
export default function OrDivider({ label }) {
    return (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {label}
            <span className="h-px flex-1 bg-border" />
        </div>
    );
}
