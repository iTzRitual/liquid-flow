// Wyznacza „okno" widocznych pozycji listy tak, by zaznaczony element (index)
// był zawsze widoczny, a całość nie przekroczyła `max` wierszy. Gdy pozycji jest
// więcej niż mieści się na ekranie, rezerwuje wiersze na wskaźniki ↑/↓ więcej.
// Zwraca { start, count, above, below }.
export function windowList(n, index, max) {
  const cap = Math.max(3, max);
  if (n <= cap) return { start: 0, count: n, above: 0, below: 0 };

  // dwa przebiegi: najpierw zakładamy oba wskaźniki, potem korygujemy na brzegach
  let slots = cap - 2;
  let start = Math.max(0, Math.min(index - Math.floor(slots / 2), n - slots));
  let top = start > 0;
  let bottom = start + slots < n;

  slots = cap - (top ? 1 : 0) - (bottom ? 1 : 0);
  start = Math.max(0, Math.min(index - Math.floor(slots / 2), n - slots));
  let above = start;
  let below = n - (start + slots);

  // Wskaźnik „1 więcej" zajmuje dokładnie tyle wierszy co sam element —
  // zamiast pokazywać „↑ 1 więcej" / „↓ 1 więcej", rozszerz okno o ten element.
  // Łączna liczba wierszy (okno + wskaźniki) nie rośnie.
  if (above === 1) { start -= 1; slots += 1; above = 0; }
  if (below === 1) { slots += 1; below = 0; }

  return { start, count: slots, above, below };
}

// Okienkowanie pozycji o STAŁEJ wysokości `itemLines` (np. kart konfliktu = 3
// wiersze) tak, by zmieściły się w `budgetLines`, z zaznaczonym (index) zawsze
// widocznym. Gdy nie mieszczą się wszystkie, rezerwuje po jednym wierszu na
// wskaźniki ↑/↓ (góra/dół wg potrzeby). Zwraca { start, count, above, below }.
export function windowCards(n, index, budgetLines, itemLines) {
  if (n <= 0) return { start: 0, count: 0, above: 0, below: 0 };
  if (n * itemLines <= budgetLines) return { start: 0, count: n, above: 0, below: 0 };

  // pierwsze przybliżenie z oboma wskaźnikami, potem korekta na brzegach
  let cap = Math.max(1, Math.floor((budgetLines - 2) / itemLines));
  let start = Math.max(0, Math.min(index - Math.floor(cap / 2), n - cap));
  let top = start > 0;
  let bottom = start + cap < n;

  // brak jednego wskaźnika → odzyskany wiersz może dać jeszcze jedną kartę
  cap = Math.max(1, Math.floor((budgetLines - (top ? 1 : 0) - (bottom ? 1 : 0)) / itemLines));
  start = Math.max(0, Math.min(index - Math.floor(cap / 2), n - cap));
  const above = start;
  const below = n - (start + cap);
  return { start, count: cap, above, below };
}
