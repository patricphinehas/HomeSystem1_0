"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
      if (!response.ok) {
        // A reply with no JSON in it did not come from the data API — it is the
        // dev server's proxy saying it could not reach :4000, and "Internal
        // Server Error" on its own sends you looking in the wrong place.
        if (!body) throw new Error(`The data API did not answer (${response.status}). Is it still running on :4000?`);
        throw new Error(body.error ?? response.statusText);
      }
      setMessages([...history, ...body.messages]);
    } catch (e) {
      setError((e as Error).message || "The model did not answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-[32rem] flex-col rounded-xl border border-border bg-surface lg:min-h-[38rem]">
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

  return (
    <div className="max-w-[85%] text-sm">
      <Answer>{message.content}</Answer>
    </div>
  );
}

/**
 * The model answers in Markdown, so it is rendered as Markdown — bullets,
 * emphasis, tables and links instead of a wall of asterisks.
 *
 * `react-markdown` builds React elements and never sets innerHTML, which is
 * what makes this safe: the text comes from a model that has just been fed
 * tool output, and raw HTML in it must not become markup. GFM is on for
 * tables, strikethrough and bare URLs; the component map below is only
 * styling, because nothing here inherits Tailwind's reset.
 */
function Answer({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: (props) => <p {...props} className="mb-2 last:mb-0" />,
        ul: (props) => <ul {...props} className="mb-2 grid list-disc gap-1 pl-5 last:mb-0" />,
        ol: (props) => <ol {...props} className="mb-2 grid list-decimal gap-1 pl-5 last:mb-0" />,
        li: (props) => <li {...props} className="marker:text-muted" />,
        strong: (props) => <strong {...props} className="font-semibold" />,
        em: (props) => <em {...props} className="italic" />,
        h1: (props) => <h3 {...props} className="mb-1 font-semibold" />,
        h2: (props) => <h3 {...props} className="mb-1 font-semibold" />,
        h3: (props) => <h3 {...props} className="mb-1 font-semibold" />,
        code: (props) => <code {...props} className="rounded bg-bg px-1 py-0.5 font-mono text-[0.85em]" />,
        pre: (props) => (
          <pre {...props} className="mb-2 max-w-full overflow-x-auto rounded-xl bg-bg p-3 font-mono text-xs last:mb-0" />
        ),
        blockquote: (props) => <blockquote {...props} className="border-l-2 border-border pl-3 text-muted" />,
        hr: () => <hr className="my-3 border-border" />,
        table: (props) => (
          <div className="mb-2 max-w-full overflow-x-auto last:mb-0">
            <table {...props} className="w-full text-left text-xs" />
          </div>
        ),
        th: (props) => <th {...props} className="border-b border-border pr-3 pb-1 font-medium" />,
        td: (props) => <td {...props} className="border-b border-border pr-3 py-1 align-top" />,
        // Anything the model links to is outside this app, so it opens away
        // from it and cannot reach back through window.opener.
        a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" className="text-accent underline" />,
      }}
    >
      {children}
    </Markdown>
  );
}
