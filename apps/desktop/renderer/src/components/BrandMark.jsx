import React from "react";

// The "Liquid Flow" wordmark + an optional version number alongside.
export default function BrandMark({ version }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-primary to-65% bg-clip-text text-transparent">
                Liquid Flow
            </span>
            {version && (
                <span className="text-sm font-medium text-muted-foreground">
                    {version}
                </span>
            )}
        </div>
    );
}
