import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// A toggle with a label alongside (e.g. "Remember password"). Purely presentational.
export default function SwitchField({ id, label, checked, onCheckedChange }) {
    return (
        <div className="flex items-center gap-2">
            <Switch
                id={id}
                checked={checked}
                onCheckedChange={onCheckedChange}
            />
            <Label htmlFor={id} className="cursor-pointer">
                {label}
            </Label>
        </div>
    );
}
