// server.js — the entry point. Start it with:  node server.js
//
//   1. load configuration from .env
//   2. build the Supabase auth service
//   3. build the app over it
//   4. listen

import dotenv from 'dotenv';
import { createSupabaseAuth } from './authService.js';
import { createApp } from './app.js';

dotenv.config({ quiet: true });

// Fail fast, and say exactly what is missing. Without these two the app cannot
// talk to Supabase at all, so there is no point starting.
const { SUPABASE_URL, SUPABASE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_KEY. Copy .env.example to .env and fill them in.',
  );
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

const auth = createSupabaseAuth(SUPABASE_URL, SUPABASE_KEY);
const app = createApp({ auth });

app.listen(PORT, () => {
  // The Stage 0 checkpoint line. `createClient` does not make a network call, so
  // "connected" means "configured and ready to call Supabase", not a live ping.
  console.log(`Server running and connected to Supabase — http://localhost:${PORT} (docs: /docs)`);
});
