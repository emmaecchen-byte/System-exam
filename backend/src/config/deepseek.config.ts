export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export function getDeepSeekConfig(): DeepSeekConfig {
  return {
    apiKey: (process.env.DEEPSEEK_API_KEY ?? '').trim(),
    baseUrl: (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, ''),
    model: (process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro').trim(),
    timeoutMs: parseInt(process.env.DEEPSEEK_TIMEOUT_MS ?? '30000', 10),
  };
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(getDeepSeekConfig().apiKey);
}
