import { Badge } from '../../atoms/Badge';
import { Text } from '../../atoms/Text';
import { Lock, Loader2 } from '../../foundations/icons';
import { cn } from '../../foundations/cn';

export interface Template {
  Id: string | number;
  Name: string;
  Locked?: boolean;
}

/** The "wybierz szablon" list: one tall row per template (name + [id], a lock
 * badge when locked, a spinner on the row being selected). Presentational —
 * `selectingId` disables the whole list while a selection is in flight. */
export interface TemplateListProps {
  templates: Template[];
  selectingId?: string | number | null;
  onSelect?: (template: Template) => void;
  emptyLabel?: string;
  className?: string;
}

export function TemplateList({
  templates,
  selectingId,
  onSelect,
  emptyLabel,
  className,
}: TemplateListProps) {
  if (templates.length === 0) {
    return <Text as="p" variant="body-md" tone="muted">{emptyLabel}</Text>;
  }
  const busy = selectingId != null;
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {templates.map((tpl) => {
        const selecting = tpl.Id === selectingId;
        return (
          <button
            key={tpl.Id}
            type="button"
            disabled={busy}
            onClick={() => onSelect?.(tpl)}
            className={cn(
              'flex h-14 w-full items-center justify-between gap-2 rounded-md bg-surface-muted px-3 text-left transition-opacity',
              'hover:bg-surface-muted/70 disabled:pointer-events-none',
              selecting && 'opacity-60',
            )}
          >
            <span className="truncate font-ui text-[14px] text-text-primary">
              {tpl.Name} [{tpl.Id}]
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {tpl.Locked && (
                <Badge variant="warning">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                </Badge>
              )}
              {selecting && (
                <Loader2 className="h-4 w-4 animate-spin text-text-secondary" aria-hidden="true" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
