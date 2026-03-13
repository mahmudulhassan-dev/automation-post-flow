import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import express from "express";
import morgan from "morgan";
import { z } from "zod";
import { pool, query } from "./db.js";
import { runMigrations, seedDefaults } from "./migrate.js";

const app = express();
const port = Number(process.env.PORT || 8080);
const adminToken = process.env.ADMIN_TOKEN || "change_this_admin_token";

const gateways = new Set(["sslcommerz", "bkash", "nagad"]);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (token !== adminToken) {
    return res.status(403).json({ error: "Admin token mismatch" });
  }
  return next();
}

function gatewayPaymentUrl(gateway, subscriptionId) {
  return `https://sandbox.${gateway}.amanaflow.com/checkout?subscription=${subscriptionId}`;
}

app.get("/api/health", async (_req, res) => {
  const dbCheck = await query("SELECT NOW() AS now");
  res.json({
    status: "ok",
    service: "amanaflow-api",
    now: dbCheck.rows[0].now
  });
});

app.get("/api/plans", async (_req, res) => {
  const plans = await query(
    `SELECT code, name, price_bdt, interval_months, channel_limit
     FROM plans
     WHERE is_active = TRUE
     ORDER BY price_bdt ASC`
  );
  res.json({ plans: plans.rows });
});

app.post("/api/users", async (req, res) => {
  const schema = z.object({
    full_name: z.string().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(6).max(128).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { full_name, email, password } = parsed.data;
  const passwordHash = password ?? "placeholder_hash";

  const inserted = await query(
    `INSERT INTO users (full_name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email)
     DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id, full_name, email, timezone, created_at`,
    [full_name, email.toLowerCase(), passwordHash]
  );

  return res.status(201).json({ user: inserted.rows[0] });
});

app.get("/api/channels", async (req, res) => {
  const userId = Number(req.query.user_id);
  if (!userId) {
    return res.status(400).json({ error: "user_id query param is required" });
  }

  const rows = await query(
    `SELECT id, channel_type, account_name, status, created_at
     FROM channels
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return res.json({ channels: rows.rows });
});

app.post("/api/channels", async (req, res) => {
  const schema = z.object({
    user_id: z.number().int().positive(),
    channel_type: z.string().min(2).max(80),
    account_name: z.string().min(2).max(120),
    status: z.string().min(2).max(20).optional(),
    oauth_payload: z.record(z.any()).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  const inserted = await query(
    `INSERT INTO channels (user_id, channel_type, account_name, status, oauth_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, user_id, channel_type, account_name, status, created_at`,
    [
      payload.user_id,
      payload.channel_type,
      payload.account_name,
      payload.status ?? "connected",
      JSON.stringify(payload.oauth_payload ?? {})
    ]
  );

  return res.status(201).json({ channel: inserted.rows[0] });
});

app.post("/api/payments/session", async (req, res) => {
  const schema = z.object({
    user_id: z.number().int().positive(),
    plan_code: z.string().min(2).max(40),
    gateway: z.string().min(2).max(20),
    auto_renew: z.boolean().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { user_id, plan_code, gateway, auto_renew } = parsed.data;
  if (!gateways.has(gateway)) {
    return res.status(400).json({ error: "Unsupported gateway" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const planResult = await client.query(
      "SELECT code, price_bdt, interval_months FROM plans WHERE code = $1 AND is_active = TRUE",
      [plan_code]
    );
    if (!planResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Plan not found" });
    }

    const plan = planResult.rows[0];
    const subscriptionResult = await client.query(
      `INSERT INTO subscriptions (user_id, plan_code, gateway, status, auto_renew)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id, user_id, plan_code, gateway, status, auto_renew, created_at`,
      [user_id, plan.code, gateway, auto_renew ?? true]
    );

    const subscription = subscriptionResult.rows[0];

    await client.query(
      `INSERT INTO invoices (subscription_id, amount_bdt, gateway, status, due_at, metadata)
       VALUES ($1, $2, $3, 'pending', NOW() + INTERVAL '15 minutes', $4::jsonb)`,
      [
        subscription.id,
        plan.price_bdt,
        gateway,
        JSON.stringify({
          plan_code: plan.code,
          interval_months: plan.interval_months
        })
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      subscription,
      payment_url: gatewayPaymentUrl(gateway, subscription.id),
      next_action: "redirect_to_gateway"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Could not create payment session" });
  } finally {
    client.release();
  }
});

app.post("/api/billing/activate", async (req, res) => {
  const schema = z.object({
    subscription_id: z.number().int().positive(),
    transaction_reference: z.string().min(4).max(120)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { subscription_id, transaction_reference } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const subscriptionResult = await client.query(
      `SELECT s.id, s.plan_code, s.status, p.interval_months
       FROM subscriptions s
       JOIN plans p ON p.code = s.plan_code
       WHERE s.id = $1
       FOR UPDATE`,
      [subscription_id]
    );

    if (!subscriptionResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Subscription not found" });
    }

    const subscription = subscriptionResult.rows[0];
    await client.query(
      `UPDATE invoices
       SET status = 'paid', paid_at = NOW(), transaction_reference = $2
       WHERE id = (
         SELECT id FROM invoices
         WHERE subscription_id = $1 AND status IN ('pending', 'issued')
         ORDER BY created_at DESC
         LIMIT 1
       )`,
      [subscription_id, transaction_reference]
    );

    const updated = await client.query(
      `UPDATE subscriptions
       SET status = 'active',
           started_at = COALESCE(started_at, NOW()),
           renewal_at = NOW() + make_interval(months => $2::int),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, started_at, renewal_at`,
      [subscription_id, subscription.interval_months]
    );
    await client.query("COMMIT");

    return res.json({
      message: "Subscription activated",
      subscription: updated.rows[0]
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Activation failed" });
  } finally {
    client.release();
  }
});

app.post("/api/billing/cancel", async (req, res) => {
  const schema = z.object({
    subscription_id: z.number().int().positive()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updated = await query(
    `UPDATE subscriptions
     SET status = 'cancelled',
         auto_renew = FALSE,
         cancelled_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, user_id, status, auto_renew, cancelled_at`,
    [parsed.data.subscription_id]
  );

  if (!updated.rows.length) {
    return res.status(404).json({ error: "Subscription not found" });
  }

  return res.json({ subscription: updated.rows[0] });
});

app.get("/api/billing/subscriptions", async (req, res) => {
  const userId = Number(req.query.user_id);
  if (!userId) {
    return res.status(400).json({ error: "user_id query param is required" });
  }

  const rows = await query(
    `SELECT s.id, s.plan_code, s.gateway, s.status, s.auto_renew, s.renewal_at, s.created_at,
            p.name AS plan_name, p.price_bdt
     FROM subscriptions s
     JOIN plans p ON p.code = s.plan_code
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [userId]
  );

  return res.json({ subscriptions: rows.rows });
});

app.get("/api/admin/summary", requireAdmin, async (_req, res) => {
  const [users, channels, subscriptions, invoices] = await Promise.all([
    query("SELECT COUNT(*)::INT AS count FROM users"),
    query("SELECT COUNT(*)::INT AS count FROM channels"),
    query("SELECT COUNT(*)::INT AS count FROM subscriptions"),
    query("SELECT COUNT(*)::INT AS count FROM invoices")
  ]);

  return res.json({
    users: users.rows[0].count,
    channels: channels.rows[0].count,
    subscriptions: subscriptions.rows[0].count,
    invoices: invoices.rows[0].count
  });
});

app.get("/api/admin/features", requireAdmin, async (_req, res) => {
  const rows = await query(
    `SELECT key, category, description, enabled, updated_at
     FROM feature_flags
     ORDER BY key ASC`
  );
  return res.json({ features: rows.rows });
});

app.patch("/api/admin/features/:featureKey", requireAdmin, async (req, res) => {
  const schema = z.object({
    enabled: z.boolean()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const featureKey = req.params.featureKey;
  const updated = await query(
    `UPDATE feature_flags
     SET enabled = $2, updated_at = NOW()
     WHERE key = $1
     RETURNING key, category, description, enabled, updated_at`,
    [featureKey, parsed.data.enabled]
  );

  if (!updated.rows.length) {
    return res.status(404).json({ error: "Feature key not found" });
  }

  return res.json({ feature: updated.rows[0] });
});

app.get("/api/admin/settings/:group", requireAdmin, async (req, res) => {
  const setting = await query("SELECT key, value, updated_at FROM settings WHERE key = $1", [
    req.params.group
  ]);
  if (!setting.rows.length) {
    return res.status(404).json({ error: "Settings group not found" });
  }
  return res.json({ setting: setting.rows[0] });
});

app.put("/api/admin/settings/:group", requireAdmin, async (req, res) => {
  const schema = z.record(z.any());
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updated = await query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     RETURNING key, value, updated_at`,
    [req.params.group, JSON.stringify(parsed.data)]
  );
  return res.json({ setting: updated.rows[0] });
});

app.use((error, _req, res, _next) => {
  // Keep errors concise to avoid leaking internals.
  console.error(error);
  res.status(500).json({ error: "Unhandled server error" });
});

async function start() {
  await runMigrations();
  await seedDefaults();

  app.listen(port, () => {
    console.log(`Amanaflow API running on http://0.0.0.0:${port}`);
  });
}

start().catch((error) => {
  console.error("Startup failed", error);
  process.exit(1);
});
