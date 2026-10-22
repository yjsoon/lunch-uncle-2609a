import { buildSystemPrompt } from "./prompt.js";
import { toolDefinitions, executeTool } from "./tools.js";

// OpenCode Go, OpenAI-compatible chat completions endpoint.
const LLM_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
// deepseek-v4.1-flash was unavailable upstream (429) on 2026-10-21; switch back once it works.
const LLM_MODEL = "glm-5.3-flash";

const LLM_TIMEOUT_MS = 20_000;
const MAX_ROUNDS = 8;

const FALLBACK_REPLY = "Just go Berseh Food Centre lah.";
const FOOD_WORDS = /\b(eat|lunch|food|makan|hungry|restaurant|hawker)\b/i;

/**
 * Run the agentic loop for one user turn and return Uncle's reply.
 *
 * history is the prior conversation as OpenAI-style {role, content} messages.
 */
export async function runLoop(history, message, env) {
  if (needsFallback(message, Boolean(env.GOOGLE_PLACES_API_KEY))) {
    return FALLBACK_REPLY;
  }

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...history,
    { role: "user", content: message },
  ];

  // One session id per turn, shared by every model call in this loop run,
  // so the OpenCode Go endpoint can route and cache consistently.
  const sessionId = crypto.randomUUID();

  let round = 0;
  while (round < MAX_ROUNDS) {
    const assistant = await callModel(messages, env, sessionId);
    messages.push(assistant);

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return assistant.content ?? "";
    }

    for (const call of toolCalls) {
      const args = parseArgs(call.function.arguments);
      console.log(`round ${round}: ${call.function.name}`, args);
      const result = await executeTool(call.function.name, args, env);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  return "Uncle tried too many times already. Ask something simpler.";
}

async function callModel(messages, env, sessionId) {
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENCODE_API_KEY}`,
      "x-opencode-session": sessionId,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      tools: toolDefinitions,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`LLM returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.choices[0].message;
}

/**
 * Uncle cannot search for places without the Places key, so a food question
 * gets the safe canned answer. Everything else, such as rain or bus
 * questions, still goes to the model.
 */
export function needsFallback(message, hasPlacesKey) {
  return !hasPlacesKey && FOOD_WORDS.test(message);
}

function parseArgs(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
