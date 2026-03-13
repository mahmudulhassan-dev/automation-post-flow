import dotenv from "dotenv";
dotenv.config();

import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const autoRenewMode = process.env.AUTO_RENEW_MODE || "issue";
const tickMs = Number(process.env.WORKER_TICK_MS || 60000);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: databaseUrl });

async function processRenewals() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dueRows = await client.query(
      `SELECT s.id, s.plan_code, s.gateway, p.price_bdt, p.interval_months
       FROM subscriptions s
       JOIN plans p ON p.code = s.plan_code
       WHERE s.status = 'active'
         AND s.auto_renew = TRUE
         AND s.renewal_at IS NOT NULL
         AND s.renewal_at <= NOW()
       FOR UPDATE SKIP LOCKED`
    );

    if (!dueRows.rows.length) {
      await client.query("COMMIT");
      return;
    }

    for (const row of dueRows.rows) {
      const invoiceStatus = autoRenewMode === "simulate" ? "paid" : "issued";
      const paidAt = autoRenewMode === "simulate" ? "NOW()" : "NULL";
      const transactionReference =
        autoRenewMode === "simulate" ? `SIM-${row.id}-${Date.now()}` : null;

      await client.query(
        `INSERT INTO invoices (subscription_id, amount_bdt, gateway, status, due_at, paid_at, transaction_reference, metadata)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '2 days', ${paidAt}, $5, $6::jsonb)`,
        [
          row.id,
          row.price_bdt,
          row.gateway,
          invoiceStatus,
          transactionReference,
          JSON.stringify({ renewal_cycle: true, mode: autoRenewMode })
        ]
      );

      await client.query(
        `UPDATE subscriptions
         SET renewal_at = NOW() + make_interval(months => $2::int),
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, row.interval_months]
      );
    }

    await client.query("COMMIT");
    console.log(`[worker] processed renewals: ${dueRows.rows.length}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[worker] renewal processing failed", error);
  } finally {
    client.release();
  }
}

console.log(`[worker] started with mode=${autoRenewMode}, tick=${tickMs}ms`);
setInterval(processRenewals, tickMs);
processRenewals();
