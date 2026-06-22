import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Lock } from 'lucide-react';

export default function TemplateUnlock({ template }) {
  const { t, api, call, navigate, setCurrentTemplate } = useApp();
  const [password, setPassword] = useState('');
  const [savePassword, setSavePassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await call(() => api.unlockTemplate({ tplId: template.Id, Password: password, SavePassword: savePassword }));
      setCurrentTemplate({ Id: res.Id, Name: res.Name });
      navigate('sync');
    } catch { /* toast */ }
    finally { setBusy(false); }
  };

  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-warning" /> {template.Name}</CardTitle>
          <CardDescription>{t.TemplatePassword}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.Password}</Label>
            <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="savePwd2" checked={savePassword} onCheckedChange={setSavePassword} />
            <Label htmlFor="savePwd2" className="cursor-pointer">{t.SavePassword}</Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy || !password}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {t.SignIn}
            </Button>
            <Button variant="secondary" onClick={() => navigate('templates')}>{t.Cancel}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
