// payments.js — Stripe Checkout for self-service credit purchases (mirrors curio).
//
// An app buys USD credits with its app token; Stripe charges the card; on the
// confirmed webhook we add the credits and flip the token to the payg tier. Keys
// are read at call time. Without STRIPE_SECRET_KEY everything no-ops so the
// gateway still runs (free tier + BYO keep working).
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  return key ? new Stripe(key) : null;
}

export function paymentsEnabled() {
  return !!process.env.STRIPE_SECRET_KEY;
}

// Create a Checkout Session for `amountUsd` of credits. The app token + amount
// ride in metadata so the webhook knows which token to credit. Returns the hosted
// payment URL, or null if Stripe isn't configured.
export async function createCheckoutSession({ token, amountUsd, baseUrl }) {
  const stripe = getStripe();
  if (!stripe) return null;
  const opts = process.env.STRIPE_ACCOUNT ? { stripeContext: process.env.STRIPE_ACCOUNT } : undefined;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: { name: "Volt AI credits" },
            unit_amount: Math.round(amountUsd * 100),
          },
        },
      ],
      success_url: `${baseUrl}/credits?status=success`,
      cancel_url: `${baseUrl}/credits?status=cancel`,
      metadata: { token: String(token), amountUsd: String(amountUsd) },
    },
    opts,
  );
  return session.url;
}

// Verify a webhook payload's signature and return the parsed event. Throws on a
// bad signature (so the route returns 400).
export function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET || "");
}
