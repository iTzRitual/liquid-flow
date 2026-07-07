import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { Button } from "@/components/ui/button";
import BrandMark from "./BrandMark.jsx";
import FeatureCarousel from "./FeatureCarousel.jsx";
import FormField from "./FormField.jsx";
import SwitchField from "./SwitchField.jsx";
import OrDivider from "./OrDivider.jsx";
import { Loader2, Zap, Shuffle, PackageCheck } from "lucide-react";

export default function Onboarding() {
    const {
        t,
        version,
        call,
        api,
        refreshShops,
        navigate,
        setCurrentTemplate,
    } = useApp();
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [password, setPassword] = useState("");
    const [savePassword, setSavePassword] = useState(true);
    const [busy, setBusy] = useState(false);

    const nameValid = /^[A-Za-z0-9]+$/.test(name);
    const urlValid =
        /^https:\/\/.+$/.test(url) || /^http:\/\/localhost:\d+.*$/.test(url);
    const canSubmit = nameValid && urlValid && password.length > 0 && !busy;

    const submit = async () => {
        setBusy(true);
        try {
            await call(() =>
                api.signInShop({
                    Name: name,
                    Url: url,
                    Password: password,
                    SavePassword: savePassword,
                }),
            );
            await refreshShops();
            setCurrentTemplate(null);
            navigate("templates");
        } catch {
        } finally {
            setBusy(false);
        }
    };

    const features = [
        { icon: Zap, title: t.FeatureLoggingTitle, desc: t.FeatureLoggingDesc },
        {
            icon: Shuffle,
            title: t.FeatureConflictTitle,
            desc: t.FeatureConflictDesc,
        },
        {
            icon: PackageCheck,
            title: t.FeatureAutomationTitle,
            desc: t.FeatureAutomationDesc,
        },
    ];

    return (
        <div className="flex h-full overflow-hidden bg-background">
            {/* shrink-to-fit, not a 50/50 split: this column only ever takes
                as much width as its max-w-md content needs (see below), and
                md:max-w-[50%] is just a ceiling for narrow windows so it
                never crowds out the form on the right. */}
            <div className="hidden shrink-0 overflow-hidden p-10 md:flex md:max-w-[50%]">
                {/* Capped at max-w-md so the whole block (and the dashboard
                    image inside it) stays a fixed size instead of stretching
                    as the window gets wider. h-full + justify-center lets it
                    center in extra vertical space same as before, but once
                    the window gets too short for everything to fit, the
                    image (min-h-0 + shrink, unlike the shrink-0 text/features
                    around it) is the one that gives: its aspect-[1024/728]
                    box shrinks in height, and — since self-center opts it out
                    of the column's default full-width stretch — the auto
                    width shrinks to match via the same aspect-ratio, so the
                    border always hugs the picture instead of the box staying
                    full width with empty space letterboxed inside it. */}
                <div className="flex h-full w-full max-w-md flex-col justify-center gap-8">
                    <div className="shrink-0 space-y-4">
                        <BrandMark version={version} />
                        <p className="max-w-md text-lg font-semibold leading-snug text-foreground/90">
                            {t.AppTagline}
                        </p>
                    </div>

                    <div
                        className="aspect-[1024/728] w-auto min-h-0 shrink self-center overflow-hidden rounded-xl border bg-background/60 shadow-sm"
                        aria-hidden
                    >
                        <img
                            src="dashboard-preview.png"
                            alt="Liquid Flow Dashboard Preview"
                            className="h-full w-full object-contain"
                        />
                    </div>

                    <div className="shrink-0">
                        <FeatureCarousel features={features} />
                    </div>
                </div>
            </div>

            <div className="min-w-0 flex-1 overflow-hidden px-2 pb-2 pt-2">
                <div className="flex h-full items-center justify-center overflow-y-auto rounded-2xl bg-card p-8 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_0_16px_rgba(0,0,0,0.08)]">
                    <div className="w-full max-w-sm space-y-6">
                        <h1 className="text-2xl text-center font-bold">
                            {t.OnboardTitle}
                        </h1>

                        <div className="space-y-4">
                            <FormField
                                id="shopName"
                                label={t.ShopName}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="MójSklep"
                                error={
                                    !nameValid && name.length > 0
                                        ? `${t.InvalidName_AllowedChars} A-Za-z0-9`
                                        : undefined
                                }
                            />

                            <FormField
                                id="shopUrl"
                                label={t.Url}
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://"
                                error={
                                    !urlValid && url.length > 0
                                        ? t.SSL_Required
                                        : undefined
                                }
                            />

                            <FormField
                                id="shopPassword"
                                label={t.Password}
                                type="password"
                                value={password}
                                placeholder="********"
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && canSubmit)
                                        submit();
                                }}
                            />

                            <SwitchField
                                id="savePwd"
                                label={t.SavePassword}
                                checked={savePassword}
                                onCheckedChange={setSavePassword}
                            />
                        </div>

                        <Button
                            className="w-full"
                            onClick={submit}
                            disabled={!canSubmit}
                        >
                            {busy && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                            {t.OnboardAddAndSignIn}
                        </Button>

                        <OrDivider label={t.OrSeparator} />

                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => navigate("shopImport")}
                        >
                            {t.OnboardImportConfig}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
