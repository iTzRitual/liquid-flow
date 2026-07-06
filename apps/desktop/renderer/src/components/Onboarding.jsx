import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { Button } from "@/components/ui/button";
import BrandMark from "./BrandMark.jsx";
import FeatureItem from "./FeatureItem.jsx";
import FormField from "./FormField.jsx";
import SwitchField from "./SwitchField.jsx";
import OrDivider from "./OrDivider.jsx";
import { Loader2, Zap, Shuffle, PackageCheck } from "lucide-react";

// Ekran startowy (pierwsze uruchomienie): lewa kolumna = branding/hero,
// prawa = formularz „dodaj pierwszy sklep" + import konfiguracji.
// Iteracja 0 redesignu — stylowana na tokenach, dopieszczana w Storybooku.
// Kontrolki okna (WindowChrome) to overlay nad całą treścią — na Win/Linux
// (prawy górny róg) lądują bezpośrednio na białym kontenerze formularza,
// nad nagłówkiem `h1`; gutter górny jest taki sam jak reszta (bez zapasu).
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
            /* toast już pokazany */
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
        <div className="grid h-full grid-cols-1 overflow-hidden bg-background md:grid-cols-2">
            {/* Lewa kolumna — hero / branding (bezpośrednio na szarym tle okna) */}
            <div className="hidden flex-col justify-center gap-8 overflow-hidden p-10 md:flex">
                <div className="space-y-4">
                    <BrandMark version={version} />
                    <p className="max-w-md text-lg font-semibold leading-snug text-foreground/90">
                        {t.AppTagline}
                    </p>
                </div>

                {/* Placeholder podglądu aplikacji — do podmiany na realny screenshot */}
                <div
                    className=" overflow-hidden rounded-xl border bg-background/60 shadow-sm"
                    aria-hidden
                >
                    <img
                        src="dashboard-preview.png"
                        alt="Liquid Flow Dashboard Preview"
                        className="h-full w-full "
                    />
                </div>

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
            </div>

            {/* Prawa kolumna — formularz w osobnym białym kontenerze (gutter dookoła;
          na Win/Linux górny gutter mieści kontrolki okna, na macOS równy z bokami) */}
            <div className="overflow-hidden px-2 pb-2 pt-2">
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
