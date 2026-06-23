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
  const above = start;
  const below = n - (start + slots);
  return { start, count: slots, above, below };
}
