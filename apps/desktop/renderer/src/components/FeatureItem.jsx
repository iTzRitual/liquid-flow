import React from "react";

// Pojedyncza pozycja cechy (ikona + tytuł + opis), np. w liście hero onboardingu.
export default function FeatureItem({ icon: Icon, title, desc }) {
    return (
        <li className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
            <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
        </li>
    );
}
