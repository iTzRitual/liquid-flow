import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Zap, Shuffle, PackageCheck } from 'lucide-react';

// Ekran startowy (pierwsze uruchomienie): lewa kolumna = branding/hero,
// prawa = formularz „dodaj pierwszy sklep" + import konfiguracji.
// Iteracja 0 redesignu — stylowana na tokenach, dopieszczana w Storybooku.
export default function Onboarding() {
  const { t, version, call, api, refreshShops, navigate, setCurrentTemplate } = useApp();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [password, setPassword] = useState('');
  const [savePassword, setSavePassword] = useState(true);
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

  const features = [
    { icon: Zap, title: t.FeatureLoggingTitle, desc: t.FeatureLoggingDesc },
    { icon: Shuffle, title: t.FeatureConflictTitle, desc: t.FeatureConflictDesc },
    { icon: PackageCheck, title: t.FeatureAutomationTitle, desc: t.FeatureAutomationDesc },
  ];

  return (
    <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-2">
      {/* Lewa kolumna — hero / branding */}
      <div className="hidden flex-col justify-between gap-8 bg-muted/40 p-10 md:flex">
        <div className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">Liquid</span>
            <span className="text-3xl font-extrabold tracking-tight text-primary">Flow</span>
            {version && <span className="text-sm font-medium text-muted-foreground">{version}</span>}
          </div>
          <p className="max-w-md text-lg font-semibold leading-snug text-foreground/90">
            {t.AppTagline}
          </p>
        </div>

        {/* Placeholder podglądu aplikacji — do podmiany na realny screenshot */}
        <div className="flex-1 rounded-xl border bg-background/60 shadow-sm" aria-hidden />

        <ul className="space-y-5">
          {features.map((f) => (
            <li key={f.title} className="flex items-start gap-3">
              <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
              <div>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Prawa kolumna — formularz */}
      <div className="flex items-center justify-center overflow-y-auto p-8">
        <div className="w-full max-w-sm space-y-6">
          <h1 className="text-2xl font-bold">{t.OnboardTitle}</h1>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t.ShopName}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MójSklep" />
              {!nameValid && name.length > 0 && (
                <p className="text-xs text-destructive">{t.InvalidName_AllowedChars} A-Za-z0-9</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t.Url}</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
              {!urlValid && url.length > 0 && <p className="text-xs text-destructive">{t.SSL_Required}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>{t.Password}</Label>
              <Input type="password" value={password} placeholder="********"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }} />
            </div>

            <div className="flex items-center gap-2">
              <Switch id="savePwd" checked={savePassword} onCheckedChange={setSavePassword} />
              <Label htmlFor="savePwd" className="cursor-pointer">{t.SavePassword}</Label>
            </div>
          </div>

          <Button className="w-full" onClick={submit} disabled={!canSubmit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.OnboardAddAndSignIn}
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t.OrSeparator}
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={() => navigate('shopImport')}>
            {t.OnboardImportConfig}
          </Button>
        </div>
      </div>
    </div>
  );
}
