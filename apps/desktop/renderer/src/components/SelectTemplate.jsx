import React, { useEffect, useState } from "react";
import { useApp } from "../App.jsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Avatar from "./Avatar.jsx";
import { Check, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SelectTemplate() {
    const {
        t,
        shops,
        currentShop,
        api,
        call,
        navigate,
        setCurrentTemplate,
    } = useApp();
    const [templates, setTemplates] = useState(null);
    const [selectingId, setSelectingId] = useState(null);

    useEffect(() => {
        setTemplates(null);
        call(() => api.listTemplates())
            .then(setTemplates)
            .catch(() => setTemplates([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentShop && currentShop.Id]);

    const select = async (tpl) => {
        setSelectingId(tpl.Id);
        try {
            const res = await call(() => api.selectTemplate(tpl.Id));
            if (res.Locked) {
                navigate("unlock", { template: res });
            } else {
                setCurrentTemplate({ Id: res.Id, Name: res.Name });
                navigate("sync");
            }
        } catch {
            /* toast */
        } finally {
            setSelectingId(null);
        }
    };

    return (
        <div className="flex h-full overflow-hidden bg-background">
            {/* pt-12 clears the mac traffic-light overlay from WindowChrome —
                this screen has no TopBar reserving that space itself. */}
            <aside className="flex w-80 shrink-0 flex-col p-3 pt-12">
                <span className="px-1.5 pb-2 text-[13px] text-foreground/50">
                    {t.Shops}
                </span>

                <div className="flex-1 space-y-1.5 overflow-y-auto">
                    {shops.length === 0 && (
                        <p className="px-1.5 py-4 text-xs text-muted-foreground">
                            {t.NoShopsAddFirst}
                        </p>
                    )}
                    {shops.map((shop) => {
                        const active =
                            currentShop && currentShop.Id === shop.Id;
                        return (
                            <button
                                key={shop.Id}
                                type="button"
                                onClick={() =>
                                    navigate("shopForm", { editing: shop })
                                }
                                className={cn(
                                    "no-drag flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors",
                                    active
                                        ? "bg-[#e7e7e7]"
                                        : "hover:bg-[#e7e7e7]/60",
                                )}
                            >
                                <Avatar name={shop.Name} />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1 truncate text-sm leading-tight text-foreground/80">
                                        <span className="truncate">
                                            {shop.Name}
                                        </span>
                                        {active && (
                                            <Check className="h-3 w-3 shrink-0 text-primary" />
                                        )}
                                    </span>
                                    <span className="block truncate text-[10px] font-light text-foreground/80">
                                        {shop.Url.replace(/^https?:\/\//, "")}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={() => navigate("shopForm", { editing: null })}
                    className="no-drag rounded-lg border border-border p-3 text-center text-sm text-foreground"
                >
                    {t.ShopAdd}
                </button>
            </aside>

            <div className="min-w-0 flex-1 overflow-hidden px-2 pb-2 pt-2">
                <div className="flex h-full items-center justify-center overflow-y-auto rounded-2xl bg-card p-8 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_0_16px_rgba(0,0,0,0.08)]">
                    <div className="w-full max-w-2xl space-y-6">
                        <h1 className="text-2xl font-semibold text-foreground/80">
                            {t.SelectTemplateHeading}
                        </h1>

                        {templates === null && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                …
                            </div>
                        )}
                        {templates && templates.length === 0 && (
                            <p className="text-muted-foreground">
                                {t.NoTemplatesInShop}
                            </p>
                        )}

                        <div className="space-y-2.5">
                            {templates?.map((tpl) => (
                                <button
                                    key={tpl.Id}
                                    type="button"
                                    onClick={() =>
                                        !selectingId && select(tpl)
                                    }
                                    disabled={!!selectingId}
                                    className={cn(
                                        "no-drag flex h-14 w-full items-center justify-between rounded-[4px] bg-[#e7e7e7] px-3 text-sm text-foreground/80 transition-opacity",
                                        selectingId === tpl.Id && "opacity-60",
                                    )}
                                >
                                    <span className="truncate">
                                        {tpl.Name} [{tpl.Id}]
                                    </span>
                                    <span className="flex shrink-0 items-center gap-2">
                                        {tpl.Locked && (
                                            <Badge
                                                variant="warning"
                                                className="gap-1"
                                            >
                                                <Lock className="h-3 w-3" />
                                            </Badge>
                                        )}
                                        {selectingId === tpl.Id && (
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        )}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
