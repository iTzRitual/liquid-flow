import { StatusDot, type StatusDotProps } from '../../atoms/StatusDot';
import { cn } from '../../foundations/cn';

export type LogTone = NonNullable<StatusDotProps['tone']>;

/** One activity-log line from the Hub: timestamp + status dot + message.
 * `muted` dims historic entries (the fade in the Figma log). */
export interface LogRowProps {
  time: string;
  message: string;
  tone?: LogTone;
  muted?: boolean;
  className?: string;
}

export function LogRow({ time, message, tone = 'neutral', muted, className }: LogRowProps) {
  return (
    <div className={cn('flex items-center gap-3 py-0.5', muted && 'opacity-50', className)}>
      <span className="shrink-0 font-ui text-[12px] leading-[14px] tabular-nums text-text-secondary">
        {time}
      </span>
      <StatusDot tone={tone} />
      <span className="truncate font-ui text-[12px] leading-[14px] text-text-primary">{message}</span>
    </div>
  );
}
