import { Avatar } from '../../atoms/Avatar';
import { Text } from '../../atoms/Text';
import { Check, Plus, PanelLeftClose } from '../../foundations/icons';
import { cn } from '../../foundations/cn';

export interface SidebarShop {
  Id: string;
  Name: string;
  Url: string;
}

/** The shop rail: a labelled list of shops (avatar + name + host, with a check
 * on the active one) plus an "add shop" action pinned to the bottom.
 * Presentational — selection and creation are wired by the caller. */
export interface SidebarProps {
  shops: SidebarShop[];
  currentShopId?: string;
  onSelectShop?: (shop: SidebarShop) => void;
  onAddShop?: () => void;
  /** When set, renders a collapse button beside the label that closes the rail. */
  onCollapse?: () => void;
  label: string;
  addLabel: string;
  collapseLabel?: string;
  emptyLabel?: string;
  className?: string;
}

/** Strips the scheme so the host reads cleanly under the shop name. */
function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function Sidebar({
  shops,
  currentShopId,
  onSelectShop,
  onAddShop,
  onCollapse,
  label,
  addLabel,
  collapseLabel,
  emptyLabel,
  className,
}: SidebarProps) {
  return (
    <aside className={cn('flex w-80 shrink-0 flex-col gap-2 p-3', className)}>
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
        <Text as="div" variant="body-md" tone="muted">{label}</Text>
        {onCollapse && (
          <button
            type="button"
            aria-label={collapseLabel}
            onClick={onCollapse}
            className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-muted"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {shops.length === 0 && (
          <Text as="p" variant="caption-md" tone="muted" className="px-1.5 py-4">{emptyLabel}</Text>
        )}
        {shops.map((shop) => {
          const active = shop.Id === currentShopId;
          return (
            <button
              key={shop.Id}
              type="button"
              onClick={() => onSelectShop?.(shop)}
              aria-current={active || undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors',
                active ? 'bg-surface-muted' : 'hover:bg-surface-muted/60',
              )}
            >
              <Avatar name={shop.Name} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="truncate font-ui text-[14px] leading-tight text-text-primary">
                    {shop.Name}
                  </span>
                  {active && (
                    <Check className="h-3 w-3 shrink-0 text-interactive-primary" aria-hidden="true" />
                  )}
                </span>
                <span className="block truncate font-ui text-[11px] text-text-secondary">
                  {hostOf(shop.Url)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAddShop}
        className="flex items-center justify-center gap-2 rounded-lg border border-border p-3 font-ui text-[14px] text-text-primary transition-colors hover:bg-surface-muted"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {addLabel}
      </button>
    </aside>
  );
}
