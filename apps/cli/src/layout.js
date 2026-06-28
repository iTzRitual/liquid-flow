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

// Wybór wariantu nagłówka wg wysokości okna i bieżącego trybu.
// Zwraca { mode: 'full'|'compact'|'none'|'guard', height, minRows }.
// `height` to liczba wierszy zajętych przez nagłówek (z górnym dividerem);
// `minRows` to minimalna wysokość okna potrzebna trybowi (do komunikatu guard).
export function headerLayout({ termRows, termCols, mode }) {
  const need = minBodyRows(mode);
  const fullH = termCols < HEADER_STACK_COLS ? FULL_HEADER_STACKED_ROWS : FULL_HEADER_ROWS;
  // Root rośnie do termRows-1 (input/nakładki przypięte do dołu), więc pod
  // nagłówkiem zostaje (termRows-1) - height wierszy.
  const under = (h) => termRows - 1 - h;
  const minRows = need + 1; // +1: root = termRows-1
  if (termRows >= FULL_HEADER_MIN_TERM_ROWS && under(fullH) >= need)
    return { mode: 'full', height: fullH, minRows };
  if (under(COMPACT_HEADER_ROWS) >= need)
    return { mode: 'compact', height: COMPACT_HEADER_ROWS, minRows };
  if (under(0) >= need)
    return { mode: 'none', height: 0, minRows };
  return { mode: 'guard', height: 0, minRows };
}
