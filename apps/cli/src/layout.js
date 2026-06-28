// Czysta logika layoutu wysokości — degradacja nagłówka przy niskim oknie.
//
// Zasada: nagłówek ustępuje miejsca treści, gdy okno robi się niskie. Schodzimy
// po piętrach: pełny (logo) → compact (1 wiersz) → ukryty (modal „nachodzi" na
// nagłówek, jak position:absolute w webie — w terminalu nie ma z‑indexu, więc po
// prostu go nie renderujemy). Gdy nawet bez nagłówka nie mieści się minimum
// trybu — zwracamy `guard` (ekran „okno za małe").
import { HEADER_STACK_COLS } from './components/Header.jsx';

// Realne wysokości nagłówka (wraz z górnym dividerem pod nim):
//  - pełny 2‑kolumnowy: marginTop(1)+logo(6)+divider(1) = 8,
//  - pełny pionowy (wąskie okno): logo+informacje pod sobą = 14,
//  - compact: 1 wiersz nagłówka + divider = 2.
export const FULL_HEADER_ROWS = 8;
export const FULL_HEADER_STACKED_ROWS = 14;
export const COMPACT_HEADER_ROWS = 2;

// Próg, od którego w ogóle dopuszczamy pełny nagłówek (spójny z dawnym fillHeight).
export const FULL_HEADER_MIN_TERM_ROWS = 16;

// Ile wierszy treści POD nagłówkiem potrzebuje dany tryb, by był użyteczny.
// (chrome nakładek = ramka 2 + tytuł 1 + pomoc/stopka 1 = 4)
// To MINIMUM (1 pozycja / 1 karta) — używane do globalnej podłogi i guardu, NIE
// do wyboru wariantu nagłówka (tym steruje `naturalBodyRows`).
export function minBodyRows(mode) {
  switch (mode?.type) {
    case 'conflicts': return 4 + 3 + (mode.bulk?.length ? 1 : 0); // chrome + 1 karta (3) + stopka
    case 'picker':
    case 'connect':
    case 'form': return 5; // chrome + 1 pozycja
    case 'loading': return 4; // ramka + tytuł + spinner
    default: return 2; // input: minimalnie log/divider + pole
  }
}

// Ile wierszy treści tryb chce pokazać W CAŁOŚCI (cała lista / wszystkie karty,
// bez okienkowania) — „naturalna" wysokość nakładki. To jej steruje degradacją
// nagłówka: wolimy zmniejszyć/ukryć nagłówek niż okienkować pozycje (patrz
// `headerLayout`). MUSI być spójne z `overlayNatural` w App.jsx — ta sama liczba
// decyduje, kiedy nakładka zaczyna się okienkować, więc liczby chrome (+4/+6,
// karta = 4 wiersze) muszą się zgadzać. Dla `input`/`loading` natural = minimum:
// log jest przewijanym wypełniaczem, a loader ma stałą, drobną treść — nie
// wymuszają degradacji nagłówka.
export function naturalBodyRows(mode) {
  switch (mode?.type) {
    case 'picker': return (mode.items?.length || 0) + 4;
    case 'connect': return (mode.shops?.length || 0) + 6;
    case 'conflicts': return (mode.files?.length || 0) * 4 + (mode.bulk?.length ? 1 : 0) + 4;
    case 'form': return (mode.fields?.length || 0) + 4;
    default: return minBodyRows(mode); // loading/input
  }
}

// Wszystkie tryby, które mogą się pojawić w trakcie pracy — do policzenia
// globalnej podłogi (najcięższy ekran). `conflicts` z operacjami seryjnymi to
// najwyższy wymóg. Bierzemy najgorszy przypadek każdego trybu.
const ALL_MODES = [
  { type: 'conflicts', bulk: [0] },
  { type: 'picker' },
  { type: 'connect' },
  { type: 'form' },
  { type: 'loading' },
  { type: 'input' },
];

// Globalna minimalna wysokość okna dla CAŁEJ aplikacji: tyle, ile potrzebuje
// najcięższy ekran (+1 bo root = termRows-1). Dzięki temu komunikat „za małe
// okno" pojawia się od razu (przy każdym ekranie), a nie dopiero po wejściu w
// cięższy ekran w środku pracy — minimum jest spójne dla wszystkich trybów.
export function appMinRows() {
  return Math.max(...ALL_MODES.map(minBodyRows)) + 1;
}

// Wybór wariantu nagłówka wg wysokości okna i bieżącego trybu.
// Zwraca { mode: 'full'|'compact'|'none'|'guard', height, minRows }.
// `height` to liczba wierszy zajętych przez nagłówek (z górnym dividerem);
// `minRows` to GLOBALNE minimum aplikacji (do komunikatu guard, spójne wszędzie).
//
// Zasada doboru: bierzemy NAJWIĘKSZY wariant nagłówka, przy którym CAŁA treść
// trybu (`naturalBodyRows`) jeszcze się mieści POD nagłówkiem — bez okienkowania.
// Gdy treści jest dużo (np. wiele plików w /conflicts albo długa lista), pełny
// nagłówek by ją okienkował (mniej widocznych pozycji), więc schodzimy do compact,
// a potem chowamy nagłówek (none) — treść dostaje całą wysokość zamiast tracić
// pozycje. Gdy nawet bez nagłówka treść się nie mieści, i tak `none` (max miejsca;
// nakładka sama się wtedy okienkuje). Lekkie tryby (input — log przewija się;
// loader) mają `naturalBodyRows = minimum`, więc trzymają pełny nagłówek, gdy okno
// na to pozwala.
//
// Guard używa globalnej podłogi (`appMinRows`, liczonej z `minBodyRows`), a NIE
// naturalnej wysokości — inaczej info o za małym oknie wyskakiwałoby przy każdej
// dłuższej liście. Po przejściu podłogi `under(0) >= minBodyRows` zachodzi dla
// każdego trybu, więc 'none' zawsze zmieści przynajmniej minimum bieżącego trybu.
export function headerLayout({ termRows, termCols, mode }) {
  const minRows = appMinRows();
  if (termRows < minRows) return { mode: 'guard', height: 0, minRows };

  const want = naturalBodyRows(mode);
  const fullH = termCols < HEADER_STACK_COLS ? FULL_HEADER_STACKED_ROWS : FULL_HEADER_ROWS;
  const under = (h) => termRows - 1 - h; // root rośnie do termRows-1
  if (termRows >= FULL_HEADER_MIN_TERM_ROWS && under(fullH) >= want)
    return { mode: 'full', height: fullH, minRows };
  if (under(COMPACT_HEADER_ROWS) >= want)
    return { mode: 'compact', height: COMPACT_HEADER_ROWS, minRows };
  return { mode: 'none', height: 0, minRows };
}
