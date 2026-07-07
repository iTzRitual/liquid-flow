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

// A round monogram avatar, used wherever a shop is represented without a
// real picture (currently just the shop card in SelectTemplate's sidebar).
export default function Avatar({ name, className }) {
    return (
        <span
            className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d9d9d9] text-sm font-semibold text-white",
                className,
            )}
        >
            {initialsFor(name)}
        </span>
    );
}
