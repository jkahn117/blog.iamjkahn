import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  getNextThemePreference,
  type ThemePreference,
} from "../src/lib/theme.ts";

const layout = readFileSync(
  new URL("../src/layouts/Base.astro", import.meta.url),
  "utf8",
);
const script = layout.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "the pre-paint theme script exists");

function setup(stored: string | null, dark: boolean, storageBlocked = false) {
  const root = {
    dataset: { theme: "" },
    style: { colorScheme: "" },
    classList: {
      dark: false,
      toggle(name: string, enabled: boolean) {
        assert.equal(name, "dark");
        this.dark = enabled;
      },
    },
  };
  const document = Object.assign(new EventTarget(), { documentElement: root });
  const system = Object.assign(new EventTarget(), { matches: dark });
  runInNewContext(script!, {
    document,
    window: {
      matchMedia(query: string) {
        assert.equal(query, "(prefers-color-scheme: dark)");
        return system;
      },
    },
    localStorage: {
      getItem(key: string) {
        assert.equal(key, "theme");
        if (storageBlocked) throw new Error("Storage blocked");
        return stored;
      },
    },
  });
  return {
    root,
    changeSystem(dark: boolean) {
      system.matches = dark;
      system.dispatchEvent(new Event("change"));
    },
    select(theme: string) {
      root.dataset.theme = theme;
      document.dispatchEvent(new Event("theme-change"));
    },
  };
}

for (const dark of [false, true]) {
  test(`system preference applies before paint and follows changes, dark=${dark}`, () => {
    const theme = setup(null, dark);
    assert.equal(theme.root.dataset.theme, "system");
    assert.equal(theme.root.classList.dark, dark);
    assert.equal(theme.root.style.colorScheme, dark ? "dark" : "light");
    theme.changeSystem(!dark);
    assert.equal(theme.root.classList.dark, !dark);
    assert.equal(theme.root.style.colorScheme, dark ? "light" : "dark");
  });
}

for (const preference of ["light", "dark"]) {
  test(`saved ${preference} overrides system preference`, () => {
    const dark = preference === "dark";
    const theme = setup(preference, !dark);
    assert.equal(theme.root.dataset.theme, preference);
    assert.equal(theme.root.classList.dark, dark);
    theme.changeSystem(dark);
    theme.changeSystem(!dark);
    assert.equal(theme.root.classList.dark, dark);
  });
}

test("the theme control cycles System, Light, Dark, then System", () => {
  let preference: ThemePreference = "system";
  for (const expected of ["light", "dark", "system"] as const) {
    preference = getNextThemePreference(preference);
    assert.equal(preference, expected);
  }
});

test("selecting an override applies immediately; System resumes live updates", () => {
  const theme = setup(null, false);
  theme.select("dark");
  assert.equal(theme.root.classList.dark, true);
  theme.select("light");
  assert.equal(theme.root.classList.dark, false);
  theme.changeSystem(true);
  assert.equal(theme.root.classList.dark, false);
  theme.select("system");
  assert.equal(theme.root.classList.dark, true);
  theme.changeSystem(false);
  assert.equal(theme.root.classList.dark, false);
});

test("unrecognized preferences and blocked storage fall back to the system", () => {
  for (const theme of [setup("invalid", true), setup("light", true, true)]) {
    assert.equal(theme.root.dataset.theme, "system");
    assert.equal(theme.root.classList.dark, true);
    theme.changeSystem(false);
    assert.equal(theme.root.classList.dark, false);
  }
});
