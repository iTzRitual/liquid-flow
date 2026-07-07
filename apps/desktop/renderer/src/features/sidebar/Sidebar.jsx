import React from "react";
import { useApp } from "../../App.jsx";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar.jsx";
import { Plus } from "lucide-react";

// Design-gallery redesign of the shop list sidebar: a shop monogram, name and
// URL, and a single "add shop" action in the footer. It reads the same shop
// state as the shell's Sidebar so it can later replace it directly, but for
// now only the "connect to an existing shop" flow is wired — session
// management (disconnect/export/import) still lives on the current sidebar.
// The panel has no background of its own — it sits on the screen's
// `bg-background`, with each shop rendered as a `bg-card` (white) tile so it
// reads as a surface floating on the page, matching the main content panel.
export default function Sidebar() {
    const { t, shops, navigate } = useApp();

    return (
        <aside className="flex w-64 shrink-0 flex-col">
            {/* pt-12 clears the mac traffic-light overlay from WindowChrome —
                this screen has no TopBar reserving that space itself. */}
            <div className="px-4 pb-3 pt-12">
                <span className="text-sm font-medium text-muted-foreground">
                    {t.Shops}
                </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
                {shops.length === 0 && (
                    <p className="px-1 py-4 text-xs text-muted-foreground">
                        {t.NoShopsAddFirst}
                    </p>
                )}
                {shops.map((shop) => (
                    <button
                        key={shop.Id}
                        type="button"
                        onClick={() => navigate("shopForm", { editing: shop })}
                        className="no-drag flex w-full items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left shadow-sm transition-shadow hover:shadow"
                    >
                        <Avatar name={shop.Name} />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold leading-tight">
                                {shop.Name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                                {shop.Url}
                            </span>
                        </span>
                    </button>
                ))}
            </div>
            <div className="p-3">
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("shopForm", { editing: null })}
                >
                    <Plus className="h-4 w-4" /> {t.ShopAdd}
                </Button>
            </div>
        </aside>
    );
}
