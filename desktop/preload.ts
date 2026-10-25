/**
 * The preload. It runs in the renderer with context isolation on, so the only
 * thing the pages can see is what is handed over here — never `require`, never
 * `process`, never the file system.
 *
 * There is deliberately almost nothing in it yet. The pages are the same pages
 * the browser gets, and anything they need from the shell (the per-launch API
 * token, a save dialog) arrives in a later phase through an explicit channel.
 * `desktop: true` is here so a page can tell where it is running without
 * sniffing the user agent.
 */

import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("homeSystem", {
  desktop: true,
  version: process.env.HOME_SYSTEM_VERSION ?? "",
  platform: process.platform,
});
