import { LogRow, type LogRowProps } from '../../molecules/LogRow';
import { Text } from '../../atoms/Text';
import { cn } from '../../foundations/cn';

export interface ActivityLogEntry extends LogRowProps {
  id: string | number;
}

/** The Hub "Aktywność" feed: a scrollable, newest-at-top stack of log rows.
 * Presentational — the caller maps the controller's log buffer to `entries`
 * (id + time + message + tone + muted). Newest ordering is the caller's job. */
export interface ActivityLogProps {
  entries: ActivityLogEntry[];
  emptyLabel?: string;
  className?: string;
}

export function ActivityLog({ entries, emptyLabel, className }: ActivityLogProps) {
  if (entries.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Text variant="caption-md" tone="muted">{emptyLabel}</Text>
      </div>
    );
  }
  return (
    <div role="log" className={cn('flex flex-col overflow-y-auto', className)}>
      {entries.map(({ id, ...row }) => (
        <LogRow key={id} {...row} />
      ))}
    </div>
  );
}
