import React from 'react';
import { useApp } from '../App.jsx';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ChevronRight, LogOut } from 'lucide-react';

export default function TopBar() {
  const { t, version, languages, language, changeLanguage, currentShop, currentTemplate, api, call, navigate } = useApp();

  const logout = async () => {
    await call(() => api.logout());
    navigate('welcome');
  };
  return (
    <header className="drag-region flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 pl-20 backdrop-blur">
      <img src="logo.png" alt="" className="h-6 w-6" />
      <div className="flex items-baseline gap-2">
        <span className="font-semibold tracking-tight">Liquid Flow</span>
        <span className="text-[10px] text-muted-foreground">{version}</span>
      </div>

      <div className="ml-2 flex items-center gap-1.5 text-sm text-muted-foreground">
        {currentShop && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{currentShop.Name}</span>
          </>
        )}
        {currentTemplate && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{currentTemplate.Name}</span>
            <span className="text-xs">[{currentTemplate.Id}]</span>
          </>
        )}
      </div>

      <div className="ml-auto no-drag flex items-center gap-2">
        {currentShop && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" title="Rozłącz" onClick={logout}>
            <LogOut className="h-3.5 w-3.5" /> Rozłącz
          </Button>
        )}
        <span className="text-xs text-muted-foreground">{t.Language}</span>
        <Select value={language} onValueChange={changeLanguage}>
          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {languages.map((l) => <SelectItem key={l.Id} value={l.Id}>{l.Name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
