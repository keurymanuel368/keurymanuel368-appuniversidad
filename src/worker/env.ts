export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI: Ai;
  TZ_OFFSET_HOURS: string;
  MOODLE_URL: string;
  // Secretos
  APP_PASSWORD?: string;
  SESSION_SECRET?: string;
  MOODLE_TOKEN?: string;
  WA_PHONE_NUMBER_ID?: string;
  WA_TOKEN?: string;
  WA_VERIFY_TOKEN?: string;
  WA_APP_SECRET?: string;
  WA_MY_NUMBER?: string;
  WA_WABA_ID?: string; // identificador de la cuenta de WhatsApp Business (no es secreto)
  CALLMEBOT_APIKEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  // Motores de IA gratis (opcionales, se usan en cadena)
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  NVIDIA_API_KEY?: string;
  NVIDIA_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  CEREBRAS_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}
