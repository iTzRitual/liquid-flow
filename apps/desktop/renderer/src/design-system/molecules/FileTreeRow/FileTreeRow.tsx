import { Folder, ChevronDown } from '../../foundations/icons';
import { cn } from '../../foundations/cn';

/** One row of the Hub "Pliki" tree: a folder (icon + chevron, toggles on click)
 * or a file (indented name). `depth` drives the indent. */
export interface FileTreeRowProps {
  name: string;
  type?: 'folder' | 'file';
  depth?: number;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function FileTreeRow({
  name,
  type = 'file',
  depth = 0,
  expanded = false,
  onToggle,
  className,
}: FileTreeRowProps) {
  const isFolder = type === 'folder';
  return (
    <div
      role="treeitem"
      aria-expanded={isFolder ? expanded : undefined}
      onClick={isFolder ? onToggle : undefined}
      style={{ paddingLeft: 8 + depth * 16 }}
      className={cn(
        'flex items-center gap-2 rounded-md py-1 pr-2 font-ui text-[13px] text-text-primary hover:bg-surface-muted',
        isFolder && 'cursor-pointer',
        className,
      )}
    >
      {isFolder ? (
        <Folder className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
      ) : (
        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{name}</span>
      {isFolder && (
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-text-muted transition-transform',
            !expanded && '-rotate-90',
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
