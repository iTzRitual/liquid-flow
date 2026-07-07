import { Text } from '../../atoms/Text';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { FolderOpen, Globe, RefreshCw, CircleDot, Check } from '../../foundations/icons';
import { cn } from '../../foundations/cn';

/** The Hub header: template title with ID + conflict/OK status badges, the
 * shop·host subtitle, and the folder/shop/refresh actions. Presentational — all
 * three actions are wired by the caller; `conflictCount === 0` shows the OK badge. */
export interface SyncHeaderProps {
  templateName: string;
  templateId: string | number;
  shopName: string;
  shopUrl: string;
  conflictCount: number;
  idLabel: string;
  okLabel: string;
  openFolderLabel: string;
  openShopLabel: string;
  refreshLabel: string;
  onOpenFolder?: () => void;
  onOpenShop?: () => void;
  onRefresh?: () => void;
  className?: string;
}

export function SyncHeader({
  templateName,
  templateId,
  shopName,
  shopUrl,
  conflictCount,
  idLabel,
  okLabel,
  openFolderLabel,
  openShopLabel,
  refreshLabel,
  onOpenFolder,
  onOpenShop,
  onRefresh,
  className,
}: SyncHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-center gap-3 border-b border-border px-6 py-3', className)}>
      <div className="mr-auto min-w-0">
        <div className="flex items-center gap-2">
          <Text as="h2" variant="heading-lg" className="truncate">{templateName}</Text>
          <Badge variant="neutral">{idLabel} {templateId}</Badge>
          {conflictCount > 0 ? (
            <Badge variant="warning">
              <CircleDot className="h-3 w-3" aria-hidden="true" /> {conflictCount}
            </Badge>
          ) : (
            <Badge variant="successSoft">
              <Check className="h-3 w-3" aria-hidden="true" /> {okLabel}
            </Badge>
          )}
        </div>
        <Text as="p" variant="caption-md" tone="secondary" className="truncate">
          {shopName} · {shopUrl}
        </Text>
      </div>

      <Button variant="outline" size="sm" onClick={onOpenFolder}>
        <FolderOpen className="h-4 w-4" aria-hidden="true" /> {openFolderLabel}
      </Button>
      <Button variant="outline" size="sm" onClick={onOpenShop}>
        <Globe className="h-4 w-4" aria-hidden="true" /> {openShopLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={onRefresh}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> {refreshLabel}
      </Button>
    </header>
  );
}
