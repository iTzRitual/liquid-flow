import * as React from 'react';
import { SplitMarketingForm } from '../../templates/SplitMarketingForm';
import { FeatureList, type Feature } from '../../organisms/FeatureList';
import { FormField } from '../../molecules/FormField';
import { SwitchField } from '../../molecules/SwitchField';
import { OrDivider } from '../../molecules/OrDivider';
import { Input } from '../../atoms/Input';
import { Button } from '../../atoms/Button';
import { Text } from '../../atoms/Text';
import { Loader2 } from '../../foundations/icons';

export interface OnboardingScreenLabels {
  title: string;
  shopName: string;
  url: string;
  password: string;
  savePassword: string;
  submit: string;
  or: string;
  import: string;
}

export interface OnboardingValues {
  name: string;
  url: string;
  password: string;
  savePassword: boolean;
}

/** The first-run / add-shop screen: marketing column (brand, tagline, features)
 * beside the sign-in form. Owns only the form's local input state; `onSubmit`
 * receives the collected values and `busy` reflects the in-flight request. */
export interface OnboardingScreenProps {
  appName: string;
  version: string;
  tagline: string;
  features: Feature[];
  labels: OnboardingScreenLabels;
  busy?: boolean;
  onSubmit?: (values: OnboardingValues) => void;
  onImport?: () => void;
}

export function OnboardingScreen({
  appName,
  version,
  tagline,
  features,
  labels,
  busy = false,
  onSubmit,
  onImport,
}: OnboardingScreenProps) {
  const [name, setName] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [savePassword, setSavePassword] = React.useState(true);

  const canSubmit = name.trim() !== '' && url.trim() !== '' && password !== '' && !busy;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit?.({ name, url, password, savePassword });
  };

  return (
    <SplitMarketingForm
      marketing={
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <Text as="span" variant="heading-xl">{appName}</Text>
              <Text as="span" variant="caption-md" tone="muted">{version}</Text>
            </div>
            <Text as="p" variant="heading-md" tone="secondary">{tagline}</Text>
          </div>
          <FeatureList features={features} />
        </>
      }
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-base p-8 shadow-lg">
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Text as="h1" variant="heading-lg" className="text-center">{labels.title}</Text>

          <div className="flex flex-col gap-4">
            <FormField label={labels.shopName} htmlFor="ds-onboarding-name">
              <Input
                id="ds-onboarding-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="MójSklep"
              />
            </FormField>
            <FormField label={labels.url} htmlFor="ds-onboarding-url">
              <Input
                id="ds-onboarding-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
            </FormField>
            <FormField label={labels.password} htmlFor="ds-onboarding-password">
              <Input
                id="ds-onboarding-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
              />
            </FormField>
            <SwitchField
              label={labels.savePassword}
              checked={savePassword}
              onCheckedChange={setSavePassword}
            />
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {labels.submit}
          </Button>

          <OrDivider label={labels.or} />

          <Button type="button" variant="outline" className="w-full" onClick={onImport}>
            {labels.import}
          </Button>
        </form>
      </div>
    </SplitMarketingForm>
  );
}
