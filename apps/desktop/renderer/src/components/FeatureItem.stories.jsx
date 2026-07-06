import React from "react";
import { Zap, Shuffle, PackageCheck } from "lucide-react";
import FeatureItem from "./FeatureItem.jsx";

export default {
    title: "Components/FeatureItem",
    component: FeatureItem,
    decorators: [
        (Story) => (
            <ul className="w-full max-w-md space-y-5">
                <Story />
            </ul>
        ),
    ],
};

export const HotReload = {
    args: {
        icon: Zap,
        title: "Hot-reload na żywo",
        desc: "Zmiany lokalne trafiają do sklepu natychmiast.",
    },
};

export const ConflictDetection = {
    args: {
        icon: Shuffle,
        title: "Wykrywanie konfliktów",
        desc: "Porównanie znaczników czasu lokalnie i zdalnie.",
    },
};

export const AutoSync = {
    args: {
        icon: PackageCheck,
        title: "Automatyczna synchronizacja",
        desc: "Watcher pilnuje plików w tle.",
    },
};
