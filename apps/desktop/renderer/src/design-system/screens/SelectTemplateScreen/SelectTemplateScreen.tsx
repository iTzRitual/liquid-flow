import { AppShell } from '../../templates/AppShell';
import { ContentSurface } from '../../templates/ContentSurface';
import { Sidebar, type SidebarShop } from '../../organisms/Sidebar';
import { TemplateList, type Template } from '../../organisms/TemplateList';
import { Text } from '../../atoms/Text';

export interface SelectTemplateScreenLabels {
  shops: string;
  addShop: string;
  heading: string;
  emptyShops?: string;
  emptyTemplates?: string;
}

/** The "choose a template" screen: the shop rail beside a centered card holding
 * the template list. Presentational — selection is wired by the caller; the
 * template list disables itself while `selectingId` is set. */
export interface SelectTemplateScreenProps {
  shops: SidebarShop[];
  currentShopId?: string;
  templates: Template[];
  selectingId?: string | number | null;
  labels: SelectTemplateScreenLabels;
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
  onSelectShop,
  onAddShop,
  onSelectTemplate,
}: SelectTemplateScreenProps) {
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
      <ContentSurface center className="p-8">
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
    </AppShell>
  );
}
