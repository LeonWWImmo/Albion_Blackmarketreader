// Where api/_lib/billing.js keeps subscriptions: public.subscriptions on Supabase (service role),
// or a Map for tests and `npm run dev`.

const fromDb = (r) =>
  r && {
    userId: r.user_id,
    subscriptionId: r.subscription_id,
    customerId: r.customer_id,
    variantId: r.variant_id,
    status: r.status,
    renewsAt: r.renews_at,
    endsAt: r.ends_at,
    testMode: r.test_mode,
    providerUpdatedAt: r.provider_updated_at
  };

function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export function createBillingStore(db) {
  const one = async (column, value) => fromDb(must(await db.from("subscriptions").select("*").eq(column, value).maybeSingle()));
  return {
    getByUser: (userId) => one("user_id", userId),
    getBySubscription: (subscriptionId) => one("subscription_id", subscriptionId),
    async save(row) {
      must(
        await db.from("subscriptions").upsert({
          user_id: row.userId,
          subscription_id: row.subscriptionId,
          customer_id: row.customerId,
          variant_id: row.variantId,
          status: row.status,
          renews_at: row.renewsAt,
          ends_at: row.endsAt,
          test_mode: row.testMode,
          provider_updated_at: row.providerUpdatedAt,
          updated_at: new Date().toISOString()
        })
      );
    }
  };
}

export function createMemoryBillingStore() {
  const rows = new Map();
  return {
    rows,
    getByUser: async (userId) => rows.get(userId) ?? null,
    getBySubscription: async (subscriptionId) => [...rows.values()].find((r) => r.subscriptionId === subscriptionId) ?? null,
    async save(row) {
      // one subscription per player: a new one replaces the old, as the upsert on user_id does
      for (const [key, r] of rows) if (r.subscriptionId === row.subscriptionId) rows.delete(key);
      rows.set(row.userId, { ...row });
    }
  };
}
