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
    provider: "https://api.deepseek.com/v1",
    model: "deepseek-pro-flash",
    apiKey: "",
  },
  defaultMode: "default",
  tavilyApiKey: "",
};
