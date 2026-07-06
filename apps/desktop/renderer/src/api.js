// A thin layer over window.api (the IPC bridge from preload).
import { toast } from 'sonner';

const api = window.api;

// Substitutes {name} tokens — a local equivalent of core.tfmt. The renderer does
// NOT import @liquidflow/core (it pulls in `node:` modules → the module graph
// blows up in the browser and the window goes black). Hence this small formatter copy.
export function fmt(str, params = {}) {
  return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m);
}

// A call with an automatic error toast.
export async function call(fn, { errorToast = true } = {}) {
  try {
    return await fn();
  } catch (e) {
    if (errorToast) toast.error(e.message || String(e));
    throw e;
  }
}

export default api;
