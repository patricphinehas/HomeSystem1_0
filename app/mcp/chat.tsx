"use client";

import { useEffect, useRef, useState } from "react";
import { PaperPlaneTilt, Wrench } from "@phosphor-icons/react";

export type Provider = { id: string; label: string; base: string; model: string; needsKey: boolean; hasKey: boolean };

type Message = {
  role: "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
};

const EXAMPLES = [
  "What are we about to run out of?",
  "How has rice changed in price?",
  "What did we spend last month, and on what?",
];

/**
 * A conversation with the household data. The model and the tool rounds both
 * run on the API (server/chat.ts); this only sends the history and appends
 * whatever comes back, tool calls included so the reasoning is visible.
 */
export function Chat({ providers, initial }: { providers: Provider[]; initial: string }) {
  const [provider, setProvider] = useState(initial);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const chosen = providers.find((p) => p.id === provider);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    const history = [...messages, { role: "user" as const, content: question }];
    setMessages(history);
    setDraft("");
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, messages: history }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? response.statusText);
      setMessages([...history, ...body.messages]);
    } catch (e) {
      setError((e as Error).message || "The model did not answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-[28rem] flex-col rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-sm font-medium">Ask the data</h2>
          <p className="mt-0.5 text-xs text-muted">
            {chosen ? `${chosen.model} · ${chosen.base}` : "Pick an engine"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} className="text-xs text-muted hover:text-fg">
              Clear
            </button>
          )}
          <select
            aria-label="Inference engine"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-xl border border-border bg-bg px-2 py-1.5 text-sm"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.needsKey && !p.hasKey ? " (no key)" : ""}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="grid gap-2">
            <p className="text-sm text-muted">
              The model gets the tools listed below and answers from the real inventory and bills.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => send(example)}
                  className="rounded-xl border border-border px-3 py-1.5 text-left text-xs text-muted hover:text-fg"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <Bubble key={i} message={message} />
        ))}

        {busy && <p className="text-sm text-muted">Thinking...</p>}
        {error && (
          <p role="status" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            {error}
          </p>
        )}
        <div ref={end} />
      </div>

      <form
        className="flex items-center gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about stock, prices or spend"
          aria-label="Your question"
          className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          aria-label="Send"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-surface disabled:opacity-40"
        >
          <PaperPlaneTilt size={15} weight="bold" />
        </button>
      </form>
    </section>
  );
}

function Bubble({ message }: { message: Message }) {
  if (message.role === "tool") {
    return (
      <details className="rounded-xl border border-border bg-bg px-3 py-2 text-xs">
        <summary className="flex cursor-pointer items-center gap-1.5 text-muted">
          <Wrench size={13} />
          {message.name} returned
        </summary>
        <pre className="mt-2 max-h-60 overflow-auto font-mono text-[11px] whitespace-pre-wrap text-muted">
          {message.content}
        </pre>
      </details>
    );
  }

  if (message.role === "user") {
    return (
      <p className="ml-auto w-fit max-w-[85%] rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
        {message.content}
      </p>
    );
  }

  // An assistant turn that only called tools has no prose worth a bubble.
  if (!message.content?.trim()) {
    return message.tool_calls?.length ? (
      <p className="text-xs text-muted">
        Calling {message.tool_calls.map((c) => c.function.name).join(", ")}...
      </p>
    ) : null;
  }

  return <p className="max-w-[85%] text-sm whitespace-pre-wrap">{message.content}</p>;
}
