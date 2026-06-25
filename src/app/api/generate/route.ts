import { NextResponse } from "next/server";
import { z } from "zod";
import { CLAUDE_MODEL, getAnthropic } from "@/lib/anthropic";
import { createCards } from "@/lib/store";

export const runtime = "nodejs";
// Give the model room to think; structured task breakdown is quick but not instant.
export const maxDuration = 60;

const requestSchema = z.object({
  goal: z.string().trim().min(1, "Describe a goal first").max(1000),
});

// Validates Claude's structured output before it touches the store.
const tasksSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        body: z.string().max(2000),
        details: z.string().max(4000),
        devStrategy: z.string().max(4000),
        iteration: z.number().int().min(1).max(20),
        estimatedTokens: z.number().int().min(0).max(10_000_000),
      }),
    )
    .min(1)
    .max(8),
});

// JSON Schema for Claude's structured output (output_config.format). A raw
// schema keeps us decoupled from any zod-helper version differences.
const OUTPUT_FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            details: { type: "string" },
            devStrategy: { type: "string" },
            iteration: { type: "integer" },
            estimatedTokens: { type: "integer" },
          },
          required: [
            "title",
            "body",
            "details",
            "devStrategy",
            "iteration",
            "estimatedTokens",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["tasks"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = [
  "You break a high-level software goal into a short list of concrete, actionable kanban task cards.",
  "Produce between 3 and 6 tasks, ordered in a sensible build sequence.",
  "For each task provide:",
  "- title: a short imperative title (e.g. 'Set up the database schema').",
  "- body: a one- or two-sentence summary of what to do.",
  "- details: a fuller description of what the task involves and why it matters.",
  "- devStrategy: a detailed, practical development strategy for implementing this task — concrete steps, tools/approaches, and things to watch out for.",
  "- iteration: an integer phase number (starting at 1) that groups tasks into logical stages; tasks that can ship together share an iteration, and dependent work uses a higher number.",
  "- estimatedTokens: your estimate of the number of LLM tokens it would take an AI coding agent to implement this task end to end, as a rough effort/complexity signal (a larger or more complex task gets a larger number).",
].join("\n");

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  let client;
  try {
    client = getAnthropic();
  } catch (error) {
    // Missing API key — a configuration problem, not a server fault.
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  try {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { format: OUTPUT_FORMAT },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Goal: ${parsed.data.goal}` }],
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "Claude declined this request. Try rephrasing your goal." },
        { status: 422 },
      );
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Claude returned no usable content." },
        { status: 502 },
      );
    }

    let data: z.infer<typeof tasksSchema>;
    try {
      data = tasksSchema.parse(JSON.parse(textBlock.text));
    } catch {
      return NextResponse.json(
        { error: "Could not parse Claude's response." },
        { status: 502 },
      );
    }

    const cards = await createCards(data.tasks, "todo");
    return NextResponse.json({ cards }, { status: 201 });
  } catch (error) {
    const err = error as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Claude request failed." },
      { status: typeof err.status === "number" ? err.status : 502 },
    );
  }
}
