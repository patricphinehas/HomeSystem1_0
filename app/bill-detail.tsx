"use client";

import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import type { StoredBill } from "@/lib/bill";
import { inr, perUnit } from "@/lib/money";

export function BillDetail({ bill, onClose }: { bill: StoredBill; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={`Bill from ${bill.store}`}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-surface p-0 text-fg backdrop:bg-black/40"
    >
      <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{bill.store}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {bill.date} · {bill.items.length} items · {inr(bill.total, 2)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
          className="grid size-8 shrink-0 place-items-center rounded-xl text-muted hover:bg-bg hover:text-fg"
        >
          <X size={16} />
        </button>
      </header>

      <div className="px-5 py-5">
        {bill.note && <p className="mb-4 text-sm text-muted">{bill.note}</p>}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="pb-2 font-normal">Item</th>
              <th className="pb-2 font-normal">Qty</th>
              <th className="pb-2 text-right font-normal">Paid</th>
              <th className="hidden pb-2 text-right font-normal sm:table-cell">Per unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bill.items.map((line, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">
                  {line.name}
                  {line.category && (
                    <span className="mt-0.5 block text-xs text-muted">
                      {line.category}
                      {line.itemId && ` · ${line.itemId}`}
                    </span>
                  )}
                  {!line.category && !line.itemId && (
                    <span className="mt-0.5 block text-xs text-warn">Not linked to inventory</span>
                  )}
                </td>
                <td className="py-2 font-mono text-xs tabular-nums">
                  {line.qty} {line.unit}
                </td>
                <td className="py-2 text-right font-mono text-xs tabular-nums">{inr(line.cost, 2)}</td>
                <td className="hidden py-2 text-right font-mono text-xs tabular-nums text-muted sm:table-cell">
                  {perUnit(line.unitPrice, line.base)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
