import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import FeatureItem from "./FeatureItem.jsx";
import { useIsCompactWindow } from "../lib/windowSize.jsx";

const ROTATE_MS = 3000;

// Below this window height the onboarding left panel (logo + tagline + image
// + 3 feature items, see Onboarding.jsx) no longer fits without the panel's
// overflow-hidden clipping it — so we swap the full list for a single item
// that rotates, keeping the panel readable at the Electron window's
// minHeight (600, see electron/main.js createWindow()).
const COMPACT_MAX_HEIGHT = 750;

export default function FeatureCarousel({ features }) {
    const compact = useIsCompactWindow(COMPACT_MAX_HEIGHT);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (!compact) return;
        setIndex(0);
        const id = setInterval(() => {
            setIndex((i) => (i + 1) % features.length);
        }, ROTATE_MS);
        return () => clearInterval(id);
    }, [compact, features.length]);

    if (!compact) {
        return (
            <ul className="space-y-5">
                {features.map((f) => (
                    <FeatureItem
                        key={f.title}
                        icon={f.icon}
                        title={f.title}
                        desc={f.desc}
                    />
                ))}
            </ul>
        );
    }

    const active = features[index];

    return (
        <div className="relative">
            {/* Invisible sizer: every item stacked in the same grid cell so the
                container's height is the tallest of the three (1- vs 2-line
                descriptions), keeping the rotation below from shifting the layout. */}
            <ul className="invisible grid" aria-hidden="true">
                {features.map((f) => (
                    <li
                        key={f.title}
                        className="col-start-1 row-start-1 flex items-start gap-3"
                    >
                        <f.icon className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold">{f.title}</p>
                            <p className="text-sm">{f.desc}</p>
                        </div>
                    </li>
                ))}
            </ul>

            <ul className="absolute inset-0">
                <AnimatePresence mode="wait">
                    <motion.li
                        key={active.title}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-start gap-3"
                    >
                        <active.icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
                        <div>
                            <p className="text-sm font-semibold">{active.title}</p>
                            <p className="text-sm text-muted-foreground">
                                {active.desc}
                            </p>
                        </div>
                    </motion.li>
                </AnimatePresence>
            </ul>
        </div>
    );
}
