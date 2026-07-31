// server.js — the entry point. Start it with:  node server.js
//
// It does four small things:
//   1. open the SQLite database (creating the file + table on first run)
//   2. build the task store over that connection
//   3. build the Express app over that store
//   4. start listening, and close the database cleanly on shutdown

import { openDatabase, createTaskStore } from './db.js';
import { createApp } from './app.js';

const PORT = process.env.PORT || 3000;
// Where the database file lives. Relative to wherever you start the server, so
// `node server.js` from this folder creates ./tasks.db right here.
const DB_FILE = process.env.DB_FILE || 'tasks.db';

const db = openDatabase(DB_FILE);
const store = createTaskStore(db);
const app = createApp(store);

const server = app.listen(PORT, () => {
  console.log(`Tasks API running at http://localhost:${PORT}  (database: ${DB_FILE})`);
});

// Close the database on Ctrl-C so the WAL file is checkpointed back into the
// main .db file and nothing is left half-written.
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
