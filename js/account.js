'use strict';
// ---- player account: credits, permanent unlock tiers and the state of the campaign. Stored in localStorage. ----
const SAVE_KEY = 'frontline1944.save.v1';
const Account = {
  data: null,
  fresh() { return { credits: 0, tiers: { air: 1, land: 1, sea: 1 }, battles: 0, wins: 0, kills: 0, campaigns: 0, owners: null }; },
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { d = null; }
    if (!d || !d.tiers) d = this.fresh();
    for (const k of ['air', 'land', 'sea']) d.tiers[k] = Math.max(1, Math.min(MAX_TIER, d.tiers[k] | 0));
    d.credits = Math.max(0, Math.floor(+d.credits || 0));
    if (!Array.isArray(d.owners) || d.owners.length !== POINTS.length) d.owners = null;
    this.data = d; return d;
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { } },
  tier(branch) { return this.data.tiers[branch] || 1; },
  // a vehicle is usable once its branch has reached the vehicle's tier
  has(id) { const d = DEFS[id]; return !!d && (d.tier || 1) <= this.tier(d.domain); },
  nextPrice(branch) { const t = this.tier(branch); return t >= MAX_TIER ? 0 : TIER_PRICE[t + 1]; },
  unlock(branch) {
    const p = this.nextPrice(branch);
    if (!p || this.data.credits < p) return false;
    this.data.credits -= p; this.data.tiers[branch]++; this.save(); return true;
  },
  // battle payout: res = { credits, kills, win, owners (null = start a new campaign), campaignWon }
  reward(res) {
    const d = this.data;
    d.credits += res.credits; d.battles++; d.kills += res.kills; if (res.win) d.wins++;
    if (res.campaignWon) d.campaigns++;
    d.owners = res.owners; this.save();
  },
  reset() { this.data = this.fresh(); this.save(); }
};
Account.load();
if (Account.data.owners) POINTS.forEach((p, i) => { p.owner = Account.data.owners[i]; });
