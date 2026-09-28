// Plans (EXPERIENCE §13.2): the trader's own recap, then yearly and monthly. Nothing preselected, no countdowns.
import { useEffect, useState } from 'react';
import { RULE_NAMES, type TitleId } from '@dg/core';
import { api } from '../api.ts';
import { plural } from '../fmt.ts';
import { onLink } from '../router.ts';
import { useToast } from '../ui/kit.tsx';
import type { PageProps } from '../main.tsx';

type PlanKind = 'yearly' | 'monthly' | 'earlybird_yearly';

interface PlansData {
  prices: Record<PlanKind, number>;
  earlyBird: boolean;
  recap: { pauses: number; skipped: number; daysTraded: number; daysKept: number; topRule: string | null };
}

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

export function Plans({ me, reload }: PageProps) {
  const [d, setD] = useState<PlansData | null>(null);
  const toast = useToast();
  const paid = new URLSearchParams(location.search).has('paid');
  const lic = me.license;
  const subscribed = lic.state === 'active' || lic.state === 'past_due';

  useEffect(() => {
    api<PlansData>('GET', '/api/plans').then(setD).catch(() => {});
  }, []);

  // Back from checkout: the plan turns on when the provider's webhook arrives, usually within seconds.
  useEffect(() => {
    if (!paid || subscribed) return;
    let n = 0;
    const id = setInterval(() => (++n > 24 ? clearInterval(id) : void reload()), 5000);
    return () => clearInterval(id);
  }, [paid, subscribed]);

  async function buy(plan: PlanKind) {
    try {
      const r = await api('POST', '/api/checkout', { plan });
      location.href = r.url;
    } catch {
      toast("Checkout isn't available right now. Try again in a moment.");
    }
  }

  const r = d?.recap;
  const offers: [PlanKind, string, string][] = d
    ? [
        d.earlyBird
          ? ['earlybird_yearly', `${usd(d.prices.earlybird_yearly)} a year`, `Early-bird: kept at every renewal while your plan never lapses. Renews every year at ${usd(d.prices.earlybird_yearly)}.`]
          : ['yearly', `${usd(d.prices.yearly)} a year`, `Renews every year at ${usd(d.prices.yearly)}.`],
        ['monthly', `${usd(d.prices.monthly)} a month`, `Renews every month at ${usd(d.prices.monthly)}.`],
      ]
    : [];

  return (
    <div className="stack">
      <h1>Plans</h1>
      {paid && (
        <div className="banner">
          {subscribed
            ? "Protection is back on. Today's trades count, so your next trade may be paused. Your devices update within 5 minutes."
            : 'Payment received. Turning your plan on…'}
        </div>
      )}
      {r && r.daysTraded + r.pauses > 0 && (
        <div className="card">
          <h2>So far</h2>
          <p>
            {plural(r.pauses, 'pause')}. You skipped {plural(r.skipped, 'trade')}. You kept your rules on {r.daysKept} of the {plural(r.daysTraded, 'day')} you traded.
            {r.topRule && ` Your most frequent pause: ${(RULE_NAMES[r.topRule as TitleId] ?? r.topRule).toLowerCase()}.`}
          </p>
        </div>
      )}
      {subscribed ? (
        <div className="card">
          <p>You're on a plan. <a href="/account#plan" onClick={onLink}>Manage it in Account</a>.</p>
        </div>
      ) : (
        <div className="grid two">
          {offers.map(([plan, price, renews]) => (
            <div key={plan} className="card">
              <h2>{plan === 'monthly' ? 'Monthly' : 'Yearly'}</h2>
              <p className="stat">{price}</p>
              <button className="primary" onClick={() => buy(plan)}>Choose {plan === 'monthly' ? 'monthly' : 'yearly'}</button>
              <p className="small muted">{renews} Cancel anytime. Full refund within 14 days.</p>
            </div>
          ))}
        </div>
      )}
      <p className="small muted">Tax, if any, is added at checkout. Paying mid-session turns protection on at once.</p>
    </div>
  );
}
