export type SettingsTab = 'account' | 'security' | 'commercial' | 'automation';

const passwordErrorCodes = new Set(['length', 'confirm', 'same', 'current']);

export function getSettingsInitialTab(passwordError?: string): SettingsTab {
  return passwordError && passwordErrorCodes.has(passwordError) ? 'security' : 'account';
}
