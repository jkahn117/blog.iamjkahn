export const themePreferences = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof themePreferences)[number];

export function getNextThemePreference(
  preference: ThemePreference,
): ThemePreference {
  const currentIndex = themePreferences.indexOf(preference);
  return themePreferences[(currentIndex + 1) % themePreferences.length];
}
