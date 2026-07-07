import * as React from 'react';
import { Tabs as BaseTabs } from '@base-ui-components/react/tabs';
import { cn } from '../../foundations/cn';

/**
 * Segmented tabs on Base UI (the Hub's Aktywność / Git-Backup / Konflikty bar).
 * Compound API: `<Tabs value defaultValue onValueChange>` + `Tabs.List`,
 * `Tabs.Tab value`, `Tabs.Panel value`. The active tab is styled off its
 * `aria-selected` state (Base UI sets aria-selected + data-active on it).
 */
type WithStringClass<T> = Omit<T, 'className'> & { className?: string };

function TabsRoot({ className, ...props }: WithStringClass<React.ComponentProps<typeof BaseTabs.Root>>) {
  return <BaseTabs.Root className={cn(className)} {...props} />;
}

function TabsList({ className, ...props }: WithStringClass<React.ComponentProps<typeof BaseTabs.List>>) {
  return (
    <BaseTabs.List
      className={cn('inline-flex items-center gap-1 rounded-lg bg-surface-muted p-1', className)}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: WithStringClass<React.ComponentProps<typeof BaseTabs.Tab>>) {
  return (
    <BaseTabs.Tab
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 font-ui text-[13px] font-medium',
        'text-text-secondary transition-colors hover:text-text-primary',
        'aria-selected:bg-surface-base aria-selected:text-text-primary aria-selected:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: WithStringClass<React.ComponentProps<typeof BaseTabs.Panel>>) {
  return <BaseTabs.Panel className={cn('pt-3', className)} {...props} />;
}

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
});
