import React from "react";
import { Loader2, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// A single row in a template list: name + id on the left, lock/loading status
// on the right. Selection is async (a SOAP round-trip), hence the `selecting`
// flag rather than a plain disabled state.
export default function TemplateListItem({ template, selecting, onSelect }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={selecting}
            className={cn(
                "no-drag flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:cursor-default",
                selecting && "opacity-60",
            )}
        >
            <span className="truncate font-medium">
                {template.Name}{" "}
                <span className="text-muted-foreground">
                    [{template.Id}]
                </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
                {template.Locked && (
                    <Badge variant="warning" className="gap-1">
                        <Lock className="h-3 w-3" />
                    </Badge>
                )}
                {selecting && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
            </span>
        </button>
    );
}
