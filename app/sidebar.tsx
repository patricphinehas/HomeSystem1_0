"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHousehold } from "./use-household";
import {
  BookOpen,
  CalendarBlank,
  ChartLine,
  Gear,
  HardDrives,
  House,
  List,
  Package,
  Plugs,
  Receipt,
  Repeat,
  SignOut,
  X,
} from "@phosphor-icons/react";

const links = [
  { href: "/", label: "Overview", icon: House },
  { href: "/control", label: "Home control", icon: HardDrives },
  { href: "/inventory", label: "Inventory management", icon: Package },
  { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/calendar", label: "Calendar", icon: CalendarBlank },
  { href: "/upload", label: "Enter bill", icon: Receipt },
  { href: "/analytics", label: "Analytics", icon: ChartLine },
  { href: "/mcp", label: "MCP tools", icon: Plugs },
  { href: "/manual", label: "User manual", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Gear },
];

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const user = useHousehold();
  const current = links.find((link) => link.href === path)?.label ?? "Home System";

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
            <div className="grid gap-1">
              {links.map((link) => (
                <NavLink key={link.href} {...link} path={path} roomy onNavigate={() => setOpen(false)} />
              ))}
            </div>
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
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {links.map((link) => (
            <NavLink key={link.href} {...link} path={path} />
          ))}
        </div>
        <UserSlot name={user.name} household={user.household} />
      </nav>
    </>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  path,
  roomy,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof House;
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
      className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm transition ${
        roomy ? "min-h-10" : "py-2"
      } ${active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-bg hover:text-fg"}`}
    >
      <Icon size={18} />
      {label}
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
