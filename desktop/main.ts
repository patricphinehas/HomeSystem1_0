/**
 * The desktop app: one window, one loopback port, one process.
 *
 * What this file is responsible for, and nothing else:
 *
 *   - where the household's writable files live (the per-user data directory,
 *     never the installed program directory, which is read-only);
 *   - starting `server/host.ts` on a port the operating system picks, bound to
 *     loopback, because this API has no authentication of any kind;
 *   - one window, sandboxed, that can only ever navigate to that port;
 *   - the menu, and remembering where the window was.
 *
 * It is not responsible for choosing a database, seeding one or backing one up
 * — that is the first-run work, and it is a phase of its own. What is here is
 * the shell those things will hang off.
 *
 *   pnpm desktop        the built pages (needs pnpm build first)
 *   pnpm desktop:dev    Next's dev server, in this process
 */

import { app, BrowserWindow, Menu, session, shell } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Host } from "../server/host.ts";
import { startHost } from "../server/host.ts";

const dev = process.argv.includes("--dev");

/**
 * Everything writable lives here: `.env`, the SQLite file, the window's last
 * size. On Windows that is %APPDATA%/HomeSystem, on Linux ~/.config/HomeSystem.
 * Nothing is ever written next to the program, because an installed program
 * directory is read-only for the user who installed it — and because an
 * uninstall should be able to take the program without taking the household.
 */
const dataDir = app.getPath("userData");
const windowStateFile = join(dataDir, "window.json");
const logFile = join(dataDir, "logs", "main.log");

/**
 * A packaged application has no console to print to, so the few lines worth
 * keeping — the port it came up on, and anything that went wrong — go to a
 * file the Help menu can open. It is appended to and never rotated, because
 * it is a handful of lines per launch.
 */
function log(...parts: unknown[]) {
  const line = `${new Date().toISOString()} ${parts.map(String).join(" ")}`;
  console.log(line);
  try {
    mkdirSync(join(dataDir, "logs"), { recursive: true });
    appendFileSync(logFile, `${line}\n`, "utf8");
  } catch {
    // Not being able to write the log must never stop the app starting.
  }
}

function prepareEnvironment() {
  mkdirSync(dataDir, { recursive: true });

  /**
   * The two kinds of path this app has, kept apart on purpose.
   *
   * Read-only resources ship with the program and are read from where it is
   * installed — inside the asar in a packaged build, which is fine, because
   * nothing writes to them. Everything writable is in dataDir instead.
   * `server/paths.ts` reads all of these, and they are set here rather than
   * guessed there, because only this process knows where it was installed.
   */
  const resources = app.getAppPath();
  process.env.HOME_SYSTEM_SQLITE_SCHEMA ??= join(resources, "sqlite", "schema.sql");
  process.env.HOME_SYSTEM_MCP_FILE ??= join(resources, ".mcp.json");
  process.env.HOME_SYSTEM_ENV_FILE ??= join(dataDir, ".env");
  process.env.HOME_SYSTEM_VERSION ??= app.getVersion();

  const envFile = process.env.HOME_SYSTEM_ENV_FILE;
  if (existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch (e) {
      log(`could not read ${envFile}: ${(e as Error).message}`);
    }
  }

  // The standalone default, and the whole reason SQLite is one of the three:
  // an install that has never been configured still has a working database.
  process.env.DB_SELECT ||= "sqlite";
  process.env.SQLITE_PATH ||= join(dataDir, "homesystem.db");
}

type WindowState = { width: number; height: number; x?: number; y?: number; maximized?: boolean };

const defaultState: WindowState = { width: 1280, height: 860 };

function readWindowState(): WindowState {
  try {
    const saved = JSON.parse(readFileSync(windowStateFile, "utf8")) as Partial<WindowState>;
    // A window remembered on a monitor that is no longer attached is worse
    // than no memory at all, so only the size is trusted without checking.
    return {
      width: Number(saved.width) > 400 ? Number(saved.width) : defaultState.width,
      height: Number(saved.height) > 300 ? Number(saved.height) : defaultState.height,
      x: Number.isFinite(saved.x) ? Number(saved.x) : undefined,
      y: Number.isFinite(saved.y) ? Number(saved.y) : undefined,
      maximized: Boolean(saved.maximized),
    };
  } catch {
    return defaultState;
  }
}

function rememberWindow(win: BrowserWindow) {
  try {
    const bounds = win.getNormalBounds();
    writeFileSync(windowStateFile, JSON.stringify({ ...bounds, maximized: win.isMaximized() }, null, 1), "utf8");
  } catch (e) {
    // Losing the window position is not worth interrupting a quit for, but a
    // failure that is never reported is how a silent bug survives.
    log(`could not save the window position: ${(e as Error).message}`);
  }
}

let host: Host | null = null;
let win: BrowserWindow | null = null;

/**
 * Everything this app renders comes from its own loopback server, so the
 * policy can be 'self' throughout: no CDN, no analytics, no font host — the
 * fonts are self-hosted by next/font at build time. `connect-src 'self'` is
 * the one that matters, because it is what a stray script would need to send
 * the household's data anywhere.
 *
 * `'unsafe-inline'` is in script-src because Next inlines its bootstrap and
 * its flight data without a nonce; removing it needs a nonce threaded through
 * the pages, and that is a change to the app rather than to the shell.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function openWindow(url: string) {
  const state = readWindowState();
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 480,
    minHeight: 480,
    show: false,
    backgroundColor: "#0b0b0c",
    title: "Home System",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The window only ever loads this app's own loopback origin.
      webSecurity: true,
    },
  });

  if (state.maximized) win.maximize();
  win.once("ready-to-show", () => win?.show());
  win.on("close", () => rememberWindow(win!));
  win.on("closed", () => (win = null));

  /**
   * Two doors out of the app, both shut. A link to anywhere but this server's
   * own origin opens in the user's browser instead of replacing the window,
   * and a target=_blank never gets a second BrowserWindow with these
   * privileges.
   */
  const sameOrigin = (target: string) => {
    try {
      return new URL(target).origin === new URL(url).origin;
    } catch {
      return false;
    }
  };
  const externally = (target: string) => {
    if (/^https?:/i.test(target)) void shell.openExternal(target);
  };

  win.webContents.on("will-navigate", (event, target) => {
    if (sameOrigin(target)) return;
    event.preventDefault();
    externally(target);
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!sameOrigin(target)) externally(target);
    return { action: "deny" };
  });

  void win.loadURL(url);
}

function buildMenu(url: string) {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Open the data folder",
          click: () => void shell.openPath(dataDir),
        },
        {
          label: "Open in a browser",
          click: () => void shell.openExternal(url),
        },
        { type: "separator" },
        { role: process.platform === "darwin" ? "close" : "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(dev || !app.isPackaged ? [{ role: "toggleDevTools" } as Electron.MenuItemConstructorOptions] : []),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "User manual",
          click: () => void win?.loadURL(`${url}/manual`),
        },
        {
          label: "Settings",
          click: () => void win?.loadURL(`${url}/settings`),
        },
        { type: "separator" },
        {
          label: "Open the log",
          click: () => void shell.openPath(logFile),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * One copy of this app per machine. Two would be two writers on one SQLite
 * file, which is the one way to meet SQLITE_BUSY in a household — so a second
 * launch hands focus to the window that is already open and exits.
 */
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    prepareEnvironment();

    try {
      host = await startHost({ port: 0, hostname: "127.0.0.1", dir: app.getAppPath(), dev });
    } catch (e) {
      log("could not start:", (e as Error).stack ?? (e as Error).message);
      const { dialog } = await import("electron");
      dialog.showErrorBox("Home System could not start", (e as Error).message);
      app.exit(1);
      return;
    }

    session.defaultSession.webRequest.onHeadersReceived((details, done) => {
      done({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] } });
    });

    log(`home system on ${host.url} (data in ${dataDir})`);
    buildMenu(host.url);
    openWindow(host.url);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && host) openWindow(host.url);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  /**
   * Quitting can skip a window's own close event — a quit from the menu, or a
   * renderer calling window.close(), does not always reach it — so the size is
   * saved here as well. Writing it twice costs one small synchronous write.
   */
  app.on("before-quit", () => {
    if (win && !win.isDestroyed()) rememberWindow(win);
    void host?.close();
  });
}
