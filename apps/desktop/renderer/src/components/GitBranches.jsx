import React, { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ConfirmButton from './ConfirmButton.jsx';
import { fmt } from '@/lib/utils';
import { GitBranch, Check, Plus } from 'lucide-react';

// Branch (stream) management — list + switch + create. The "target stream" is
// git.branch; the hidden wip branch never appears (the core filters it out).
export default function GitBranches() {
  const { t, api, call, git, setGit } = useApp();
  const [branches, setBranches] = useState([]);
  const [newName, setNewName] = useState('');

  const load = async () => {
    try { setBranches(await api.git.listBranches()); } catch { setBranches([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [git && git.branch]);

  const refresh = async () => { const s = await call(() => api.git.status(), { errorToast: false }).catch(() => null); if (s) setGit(s); await load(); };

  const doSwitch = async (name, discard) => { await call(() => api.git.switchBranch(name, { discard })); await refresh(); };
  const createBranch = async () => {
    if (!newName.trim()) return;
    await call(() => api.git.createBranch(newName.trim()));
    setNewName('');
    await refresh();
  };

  const ahead = git ? git.ahead : 0;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><GitBranch className="h-4 w-4" /> {t.GitBranches}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y divide-border">
          {branches.map((b) => {
            const current = git && b === git.branch;
            return (
              <li key={b} className="flex items-center gap-2 py-1.5">
                <code className="min-w-0 flex-1 truncate text-sm">{b}{current ? t.GitCurrentSuffix : ''}</code>
                {current
                  ? <Check className="h-4 w-4 text-primary" />
                  : <ConfirmButton variant="outline" size="sm"
                      title={t.GitBranchSwitch}
                      message={ahead > 0 ? fmt(t.GitSwitchDiscardConfirm, { count: ahead, name: b }) : fmt(t.ConfirmSwitchBranch, { name: b })}
                      confirmLabel={t.GitBranchSwitch}
                      onConfirm={() => doSwitch(b, ahead > 0)}>
                      {t.GitBranchSwitch}
                    </ConfirmButton>}
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t.GitBranchNameField} />
          <Button variant="secondary" onClick={createBranch}><Plus className="h-4 w-4" /> {t.GitBranchCreate}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
