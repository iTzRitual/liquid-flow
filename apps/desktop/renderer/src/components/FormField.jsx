import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Pole formularza: etykieta + input + opcjonalny błąd walidacji pod spodem.
// Czysto prezentacyjny — cała logika (stan, walidacja, tłumaczenia) przychodzi z zewnątrz przez propsy.
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
