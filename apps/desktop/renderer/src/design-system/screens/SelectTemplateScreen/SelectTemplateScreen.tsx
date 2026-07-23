import { AppShell } from '../../templates/AppShell';
import { ContentSurface } from '../../templates/ContentSurface';
import { Sidebar, type SidebarShop } from '../../organisms/Sidebar';
import { TemplateList, type Template } from '../../organisms/TemplateList';
import { Text } from '../../atoms/Text';
import { PanelLeftOpen } from '../../foundations/icons';
import { useResizableSidebar } from '../../foundations/useResizableSidebar';

export interface SelectTemplateScreenLabels {
  shops: string;
  addShop: string;
  heading: string;
  collapseSidebar: string;
  expandSidebar: string;
  resizeSidebar: string;
  /** Resize-handle tooltip: click-to-toggle line (open/collapsed), shortcut chip, drag line. */
  collapseHint?: string;
  expandHint?: string;
  collapseShortcut?: string;
  resizeHint?: string;
  emptyShops?: string;
  emptyTemplates?: string;
}

/** The "choose a template" screen: the shop rail beside a centered card holding
 * the template list. Presentational — selection is wired by the caller; the
 * template list disables itself while `selectingId` is set. The shop rail
 * collapses (its own button) and reopens via the floating button on the card;
 * `defaultSidebarCollapsed` seeds that state. */
export interface SelectTemplateScreenProps {
  shops: SidebarShop[];
  currentShopId?: string;
  templates: Template[];
  selectingId?: string | number | null;
  labels: SelectTemplateScreenLabels;
  defaultSidebarCollapsed?: boolean;
  /** localStorage key the rail width is remembered under; omit to keep it in-memory. */
  sidebarStorageKey?: string;
  onSelectShop?: (shop: SidebarShop) => void;
  onAddShop?: () => void;
  onSelectTemplate?: (template: Template) => void;
}

export function SelectTemplateScreen({
  shops,
  currentShopId,
  templates,
  selectingId,
  labels,
  defaultSidebarCollapsed = false,
  sidebarStorageKey,
  onSelectShop,
  onAddShop,
  onSelectTemplate,
}: SelectTemplateScreenProps) {
  const { width, collapsed, resizing, beginResize, collapse, expand } = useResizableSidebar({
    storageKey: sidebarStorageKey,
    defaultCollapsed: defaultSidebarCollapsed,
  });

  return (
    <AppShell
      sidebarWidth={width}
      sidebarCollapsed={collapsed}
      sidebarResizing={resizing}
      onSidebarResizeStart={beginResize}
      resizeHandleLabel={labels.resizeSidebar}
      collapseHint={labels.collapseHint}
      expandHint={labels.expandHint}
      collapseShortcut={labels.collapseShortcut}
      resizeHint={labels.resizeHint}
      sidebar={
        <Sidebar
          shops={shops}
          currentShopId={currentShopId}
          onSelectShop={onSelectShop}
          onAddShop={onAddShop}
          onCollapse={collapse}
          label={labels.shops}
          addLabel={labels.addShop}
          collapseLabel={labels.collapseSidebar}
          emptyLabel={labels.emptyShops}
          // Reserve the top strip so window controls (macOS traffic lights) don't
          // overlap the shop-rail label when the screen is inside WindowChrome.
          className="pt-12"
        />
      }
    >
      <div className="relative h-full">
        {collapsed && (
          // top-12 keeps the reopen button clear of the macOS traffic lights and
          // the window's drag strip; the card behind it is centered, so the
          // top-left corner is free.
          <button
            type="button"
            aria-label={labels.expandSidebar}
            onClick={expand}
            className="absolute left-3 top-12 z-20 flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-muted"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <ContentSurface center flushLeft={!collapsed} className="p-8">
          <div className="flex w-full max-w-2xl flex-col gap-6">
            <Text as="h1" variant="heading-lg">{labels.heading}</Text>
            <TemplateList
              templates={templates}
              selectingId={selectingId}
              onSelect={onSelectTemplate}
              emptyLabel={labels.emptyTemplates}
            />
          </div>
        </ContentSurface>
      </div>
    </AppShell>
  );
}
