package db

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed init.sql
var migrationsFS embed.FS

func OpenPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	sqlBytes, err := migrationsFS.ReadFile("init.sql")
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, string(sqlBytes))
	return err
}

func SeedDefaults(ctx context.Context, pool *pgxpool.Pool) error {
	if err := seedFeatureFlags(ctx, pool); err != nil {
		return err
	}
	return seedSettings(ctx, pool)
}

func seedFeatureFlags(ctx context.Context, pool *pgxpool.Pool) error {
	var count int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM feature_flags").Scan(&count); err != nil {
		return err
	}
	if count >= 160 {
		return nil
	}

	categories := []string{"publishing", "ai", "automation", "billing", "channel", "security", "analytics", "localization"}
	for i := 1; i <= 160; i++ {
		category := categories[i%len(categories)]
		key := fmt.Sprintf("feature_%03d", i)
		description := fmt.Sprintf("Runtime switch %d for %s pipeline", i, category)
		enabled := i%3 == 0
		_, err := pool.Exec(
			ctx,
			`INSERT INTO feature_flags (key, category, description, enabled)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (key)
			 DO UPDATE SET category = EXCLUDED.category, description = EXCLUDED.description`,
			key, category, description, enabled,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func seedSettings(ctx context.Context, pool *pgxpool.Pool) error {
	type setting struct {
		Key   string
		Value any
	}

	settings := []setting{
		{
			Key: "integrations",
			Value: map[string]any{
				"tiktok":         map[string]any{"clientId": "", "clientSecret": "", "enabled": false},
				"facebook":       map[string]any{"appId": "", "appSecret": "", "enabled": false},
				"instagram":      map[string]any{"appId": "", "appSecret": "", "enabled": false},
				"youtube":        map[string]any{"clientId": "", "clientSecret": "", "enabled": false},
				"googleBusiness": map[string]any{"clientId": "", "clientSecret": "", "enabled": false},
				"linkedin":       map[string]any{"clientId": "", "clientSecret": "", "enabled": false},
			},
		},
		{
			Key: "payments",
			Value: map[string]any{
				"sslcommerz": map[string]any{"enabled": false, "storeId": "", "storePassword": ""},
				"bkash":      map[string]any{"enabled": false, "appKey": "", "appSecret": ""},
				"nagad":      map[string]any{"enabled": false, "merchantId": "", "publicKey": ""},
			},
		},
		{
			Key: "ai_engine",
			Value: map[string]any{
				"primaryModel": "gemini-2.5-pro",
				"fallbackModel": "gpt-5-mini",
				"minDelaySec": 2,
				"maxDelaySec": 10,
			},
		},
	}

	for _, s := range settings {
		raw, err := json.Marshal(s.Value)
		if err != nil {
			return err
		}
		_, err = pool.Exec(ctx,
			`INSERT INTO settings (key, value)
			 VALUES ($1, $2::jsonb)
			 ON CONFLICT (key) DO NOTHING`,
			s.Key, string(raw),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func Must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
