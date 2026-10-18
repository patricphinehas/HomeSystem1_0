"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plugs, Wrench } from "@phosphor-icons/react";
import { Card, Notice, Skeleton, Tabs } from "../ui";
import { PageGrid, PageHeader, Span } from "../page-frame";
import { Chat, type Provider } from "./chat";

type Tool = {
  name: string;
  description: string;
  inputSchema: { properties: Record<string, { type?: string; description?: string }>; required?: string[] };
};

type Info = {
  name: string;
  protocolVersion: string;
  endpoint: string;
  tools: Tool[];
  servers: { name: string; transport: string; target: string; features: string[] }[];
  providers: Provider[];
  provider: string;
};

/**
 * Two things live here and only one of them is ever wanted at a time: asking
 * the data a question, and wiring another client up to the same tools. They
 * are tabs rather than a scroll, so the chat gets the whole pane.
 */
const TABS = [
  { id: "chat", title: "Chat" },
  { id: "tools", title: "Tools & clients" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function McpPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("chat");

  useEffect(() => {
    fetch("/api/mcp")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setInfo)
      .catch(() => setError("Could not reach the MCP endpoint. Is the data API running on :4000?"));
  }, []);

  return (
    <PageGrid>
      <PageHeader
        title="MCP tools"
        hint={
          tab === "chat"
            ? "Ask the household data a question; the model calls the tools for you."
            : "The same tools, for any MCP client that wants to call them itself."
        }
      />

      {error && (
        <Span>
          <Notice>{error}</Notice>
        </Span>
      )}
      {!info && !error && (
        <Span>
          <Skeleton rows={3} />
        </Span>
      )}

      {info && (
        <>
          <Span>
            <Tabs
              label="MCP sections"
              current={tab}
              onChange={setTab}
              tabs={TABS.map((item) => ({ id: item.id, title: item.title }))}
            />
          </Span>

          {tab === "chat" ? (
            <>
              <Span>
                <Chat providers={info.providers} initial={info.provider} />
              </Span>
              <p className="text-xs text-muted lg:col-span-full">
                The model answers from {info.tools.length} tools over the real inventory and bills. The engine, its
                model and its API key are on the{" "}
                <Link href="/settings" className="text-accent hover:underline">
                  settings page
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <Span>
                <Card
                  dense
                  title="Tools this server exposes"
                  subtitle={`${info.tools.length} tools, MCP ${info.protocolVersion}`}
                >
                  {info.tools.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted">This server exposes no tools.</p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {info.tools.map((tool) => (
                        <li key={tool.name} className="rounded-xl border border-border bg-bg p-3">
                          <div className="flex items-center gap-2">
                            <Wrench size={14} className="shrink-0 text-accent" />
                            <code className="font-mono text-sm">{tool.name}</code>
                          </div>
                          <p className="mt-1 text-sm text-muted">{tool.description}</p>
                          <Arguments schema={tool.inputSchema} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </Span>

              <Card dense title="Connect a client" subtitle="Add this to .mcp.json, or to any MCP client over HTTP.">
                <pre className="max-w-full overflow-x-auto rounded-xl bg-bg p-3 font-mono text-xs">
                  {JSON.stringify(
                    { mcpServers: { "home-system": { type: "http", url: `http://127.0.0.1:3000${info.endpoint}` } } },
                    null,
                    2,
                  )}
                </pre>
                <p className="mt-3 text-xs text-muted">
                  Tools only — no resources, prompts or streaming, and no authentication, so keep it on localhost.
                </p>
              </Card>

              <Card dense title="Servers this project talks to" subtitle="From .mcp.json in the project root.">
                {info.servers.length === 0 ? (
                  <p className="text-sm text-muted">No MCP servers configured.</p>
                ) : (
                  <ul className="grid gap-2">
                    {info.servers.map((server) => (
                      <li
                        key={server.name}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-bg p-3"
                      >
                        <Plugs size={14} className="shrink-0 text-accent" />
                        <span className="text-sm font-medium">{server.name}</span>
                        <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
                          {server.transport}
                        </span>
                        <span className="font-mono text-xs break-all text-muted">{server.target}</span>
                        {server.features.length > 0 && (
                          <span className="basis-full text-xs text-muted">features: {server.features.join(", ")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </PageGrid>
  );
}

function Arguments({ schema }: { schema: Tool["inputSchema"] }) {
  const entries = Object.entries(schema.properties ?? {});
  if (!entries.length) return <p className="mt-2 text-xs text-muted">No arguments.</p>;

  return (
    <dl className="mt-2 grid gap-1 text-xs">
      {entries.map(([name, spec]) => (
        <div key={name} className="flex flex-wrap gap-x-2">
          <dt className="font-mono text-fg">
            {name}
            {schema.required?.includes(name) && <span className="text-warn">*</span>}
          </dt>
          <dd className="text-muted">
            <span className="font-mono">{spec.type ?? "any"}</span>
            {spec.description ? ` — ${spec.description}` : ""}
          </dd>
        </div>
      ))}
    </dl>
  );
}
