"use client";

import { useState } from "react";
import Link from "next/link";
import { lowStock } from "@/lib/inventory";
import { KINDS, describeState, stateSummary } from "@/lib/devices";
import type { StoredBill } from "@/lib/bill";
import type { SubscriptionsDoc } from "@/lib/subscriptions";
import { inr } from "@/lib/money";
import { useInventory } from "../use-inventory";
import { useJson } from "../use-api";
import { useDevices, useHomeState } from "../use-devices";
import { BillDetail } from "../bill-detail";
import { Card } from "../ui";
import { PageGrid, PageHeader } from "../page-frame";

type Health = {
  database?: {
    target: string;
    ok: boolean;
    server?: string;
    error?: string;
    counts?: { categories: number; items: number; bills: number };
  };
};

const action = "inline-flex min-h-10 items-center text-xs text-accent hover:underline";

export default function HomeControlPage() {
  const { inv, error: invError } = useInventory();
  const bills = useJson<{ bills: StoredBill[] }>("/api/bills?limit=6");
  const subs = useJson<SubscriptionsDoc>("/api/subscriptions");
  const settings = useJson<Health>("/api/settings");
  const { doc: registry } = useDevices();
  // Slower than the smart-home page's five seconds: this is a summary card on a
  // page somebody leaves open, not the screen they adjust a room from.
  const { home } = useHomeState(15_000);
  const [openBill, setOpenBill] = useState<StoredBill | null>(null);

  const low = inv ? lowStock(inv) : null;
  const devices = registry?.devices ?? [];
  const house = stateSummary(devices, home?.states ?? {});
  const controllersDown = (home?.controllers ?? []).filter((c) => !c.ok);
  const db = settings.data?.database;
  const api = settings.loading ? "checking" : settings.data ? "up" : settings.error ? "down" : "checking";

  return (
    <PageGrid>
      <PageHeader
        title="Home control"
        hint="Household activity, and what this app can see of the machine it runs on."
      />

      <Card dense title="This machine" subtitle="What the app can check about the box it runs on. Devices are on Smart home.">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Data API</dt>
            <dd className={api === "up" ? "text-accent" : api === "down" ? "text-warn" : "text-muted"}>
              {api === "up" ? "Answering" : api === "down" ? "Not answering" : "Checking"}
            </dd>
            {settings.error && <p className="mt-1 text-xs text-warn">{settings.error}</p>}
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted">Database</dt>
            <dd className="break-all font-mono text-xs">
              {db ? db.target : api === "down" ? "Not checked" : "Checking"}
            </dd>
            {db?.server && <p className="mt-1 text-xs text-muted">{db.server}</p>}
            {db && (
              <p className={`mt-1 text-xs ${db.ok ? "text-accent" : "text-warn"}`}>
                {db.ok
                  ? `Answering${db.counts ? ` · ${db.counts.items} items, ${db.counts.bills} bills` : ""}`
                  : (db.error ?? "Not answering")}
              </p>
            )}
          </div>
        </dl>
        <Link href="/settings" className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-sm">
          Open settings
        </Link>
      </Card>

      <Card dense title="Services to watch" subtitle="Status from a real check. Nothing here is switched on or off.">
        <ul className="divide-y divide-border">
          <Service
            label="Pages"
            state="up"
            detail="This page loaded. The Next.js app is serving it."
          />
          <Service
            label="Data API"
            state={api}
            detail={
              api === "up"
                ? "GET /api/settings answered."
                : api === "down"
                  ? "The settings request failed. The API on port 4000 is the usual cause."
                  : "Waiting for /api/settings."
            }
          />
          <Service
            label="Database"
            state={db ? (db.ok ? "up" : "down") : api === "down" ? "unknown" : "checking"}
            detail={
              db
                ? db.ok
                  ? db.target
                  : (db.error ?? "The selected database did not answer.")
                : api === "down"
                  ? "Not checked — the data API did not answer."
                  : "Waiting for the health payload."
            }
          />
        </ul>
      </Card>

      <Card dense title="Not connected" subtitle="Listed so they are not mistaken for a quiet reading.">
        <ul className="grid gap-2 text-sm">
          <li>NAS shares and disk volumes — no share, no mount, and no free-space figure.</li>
          <li>Power, reboot, and service switches — this page cannot start or stop the machine.</li>
          <li>Anything not behind an edge controller — a device no controller owns cannot be reached.</li>
        </ul>
      </Card>

      <Card
        dense
        title="Smart home"
        subtitle={
          registry
            ? devices.length
              ? `${house.on} on · ${house.online}/${house.total} answering`
              : "Nothing paired yet"
            : "Loading…"
        }
        aside={
          <Link href="/devices" className={action}>
            Open smart home
          </Link>
        }
      >
        {!registry ? (
          <Pending />
        ) : devices.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            No devices. Add an edge controller on Smart home and the house shows up here.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {devices.slice(0, 6).map((device) => {
                const state = home?.states[device.id];
                const unit = KINDS[device.kind].unit;
                return (
                  <li key={device.id} className="flex items-baseline justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {device.name || "Unnamed device"}
                      <span className="ml-2 text-xs text-muted">{device.room || "no room"}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {state?.online && state.value !== null && (
                        <span className="font-mono text-xs tabular-nums">
                          {state.value}
                          {unit}
                        </span>
                      )}
                      <span
                        className={`ml-2 text-xs ${
                          !state?.online ? "text-warn" : state.power ? "text-accent" : "text-muted"
                        }`}
                      >
                        {describeState(device, state)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {devices.length > 6 && <p className="mt-2 text-xs text-muted">{devices.length - 6} more on Smart home.</p>}
            {controllersDown.length > 0 && (
              <p className="mt-2 text-xs text-warn">
                {controllersDown.map((c) => c.name).join(", ")} not answering — everything on it reads as offline.
              </p>
            )}
          </>
        )}
      </Card>

      <Card
        dense
        title="Buy next"
        subtitle={low ? `${low.length} at or below minimum` : "Loading…"}
        aside={
          <Link href="/inventory" className={action}>
            Handle in inventory
          </Link>
        }
      >
        {invError ? (
          <p className="text-xs text-warn">{invError}</p>
        ) : low === null ? (
          <Pending />
        ) : low.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">Nothing is below its minimum.</p>
        ) : (
          <ul className="divide-y divide-border">
            {low.slice(0, 6).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {item.name}
                  <span className="ml-2 text-xs text-muted">{item.category}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-warn">
                  {item.qty} / {item.min} {item.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
        {low && low.length > 6 && (
          <p className="mt-2 text-xs text-muted">{low.length - 6} more in inventory.</p>
        )}
      </Card>

      <Card
        dense
        title="Recent bills"
        subtitle={bills.data ? `${bills.data.bills.length} most recent` : "Loading…"}
        aside={
          <Link href="/upload" className={action}>
            Enter a bill
          </Link>
        }
      >
        {bills.error ? (
          <p className="text-xs text-warn">{bills.error}</p>
        ) : !bills.data ? (
          <Pending />
        ) : bills.data.bills.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">No bills yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {bills.data.bills.map((bill) => (
              <li key={bill.id}>
                <button
                  type="button"
                  onClick={() => setOpenBill(bill)}
                  className="flex min-h-10 w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1 text-left text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{bill.store}</span>
                    <span className="text-xs text-muted">
                      {bill.date} · {bill.items.length} items
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums">{inr(bill.total, 2)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        dense
        title="Subscriptions"
        subtitle={subs.data ? `${subs.data.subscriptions.length} on record` : "Loading…"}
        aside={
          <Link href="/subscriptions" className={action}>
            Open subscriptions
          </Link>
        }
      >
        {subs.error ? (
          <p className="text-xs text-warn">{subs.error}</p>
        ) : !subs.data ? (
          <Pending />
        ) : subs.data.subscriptions.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">No subscriptions yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {subs.data.subscriptions.slice(0, 6).map((sub) => (
              <li key={sub.id} className="flex items-baseline justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {sub.name}
                  <span className="ml-2 text-xs text-muted">{sub.type}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {sub.holder || "No holder"}
                  {sub.shareable ? " · shared" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {subs.data && subs.data.subscriptions.length > 6 && (
          <p className="mt-2 text-xs text-muted">{subs.data.subscriptions.length - 6} more on the subscriptions page.</p>
        )}
      </Card>

      {openBill && <BillDetail bill={openBill} onClose={() => setOpenBill(null)} />}
    </PageGrid>
  );
}

function Service({
  label,
  state,
  detail,
}: {
  label: string;
  state: "up" | "down" | "checking" | "unknown";
  detail: string;
}) {
  const word =
    state === "up" ? "Answering" : state === "down" ? "Not answering" : state === "unknown" ? "Not checked" : "Checking";
  const tone = state === "up" ? "text-accent" : state === "down" ? "text-warn" : "text-muted";
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="mt-0.5 block text-xs break-words text-muted">{detail}</span>
      </span>
      <span className={`shrink-0 text-xs ${tone}`}>{word}</span>
    </li>
  );
}

function Pending() {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Loading">
      <div className="h-8 animate-pulse rounded-lg bg-bg" />
      <div className="h-8 animate-pulse rounded-lg bg-bg" />
    </div>
  );
}
