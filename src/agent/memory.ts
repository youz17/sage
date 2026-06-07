import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Logger } from "../log/logger.js";

function getMessageText(m: AgentMessage): string {
  switch (m.role) {
    case "user":
      return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    case "assistant":
      return JSON.stringify(m.content);
    case "toolResult":
      return JSON.stringify(m.content);
    case "bashExecution":
      return `${m.command}\n${m.output}`;
    case "custom":
      return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    case "branchSummary":
      return m.summary;
    case "compactionSummary":
      return m.summary;
    default:
      return "";
  }
}

function estimateTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const m of messages) {
    total += Math.ceil(getMessageText(m).length / 4);
  }
  return total;
}

export async function compactMemory(
  messages: AgentMessage[],
  logger?: Logger,
): Promise<AgentMessage[] | null> {
  const contextWindow = 128000;
  const estimatedTokens = estimateTokens(messages);

  if (estimatedTokens < contextWindow * 0.7) return null;
  if (messages.length < 6) return null;

  const splitPoint = Math.max(2, Math.floor(messages.length * 0.4));
  logger?.log("memory:compact", { inputCount: messages.length, splitPoint });
  const toCompact = messages.slice(0, splitPoint);
  const recent = messages.slice(splitPoint);

  const summaryLines: string[] = [];
  for (const m of toCompact) {
    const text = getMessageText(m);
    const preview = text.slice(0, 200);
    const role = m.role === "assistant" ? "Assistant" : "User";
    summaryLines.push(`- ${role}: ${preview}${text.length > 200 ? "..." : ""}`);
  }

  const summary = summaryLines.join("\n");

  return [
    {
      role: "user",
      content: `<conversation_memory>\nEarlier conversation summary:\n${summary}\n</conversation_memory>`,
      timestamp: Date.now(),
    } as AgentMessage,
    ...recent,
  ];
}
