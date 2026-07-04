// Cienka warstwa nad window.api (mostek IPC z preload).
import { toast } from 'sonner';

const api = window.api;

// Podstawienie tokenów {nazwa} — lokalny odpowiednik core.tfmt. Renderer NIE
// importuje @liquidflow/core (ten ciągnie moduły `node:` → w przeglądarce graf
// modułów się wywala i okno jest czarne). Dlatego mała kopia formattera tutaj.
export function fmt(str, params = {}) {
  return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m);
}

// Wywołanie z automatycznym toastem błędu.
export async function call(fn, { errorToast = true } = {}) {
  try {
    return await fn();
  } catch (e) {
    if (errorToast) toast.error(e.message || String(e));
    throw e;
  }
}

export default api;
