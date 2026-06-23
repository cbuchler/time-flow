import React from "react";
import { AppRegistry, StyleSheet } from "react-native";
import { App, SettingsRoot } from "./App";

/**
 * Both the popover and the Settings window load this same bundle. We pick which
 * root to mount from the Tauri window label (set when the window is created in
 * Rust); in a plain browser preview we fall back to the `?window=settings`
 * query so Settings can still be opened in a second tab.
 */
function currentWindow(): "main" | "settings" {
  try {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } };
    }).__TAURI_INTERNALS__;
    const label = internals?.metadata?.currentWindow?.label;
    if (label) return label === "settings" ? "settings" : "main";
  } catch {
    /* not running under Tauri */
  }
  return new URLSearchParams(window.location.search).get("window") === "settings"
    ? "settings"
    : "main";
}

const Root = currentWindow() === "settings" ? SettingsRoot : App;

AppRegistry.registerComponent("TimeAndFlow", () => Root);

function seedReactNativeWebStylesheet() {
  const sheet = (StyleSheet as unknown as {
    getSheet?: () => { id: string; textContent: string };
  }).getSheet?.();
  if (!sheet || typeof document === "undefined") return;
  let element = document.getElementById(sheet.id) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = sheet.id;
    document.head.insertBefore(element, document.head.firstChild);
  }
  if (!element.textContent || element.textContent.length < sheet.textContent.length) {
    element.textContent = sheet.textContent;
  }
  document.documentElement.dataset.rnwStyles = String(sheet.textContent.length);
}

seedReactNativeWebStylesheet();
AppRegistry.runApplication("TimeAndFlow", {
  rootTag: document.getElementById("root"),
});
