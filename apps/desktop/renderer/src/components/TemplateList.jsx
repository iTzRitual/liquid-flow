import React, { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Lock, Palette, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TemplateList() {
  const { t, api, call, navigate, currentShop, setCurrentTemplate } = useApp();
  const [templates, setTemplates] = useState(null);
  const [selecting, setSelecting] = useState(null);

  const load = async () => {
    setTemplates(null);
    try { setTemplates(await call(() => api.listTemplates())); }
    catch { setTemplates([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentShop && currentShop.Id]);

  const select = async (tpl) => {
    setSelecting(tpl.Id);
    try {
      const res = await call(() => api.selectTemplate(tpl.Id));
      if (res.Locked) { navigate('unlock', { template: res }); }
      else { setCurrentTemplate({ Id: res.Id, Name: res.Name }); navigate('sync'); }
    } catch { /* toast */ }
    finally { setSelecting(null); }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-xl font-semibold">{currentShop?.Name} — {t.Templates}</h2>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> {t.Refresh}</Button>
      </div>

      {templates === null && (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> …</div>
      )}
      {templates && templates.length === 0 && (
        <p className="text-muted-foreground">{t.NoTemplatesInShop}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates?.map((tpl) => (
          <Card
            key={tpl.Id}
            onClick={() => !selecting && select(tpl)}
            className={cn('group cursor-pointer p-4 transition-all hover:border-primary/60 hover:shadow-md', selecting === tpl.Id && 'opacity-60')}
          >
            <div className="flex items-start justify-between">
              <Palette className="h-5 w-5 text-primary" />
              {tpl.Locked && <Badge variant="warning" className="gap-1"><Lock className="h-3 w-3" /> </Badge>}
              {selecting === tpl.Id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="mt-3 font-medium">{tpl.Name}</div>
            <div className="text-xs text-muted-foreground">ID: {tpl.Id}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
