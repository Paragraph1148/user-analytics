// Single MongoClient reused for the life of the process. On a persistent server
// (App Runner / EC2) one module-level client is correct — we do NOT reconnect per
// request. In dev, Next's HMR re-evaluates this module on every edit, which would
// leak a new client (and connection pool) each time; stashing it on globalThis keeps
// a single client across reloads.
//
// The client is created lazily on first use (not at import time) so a production build
// — which never touches the database — doesn't require MONGODB_URI to be present.

import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as unknown as { _mongoClient?: MongoClient };

function getClient(): MongoClient {
  if (globalForMongo._mongoClient) return globalForMongo._mongoClient;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.");
  }

  const client = new MongoClient(uri);
  // Persist across HMR reloads in dev; in production a fresh module load is a fresh process.
  if (process.env.NODE_ENV !== "production") globalForMongo._mongoClient = client;
  return client;
}

// The driver connects lazily on first operation and pools internally, so a bare
// reference is enough; callers just await getDb().
export async function getDb(): Promise<Db> {
  return getClient().db(process.env.MONGODB_DB ?? "analytics");
}
