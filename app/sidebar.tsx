"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHousehold } from "./use-household";
import {
  BookOpen,
  CalendarBlank,
  CaretRight,
  ChartLine,
  Gear,
  HardDrives,
  House,
  List,
  Package,
  Plugs,
  Receipt,
  Repeat,
  Thermometer,
  SignOut,
  X,
} from "@phosphor-icons/react";

type Entry = { href: string; label: string; icon: typeof House };
type Group = { group: string; hint: string; items: Entry[] };
type Row = Entry | Group;

const isGroup = (row: Row): row is Group => "group" in row;

/**
 * The order is the argument the app makes for itself.
 *
 * Overview and **Analytics** are at the top level, because the household's own
 * inflation rate — what *your* basket did, next to what the official figure
 * says — is the thing this app exists to work out, and it should never be two
 * clicks away. Everything that feeds it is grouped under it. The smart home
 * and the machine checks are an extension (useful, not the point), and the
 * inference engine is a way of asking the same data questions, so both are
 * groups rather than top-level claims on attention.
 */
const nav: Row[] = [
  { href: "/", label: "Overview", icon: House },
  { href: "/analytics", label: "Analytics", icon: ChartLine },
  {
    group: "Groceries & expenses",
    hint: "What the house buys, and what it costs",
    items: [
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/upload", label: "Enter bill", icon: Receipt },
      { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
    ],
  },
  {
    group: "Automations & monitoring",
    hint: "The house itself, and this machine",
    items: [
      { href: "/devices", label: "Smart home", icon: Thermometer },
      { href: "/control", label: "Home control", icon: HardDrives },
    ],
  },
  { href: "/calendar", label: "Calendar", icon: CalendarBlank },
  {
    group: "Inference engine",
    hint: "Ask the household data a question",
    items: [{ href: "/mcp", label: "MCP tools & chat", icon: Plugs }],
  },
  { href: "/settings", label: "Settings", icon: Gear },
  { href: "/manual", label: "User manual", icon: BookOpen },
];

const everyEntry = nav.flatMap((row) => (isGroup(row) ? row.items : [row]));

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const user = useHousehold();
  const current = everyEntry.find((entry) => entry.href === path)?.label ?? "Home System";

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="w-full max-w-full md:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-border"
          >
            {open ? <X size={18} /> : <List size={18} />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
          <Link href="/" className="min-w-0 truncate text-sm font-semibold tracking-tight">
            Home System
          </Link>
          <span className="ml-auto min-w-0 truncate pl-2 text-xs text-muted">{current}</span>
        </div>
        {open && (
          <nav
            id="mobile-nav"
            aria-label="Main"
            className="max-h-[70vh] overflow-y-auto border-b border-border bg-surface px-2 py-2"
          >
            <NavRows path={path} roomy onNavigate={() => setOpen(false)} />
            <UserSlot name={user.name} household={user.household} roomy />
          </nav>
        )}
      </div>

      <nav
        aria-label="Main"
        className="hidden gap-1 bg-surface md:flex md:h-full md:w-60 md:shrink-0 md:flex-col md:overflow-hidden md:border-r md:border-border md:p-4"
      >
        <Link href="/" className="mb-4 px-3 text-sm font-semibold tracking-tight">
          Home System
        </Link>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto">
          <NavRows path={path} />
        </div>
        <UserSlot name={user.name} household={user.household} />
      </nav>
    </>
  );
}

function NavRows({ path, roomy, onNavigate }: { path: string; roomy?: boolean; onNavigate?: () => void }) {
  return (
    <div className="grid min-w-0 gap-1 *:min-w-0">
      {nav.map((row) =>
        isGroup(row) ? (
          <NavGroup key={row.group} {...row} path={path} roomy={roomy} onNavigate={onNavigate} />
        ) : (
          <NavLink key={row.href} {...row} path={path} roomy={roomy} onNavigate={onNavigate} />
        ),
      )}
    </div>
  );
}

/**
 * A section of the nav, open or shut. It starts open, and a group holding the
 * page you are on cannot be shut out from under you — collapsing is for
 * getting the other sections out of the way, not for hiding where you are.
 */
function NavGroup({
  group,
  hint,
  items,
  path,
  roomy,
  onNavigate,
}: Group & { path: string; roomy?: boolean; onNavigate?: () => void }) {
  const holdsCurrent = items.some((item) => item.href === path);
  const [open, setOpen] = useState(true);
  const shown = open || holdsCurrent;
  const id = `nav-${group.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className="grid min-w-0 gap-1">
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={id}
        title={hint}
        onClick={() => setOpen(!shown)}
        className={`flex min-w-0 shrink-0 items-center gap-1 rounded-lg px-3 text-left text-[11px] font-medium tracking-wide text-muted uppercase transition hover:text-fg ${
          roomy ? "min-h-9" : "py-1.5"
        }`}
      >
        <CaretRight
          size={10}
          weight="bold"
          className={`shrink-0 transition-transform ${shown ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="min-w-0 truncate">{group}</span>
      </button>
      {shown && (
        <div id={id} className="ml-3 grid min-w-0 gap-1 border-l border-border pl-2 *:min-w-0">
          {items.map((item) => (
            <NavLink key={item.href} {...item} path={path} roomy={roomy} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  path,
  roomy,
  onNavigate,
}: Entry & {
  path: string;
  roomy?: boolean;
  onNavigate?: () => void;
}) {
  const active = path === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex min-w-0 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm transition ${
        roomy ? "min-h-10" : "py-2"
      } ${active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-bg hover:text-fg"}`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

/** Name from settings. Logout is a placeholder until there is a sign-in. */
function UserSlot({ name, household, roomy }: { name: string; household: string; roomy?: boolean }) {
  const label = name || "Household";
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={`flex shrink-0 items-center gap-2 border-t border-border px-1 ${
        roomy ? "mt-2 pt-2" : "mt-auto px-0 pt-3"
      }`}
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-medium text-accent"
      >
        {initials || "HS"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        <span className="block truncate text-[11px] text-muted">{household || "Home System"}</span>
      </span>
      <button
        type="button"
        disabled
        title="Placeholder. There is no sign-in yet."
        className={`flex shrink-0 items-center gap-1 rounded-lg text-[11px] text-muted ${
          roomy ? "min-h-10 px-2" : "px-2 py-1"
        }`}
      >
        <SignOut size={14} />
        Log out
      </button>
    </div>
  );
}
