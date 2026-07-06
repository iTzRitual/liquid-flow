import React from "react";
import { Minus, Square, X } from "lucide-react";

// Bezramkowe okno aplikacji. Kontrolki NIE mają osobnego paska ani nazwy aplikacji
// — leżą jako overlay w rogu, bezpośrednio na treści (macOS: światła top-left,
// Windows/Linux: min/max/close top-right). Górna krawędź jest przeciągalna
// (niewidoczny `drag-region`). W Electronie łączy się to z `frame:false` + IPC.

function MacControls({ onMinimize, onMaximize, onClose }) {
    const dots = [
        { color: "#ff5f57", label: "close", on: onClose },
        { color: "#febc2e", label: "minimize", on: onMinimize },
        { color: "#28c840", label: "maximize", on: onMaximize },
    ];
    return (
        <div className="flex items-center gap-2">
            {dots.map((d) => (
                <button
                    key={d.label}
                    aria-label={d.label}
                    onClick={d.on}
                    className="h-3 w-3 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: d.color }}
                />
            ))}
        </div>
    );
}

function WinLinuxControls({ onMinimize, onMaximize, onClose, rounded }) {
    const base = `flex items-center justify-center text-muted-foreground transition-colors ${
        rounded
            ? "h-6 w-6 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
            : "h-6 w-6 rounded hover:bg-black/10 dark:hover:bg-white/10"
    }`;
    return (
        <div className="flex items-center gap-1">
            <button aria-label="minimize" onClick={onMinimize} className={base}>
                <Minus className="h-3.5 w-3.5" />
            </button>
            <button aria-label="maximize" onClick={onMaximize} className={base}>
                <Square className="h-3 w-3" />
            </button>
            <button
                aria-label="close"
                onClick={onClose}
                className={`${base} hover:!bg-[#e81123] hover:text-white`}
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

export default function WindowChrome({
    platform = "mac",
    children,
    onMinimize = () => {},
    onMaximize = () => {},
    onClose = () => {},
}) {
    const mac = platform === "mac";
    const handlers = { onMinimize, onMaximize, onClose };

    return (
        <div className="relative h-full w-full overflow-hidden rounded-3xl shadow-2xl">
            {/* Treść na całą powierzchnię okna */}
            <div className="h-full w-full">{children}</div>

            {/* Niewidoczny pasek do przeciągania okna */}
            <div className="drag-region pointer-events-auto absolute inset-x-0 top-0 z-10 h-9" />

            {/* Kontrolki jako overlay w rogu — bez paska, bez nazwy aplikacji */}
            <div
                className={`no-drag absolute top-0 z-20 flex items-center ${mac ? "left-0 p-4" : "right-0 p-3"}`}
            >
                {mac ? (
                    <MacControls {...handlers} />
                ) : (
                    <WinLinuxControls
                        {...handlers}
                        rounded={platform === "linux"}
                    />
                )}
            </div>
        </div>
    );
}
