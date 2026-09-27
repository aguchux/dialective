What still blocks enabling any of it
§7's shadow-mode requirement cannot be met yet. Production has zero streaming history — no access logs, no usage rows, no payments. The split rule has still never seen real traffic, which is the non-negotiable precondition.
The mint is deferred pending Stripe becoming a polled reserve source. That needs its own design pass: Stripe's balance is net of payouts and fees, so it isn't a clean stand-in for collected revenue.
The three Stripe events must be enabled in the dashboard or no payment is ever recorded and no pool can fund — it fails silently.
Frontend still undeployed for everything since the deck publish UI; Vercel CLI failed on sandbox egress, so that needs vercel deploy --prod from the repo root.