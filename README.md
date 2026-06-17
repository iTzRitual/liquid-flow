# Liquid Sync — desktopowa aplikacja do Comarch e-Sklep

Wieloplatformowa (macOS / Windows / Linux) aplikacja desktopowa zastępująca
oryginalne narzędzie **Comarch e-Sklep Liquid Sync** (Windows-only, .NET).
Odtworzona metodą inżynierii wstecznej, z nowym interfejsem i dodatkowymi
funkcjami.

- **Hot-reload** — obserwuje lokalny folder szablonu; każdy zapis pliku trafia
  natychmiast do sklepu (SOAP `Liquid_FileSet` / `Liquid_FileAdd`).
- **Wykrywanie konfliktów** — gdy ktoś zmieni plik w panelu administracyjnym,
  aplikacja to wykryje i pozwoli **pobrać** najnowszą wersję lub **nadpisać**
  wersję w sklepie.
- **Wersjonowanie i kopie zapasowe (Git)** — folder szablonu jako repozytorium
  Git: auto-commit po każdej synchronizacji, historia, cofanie do dowolnej
  wersji i opcjonalny push na GitHub.
- **Nowy interfejs** — React + shadcn/ui, tryb ciemny, ikona w pasku menu (tray),
  synchronizacja działa w tle nawet po zamknięciu okna.

## Architektura

```
electron/        proces główny (okno, tray, IPC) + preload (bezpieczny mostek)
src/             backend (Node, reużyty z reverse engineeringu):
  soap.js          klient SOAP iSklep24Service.asmx (+ cookie sesji)
  syncEngine.js    obserwator plików, hot-reload, wykrywanie konfliktów
  store.js         konfiguracja, metadane, ścieżki (wieloplatformowe)
  git.js           wersjonowanie / backup / push
  controller.js    orkiestracja stanu (używana przez IPC)
  log.js, xml.js, translations.js
renderer/        interfejs React + Vite + Tailwind + shadcn/ui
```

Renderer rozmawia z backendem wyłącznie przez IPC (`window.api` z preload).
Wywołania do sklepu (SOAP) i operacje na plikach dzieją się w procesie głównym.

## Wymagania

- [Node.js](https://nodejs.org) 18+
- [Git](https://git-scm.com) — opcjonalnie, tylko dla funkcji wersjonowania/backupu

## Uruchomienie (tryb deweloperski)

```bash
npm install     # raz
npm run dev     # Vite + Electron z hot-reloadem interfejsu
```

## Budowanie aplikacji (instalator / paczka)

```bash
npm run build         # bieżący system
npm run build:mac     # .dmg + .zip (macOS)
npm run build:win     # instalator .exe (Windows)
npm run build:linux   # .AppImage (Linux)
```

Wynik trafia do katalogu `release/`. Powstaje pełnoprawna aplikacja z ikoną
(Dock / pasek zadań) i ikoną w tray — bez `run.command` i bez Parallels.

## Jak używać

1. **Dodaj sklep** (+ w panelu bocznym) — nazwa, URL (`https://...` lub
   `http://localhost:port`), hasło webmastera. Login zawsze `webmaster`.
2. **Wybierz szablon (skórkę)**. Zablokowane hasłem poprosi o odblokowanie.
3. Pliki szablonu zostaną pobrane lokalnie i ruszy **synchronizacja na żywo**.
   Przycisk **„Otwórz folder lokalny"** otwiera katalog w menedżerze plików.
4. Zakładka **Pliki** pokazuje konflikty — dla każdego: Pobierz / Wyślij / Usuń,
   oraz zbiorcze Pobierz wszystko / Wyślij wszystko.
5. Zakładka **Log** — podgląd zdarzeń na żywo.
6. Zakładka **Git / Backup** — włącz wersjonowanie, ustaw auto-commit / auto-push,
   podłącz repozytorium GitHub, przeglądaj historię i przywracaj wersje.

## Gdzie są pliki

Katalog danych aplikacji (wieloplatformowy):

- **macOS**: `~/Library/Application Support/Liquid Sync/`
- **Windows**: `%APPDATA%\Liquid Sync\`
- **Linux**: `~/.config/liquid-sync/` (lub `$XDG_CONFIG_HOME`)

Struktura: `Shops/<NazwaSklepu>/files/<TemplateId>/<Mode>/...` — to tutaj
edytujesz pliki szablonu. `meta/` przechowuje znaczniki czasu do wykrywania
konfliktów, a (po włączeniu) `.git/` historię wersji.

## Git / GitHub — uwierzytelnianie

Push korzysta z systemowej konfiguracji Git: klucza SSH (`git@github.com:...`)
albo menedżera poświadczeń / tokenu w URL HTTPS. Aplikacja nie przechowuje
poświadczeń GitHub.

## Protokół (odtworzony 1:1 z oryginału)

SOAP `iSklep24Service.asmx`, namespace `http://www.icomarch24.pl/iSklep24`,
uwierzytelnianie `SignIn` + cookie sesji, operacje `Liquid_Get / FilesGet /
FilesMetaGet / FileSet / FileAdd / FileDelete / FileRename / FileIsValid /
Unlock`. Limity: nazwa ≤ 64 znaki, plik ≤ 519168 B, walidacja plików tekstowych.
