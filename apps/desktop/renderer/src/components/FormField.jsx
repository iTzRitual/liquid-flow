import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// A form field: label + input + an optional validation error below.
// Purely presentational — all logic (state, validation, translations) comes from the outside via props.
export default function FormField({
    id,
    label,
    error,
    type = "text",
    ...inputProps
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} type={type} {...inputProps} />
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
