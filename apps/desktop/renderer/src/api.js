// Cienka warstwa nad window.api (mostek IPC z preload).
import { toast } from 'sonner';

const api = window.api;

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
