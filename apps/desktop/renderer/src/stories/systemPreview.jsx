import React from "react";
import WindowChrome from "../components/WindowChrome.jsx";
import Onboarding from "../components/Onboarding.jsx";
import SelectTemplate from "../components/SelectTemplate.jsx";
import { MockApp, shops, templates, mockApi } from "./mock.jsx";

// New design-system screens (prop-driven, no AppCtx) + their window frame.
import "../design-system/foundations/theme.css";
import { WindowChrome as DSWindowChrome } from "../design-system/templates/WindowChrome";
import { OnboardingScreen } from "../design-system/screens/OnboardingScreen";
import { SelectTemplateScreen } from "../design-system/screens/SelectTemplateScreen";
import { HubScreen } from "../design-system/screens/HubScreen";
import { Zap, Shuffle, PackageSearch } from "../design-system/foundations/icons";

// ————— Fixtures for the design-system screens —————
// The DS screens take plain props (labels + data), not AppCtx, so their preview
// data lives here rather than in a mock context.
const dsFeatures = [
    { icon: Zap, title: "Hot-reload na żywo", description: "Zapisz plik — zmiana natychmiast trafia do sklepu." },
    { icon: Shuffle, title: "Wykrywanie konfliktów", description: "Porównanie lokalne ↔ zdalne z jasnym wyborem wersji." },
    { icon: PackageSearch, title: "Automatyczne kopie", description: "Każda zmiana wersjonowana w git." },
];

const dsFileTree = [
    {
        name: "components",
        children: [
            { name: "mobile", children: [{ name: "mobile1.min.css" }, { name: "main.js" }] },
            { name: "header.liquid" },
            { name: "footer.liquid" },
        ],
    },
    { name: "css", children: [{ name: "layout.css" }, { name: "theme.css" }] },
    { name: "settings.liquid" },
    { name: "index.html" },
];

const dsLog = [
    { id: 6, time: "12:03:24", tone: "success", message: "Plik został zmieniony — layout.css" },
    { id: 5, time: "12:03:21", tone: "info", message: "Utworzono punkt kontrolny git" },
    { id: 4, time: "12:03:18", tone: "warning", message: "Sprawdzono niezgodności — 1 konflikt" },
    { id: 3, time: "12:00:03", tone: "success", message: "Pobrano 128 plików szablonu", muted: true },
    { id: 2, time: "12:00:02", tone: "info", message: "Połączono ze sklepem", muted: true },
];

const dsOnboardingLabels = {
    title: "Dodaj sklep",
    shopName: "Nazwa sklepu",
    url: "Adres URL",
    password: "Hasło",
    savePassword: "Zapamiętaj hasło",
    submit: "Dodaj i zaloguj",
    or: "lub",
    import: "Importuj konfigurację",
};

const dsSelectLabels = {
    shops: "Sklepy",
    addShop: "Dodaj sklep",
    heading: "Wybierz szablon",
    emptyShops: "Brak sklepów — dodaj pierwszy",
    emptyTemplates: "Brak szablonów w tym sklepie",
};

const dsHubLabels = {
    shops: "Sklepy",
    addShop: "Dodaj sklep",
    id: "ID",
    ok: "Brak konfliktów",
    openFolder: "Otwórz folder",
    openShop: "Otwórz sklep",
    refresh: "Odśwież",
    files: "Pliki",
    tabActivity: "Aktywność",
    tabConflicts: "Konflikty",
    tabGit: "Git-Backup",
    emptyLog: "Brak aktywności",
    placeholder: "Wkrótce",
};

// Which screen to preview inside the window chrome. Two kinds of entries:
//   • legacy (AppCtx-driven): `{ component, ctx }` rendered inside the legacy
//     WindowChrome via MockApp.
//   • design-system (prop-driven): `{ ds: true, element }` rendered inside the
//     DS WindowChrome, no MockApp needed.
// Shared across the per-OS system stories (Systems/macOS, Systems/Windows,
// Systems/Linux) so adding a future screen is just one more entry here.
export const SCREENS = {
    onboarding: {
        component: Onboarding,
        ctx: {
            shops: [],
            currentShop: null,
            currentTemplate: null,
            version: "0.9.151",
        },
    },
    selectTemplate: {
        component: SelectTemplate,
        ctx: {
            shops,
            currentShop: shops[0],
            currentTemplate: null,
            version: "0.9.151",
            api: mockApi({ listTemplates: async () => templates }),
        },
    },
    onboardingScreen: {
        ds: true,
        element: (
            <OnboardingScreen
                appName="Liquid Flow"
                version="0.9.168"
                tagline="Edytuj szablony lokalnie — zmiany lecą do sklepu w czasie rzeczywistym."
                features={dsFeatures}
                previewSrc="dashboard-preview.png"
                labels={dsOnboardingLabels}
            />
        ),
    },
    selectTemplateScreen: {
        ds: true,
        element: (
            <SelectTemplateScreen
                shops={shops}
                currentShopId={shops[0].Id}
                templates={templates}
                labels={dsSelectLabels}
            />
        ),
    },
    hubScreen: {
        ds: true,
        element: (
            <HubScreen
                shops={shops}
                currentShopId={shops[0].Id}
                templateName="Topaz — Główny"
                templateId={42}
                shopName={shops[0].Name}
                shopUrl="ogrodek.comarch.pl/sklep"
                conflictCount={3}
                fileTree={dsFileTree}
                logEntries={dsLog}
                labels={dsHubLabels}
            />
        ),
    },
};

// Renders the whole application window as a "floating" OS window over a desktop
// background, with the chosen screen inside. Width/height are driven by
// Storybook controls so layout can be checked against the Electron window's
// real bounds (default 1180x800, minWidth 900, minHeight 600 — see
// apps/desktop/electron/main.js createWindow()). `platform` is fixed per
// story file (Systems/macOS, Systems/Windows, Systems/Linux) — only the
// screen inside the window is a control.
export function SystemWindow({ platform, width, height, screen }) {
    const entry = SCREENS[screen];
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-300 to-slate-500 p-10 dark:from-slate-800 dark:to-slate-950">
            <div style={{ width, height }}>
                {entry.ds ? (
                    <DSWindowChrome platform={platform} title="Liquid Flow v0.9.178">
                        {entry.element}
                    </DSWindowChrome>
                ) : (
                    <MockApp ctx={entry.ctx}>
                        <WindowChrome platform={platform}>
                            {React.createElement(entry.component)}
                        </WindowChrome>
                    </MockApp>
                )}
            </div>
        </div>
    );
}

// Storybook's CSF indexer statically parses each file's default export, so it
// must be a literal object — a factory function returning one isn't
// analyzable ("CSF: default export must be an object"). This shared shape is
// spread into each Systems/* file's own object literal instead.
export const systemArgTypes = {
    width: { control: { type: "range", min: 900, max: 1600, step: 10 } },
    height: { control: { type: "range", min: 600, max: 1000, step: 10 } },
    screen: { control: { type: "select" }, options: Object.keys(SCREENS) },
};
export const systemArgs = { width: 1180, height: 800, screen: "onboarding" };
