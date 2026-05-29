import type { LLMConfig, LLMResponse, Message, ToolCall, ToolSchema } from "../types.js";

const DEFAULT_CONFIG: LLMConfig = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
};

export function createLLMClient(config: Partial<LLMConfig> = {}): LLMClient {
  return new LLMClient({ ...DEFAULT_CONFIG, ...config });
}

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async generate(
    messages: Message[],
    tools?: ToolSchema[],
  ): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(formatMessage),
      stream: false,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const res = await this.request(body);
    const choices = res.choices as Array<{ message: Record<string, unknown> }>;
    const msg = choices[0].message;

    return {
      content: (msg.content as string) ?? null,
      toolCalls: (msg.tool_calls as ToolCall[]) ?? [],
      thinking: (msg.reasoning_content as string) ?? null,
    };
  }

  async *stream(
    messages: Message[],
    tools?: ToolSchema[],
  ): AsyncGenerator<LLMResponse, void, undefined> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(formatMessage),
      stream: true,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let contentAcc = "";
    let thinkingAcc = "";
    const toolCallsAcc: Map<number, { id: string; name: string; args: string }> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
        if (!choices || choices.length === 0) continue;

        const delta = choices[0].delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        if (delta.reasoning_content) {
          thinkingAcc += delta.reasoning_content as string;
        }

        if (delta.content) {
          contentAcc += delta.content as string;
          yield {
            content: delta.content as string,
            toolCalls: [],
            thinking: null,
          };
        }

        if (delta.tool_calls) {
          const tcs = delta.tool_calls as Array<Record<string, unknown>>;
          for (const tc of tcs) {
            const index = tc.index as number;
            const existing = toolCallsAcc.get(index);
            if (!existing) {
              toolCallsAcc.set(index, {
                id: (tc.id as string) ?? "",
                name: ((tc.function as Record<string, unknown>)?.name as string) ?? "",
                args: ((tc.function as Record<string, unknown>)?.arguments as string) ?? "",
              });
            } else {
              const fn = tc.function as Record<string, unknown> | undefined;
              if (fn?.arguments) existing.args += fn.arguments as string;
              if (fn?.name) existing.name += fn.name as string;
              if (tc.id) existing.id = tc.id as string;
            }
          }
        }
      }
    }

    if (toolCallsAcc.size > 0) {
      const toolCalls: ToolCall[] = [];
      for (const [, tc] of toolCallsAcc) {
        toolCalls.push({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.args },
        });
      }
      yield {
        content: contentAcc || null,
        toolCalls,
        thinking: thinkingAcc || null,
      };
    }

    if (thinkingAcc && !contentAcc && toolCallsAcc.size === 0) {
      yield {
        content: null,
        toolCalls: [],
        thinking: thinkingAcc,
      };
    }
  }

  private async request(body: Record<string, unknown>, retries = 3): Promise<Record<string, unknown>> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(
          `${this.config.baseUrl}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM API error ${response.status}: ${errorText}`);
        }

        return (await response.json()) as Record<string, unknown>;
      } catch (err) {
        lastError = err as Error;
        if (i < retries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
      }
    }

    throw lastError;
  }
}

function formatMessage(msg: Message): Record<string, unknown> {
  const formatted: Record<string, unknown> = {
    role: msg.role,
    content: msg.content,
  };
  if (msg.tool_calls) formatted.tool_calls = msg.tool_calls;
  if (msg.tool_call_id) formatted.tool_call_id = msg.tool_call_id;
  if (msg.name) formatted.name = msg.name;
  return formatted;
}
