export interface SageModelConfig {
  provider: string;
  model: string;
  apiKey: string;
}

export interface SageConfig {
  model: SageModelConfig;
  defaultMode: string;
  tavilyApiKey: string;
}

export const DEFAULT_CONFIG: SageConfig = {
  model: {
    provider: "deepseek",
    model: "deepseek-chat",
    apiKey: "",
  },
  defaultMode: "socratic",
  tavilyApiKey: "",
};
