import React from "react";
import { cn } from "@/lib/utils";

// Derives a two-letter monogram from a name: first letter of the first two
// words, or the first two letters when there's only a single word.
function initialsFor(name) {
    const words = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

// A round monogram avatar, used wherever a shop/user is represented without a
// real picture (e.g. the shop list in the sidebar).
export default function Avatar({ name, className }) {
    return (
        <span
            className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground",
                className,
            )}
        >
            {initialsFor(name)}
        </span>
    );
}
