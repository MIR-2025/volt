// store.js — a tiny JSON-file store: named collections of records, atomic writes
// (temp + rename). Zero-dep, fine for the control plane's low write volume
// (accounts/sites/domains). At scale this is the one piece to swap for Postgres;
// the call sites only use get/all/find/put/del, so the interface is the seam.

import fs from "node:fs";
import path from "node:path";

export function makeStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (c) => path.join(dir, c.replace(/[^a-z0-9_-]/gi, "") + ".json");
  const read = (c) => { try { return JSON.parse(fs.readFileSync(file(c), "utf8")); } catch { return {}; } };
  const write = (c, obj) => {
    const tmp = file(c) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file(c)); // atomic on the same filesystem
  };
  return {
    get: (c, id) => read(c)[id] || null,
    all: (c) => Object.values(read(c)),
    find: (c, pred) => Object.values(read(c)).filter(pred),
    put: (c, id, rec) => { const o = read(c); o[id] = { ...(o[id] || {}), ...rec, id }; write(c, o); return o[id]; },
    del: (c, id) => { const o = read(c); delete o[id]; write(c, o); },
  };
}
