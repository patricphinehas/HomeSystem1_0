import Link from "next/link";
import type { Metadata } from "next";
import { PageGrid, PageHeader, Span } from "../page-frame";

export const metadata: Metadata = {
  title: "User manual · Home System",
  description: "How to use Home System, page by page.",
};

/**
 * Prose, so a server component with no data fetching. Kept in one file on
 * purpose — it is read top to bottom, and splitting it costs more than it saves.
 */

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="h-full scroll-mt-8 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      <div className="mt-3 grid gap-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em] text-fg">{children}</code>
);

const CONTENTS = [
  ["start", "Getting started"],
  ["overview", "Overview"],
  ["control", "Home control"],
  ["inventory", "Inventory"],
  ["upload", "Entering a bill"],
  ["analytics", "Analytics"],
  ["subscriptions", "Subscriptions"],
  ["mcp", "MCP tools and chat"],
  ["settings", "Settings"],
  ["prices", "How prices are compared"],
  ["trouble", "When something is wrong"],
];

export default function ManualPage() {
  return (
    <PageGrid>
      <PageHeader
        title="User manual"
        hint="What each page does, and the few rules worth knowing before you trust a number on screen."
      />

      <Span>
      <nav aria-label="Contents" className="rounded-xl border border-border bg-surface p-3">
        <ol className="grid gap-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {CONTENTS.map(([id, title], i) => (
            <li key={id}>
              <a href={`#${id}`} className="text-muted hover:text-accent hover:underline">
                <span className="mr-2 font-mono text-xs">{i + 1}.</span>
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      </Span>

      <Section id="start" title="Getting started">
        <p>
          Home System runs on your own machine: the pages on port 3000, a small data API on port 4000, and a database
          you choose. Nothing leaves the house unless you point the inference engine at a hosted model.
        </p>
        <p>
          Nothing shows data until the database is reachable. If every page is empty or warning, open{" "}
          <Link href="/settings" className="text-accent hover:underline">Settings</Link> — the database panel says what
          it is trying to reach and whether it answered. A database that is reachable but empty is filled by{" "}
          <Key>mise run seed</Key>.
        </p>
      </Section>

      <Section id="overview" title="Overview">
        <p>
          The four counters are categories, items tracked, items running low and items at zero. <strong>Buy next</strong>{" "}
          is every item at or below its minimum, worst first. It is driven entirely by the minimums you set in
          Inventory; an item with a minimum of zero never appears there.
        </p>
      </Section>

      <Section id="control" title="Home control">
        <p>
          <Link href="/control" className="text-accent hover:underline">
            Home control
          </Link>{" "}
          is the household activity list and the only view of the machine running the app. It shows what is running
          low, the latest bills, and the subscriptions on record, each with a link to the page where you change them.
          A recent bill opens in place.
        </p>
        <p>
          The machine panel says whether the pages, the data API, and the selected database answered, and names the
          database target from Settings. It does not read disk space, NAS shares, or a power switch — those are listed
          as not connected, because nothing in the app can see them.
        </p>
      </Section>

      <Section id="inventory" title="Inventory">
        <p>
          One tab per category. Each row is an item with a quantity, a minimum, a unit and tags. Change the quantity
          with the stepper or by typing; it saves as you go, and a failed save says so rather than pretending.
        </p>
        <p>
          <strong>Tags</strong> are the grouping key on the Analytics page, so tag the way you want to see spend split —{" "}
          <Key>staples</Key>, <Key>cleaning</Key>, <Key>kids</Key>. Up to eight per item, lowercased automatically.
        </p>
        <p>
          <strong>Aliases</strong> matter when you import bills. A shop that prints <em>TOOR DAL 1KG</em> for what you
          call <em>Toor dal</em> will not match until that name is an alias, and the import dialog lets you attach one
          without leaving the page. The chart button on a row opens that item&rsquo;s full purchase history.
        </p>
      </Section>

      <Section id="upload" title="Entering a bill">
        <p>
          Add a line per thing bought: name, quantity, unit and what the whole line cost — not the per-kilo price, the
          amount printed on the receipt. Each line comes back compared against what that item used to cost.
        </p>
        <p>
          To load several at once, paste a JSON array into the import box. Up to 100 bills per import, and the sample in
          the box is the exact shape expected. An import is not price-compared, because comparing a batch against a
          history it is itself extending reports nonsense.
        </p>
      </Section>

      <Section id="analytics" title="Analytics">
        <p>
          Spend by month, category, store and tag, with a three-month projection from the trend of what you have
          already spent. The projection is a straight line, not a forecast — treat it as &ldquo;at this rate&rdquo;.
        </p>
        <p>
          <strong>Deviations</strong> are items whose latest price is well off their own average. <strong>Inflation</strong>{" "}
          is per item, annualised, plus a basket index that starts at 100 in the first month with data. An item needs at
          least two purchases in the same base unit before any of it can be worked out.
        </p>
      </Section>

      <Section id="subscriptions" title="Subscriptions">
        <p>
          What the household pays for monthly that never appears on a till receipt. Mark a plan shareable and record the
          seats, so it is obvious which ones have room and which are being paid for twice.
        </p>
      </Section>

      <Section id="mcp" title="MCP tools and chat">
        <p>
          <Link href="/mcp" className="text-accent hover:underline">MCP tools</Link> exposes the household data as
          Model Context Protocol tools: reading inventory and low stock, setting a quantity, recording a bill, pulling
          spend and the price history of one item. The page lists each tool with its arguments and gives you the block
          to paste into an MCP client.
        </p>
        <p>
          The chat window on the same page calls those same tools for you. Pick the engine in the dropdown — a local{" "}
          <strong>Ollama</strong>, <strong>NVIDIA NIM</strong> for Nemotron, or <strong>OpenRouter</strong> for anything
          hosted — and ask in plain words. Each tool call is shown as it happens, so you can open one and check the
          numbers the answer was built from. A local Ollama model must support tool calling, or it will answer from
          nothing.
        </p>
        <p>
          The MCP endpoint has no authentication. Keep it on localhost; do not expose port 3000 or 4000 to the network.
        </p>
      </Section>

      <Section id="settings" title="Settings">
        <p>
          <Link href="/settings" className="text-accent hover:underline">Settings</Link> writes to{" "}
          <Key>.env</Key> in the project root. <strong>Theme</strong> is the exception and stays in this browser:
          system, light or dark.
        </p>
        <p>
          Switching <Key>DB_SELECT</Key> between MongoDB and Supabase takes effect immediately, as long as the other one
          is configured and running. Changing a <em>connection string</em> does not — those are read once when the API
          starts, so the page says &ldquo;restart needed&rdquo; and means it.
        </p>
        <p>
          API keys are write-only here: a key that is already set shows as <em>set</em> and never comes back to the
          browser. Leave the box empty to keep it, type to replace it.
        </p>
      </Section>

      <Section id="prices" title="How prices are compared">
        <p>
          Every line is reduced to a price per <strong>base unit</strong> — per kg, per litre, or per piece. Grams fold
          into kilograms and millilitres into litres, so a 500 g pack and a 2 kg bag compare directly.
        </p>
        <p>
          This is why &ldquo;cheaper&rdquo; here never means a smaller number on the receipt. It also means two
          purchases in units that do not reduce to the same base — a <em>pack</em> and a <em>kg</em> — are not compared
          at all, and the item&rsquo;s report counts them as other bases rather than mixing them in.
        </p>
      </Section>

      <Section id="trouble" title="When something is wrong">
        <div className="grid gap-3">
          <p>
            <strong>Every page warns and nothing loads</strong> — the data API is not running, or the database is not
            reachable. <Key>mise run develop</Key> starts both; <Key>mise run doctor</Key> says which part is unhappy.
          </p>
          <p>
            <strong>&ldquo;The tables are missing&rdquo;</strong> — the schema was never applied. <Key>mise run migrate</Key>.
          </p>
          <p>
            <strong>An imported bill matched nothing</strong> — the shop&rsquo;s names are not your names. Add aliases
            from the import dialog.
          </p>
          <p>
            <strong>The chat says it cannot reach the engine</strong> — for Ollama, it is not running on the host in
            Settings; for NVIDIA or OpenRouter, the key is missing or the model name is not one that account can use.
          </p>
          <p>
            <strong>Inflation is empty</strong> — not enough history. Two purchases of the same item in the same base
            unit, minimum.
          </p>
        </div>
      </Section>
    </PageGrid>
  );
}
