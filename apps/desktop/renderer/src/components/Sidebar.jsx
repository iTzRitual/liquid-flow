import React from 'react';
import { useApp } from '../App.jsx';
import { Button } from '@/components/ui/button';
import { Plus, Store, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Sidebar() {
  const { t, shops, currentShop, currentTemplate, navigate, api, call, refreshShops, setCurrentTemplate } = useApp();

  const openShop = async (shop) => {
    if (currentShop && currentShop.Id === shop.Id) {
      navigate(currentTemplate ? 'sync' : 'templates');
      return;
    }
    // jeśli hasło jest zapisane — zaloguj automatycznie, bez ponownego wpisywania
    if (shop.SavePassword) {
      try {
        await call(() => api.signInSaved(shop.Id), { errorToast: false });
        await refreshShops();
        setCurrentTemplate(null);
        navigate('templates');
        return;
      } catch {
        /* nie udało się zapisanym hasłem — pokaż formularz logowania */
      }
    }
    navigate('shopForm', { editing: shop });
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/30">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.Shops}</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" title={t.ShopAdd} onClick={() => navigate('shopForm', { editing: null })}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {shops.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">{t.NoShopsAddFirst}</p>
        )}
        {shops.map((shop) => {
          const active = currentShop && currentShop.Id === shop.Id;
          return (
            <button
              key={shop.Id}
              onClick={() => openShop(shop)}
              className={cn(
                'no-drag group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                active ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-accent'
              )}
            >
              <Store className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-medium leading-tight">
                  <span className="truncate">{shop.Name}</span>
                  {active && <Check className="h-3 w-3 text-primary" />}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">{shop.Url}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-border p-2">
        <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('shopForm', { editing: null })}>
          <Plus className="h-4 w-4" /> {t.ShopAdd}
        </Button>
      </div>
    </aside>
  );
}
