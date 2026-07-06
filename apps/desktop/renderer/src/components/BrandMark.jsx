import React from "react";

// Wordmark "Liquid Flow" + opcjonalny numer wersji obok.
export default function BrandMark({ version }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">
                Liquid
            </span>
            <span className="text-3xl font-extrabold tracking-tight text-primary">
                Flow
            </span>
            {version && (
                <span className="text-sm font-medium text-muted-foreground">
                    {version}
                </span>
            )}
        </div>
    );
}
