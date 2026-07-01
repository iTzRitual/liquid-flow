import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Interpolacja tokenów {key} w stringu tłumaczenia (odpowiednik tfmt z core, ale
// w rendererze bez importu core).
export function fmt(str, params) {
  if (!str || !params) return str || '';
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Podstawienie tokenów {name} w stringach i18n (renderer nie importuje tfmt z core).
export function fmt(str, params = {}) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}
