// domains.js — custom-domain ownership verification (the same evidence-at-the-
// -decision pattern MIR uses): the customer publishes a TXT record we hand them,
// we confirm it before the domain enters DOMAINS_MAP. The resolver is injectable
// so it can be driven deterministically in tests.

import dns from "node:dns/promises";
import fs from "node:fs";

export function makeResolver(env = process.env) {
  // test hook: read TXT records from a JSON file { "_volt-verify.acme.com": ["volt-verify=…"] }
  if (env.VOLT_TEST_TXT_FILE) {
    return async (name) => {
      try {
        const m = JSON.parse(fs.readFileSync(env.VOLT_TEST_TXT_FILE, "utf8"));
        return (m[name] || []).map((s) => [String(s)]);
      } catch {
        return [];
      }
    };
  }
  return dns.resolveTxt;
}

export async function verifyTxt(domain, expected, resolveTxt) {
  try {
    const recs = await resolveTxt(`_volt-verify.${domain}`);
    return recs.flat().map((s) => String(s).trim()).includes(expected);
  } catch {
    return false;
  }
}
