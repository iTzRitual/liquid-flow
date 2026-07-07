import React from "react";
import { useApp } from "../../App.jsx";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar.jsx";
import { Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Design-gallery redesign of the shop list sidebar: a shop monogram, name and
// URL, and a single "add shop" action in the footer. It reads the same shop
// state as the shell's Sidebar so it can later replace it directly, but for
// now only the "connect to an existing shop" flow is wired — session
// management (disconnect/export/import) still lives on the current sidebar.
export default function Sidebar() {
    const { t, shops, currentShop, navigate } = useApp();

    return (
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card/30">
            {/* pt-12 clears the mac traffic-light overlay from WindowChrome —
                this screen has no TopBar reserving that space itself. */}
            <div className="px-4 pb-4 pt-12">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.Shops}
                </span>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
                {shops.length === 0 && (
                    <p className="px-1 py-4 text-xs text-muted-foreground">
                        {t.NoShopsAddFirst}
                    </p>
                )}
                {shops.map((shop) => {
                    const active = currentShop && currentShop.Id === shop.Id;
                    return (
                        <button
                            key={shop.Id}
                            type="button"
                            onClick={() =>
                                navigate("shopForm", { editing: shop })
                            }
                            className={cn(
                                "no-drag flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                                active
                                    ? "bg-primary/10 ring-1 ring-primary/40"
                                    : "hover:bg-accent",
                            )}
                        >
                            <Avatar name={shop.Name} />
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1 truncate font-medium leading-tight">
                                    <span className="truncate">
                                        {shop.Name}
                                    </span>
                                    {active && (
                                        <Check className="h-3 w-3 shrink-0 text-primary" />
                                    )}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                    {shop.Url}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="border-t border-border p-3">
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
