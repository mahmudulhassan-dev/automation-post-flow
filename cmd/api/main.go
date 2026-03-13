package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"amanaflow-platform/internal/config"
	"amanaflow-platform/internal/db"
	"amanaflow-platform/internal/httpapi"
)

func main() {
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	pool, err := db.OpenPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	defer pool.Close()

	if err := db.RunMigrations(context.Background(), pool); err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	if err := db.SeedDefaults(context.Background(), pool); err != nil {
		log.Fatalf("seed failed: %v", err)
	}

	router := httpapi.NewRouter(httpapi.Server{
		Pool:       pool,
		AdminToken: cfg.AdminToken,
	})

	server := &http.Server{
		Addr:         ":" + cfg.HTTPPort,
		Handler:      router,
		ReadTimeout:  20 * time.Second,
		WriteTimeout: 20 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("amanaflow go api listening on :%s", cfg.HTTPPort)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}
