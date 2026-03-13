package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"amanaflow-platform/internal/config"
	"amanaflow-platform/internal/db"
	"github.com/jackc/pgx/v5/pgxpool"
)

type renewalItem struct {
	ID             int
	PriceBDT       int
	Gateway        string
	IntervalMonths int
}

func main() {
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	pool, err := db.OpenPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	defer pool.Close()

	log.Printf("[worker] started mode=%s tick=%s", cfg.AutoRenewMode, cfg.WorkerTick)
	ticker := time.NewTicker(cfg.WorkerTick)
	defer ticker.Stop()

	processRenewals(context.Background(), pool, cfg.AutoRenewMode)
	for range ticker.C {
		processRenewals(context.Background(), pool, cfg.AutoRenewMode)
	}
}

func processRenewals(ctx context.Context, pool *pgxpool.Pool, mode string) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		log.Printf("[worker] begin failed: %v", err)
		return
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(
		ctx,
		`SELECT s.id, p.price_bdt, s.gateway, p.interval_months
		 FROM subscriptions s
		 JOIN plans p ON p.code = s.plan_code
		 WHERE s.status = 'active'
		   AND s.auto_renew = TRUE
		   AND s.renewal_at IS NOT NULL
		   AND s.renewal_at <= NOW()
		 FOR UPDATE SKIP LOCKED`,
	)
	if err != nil {
		log.Printf("[worker] select failed: %v", err)
		return
	}
	defer rows.Close()

	var due []renewalItem
	for rows.Next() {
		var item renewalItem
		if err := rows.Scan(&item.ID, &item.PriceBDT, &item.Gateway, &item.IntervalMonths); err != nil {
			log.Printf("[worker] scan failed: %v", err)
			return
		}
		due = append(due, item)
	}
	if len(due) == 0 {
		if err := tx.Commit(ctx); err != nil {
			log.Printf("[worker] commit(noop) failed: %v", err)
		}
		return
	}

	for _, item := range due {
		status := "issued"
		var paidAt any = nil
		var transactionReference any = nil
		if mode == "simulate" {
			status = "paid"
			paidAt = time.Now().UTC()
			transactionReference = "SIM-" + time.Now().UTC().Format("20060102150405")
		}
		metadata, _ := json.Marshal(map[string]any{
			"renewal_cycle": true,
			"mode":          mode,
		})

		_, err := tx.Exec(
			ctx,
			`INSERT INTO invoices (subscription_id, amount_bdt, gateway, status, due_at, paid_at, transaction_reference, metadata)
			 VALUES ($1, $2, $3, $4, NOW() + INTERVAL '2 days', $5, $6, $7::jsonb)`,
			item.ID, item.PriceBDT, item.Gateway, status, paidAt, transactionReference, string(metadata),
		)
		if err != nil {
			log.Printf("[worker] invoice insert failed: %v", err)
			return
		}

		_, err = tx.Exec(
			ctx,
			`UPDATE subscriptions
			 SET renewal_at = NOW() + make_interval(months => $2::int),
			     updated_at = NOW()
			 WHERE id = $1`,
			item.ID, item.IntervalMonths,
		)
		if err != nil {
			log.Printf("[worker] subscription update failed: %v", err)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("[worker] commit failed: %v", err)
		return
	}
	log.Printf("[worker] processed renewals: %d", len(due))
}
