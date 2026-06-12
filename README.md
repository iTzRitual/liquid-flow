# Comarch e-Sklep Liquid Sync — wersja na macOS

Natywna (Node.js) reimplementacja narzędzia **Comarch e-Sklep Liquid Sync**,
działająca bezpośrednio na macOS — bez Parallels i bez Windowsa.

Odtworzona metodą inżynierii wstecznej oryginalnej aplikacji
`COMARCHeShopLiquidSync.exe` (.NET 4.8). Zachowuje ten sam protokół, ten sam
interfejs i to samo zachowanie:

- **Hot-reload** — obserwuje lokalny katalog projektu; gdy zapiszesz plik,
  natychmiast wysyła go do sklepu (SOAP `Liquid_FileSet` / `Liquid_FileAdd`).
- **Wykrywanie konfliktów** — jeśli ktoś zmieni plik w panelu administracyjnym
  sklepu, aplikacja wykryje rozbieżność i pozwoli **pobrać** najnowszą wersję
  lokalnie albo **wysłać (nadpisać)** wersję ze sklepu.
- **Ten sam interfejs** — oryginalny UI (AngularJS) wyodrębniony z `.exe`.

## Wymagania

- macOS
- [Node.js](https://nodejs.org) w wersji 18+ (`node --version`)
  Brak innych zależności — używa wyłącznie wbudowanych modułów Node.

## Uruchomienie

```bash
cd liquid-sync-mac
node src/index.js
```

albo dwuklik na **`run.command`** w Finderze (pierwszy raz: prawy przycisk → *Otwórz*).

Aplikacja wystartuje lokalny serwer i otworzy interfejs w przeglądarce pod
adresem `http://127.0.0.1:45678/`.

### Opcje

- `--no-browser` — nie otwieraj automatycznie przeglądarki.
- `--insecure` — pomiń weryfikację certyfikatu TLS (gdy sklep ma certyfikat
  self-signed na środowisku testowym). Można też ustawić `LIQUID_SYNC_INSECURE=1`.

## Jak używać

1. **Dodaj sklep** — podaj nazwę, adres URL sklepu (`https://...` lub
   `http://localhost:port` dla środowiska lokalnego) oraz hasło webmastera.
   Login to zawsze `webmaster` (jak w oryginale).
2. **Wybierz szablon (skórkę)** z listy. Jeśli szablon jest zablokowany hasłem,
   pojawi się ekran odblokowania.
3. Aplikacja pobierze wszystkie pliki szablonu do lokalnego katalogu i **zacznie
   synchronizację**. Edytuj pliki w swoim edytorze — każdy zapis trafia od razu
   do sklepu.
4. W sekcji **Pliki** zobaczysz konflikty. Dla każdego możesz:
   - **Pobierz** — ściągnij wersję ze sklepu do projektu lokalnego,
   - **Wyślij** — nadpisz wersję w sklepie wersją lokalną,
   - **Usuń** — usuń plik lokalnie lub w sklepie.
   Przyciski **Pobierz wszystko / Wyślij wszystko** działają zbiorczo.
5. **Otwórz folder lokalny** (link w nagłówku) otwiera katalog projektu w Finderze.

## Gdzie są pliki

```
~/Library/Application Support/LiquidSyncMac/
├── config.json                         # sklepy, język, port
├── .key                                # klucz do szyfrowania zapisanych haseł
└── Shops/<NazwaSklepu>/
    ├── files/<TemplateId>/<Mode>/...   # ← TUTAJ edytujesz pliki szablonu
    └── meta/<TemplateId>.json          # znaczniki czasu do wykrywania konfliktów
```

Katalog `files/<TemplateId>/<Mode>/` to ten, który obserwuje hot-reload.
`Mode` to numer trybu szablonu (jak w oryginale). Ścieżki plików odpowiadają
strukturze szablonu w sklepie.

## Architektura (co odtworzono z oryginału)

| Element | Oryginał (.exe) | Ta aplikacja |
|---|---|---|
| Web-service | SOAP `iSklep24Service.asmx`, ns `http://www.icomarch24.pl/iSklep24` | `src/soap.js` |
| Uwierzytelnianie | `SignIn` + `CookieContainer`, re-login co 8 h | `ISklep24Client` (cookie jar) |
| Obserwacja plików | `FileSystemWatcher`, debounce 333 ms | `fs.watch` + debounce 333 ms |
| Operacje | `Liquid_Get / FilesGet / FilesMetaGet / FileSet / FileAdd / FileDelete / FileRename / FileIsValid / Unlock` | identyczne |
| Wykrywanie konfliktów | porównanie `localts` / `remotets` | `src/syncEngine.js` |
| Limity | nazwa ≤ 64 zn., plik ≤ 519168 B, walidacja tekstu | identyczne |
| Interfejs | AngularJS (zasoby z `.exe`) | `web/` (te same pliki) |
| Serwer lokalny | `HttpListener`, port 45678 | `src/server.js` |

## Uwaga

Narzędzie do użytku własnego. Komunikuje się wyłącznie z Twoim sklepem Comarch
e-Sklep przez jego oficjalny web-service (ten sam, którego używa oryginał).
