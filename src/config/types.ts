export interface SageConfig {
  model: {
    provider: string;
    model: string;
    apiKey: string;
  };
  defaultMode: string;
  tavilyApiKey: string;
}

export const DEFAULT_CONFIG: SageConfig = {
  model: {
    provider: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    apiKey: "",
  },
  defaultMode: "default",
  tavilyApiKey: "",
};
