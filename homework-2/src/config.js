import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  env: process.env.NODE_ENV || 'development',
};
