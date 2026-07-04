import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { tfmt } from '@liquidflow/core';
import { Download, Loader2 } from 'lucide-react';

export default function ShopExport() {
  const { t, call, api, shops = [], navigate } = useApp();
  const [selected, setSelected] = useState(() => new Set((shops || []).map((s) => s.Id)));
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleShop = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === shops.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(shops.map((s) => s.Id)));
    }
  };

  const canExport = selected.size > 0 && !busy;

  const handleExport = async () => {
    if (!canExport) return;
    setBusy(true);
    try {
      const ids = [...selected];
      const res = await call(() => api.exportShops({ ids, passphrase }));
      if (!res) return;
      const saved = await call(() => api.saveExportFile({ json: res.json, defaultName: 'liquidflow-shops.lfshops' }));
      if (saved && !saved.canceled) {
        toast.success(tfmt(t.ShareExportedTo || 'Wyeksportowano {count} sklepów do {path}', { count: res.count, path: saved.path }));
        navigate('welcome');
      }
    } catch {
      /* toast shown by call() */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t.ShareExportTitle || 'Eksport sklepów'}</CardTitle>
          <CardDescription>
            {t.ShareExportDesc || 'Wybierz sklepy do wyeksportowania i opcjonalnie podaj hasło pakietu.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">{t.Shops || 'Sklepy'}</Label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-muted-foreground hover:underline"
              >
                {selected.size === shops.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1.5">
              {shops.map((s) => {
                const checked = selected.has(s.Id);
                return (
                  <label key={s.Id} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleShop(s.Id)}
                      className="h-4 w-4 rounded border-gray-300 accent-primary"
                    />
                    <span className="font-medium">{s.Name}</span>
                    <span className="text-xs text-muted-foreground truncate">{s.Url}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.SharePassphraseOptional || 'Hasło pakietu (opcjonalne)'}</Label>
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="••••••••"
            />
            <p className="text-xs text-muted-foreground">
              {t.SharePassphraseHint || 'Puste = eksport bez haseł (kolega wpisze je ręcznie).'}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate('welcome')} disabled={busy}>
              {t.Cancel || 'Anuluj'}
            </Button>
            <Button onClick={handleExport} disabled={!canExport}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {t.ShareExport || 'Eksportuj'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
