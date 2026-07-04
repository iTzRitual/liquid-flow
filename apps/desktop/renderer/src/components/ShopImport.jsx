import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { tfmt } from '@liquidflow/core';
import { Upload, FileText, Loader2 } from 'lucide-react';

export default function ShopImport() {
  const { t, call, api, refreshShops, navigate } = useApp();
  const [json, setJson] = useState('');
  const [path, setPath] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [preview, setPreview] = useState(null); // { encrypted, shops }
  const [checked, setChecked] = useState(new Set()); // non-colliding selected names
  const [actions, setActions] = useState({}); // colliding names -> 'skip'|'update'|'rename'
  const [busy, setBusy] = useState(false);

  const handleChooseFile = async () => {
    try {
      const r = await call(() => api.readImportFile());
      if (r && !r.canceled) {
        setJson(r.json);
        setPath(r.path);
        setPreview(null);
      }
    } catch {
      /* toast shown by call() */
    }
  };

  const handleLoadPreview = async () => {
    if (!json) return;
    setBusy(true);
    try {
      const p = await call(() => api.importPreview({ json, passphrase }));
      if (p) {
        setPreview(p);
        const initChecked = new Set();
        const initActions = {};
        for (const s of p.shops || []) {
          if (s.exists) {
            initActions[s.Name] = 'skip';
          } else {
            initChecked.add(s.Name);
          }
        }
        setChecked(initChecked);
        setActions(initActions);
      }
    } catch {
      /* toast shown by call() */
    } finally {
      setBusy(false);
    }
  };

  const toggleCheck = (name) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const setAction = (name, actionVal) => {
    setActions((prev) => ({ ...prev, [name]: actionVal }));
  };

  const handleImport = async () => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const selections = (preview.shops || []).map((s) => {
        if (s.exists) {
          const a = actions[s.Name] || 'skip';
          return { Name: s.Name, action: a === 'update' ? 'update' : a === 'rename' ? 'add' : 'skip' };
        }
        return checked.has(s.Name) ? { Name: s.Name, action: 'add' } : { Name: s.Name, action: 'skip' };
      });

      const res = await call(() => api.importShops({ json, passphrase, selections }));
      if (res) {
        await refreshShops();
        toast.success(tfmt(t.ShareImportedResult || 'Zaimportowano: {added} dodane, {updated} zaktualizowane, {skipped} pominięte', res));
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
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t.ShareImportTitle || 'Import sklepów'}</CardTitle>
          <CardDescription>
            {t.ShareImportDesc || 'Wybierz plik konfiguracji (.lfshops) i podaj hasło pakietu, jeśli wymagane.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.ShareFilePath || 'Ścieżka pliku'}</Label>
            <div className="flex gap-2">
              <Input value={path} readOnly placeholder="liquidflow-shops.lfshops" />
              <Button type="button" variant="outline" onClick={handleChooseFile}>
                <FileText className="mr-2 h-4 w-4" />
                Wybierz
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.SharePassphraseOptional || 'Hasło pakietu (opcjonalne)'}</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="••••••••"
              />
              <Button type="button" onClick={handleLoadPreview} disabled={!json || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Wczytaj'}
              </Button>
            </div>
          </div>

          {preview && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">{t.Shops || 'Sklepy w pakiecie'}</Label>
                {preview.encrypted && <Badge variant="secondary">Zaszyfrowany</Badge>}
              </div>
              <div className="max-h-60 overflow-y-auto rounded-md border p-2 space-y-2">
                {(preview.shops || []).map((s) => {
                  if (s.exists) {
                    const currentAct = actions[s.Name] || 'skip';
                    return (
                      <div key={s.Name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded bg-muted/40">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-medium">{s.Name}</span>
                          <Badge variant="warning">{t.ShareExistsBadge || 'już istnieje'}</Badge>
                        </div>
                        <Select value={currentAct} onValueChange={(val) => setAction(s.Name, val)}>
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">{t.ShareActionSkip || 'Pomiń'}</SelectItem>
                            <SelectItem value="update">{t.ShareActionUpdate || 'Nadpisz'}</SelectItem>
                            <SelectItem value="rename">{t.ShareActionRename || 'Zmień nazwę'}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }

                  const isChecked = checked.has(s.Name);
                  return (
                    <label key={s.Name} className="flex items-center gap-2 p-2 rounded hover:bg-muted/40 cursor-pointer select-none text-sm">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(s.Name)}
                        className="h-4 w-4 rounded border-gray-300 accent-primary"
                      />
                      <span className="font-medium">{s.Name}</span>
                      <span className="text-xs text-muted-foreground truncate">{s.Url}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate('welcome')} disabled={busy}>
              {t.Cancel || 'Anuluj'}
            </Button>
            <Button onClick={handleImport} disabled={!preview || busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t.ShareImport || 'Importuj'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
