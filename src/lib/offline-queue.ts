"use client";

/**
 * Offline queue (spec §Cross-cutting): IndexedDB-backed queue for field entries
 * (follow-ups, erection entries, stage updates) captured while offline, replayed
 * to REST endpoints when connectivity returns. Client entries always append;
 * conflict rule = server wins on status fields (handled server-side).
 */

const DB = "greeneco-offline";
const STORE = "queue";

export interface QueuedAction {
  id: string;
  url: string;
  method: string;
  body: unknown;
  label: string;
  at: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function uid() {
  return `${Date.now()}-${Math.floor(performance.now() * 1000)}`;
}

export async function enqueue(action: Omit<QueuedAction, "id" | "at">): Promise<void> {
  await tx("readwrite", (s) => s.add({ ...action, id: uid(), at: Date.now() }));
  window.dispatchEvent(new Event("offline-queue-changed"));
}

export async function all(): Promise<QueuedAction[]> {
  return tx<QueuedAction[]>("readonly", (s) => s.getAll());
}

export async function count(): Promise<number> {
  return tx<number>("readonly", (s) => s.count());
}

async function remove(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

/** Replay every queued action. Stops on the first network failure (still offline). */
export async function flush(): Promise<{ sent: number; remaining: number }> {
  const actions = await all();
  let sent = 0;
  for (const a of actions) {
    try {
      const res = await fetch(a.url, {
        method: a.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(a.body),
      });
      // 4xx = permanent (bad data) → drop so it doesn't wedge the queue; 5xx/network → keep.
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        await remove(a.id);
        if (res.ok) sent++;
      } else {
        break;
      }
    } catch {
      break; // still offline
    }
  }
  window.dispatchEvent(new Event("offline-queue-changed"));
  return { sent, remaining: (await all()).length };
}

/**
 * Submit a field action: try the network first; on failure, enqueue for later.
 * Returns { queued: true } when stored offline.
 */
export async function submitOrQueue(
  url: string,
  body: unknown,
  label: string,
): Promise<{ ok: boolean; queued: boolean; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue({ url, method: "POST", body, label });
    return { ok: true, queued: true };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, queued: false };
    if (res.status >= 500) {
      await enqueue({ url, method: "POST", body, label });
      return { ok: true, queued: true };
    }
    const j = await res.json().catch(() => ({}));
    return { ok: false, queued: false, error: j.error ?? `Error ${res.status}` };
  } catch {
    await enqueue({ url, method: "POST", body, label });
    return { ok: true, queued: true };
  }
}
