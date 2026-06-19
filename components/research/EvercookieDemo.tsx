"use client";

import { useState } from "react";

// STUDY ONLY. This plants a demo identifier across several storage vectors and shows the
// "respawn" trick: delete one copy and it regenerates from the survivors. Everything stays
// in YOUR browser — nothing is transmitted — and the "Purge all" button performs the real
// fix (clear every vector). This is deliberately NOT used in the core pipeline, which keeps
// a single first-party id and never respawns it.

const KEY = "ec_demo";

// ---- IndexedDB vector (the non-obvious one most "clear cookies" actions miss) ----
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ec_demo_db", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const r = db.transaction("kv", "readonly").objectStore("kv").get(KEY);
      r.onsuccess = () => res((r.result as string) ?? null);
      r.onerror = () => rej(r.error);
    });
  } catch {
    return null;
  }
}
async function idbSet(v: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const r = db.transaction("kv", "readwrite").objectStore("kv").put(v, KEY);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } catch {
    /* unavailable (e.g. private mode) */
  }
}
async function idbDel(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const r = db.transaction("kv", "readwrite").objectStore("kv").delete(KEY);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } catch {
    /* ignore */
  }
}

type Vector = {
  name: string;
  get: () => Promise<string | null>;
  set: (v: string) => Promise<void>;
  del: () => Promise<void>;
};

const vectors: Vector[] = [
  {
    name: "Cookie",
    get: async () => document.cookie.match(/(?:^|; )ec_demo=([^;]*)/)?.[1] ?? null,
    set: async (v) => {
      document.cookie = `${KEY}=${v}; Max-Age=31536000; Path=/; SameSite=Lax`;
    },
    del: async () => {
      document.cookie = `${KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
    },
  },
  {
    name: "localStorage",
    get: async () => localStorage.getItem(KEY),
    set: async (v) => localStorage.setItem(KEY, v),
    del: async () => localStorage.removeItem(KEY),
  },
  {
    name: "sessionStorage",
    get: async () => sessionStorage.getItem(KEY),
    set: async (v) => sessionStorage.setItem(KEY, v),
    del: async () => sessionStorage.removeItem(KEY),
  },
  {
    name: "window.name",
    get: async () => (window.name.startsWith(KEY + ":") ? window.name.slice(KEY.length + 1) : null),
    set: async (v) => {
      window.name = `${KEY}:${v}`;
    },
    del: async () => {
      if (window.name.startsWith(KEY + ":")) window.name = "";
    },
  },
  { name: "IndexedDB", get: idbGet, set: idbSet, del: idbDel },
];

type Row = { name: string; value: string | null };

export default function EvercookieDemo() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string>(
    "Nothing read yet — plant an identifier, or read the current vectors.",
  );

  async function refresh() {
    const read = await Promise.all(
      vectors.map(async (v) => ({ name: v.name, value: await v.get() })),
    );
    setRows(read);
    return read;
  }

  async function readAll() {
    await refresh();
    setMessage("Read the current value of every vector.");
  }

  async function plant() {
    const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 12);
    await Promise.all(vectors.map((v) => v.set(id)));
    await refresh();
    setMessage(`Planted “${id}” into all ${vectors.length} vectors.`);
  }

  async function deleteLocalStorage() {
    await vectors.find((v) => v.name === "localStorage")!.del();
    await refresh();
    setMessage("Cleared localStorage only — the others still hold the id. Now hit Respawn.");
  }

  async function respawn() {
    const current = await refresh();
    const survivor = current.find((r) => r.value)?.value;
    if (!survivor) {
      setMessage("Nothing to respawn — every vector is empty.");
      return;
    }
    await Promise.all(vectors.map((v) => v.set(survivor)));
    await refresh();
    setMessage(`Respawned “${survivor}” back into every vector from a survivor. This is the trick.`);
  }

  async function purge() {
    await Promise.all(vectors.map((v) => v.del()));
    await refresh();
    setMessage("Purged every vector. Clearing all of them at once is the only real fix.");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Action onClick={plant} variant="primary">
          Plant identifier
        </Action>
        <Action onClick={readAll}>Read all vectors</Action>
        <Action onClick={deleteLocalStorage}>Delete localStorage</Action>
        <Action onClick={respawn}>Respawn</Action>
        <Action onClick={purge}>Purge all</Action>
      </div>

      <p className="mt-3 text-sm text-body" aria-live="polite">
        {message}
      </p>

      {rows.length > 0 && (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th scope="col" className="py-2 pr-4 font-mono text-[11px] uppercase tracking-wide text-mute">
                Vector
              </th>
              <th scope="col" className="py-2 font-mono text-[11px] uppercase tracking-wide text-mute">
                Stored value
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-hairline last:border-0">
                <td className="py-2 pr-4 text-body">{r.name}</td>
                <td className="py-2 font-mono text-[13px]" translate="no">
                  {r.value ? (
                    <span className="text-ink select-all">{r.value}</span>
                  ) : (
                    <span className="text-mute">— empty</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Action({
  children,
  onClick,
  disabled,
  variant = "secondary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const base =
    "inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
  const tone =
    variant === "primary"
      ? "bg-ink text-canvas hover:bg-ink/90"
      : "border border-hairline bg-canvas text-ink hover:bg-canvas-soft";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${tone}`}>
      {children}
    </button>
  );
}
