import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Przełącznik z etykietą obok (np. "Zapamiętaj hasło"). Czysto prezentacyjny.
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
