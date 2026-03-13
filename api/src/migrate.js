import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildFeatureCatalog() {
  const categories = [
    "publishing",
    "ai",
    "automation",
    "billing",
    "channel",
    "security",
    "analytics",
    "localization"
  ];

  const features = [];
  for (let i = 1; i <= 160; i += 1) {
    const category = categories[i % categories.length];
    features.push({
      key: `feature_${String(i).padStart(3, "0")}`,
      category,
      description: `Runtime switch ${i} for ${category} pipeline`,
      enabled: i % 3 === 0
    });
  }
  return features;
}

export async function runMigrations() {
  const initSqlPath = path.join(__dirname, "..", "sql", "init.sql");
  const sql = fs.readFileSync(initSqlPath, "utf8");
  await query(sql);
}

export async function seedDefaults() {
  const featureCount = await query("SELECT COUNT(*)::INT AS count FROM feature_flags");
  if (featureCount.rows[0].count < 160) {
    const features = buildFeatureCatalog();
    for (const feature of features) {
      await query(
        `INSERT INTO feature_flags (key, category, description, enabled)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key)
         DO UPDATE SET category = EXCLUDED.category, description = EXCLUDED.description`,
        [feature.key, feature.category, feature.description, feature.enabled]
      );
    }
  }

  await query(
    `INSERT INTO settings (key, value)
     VALUES
      ('integrations', $1::jsonb),
      ('payments', $2::jsonb),
      ('ai_engine', $3::jsonb)
     ON CONFLICT (key) DO NOTHING`,
    [
      JSON.stringify({
        tiktok: { clientId: "", clientSecret: "", enabled: false },
        facebook: { appId: "", appSecret: "", enabled: false },
        instagram: { appId: "", appSecret: "", enabled: false },
        youtube: { clientId: "", clientSecret: "", enabled: false },
        googleBusiness: { clientId: "", clientSecret: "", enabled: false },
        linkedin: { clientId: "", clientSecret: "", enabled: false }
      }),
      JSON.stringify({
        sslcommerz: { enabled: false, storeId: "", storePassword: "" },
        bkash: { enabled: false, appKey: "", appSecret: "" },
        nagad: { enabled: false, merchantId: "", publicKey: "" }
      }),
      JSON.stringify({
        primaryModel: "gemini-2.5-pro",
        fallbackModel: "gpt-5-mini",
        minDelaySec: 2,
        maxDelaySec: 10
      })
    ]
  );
}
