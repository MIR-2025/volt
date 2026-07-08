// plans.js — the tiers. Limits enforced by the control plane; costs modeled in
// HOSTING-ARCHITECTURE.md. Free is deliberately near-zero-cost-at-rest (no video,
// no custom domains, modest storage) so it can be given away.

export const PLANS = {
  free: { name: "Free", price: 0, sites: 3, storageMB: 1024, bandwidthGB: 20, customDomains: 0, video: false },
  pro: { name: "Pro", price: 12, sites: 10, storageMB: 10240, bandwidthGB: 500, customDomains: 10, video: true },
};

export const planOf = (user) => PLANS[user?.plan] || PLANS.free;
