import type { SettingsOptions } from '@/utils/settings-local';

export type OptionsForm = Pick<
  SettingsOptions,
  'language' | 'highlightColor' | 'autoHighlightPageSummary' | 'autoLocateFirstSummary'
>;

export type LanguageOption = { label: string; value: string };
export type SelectOption = { label: string; value: string };
