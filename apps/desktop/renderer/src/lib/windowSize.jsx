import React, { createContext, useContext, useEffect, useState } from "react";

// Populated by WindowChrome via ResizeObserver when the app is rendered
// inside a mocked OS window (Storybook's Window Chrome story) whose size is
// set independently of the real browser viewport through story controls.
// null means "no mock in the tree" — fall back to the real window.
const WindowSizeContext = createContext(null);

export function WindowSizeProvider({ height, children }) {
    return (
        <WindowSizeContext.Provider value={height}>
            {children}
        </WindowSizeContext.Provider>
    );
}

// True once the effective window height (mocked, if WindowChrome is an
// ancestor — otherwise the real browser/Electron window) drops to or below
// maxHeight. Reactive to both the mock's ResizeObserver and real resizes.
export function useIsCompactWindow(maxHeight) {
    const observed = useContext(WindowSizeContext);
    const [viewportHeight, setViewportHeight] = useState(() =>
        typeof window !== "undefined" ? window.innerHeight : maxHeight + 1,
    );

    useEffect(() => {
        if (observed != null) return;
        const onResize = () => setViewportHeight(window.innerHeight);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [observed]);

    const height = observed ?? viewportHeight;
    return height <= maxHeight;
}
