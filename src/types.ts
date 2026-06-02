export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type AgentEventType =
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "text_chunk"
  | "text_done"
  | "error"
  | "done";

export interface AgentEvent {
  type: AgentEventType;
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolCallId?: string;
  iteration?: number;
}

export interface AgentConfig {
  maxIterations: number;
  mode: string;
  skills: string[];
  autoSkillPrompt?: string;
  onEvent?: (event: AgentEvent) => void;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  thinking: string | null;
}

export interface StreamChunk {
  type: "content" | "thinking" | "tool_call" | "done";
  content?: string;
  toolCall?: ToolCall;
}
