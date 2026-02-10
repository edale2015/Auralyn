export interface ChannelFlags {
  whatsappIntakeEnabled: boolean;
  telegramIntakeEnabled: boolean;
  testConsoleEnabled: boolean;
  llmEnabledDefault: boolean;
}

export function getChannelFlags(): ChannelFlags {
  return {
    whatsappIntakeEnabled: process.env.ENABLE_WHATSAPP_INTAKE !== "0",
    telegramIntakeEnabled: process.env.ENABLE_TELEGRAM_INTAKE === "1",
    testConsoleEnabled: process.env.ENABLE_TEST_CONSOLE === "1",
    llmEnabledDefault: process.env.LLM_ENABLED_DEFAULT !== "0",
  };
}
