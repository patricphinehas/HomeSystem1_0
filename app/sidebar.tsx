"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartLine, House, Package, Receipt, Repeat } from "@phosphor-icons/react";

const links = [
  { href: "/", label: "Overview", icon: House },
  { href: "/inventory", label: "Inventory management", icon: Package },
  { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/upload", label: "Enter bill", icon: Receipt },
  { href: "/analytics", label: "Analytics", icon: ChartLine },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <nav
      aria-label="Main"
      className="flex gap-1 overflow-x-auto border-b border-border bg-surface p-3 md:h-full md:w-60 md:shrink-0 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:p-4"
    >
      <Link href="/" className="mb-4 hidden px-3 text-sm font-semibold tracking-tight md:block">
        Home System
      </Link>
      {links.map(({ href, label, icon: Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
              active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-bg hover:text-fg"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
