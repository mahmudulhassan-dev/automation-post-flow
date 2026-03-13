package config

import (
	"log"
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPPort      string
	DatabaseURL   string
	AdminToken    string
	WorkerTick    time.Duration
	AutoRenewMode string
}

func Load() Config {
	cfg := Config{
		HTTPPort:      getenv("PORT", "8080"),
		DatabaseURL:   mustGetEnv("DATABASE_URL"),
		AdminToken:    getenv("ADMIN_TOKEN", "change_this_admin_token"),
		AutoRenewMode: getenv("AUTO_RENEW_MODE", "issue"),
		WorkerTick:    time.Duration(getenvInt("WORKER_TICK_MS", 60000)) * time.Millisecond,
	}
	return cfg
}

func getenv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func mustGetEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("%s is required", key)
	}
	return value
}

func getenvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
