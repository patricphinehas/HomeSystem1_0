/**
 * The chat window on /mcp, backed by whichever model the settings name.
 *
 * Ollama, NVIDIA NIM and OpenRouter all speak the OpenAI chat-completions API
 * with tool calling, so there is one code path and the provider is a base URL,
 * a key and a model name. Anything else that speaks the same API can be reached
 * by pointing Ollama's URL at it.
 *
 * ponytail: no streaming — one request, the tool rounds run server-side, the
 * whole exchange comes back at the end. Add SSE here if the wait starts to show.
 */

import { callTool, toolSchemas } from "./mcp.ts";

export type ProviderId = "ollama" | "nvidia" | "openrouter";

const env = (key: string, fallback = "") => (process.env[key] ?? "").trim() || fallback;

export const PROVIDERS: Record<ProviderId, { label: string; base: () => string; key: () => string; model: () => string; keyField?: string }> = {
  ollama: {
    label: "Ollama (local)",
    base: () => `${env("OLLAMA_URL", "http://127.0.0.1:11434").replace(/\/+$/, "")}/v1`,
    key: () => "",
    model: () => env("OLLAMA_MODEL", "llama3.1"),
  },
  nvidia: {
    label: "NVIDIA NIM (Nemotron)",
    base: () => env("NVIDIA_URL", "https://integrate.api.nvidia.com/v1").replace(/\/+$/, ""),
    key: () => env("NVIDIA_API_KEY"),
    keyField: "NVIDIA_API_KEY",
    // NVIDIA retires models from the catalogue and the endpoint then answers
    // 410 Gone, so this default has a shelf life. GET /v1/models with the key
    // lists what the account can actually call today.
    model: () => env("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
  },
  openrouter: {
    label: "OpenRouter",
    base: () => env("OPENROUTER_URL", "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
    key: () => env("OPENROUTER_API_KEY"),
    keyField: "OPENROUTER_API_KEY",
    model: () => env("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.5"),
  },
};

export const isProvider = (value: string): value is ProviderId => value in PROVIDERS;

export const currentProvider = (): ProviderId => {
  const chosen = env("CHAT_PROVIDER", "ollama");
  return isProvider(chosen) ? chosen : "ollama";
};

/** What the settings page and the chat header show without leaking the key. */
export const describeProviders = () =>
  (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({
    id,
    label: PROVIDERS[id].label,
    base: PROVIDERS[id].base(),
    model: PROVIDERS[id].model(),
    needsKey: !!PROVIDERS[id].keyField,
    hasKey: !PROVIDERS[id].keyField || !!PROVIDERS[id].key(),
  }));

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
};

const SYSTEM = `You are the assistant inside Home System, a household inventory, bill and price tracker.

Use the tools to answer; never guess at quantities, prices or dates. Money is Indian rupees.
Prices are compared per base unit (kg, litre, piece), so "cheaper" means cheaper per base unit, not per pack.
Answer in a couple of sentences unless asked for detail, and say plainly when a tool found nothing.`;

/** Enough for a model to reason over, small enough not to blow the context. */
const MAX_TOOL_CHARS = 6000;
const MAX_ROUNDS = 5;

/**
 * Per model call. A reasoning model with a couple of tool rounds takes ten or
 * fifteen seconds, so this is generous — it is here to end a hang, not to
 * hurry anything. Without it a provider that never answers holds the request
 * open until something else gives up, and what the browser then sees is an
 * opaque 500 from the proxy rather than a sentence saying what happened.
 */
const TIMEOUT_MS = 90_000;

/**
 * And a budget for the whole turn, because MAX_ROUNDS calls of TIMEOUT_MS each
 * would outlast any proxy in front of this. Rounds already under way finish;
 * none is started past it. Has to stay below `proxyTimeout` in next.config.ts.
 */
const TURN_BUDGET_MS = 110_000;

const trim = (text: string) =>
  text.length <= MAX_TOOL_CHARS ? text : `${text.slice(0, MAX_TOOL_CHARS)}\n...[truncated, ask for a narrower slice]`;

async function complete(id: ProviderId, messages: ChatMessage[]): Promise<ChatMessage> {
  const provider = PROVIDERS[id];
  if (provider.keyField && !provider.key()) {
    throw new Error(`${provider.label} needs ${provider.keyField}. Set it on the settings page.`);
  }

  const key = provider.key();
  let response: Response;
  try {
    response = await fetch(`${provider.base()}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: provider.model(),
        messages,
        tools: toolSchemas().map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
        temperature: 0.2,
      }),
    });
  } catch (e) {
    const error = e as Error;
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`${provider.label} did not answer within ${TIMEOUT_MS / 1000} seconds. Try a narrower question.`);
    }
    throw new Error(`Cannot reach ${provider.label} at ${provider.base()}. (${error.message})`);
  }

  // Read as text first: an error body is not always JSON, and throwing away
  // what the provider actually said leaves you with a bare "Gone".
  const raw = await response.text();
  let body: { choices?: { message?: ChatMessage }[]; error?: { message?: string }; detail?: string; message?: string } | null =
    null;
  try {
    body = JSON.parse(raw);
  } catch {
    // Not JSON. `raw` is the whole of what came back, and that is the message.
  }

  if (!response.ok) {
    const detail = body?.error?.message ?? body?.detail ?? body?.message ?? (raw.slice(0, 300) || response.statusText);
    throw new Error(
      `${provider.label} refused "${provider.model()}" (${response.status} ${response.statusText}): ${detail}`,
    );
  }

  const message = body?.choices?.[0]?.message;
  if (!message) throw new Error(`${provider.label} returned no message. Is "${provider.model()}" a model it has?`);
  return message as ChatMessage;
}

/**
 * One turn: ask the model, run whatever tools it asks for, ask again, until it
 * answers in words. Returns only the messages this turn added, so the browser
 * can append them and show each tool call as it happened.
 */
export async function chat(id: ProviderId, history: ChatMessage[]) {
  const conversation: ChatMessage[] = [{ role: "system", content: SYSTEM }, ...history];
  const added: ChatMessage[] = [];
  const deadline = Date.now() + TURN_BUDGET_MS;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round > 0 && Date.now() > deadline) {
      added.push({
        role: "assistant",
        content: "That took too long and I stopped part-way. The tool results above are real; ask something narrower.",
      });
      return { messages: added, model: PROVIDERS[id].model() };
    }
    const reply = await complete(id, conversation);
    conversation.push(reply);
    added.push(reply);

    const calls = reply.tool_calls ?? [];
    if (!calls.length) return { messages: added, model: PROVIDERS[id].model() };

    for (const call of calls) {
      let args: Record<string, unknown> | null = null;
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // A model that emits broken JSON gets told so and can try again.
      }
      const text = args
        ? trim((await callTool(call.function.name, args)).text)
        : `Could not read the arguments for ${call.function.name}: ${call.function.arguments}`;

      const message: ChatMessage = { role: "tool", tool_call_id: call.id, name: call.function.name, content: text };
      conversation.push(message);
      added.push(message);
    }
  }

  added.push({ role: "assistant", content: `Stopped after ${MAX_ROUNDS} rounds of tool calls without an answer. Try a narrower question.` });
  return { messages: added, model: PROVIDERS[id].model() };
}
