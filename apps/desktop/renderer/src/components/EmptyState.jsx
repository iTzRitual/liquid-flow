import React from 'react';
import { useApp } from '../App.jsx';
import { Button } from '@/components/ui/button';
import { Loader2, Store, Plus } from 'lucide-react';

export default function EmptyState({ loading }) {
  const { t, navigate, shops } = useApp();
  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <img src="logo.png" alt="" className="h-16 w-16 opacity-80" />
      <div>
        <h2 className="text-xl font-semibold">Liquid Flow</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {shops.length ? 'Wybierz sklep z listy po lewej, aby rozpocząć synchronizację.' : 'Dodaj swój pierwszy sklep Comarch e-Sklep, aby rozpocząć.'}
        </p>
      </div>
      <Button onClick={() => navigate('shopForm', { editing: null })}>
        {shops.length ? <Store className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {t.ShopAdd}
      </Button>
    </div>
  );
}
