import * as React from 'react';
import { AppShell } from '../../templates/AppShell';
import { ContentSurface } from '../../templates/ContentSurface';
import { Sidebar, type SidebarShop } from '../../organisms/Sidebar';
import { SyncHeader } from '../../organisms/SyncHeader';
import { FileTree, type FileTreeNode } from '../../organisms/FileTree';
import { ActivityLog, type ActivityLogEntry } from '../../organisms/ActivityLog';
import { Tabs } from '../../molecules/Tabs';
import { Text } from '../../atoms/Text';

export interface HubScreenLabels {
  shops: string;
  addShop: string;
  emptyShops?: string;
  id: string;
  ok: string;
  openFolder: string;
  openShop: string;
  refresh: string;
  files: string;
  tabActivity: string;
  tabConflicts: string;
  tabGit: string;
  emptyLog?: string;
  placeholder?: string;
}

/** The connected working screen: shop rail + template header + a persistent
 * "Pliki" file tree beside a tabbed content area (Aktywność → activity log;
 * Konflikty / Git-Backup fed by optional slots). Presentational and slot-driven;
 * the active tab is the only local state. The container wires data + actions. */
export interface HubScreenProps {
  shops: SidebarShop[];
  currentShopId?: string;
  templateName: string;
  templateId: string | number;
  shopName: string;
  shopUrl: string;
  conflictCount: number;
  fileTree: FileTreeNode[];
  logEntries: ActivityLogEntry[];
  labels: HubScreenLabels;
  conflictsSlot?: React.ReactNode;
  gitSlot?: React.ReactNode;
  onSelectShop?: (shop: SidebarShop) => void;
  onAddShop?: () => void;
  onOpenFolder?: () => void;
  onOpenShop?: () => void;
  onRefresh?: () => void;
}

function TabPlaceholder({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <Text variant="caption-md" tone="muted">{label}</Text>
    </div>
  );
}

export function HubScreen({
  shops,
  currentShopId,
  templateName,
  templateId,
  shopName,
  shopUrl,
  conflictCount,
  fileTree,
  logEntries,
  labels,
  conflictsSlot,
  gitSlot,
  onSelectShop,
  onAddShop,
  onOpenFolder,
  onOpenShop,
  onRefresh,
}: HubScreenProps) {
  return (
    <AppShell
      sidebar={
        <Sidebar
          shops={shops}
          currentShopId={currentShopId}
          onSelectShop={onSelectShop}
          onAddShop={onAddShop}
          label={labels.shops}
          addLabel={labels.addShop}
          emptyLabel={labels.emptyShops}
          // Reserve the top strip so window controls (macOS traffic lights) don't
          // overlap the shop-rail label when the screen is inside WindowChrome.
          className="pt-12"
        />
      }
    >
      <ContentSurface>
        <SyncHeader
          templateName={templateName}
          templateId={templateId}
          shopName={shopName}
          shopUrl={shopUrl}
          conflictCount={conflictCount}
          idLabel={labels.id}
          okLabel={labels.ok}
          openFolderLabel={labels.openFolder}
          openShopLabel={labels.openShop}
          refreshLabel={labels.refresh}
          onOpenFolder={onOpenFolder}
          onOpenShop={onOpenShop}
          onRefresh={onRefresh}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <section className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border" aria-label={labels.files}>
            <div className="px-4 py-3">
              <Text variant="label-md" tone="secondary">{labels.files}</Text>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              <FileTree nodes={fileTree} />
            </div>
          </section>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
            <Tabs defaultValue="activity" className="flex min-h-0 flex-1 flex-col">
              <Tabs.List>
                <Tabs.Tab value="activity">{labels.tabActivity}</Tabs.Tab>
                <Tabs.Tab value="conflicts">{labels.tabConflicts}</Tabs.Tab>
                <Tabs.Tab value="git">{labels.tabGit}</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="activity" className="min-h-0 flex-1 overflow-hidden">
                <ActivityLog entries={logEntries} emptyLabel={labels.emptyLog} className="h-full" />
              </Tabs.Panel>
              <Tabs.Panel value="conflicts" className="min-h-0 flex-1 overflow-y-auto">
                {conflictsSlot ?? <TabPlaceholder label={labels.placeholder} />}
              </Tabs.Panel>
              <Tabs.Panel value="git" className="min-h-0 flex-1 overflow-y-auto">
                {gitSlot ?? <TabPlaceholder label={labels.placeholder} />}
              </Tabs.Panel>
            </Tabs>
          </div>
        </div>
      </ContentSurface>
    </AppShell>
  );
}
