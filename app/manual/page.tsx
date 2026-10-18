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
  ["calendar", "Calendar"],
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
          What the household pays for that never appears on a till receipt. Record what each one costs and how often it
          is charged — monthly, quarterly, yearly, weekly, or a one-off — and the page puts them all on one scale:
          what you pay a month, what you pay a year, and a per-month figure on every row however it is billed. A
          one-off is kept out of those totals, because it is not a running cost. Mark a plan shareable and record the
          seats, so it is obvious which ones have room and which are being paid for twice.
        </p>
      </Section>

      <Section id="calendar" title="Calendar">
        <p>
          <Link href="/calendar" className="text-accent hover:underline">Calendar</Link> is the shared one — movie
          nights, birthdays, visitors, anything the house plans together. Click a day in the grid to list it beside the calendar, then press <strong>Add</strong> for a new entry:
          the <strong>activity</strong> you are blocking the day for, a title, a start time and roughly how long it
          runs. Leave the time empty and it sits at the top of the day as an all-day entry. Pick a duration and the end
          time is filled in for you — only the end time is kept, so you can always correct it directly.
        </p>
        <p>
          Opening an entry — click it in the grid, in the day's list, or in <strong>Coming up</strong> — gives you the rest of it:
          where it is, a link (for a movie that is the theatre and the ticket page; for a dinner, the restaurant and
          the booking), whether it <strong>needs a booking</strong> or is already reserved and whose name it is under,
          notes, and the comments.
        </p>
        <p>
          <strong>Who is coming</strong> is a list of names. Everyone in <Key>Settings → Family</Key> is offered as a
          one-click button, and anyone else can be typed in — both work, and commas add several at once.
          Each person then has <strong>In</strong>, <strong>Maybe</strong> and <strong>Out</strong>; clicking the answer
          they already gave takes it back to no answer. Comments are signed with your name from settings.
        </p>
        <p>
          Whoever added an entry is the one who can change it. Everyone else opens the same entry and sees the detail
          written out, with the answer buttons and the comment box still working — which is the part a guest is
          there for. There is no sign-in yet, so that is a courtesy rather than a lock: a name here is a label, not an
          identity, and nothing stops one person answering for another.
        </p>
        <p>
          There is no repeat. An entry is one occurrence, so a weekly game night is added week by week, and an evening
          that runs past midnight is two entries. Repeating events mean recurrence rules, timezones and daylight
          saving, and that is a far bigger thing than this page is; if you need it, say so and it gets built properly
          rather than half-built. The chat on the MCP page can read and add to the calendar too — ask it when the
          next movie night is.
        </p>
      </Section>

      <Section id="mcp" title="MCP tools and chat">
        <p>
          <Link href="/mcp" className="text-accent hover:underline">MCP tools</Link> is two tabs.{" "}
          <strong>Tools &amp; clients</strong> exposes the household data as Model Context Protocol tools: reading
          inventory and low stock, setting a quantity, recording a bill, pulling spend and the price history of one
          item, listing the family and the calendar, and adding to it. It lists each tool with its arguments and gives
          you the block to paste into an MCP client.
        </p>
        <p>
          <strong>Chat</strong>, the other tab, calls those same tools for you. Pick the engine in the dropdown — a local{" "}
          <strong>Ollama</strong>, <strong>NVIDIA NIM</strong> for Nemotron, or <strong>OpenRouter</strong> for anything
          hosted — and ask in plain words. Answers come back formatted: lists, emphasis, tables and clickable links.
          Every turn is kept, a day at a time, and the dropdown in the chat header reads any of them back; asking
          something new always starts today&rsquo;s thread.
          Each tool call is shown as it happens, so you can open one and check the numbers the answer was built from. A local Ollama model must support tool calling, or it will answer from
          nothing.
        </p>
        <p>
          The MCP endpoint has no authentication. Keep it on localhost; do not expose port 3000 or 4000 to the network.
        </p>
      </Section>

      <Section id="settings" title="Settings">
        <p>
          <Link href="/settings" className="text-accent hover:underline">Settings</Link> is six tabs:{" "}
          <strong>You</strong>, <strong>Family</strong>, <strong>Region</strong>, <strong>Database</strong>,{" "}
          <strong>Inference</strong> and <strong>Appearance</strong>. All but Family and Appearance write to{" "}
          <Key>.env</Key> in the project root and share the <em>Save to .env</em> button at the bottom; a dot on a tab
          means it is holding a change you have not saved.
        </p>
        <p>
          <strong>Region</strong> is how everything is written: the locale (<Key>en-IN</Key>, <Key>en-GB</Key>,{" "}
          <Key>de-DE</Key>…) for dates and number grouping, the currency for every price, and an IANA timezone for
          what “today” means — leave that empty and today is today wherever you are reading. Changing the
          currency does not convert anything already recorded; it changes how it is written. A value Intl cannot use
          is refused on save rather than quietly ignored.
        </p>
        <p>
          The other two save themselves. <strong>Family</strong> is who lives here — a name and a role each —
          and it is a collection in the database rather than a setting, because the calendar points at these people by
          name. It saves as you type. Two people cannot share a name: an invitation and its answer are keyed by the
          name, so a duplicate would make two people one. <strong>Appearance</strong> is the theme, and it never
          leaves this browser: system, light or dark.
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
