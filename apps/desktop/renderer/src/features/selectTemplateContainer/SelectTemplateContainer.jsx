import React, { useEffect, useState } from "react";
import { useApp } from "../../App.jsx";
import { Loader2 } from "lucide-react";
import TemplateListItem from "@/components/TemplateListItem.jsx";

// The "pick a template to work on" step shown right after connecting to a
// shop: a plain list of the shop's templates, one click away from starting a
// sync session.
export default function SelectTemplateContainer() {
    const { t, api, call, navigate, currentShop, setCurrentTemplate } =
        useApp();
    const [templates, setTemplates] = useState(null);
    const [selecting, setSelecting] = useState(null);

    useEffect(() => {
        setTemplates(null);
        (async () => {
            try {
                setTemplates(await call(() => api.listTemplates()));
            } catch {
                setTemplates([]);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentShop && currentShop.Id]);

    const select = async (tpl) => {
        setSelecting(tpl.Id);
        try {
            const res = await call(() => api.selectTemplate(tpl.Id));
            if (res.Locked) {
                navigate("unlock", { template: res });
            } else {
                setCurrentTemplate({ Id: res.Id, Name: res.Name });
                navigate("sync");
            }
        } catch {
            /* toast is raised by call() */
        } finally {
            setSelecting(null);
        }
    };

    return (
        <div className="flex h-full items-center justify-center overflow-y-auto rounded-2xl bg-card p-8 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_0_16px_rgba(0,0,0,0.08)]">
            <div className="w-full max-w-2xl">
                <h2 className="mb-8 text-2xl font-bold">
                    {t.SelectTemplateHeading}
                </h2>

                {templates === null && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />{" "}
                        {t.LoadingTemplates}
                    </div>
                )}
                {templates && templates.length === 0 && (
                    <p className="text-muted-foreground">
                        {t.NoTemplatesInShop}
                    </p>
                )}

                <div className="space-y-4">
                    {templates?.map((tpl) => (
                        <TemplateListItem
                            key={tpl.Id}
                            template={tpl}
                            selecting={selecting === tpl.Id}
                            onSelect={() => !selecting && select(tpl)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
