import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import ConfirmButton from './ConfirmButton.jsx';
import { Loader2, LogIn, Trash2 } from 'lucide-react';

export default function ShopForm({ editing }) {
  const { t, call, api, refreshShops, navigate, setCurrentTemplate } = useApp();
  const isEdit = !!editing;
  const [name, setName] = useState(editing ? editing.Name : '');
  const [url, setUrl] = useState(editing ? editing.Url : '');
  const [password, setPassword] = useState('');
  const [savePassword, setSavePassword] = useState(editing ? !!editing.SavePassword : false);
  const [busy, setBusy] = useState(false);

  const nameValid = /^[A-Za-z0-9]+$/.test(name);
  const urlValid = /^https:\/\/.+$/.test(url) || /^http:\/\/localhost:\d+.*$/.test(url);
  const canSubmit = nameValid && urlValid && password.length > 0 && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      await call(() => api.signInShop({ Name: name, Url: url, Password: password, SavePassword: savePassword }));
      await refreshShops();
      setCurrentTemplate(null);
      navigate('templates');
    } catch { /* toast już pokazany */ }
    finally { setBusy(false); }
  };

  const remove = async () => {
    await call(() => api.removeShop(editing.Id));
    await refreshShops();
    navigate('welcome');
  };

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isEdit ? editing.Name : t.ShopAdd}</CardTitle>
          <CardDescription>
            {isEdit ? 'Zaloguj się ponownie, aby przełączyć na ten sklep.' : 'Połącz nowy sklep Comarch e-Sklep.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.ShopName}</Label>
            <Input value={name} disabled={isEdit} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="MojSklep" />
            {!nameValid && name.length > 0 && <p className="text-xs text-destructive">{t.InvalidName_AllowedChars} A-Za-z0-9</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{t.Url}</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://twojsklep.pl" />
            {!urlValid && url.length > 0 && <p className="text-xs text-destructive">{t.SSL_Required}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{t.Login}</Label>
            <Input value="webmaster" disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label>{t.Password}</Label>
            <Input type="password" value={password} autoFocus={isEdit} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="savePwd" checked={savePassword} onCheckedChange={setSavePassword} />
            <Label htmlFor="savePwd" className="cursor-pointer">{t.SavePassword}</Label>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={submit} disabled={!canSubmit}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {t.SignIn}
            </Button>
            <Button variant="secondary" onClick={() => navigate('welcome')}>{t.Cancel}</Button>
            {isEdit && (
              <ConfirmButton variant="destructive" className="ml-auto" onConfirm={remove}
                message={`${t.Delete}: ${editing.Name}`} confirmLabel={t.Delete}>
                <Trash2 className="h-4 w-4" /> {t.Delete}
              </ConfirmButton>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
