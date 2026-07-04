import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api, { call } from './api.js';
import { Toaster } from '@/components/ui/sonner';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import ShopForm from './components/ShopForm.jsx';
import ShopExport from './components/ShopExport.jsx';
import ShopImport from './components/ShopImport.jsx';
import TemplateList from './components/TemplateList.jsx';
import TemplateUnlock from './components/TemplateUnlock.jsx';
import SyncView from './components/SyncView.jsx';
import EmptyState from './components/EmptyState.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const [t, setT] = useState({});
  const [languages, setLanguages] = useState([]);
  const [language, setLanguage] = useState('pl');
  const [version, setVersion] = useState('');
  const [shops, setShops] = useState([]);
  const [currentShop, setCurrentShop] = useState(null);
  const [currentTemplate, setCurrentTemplate] = useState(null);
  const [route, setRoute] = useState({ view: 'loading' });

  // dane sesji synchronizacji
  const [mismatches, setMismatches] = useState([]);
  const [log, setLog] = useState([]);
  const [git, setGit] = useState(null);
  const [progress, setProgress] = useState(null);

  const navigate = useCallback((view, data = {}) => setRoute({ view, ...data }), []);

  const refreshTranslations = useCallback(async () => {
    const tr = await api.getTranslations();
    setT(tr.Translations || {});
    setLanguages(tr.Languages || []);
    setLanguage(tr.Language || 'pl');
    setVersion(tr.Version || '');
  }, []);

  const refreshShops = useCallback(async () => {
    setShops(await api.listShops());
    setCurrentShop(await api.currentShop());
  }, []);

  // start
  useEffect(() => {
    (async () => {
      try {
        await refreshTranslations();
        await refreshShops();
        const st = await api.getState();
        setCurrentTemplate(st.currentTemplate);
        const shopsList = await api.listShops();
        if (st.currentTemplate) navigate('sync');
        else if (st.currentShop) navigate('templates');
        else navigate(shopsList.length ? 'welcome' : 'shopForm', { editing: null });
      } catch (e) {
        toast.error(e?.message || 'Startup error');
        navigate('welcome');
      }
    })();
  }, [refreshTranslations, refreshShops, navigate]);

  // zdarzenia push z backendu
  useEffect(() => {
    const off = api.onEvent(({ type, payload }) => {
      if (type === 'log') setLog((prev) => [payload, ...prev].slice(0, 500));
      else if (type === 'log:reset') setLog((payload || []).slice().reverse().slice(0, 500));
      else if (type === 'mismatches') setMismatches(payload || []);
      else if (type === 'git') setGit(payload);
      else if (type === 'progress') setProgress(payload && payload.phase !== 'ready' && payload.state !== 'done' ? payload : null);
      else if (type === 'state') {
        setCurrentShop(payload.currentShop);
        setCurrentTemplate(payload.currentTemplate);
        setLanguage(payload.language);
        if (!payload.currentTemplate) setProgress(null);
      }
    });
    return off;
  }, []);

  const changeLanguage = useCallback(async (id) => {
    const tr = await api.setLanguage(id);
    setT(tr.Translations || {});
    setLanguage(id);
    // Backend przerysował bieżący log na nowy język — pobierz go ponownie, żeby
    // już wyświetlone wpisy (z deskryptorem i18n) także się przetłumaczyły.
    try { setLog((await api.getLog(0)).slice().reverse()); } catch { /* brak aktywnego logu */ }
  }, []);

  const ctx = {
    t, languages, language, version, shops, currentShop, currentTemplate,
    mismatches, log, git, progress, route, navigate,
    api, call, toast,
    refreshShops, refreshTranslations, changeLanguage,
    setMismatches, setLog, setGit, setCurrentTemplate, setCurrentShop,
  };

  return (
    <AppCtx.Provider value={ctx}>
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <MainContent />
          </main>
        </div>
      </div>
      <Toaster />
    </AppCtx.Provider>
  );
}

function MainContent() {
  const { route } = useApp();
  switch (route.view) {
    case 'shopForm': return <ShopForm editing={route.editing} />;
    case 'shopExport': return <ShopExport />;
    case 'shopImport': return <ShopImport />;
    case 'templates': return <TemplateList />;
    case 'unlock': return <TemplateUnlock template={route.template} />;
    case 'sync': return <SyncView />;
    case 'welcome': return <EmptyState />;
    default: return <EmptyState loading />;
  }
}
