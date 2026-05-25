import { NextRequest } from "next/server";
import OpenAI from "openai";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: (process.env.DEEPSEEK_API_KEY || "").trim(),
      baseURL: "https://api.deepseek.com",
    });
  }
  return _client;
}

function getSystemPrompt(): string {
  return `You are Agent-M (the "M" stands for Money), a financial intelligence assistant for Blackdeer Investment Group (BIG). You have access to live AppFolio property management data through tool calls.

Your personality: Professional yet approachable. You speak with confidence about financial data. You format numbers as currency when appropriate. You use bullet points and tables for clarity.

Available data tools let you query:
- Income statements (P&L) for any date range or property
- Cash flow statements (operating/investing/financing)
- Budget vs actuals and year-over-year comparisons
- Aged receivables (who owes what, how long overdue)
- Lease expiration schedules
- Rent roll (all units, occupancy, rents)
- Vendor disbursements (check register)
- Property-level P&L for individual properties
- Account totals (property balances)

When answering questions:
1. Call the appropriate tool(s) to get real data — never make up numbers
2. Summarize the key insights, don't just dump raw data
3. Highlight anything concerning (e.g., high delinquency, negative cash flow)
4. When asked about profitability, consider both income and expenses
5. Format dollar amounts with commas and 2 decimal places where precise, or round to nearest dollar for summaries
6. If a question is ambiguous, make a reasonable assumption and state it

Today's date: ${new Date().toISOString().split("T")[0]}`;
}

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_income_statement",
      description: "Get portfolio-wide P&L (income statement). Returns total income, total expenses, net income, and per-account breakdowns.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD. Defaults to first of current month." },
          to: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
          period: { type: "string", enum: ["mtd", "qtd", "ytd", "custom"], description: "Preset period. Defaults to mtd." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_pnl",
      description: "Get P&L for a specific property by name or slug. Returns income, expenses, net income for that property.",
      parameters: {
        type: "object",
        properties: {
          property: { type: "string", description: "Property name or slug (e.g., 'Greywolf Properties' or 'greywolf-properties')" },
          from: { type: "string", description: "Start date YYYY-MM-DD" },
          to: { type: "string", description: "End date YYYY-MM-DD" },
          period: { type: "string", enum: ["mtd", "qtd", "ytd"], description: "Preset period" },
        },
        required: ["property"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cash_flow",
      description: "Get cash flow statement broken into operating, investing, and financing activities.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["mtd", "ytd"], description: "Period for cash flow. Defaults to mtd." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget_yoy",
      description: "Get budget vs actuals (if budget exists) or year-over-year comparison. Returns per-account actuals, budgets, variances, and YoY changes.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD" },
          to: { type: "string", description: "End date YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_aged_receivables",
      description: "Get outstanding receivables grouped by tenant with aging buckets (current, 31-60, 61-90, 90+ days). Shows who owes money and how overdue.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lease_expirations",
      description: "Get lease expiration schedule showing all leases grouped by time bucket (expired, 0-30, 31-60, 61-90, 91-180, 180+ days).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_rent_roll",
      description: "Get full rent roll showing all units, tenants, occupancy status, market/actual rents, lease end dates, and balances.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vendors",
      description: "Get vendor disbursements from the check register. Shows all vendors, number of checks, and total amounts paid.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD" },
          to: { type: "string", description: "End date YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_totals",
      description: "Get property-level account balance totals. Shows net amounts per property.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function callInternalApi(baseUrl: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  return res.json();
}

async function executeTool(name: string, args: Record<string, string>, baseUrl: string): Promise<string> {
  try {
    let data: unknown;
    switch (name) {
      case "get_income_statement":
        data = await callInternalApi(baseUrl, "/api/income-statement", args);
        break;
      case "get_property_pnl":
        data = await callInternalApi(baseUrl, "/api/property-pnl", args);
        break;
      case "get_cash_flow":
        data = await callInternalApi(baseUrl, "/api/cash-flow", args);
        break;
      case "get_budget_yoy":
        data = await callInternalApi(baseUrl, "/api/budget", args);
        break;
      case "get_aged_receivables":
        data = await callInternalApi(baseUrl, "/api/aged-receivables");
        break;
      case "get_lease_expirations":
        data = await callInternalApi(baseUrl, "/api/lease-expirations");
        break;
      case "get_rent_roll":
        data = await callInternalApi(baseUrl, "/api/rent-roll");
        break;
      case "get_vendors":
        data = await callInternalApi(baseUrl, "/api/check-register", args);
        break;
      case "get_account_totals":
        data = await callInternalApi(baseUrl, "/api/account-totals");
        break;
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "Tool execution failed" });
  }
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = (await request.json()) as { messages: ChatMessage[] };

    const baseUrl = request.nextUrl.origin;

    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: getSystemPrompt() },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    let response = await getClient().chat.completions.create({
      model: "deepseek-chat",
      messages: openaiMessages,
      tools,
      tool_choice: "auto",
      max_tokens: 2048,
      temperature: 0.3,
    });

    let assistantMessage = response.choices[0]?.message;

    // Handle tool calls in a loop (up to 5 iterations)
    let iterations = 0;
    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0 && iterations < 5) {
      iterations++;

      openaiMessages.push({
        role: "assistant",
        content: assistantMessage.content || "",
        tool_calls: assistantMessage.tool_calls,
      });

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        assistantMessage.tool_calls
          .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: "function"; function: { name: string; arguments: string } } => "function" in tc)
          .map(async (tc) => {
            const args = JSON.parse(tc.function.arguments || "{}");
            const result = await executeTool(tc.function.name, args, baseUrl);
            return {
              role: "tool" as const,
              tool_call_id: tc.id,
              content: result,
            };
          })
      );

      openaiMessages.push(...toolResults);

      response = await getClient().chat.completions.create({
        model: "deepseek-chat",
        messages: openaiMessages,
        tools,
        tool_choice: "auto",
        max_tokens: 2048,
        temperature: 0.3,
      });

      assistantMessage = response.choices[0]?.message;
    }

    return Response.json({
      message: assistantMessage?.content || "I wasn't able to generate a response. Please try again.",
    });
  } catch (err) {
    console.error("Agent-M error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Agent-M encountered an error" },
      { status: 500 }
    );
  }
}
