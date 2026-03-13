package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	Pool       *pgxpool.Pool
	AdminToken string
}

func NewRouter(server Server) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	r.Get("/api/health", server.health)
	r.Get("/api/plans", server.listPlans)
	r.Post("/api/users", server.upsertUser)
	r.Get("/api/channels", server.listChannels)
	r.Post("/api/channels", server.createChannel)
	r.Post("/api/payments/session", server.createPaymentSession)
	r.Post("/api/billing/activate", server.activateSubscription)
	r.Post("/api/billing/cancel", server.cancelSubscription)
	r.Get("/api/billing/subscriptions", server.listSubscriptions)

	r.Route("/api/admin", func(ar chi.Router) {
		ar.Use(server.adminAuth)
		ar.Get("/summary", server.adminSummary)
		ar.Get("/features", server.listFeatures)
		ar.Patch("/features/{featureKey}", server.patchFeature)
		ar.Get("/settings/{group}", server.getSetting)
		ar.Put("/settings/{group}", server.putSetting)
	})

	return r
}

func (s Server) health(w http.ResponseWriter, r *http.Request) {
	var now time.Time
	if err := s.Pool.QueryRow(r.Context(), "SELECT NOW()").Scan(&now); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "amanaflow-go-api",
		"now":     now,
	})
}

func (s Server) listPlans(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Pool.Query(
		r.Context(),
		`SELECT code, name, price_bdt, interval_months, channel_limit
		 FROM plans
		 WHERE is_active = TRUE
		 ORDER BY price_bdt ASC`,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type plan struct {
		Code          string `json:"code"`
		Name          string `json:"name"`
		PriceBDT      int    `json:"price_bdt"`
		IntervalMonths int   `json:"interval_months"`
		ChannelLimit  int    `json:"channel_limit"`
	}

	var plans []plan
	for rows.Next() {
		var p plan
		if err := rows.Scan(&p.Code, &p.Name, &p.PriceBDT, &p.IntervalMonths, &p.ChannelLimit); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		plans = append(plans, p)
	}
	writeJSON(w, http.StatusOK, map[string]any{"plans": plans})
}

func (s Server) upsertUser(w http.ResponseWriter, r *http.Request) {
	type request struct {
		FullName string `json:"full_name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	var body request
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(strings.TrimSpace(body.FullName)) < 2 || !strings.Contains(body.Email, "@") {
		writeError(w, http.StatusBadRequest, "full_name and valid email are required")
		return
	}
	passwordHash := body.Password
	if strings.TrimSpace(passwordHash) == "" {
		passwordHash = "placeholder_hash"
	}

	var response struct {
		ID        int       `json:"id"`
		FullName  string    `json:"full_name"`
		Email     string    `json:"email"`
		Timezone  string    `json:"timezone"`
		CreatedAt time.Time `json:"created_at"`
	}
	err := s.Pool.QueryRow(
		r.Context(),
		`INSERT INTO users (full_name, email, password_hash)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (email)
		 DO UPDATE SET full_name = EXCLUDED.full_name
		 RETURNING id, full_name, email, timezone, created_at`,
		strings.TrimSpace(body.FullName), strings.ToLower(strings.TrimSpace(body.Email)), passwordHash,
	).Scan(&response.ID, &response.FullName, &response.Email, &response.Timezone, &response.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"user": response})
}

func (s Server) listChannels(w http.ResponseWriter, r *http.Request) {
	userID, err := requiredIntQuery(r, "user_id")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	rows, err := s.Pool.Query(
		r.Context(),
		`SELECT id, channel_type, account_name, status, created_at
		 FROM channels
		 WHERE user_id = $1
		 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type channel struct {
		ID          int       `json:"id"`
		ChannelType string    `json:"channel_type"`
		AccountName string    `json:"account_name"`
		Status      string    `json:"status"`
		CreatedAt   time.Time `json:"created_at"`
	}
	var channels []channel
	for rows.Next() {
		var c channel
		if err := rows.Scan(&c.ID, &c.ChannelType, &c.AccountName, &c.Status, &c.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		channels = append(channels, c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"channels": channels})
}

func (s Server) createChannel(w http.ResponseWriter, r *http.Request) {
	type request struct {
		UserID      int             `json:"user_id"`
		ChannelType string          `json:"channel_type"`
		AccountName string          `json:"account_name"`
		Status      string          `json:"status"`
		OAuthPayload json.RawMessage `json:"oauth_payload"`
	}
	var body request
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.UserID <= 0 || strings.TrimSpace(body.ChannelType) == "" || strings.TrimSpace(body.AccountName) == "" {
		writeError(w, http.StatusBadRequest, "user_id, channel_type, account_name are required")
		return
	}
	if strings.TrimSpace(body.Status) == "" {
		body.Status = "connected"
	}
	if len(body.OAuthPayload) == 0 {
		body.OAuthPayload = json.RawMessage(`{}`)
	}

	var response struct {
		ID          int       `json:"id"`
		UserID      int       `json:"user_id"`
		ChannelType string    `json:"channel_type"`
		AccountName string    `json:"account_name"`
		Status      string    `json:"status"`
		CreatedAt   time.Time `json:"created_at"`
	}
	err := s.Pool.QueryRow(
		r.Context(),
		`INSERT INTO channels (user_id, channel_type, account_name, status, oauth_payload)
		 VALUES ($1, $2, $3, $4, $5::jsonb)
		 RETURNING id, user_id, channel_type, account_name, status, created_at`,
		body.UserID, body.ChannelType, body.AccountName, body.Status, string(body.OAuthPayload),
	).Scan(&response.ID, &response.UserID, &response.ChannelType, &response.AccountName, &response.Status, &response.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"channel": response})
}

func (s Server) createPaymentSession(w http.ResponseWriter, r *http.Request) {
	type request struct {
		UserID    int    `json:"user_id"`
		PlanCode  string `json:"plan_code"`
		Gateway   string `json:"gateway"`
		AutoRenew *bool  `json:"auto_renew"`
	}
	var body request
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.UserID <= 0 || body.PlanCode == "" || body.Gateway == "" {
		writeError(w, http.StatusBadRequest, "user_id, plan_code and gateway are required")
		return
	}
	if !isValidGateway(body.Gateway) {
		writeError(w, http.StatusBadRequest, "unsupported gateway")
		return
	}
	autoRenew := true
	if body.AutoRenew != nil {
		autoRenew = *body.AutoRenew
	}

	tx, err := s.Pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	var plan struct {
		Code           string
		PriceBDT       int
		IntervalMonths int
	}
	err = tx.QueryRow(
		r.Context(),
		`SELECT code, price_bdt, interval_months
		 FROM plans WHERE code = $1 AND is_active = TRUE`,
		body.PlanCode,
	).Scan(&plan.Code, &plan.PriceBDT, &plan.IntervalMonths)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "plan not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var subscription struct {
		ID        int       `json:"id"`
		UserID    int       `json:"user_id"`
		PlanCode  string    `json:"plan_code"`
		Gateway   string    `json:"gateway"`
		Status    string    `json:"status"`
		AutoRenew bool      `json:"auto_renew"`
		CreatedAt time.Time `json:"created_at"`
	}
	err = tx.QueryRow(
		r.Context(),
		`INSERT INTO subscriptions (user_id, plan_code, gateway, status, auto_renew)
		 VALUES ($1, $2, $3, 'pending', $4)
		 RETURNING id, user_id, plan_code, gateway, status, auto_renew, created_at`,
		body.UserID, plan.Code, body.Gateway, autoRenew,
	).Scan(&subscription.ID, &subscription.UserID, &subscription.PlanCode, &subscription.Gateway, &subscription.Status, &subscription.AutoRenew, &subscription.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	metadata, _ := json.Marshal(map[string]any{
		"plan_code":       plan.Code,
		"interval_months": plan.IntervalMonths,
	})
	_, err = tx.Exec(
		r.Context(),
		`INSERT INTO invoices (subscription_id, amount_bdt, gateway, status, due_at, metadata)
		 VALUES ($1, $2, $3, 'pending', NOW() + INTERVAL '15 minutes', $4::jsonb)`,
		subscription.ID, plan.PriceBDT, body.Gateway, string(metadata),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"subscription": subscription,
		"payment_url":  fmt.Sprintf("https://sandbox.%s.amanaflow.com/checkout?subscription=%d", body.Gateway, subscription.ID),
		"next_action":  "redirect_to_gateway",
	})
}

func (s Server) activateSubscription(w http.ResponseWriter, r *http.Request) {
	type request struct {
		SubscriptionID      int    `json:"subscription_id"`
		TransactionReference string `json:"transaction_reference"`
	}
	var body request
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.SubscriptionID <= 0 || strings.TrimSpace(body.TransactionReference) == "" {
		writeError(w, http.StatusBadRequest, "subscription_id and transaction_reference are required")
		return
	}

	tx, err := s.Pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	var intervalMonths int
	err = tx.QueryRow(
		r.Context(),
		`SELECT p.interval_months
		 FROM subscriptions s
		 JOIN plans p ON p.code = s.plan_code
		 WHERE s.id = $1
		 FOR UPDATE`,
		body.SubscriptionID,
	).Scan(&intervalMonths)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "subscription not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_, err = tx.Exec(
		r.Context(),
		`UPDATE invoices
		 SET status = 'paid', paid_at = NOW(), transaction_reference = $2
		 WHERE id = (
		   SELECT id FROM invoices
		   WHERE subscription_id = $1 AND status IN ('pending', 'issued')
		   ORDER BY created_at DESC
		   LIMIT 1
		 )`,
		body.SubscriptionID, body.TransactionReference,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var response struct {
		ID        int       `json:"id"`
		Status    string    `json:"status"`
		StartedAt time.Time `json:"started_at"`
		RenewalAt time.Time `json:"renewal_at"`
	}
	err = tx.QueryRow(
		r.Context(),
		`UPDATE subscriptions
		 SET status = 'active',
		     started_at = COALESCE(started_at, NOW()),
		     renewal_at = NOW() + make_interval(months => $2::int),
		     updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, status, started_at, renewal_at`,
		body.SubscriptionID, intervalMonths,
	).Scan(&response.ID, &response.Status, &response.StartedAt, &response.RenewalAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":      "subscription activated",
		"subscription": response,
	})
}

func (s Server) cancelSubscription(w http.ResponseWriter, r *http.Request) {
	type request struct {
		SubscriptionID int `json:"subscription_id"`
	}
	var body request
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.SubscriptionID <= 0 {
		writeError(w, http.StatusBadRequest, "subscription_id is required")
		return
	}

	var response struct {
		ID          int       `json:"id"`
		UserID      int       `json:"user_id"`
		Status      string    `json:"status"`
		AutoRenew   bool      `json:"auto_renew"`
		CancelledAt time.Time `json:"cancelled_at"`
	}
	err := s.Pool.QueryRow(
		r.Context(),
		`UPDATE subscriptions
		 SET status = 'cancelled',
		     auto_renew = FALSE,
		     cancelled_at = NOW(),
		     updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, user_id, status, auto_renew, cancelled_at`,
		body.SubscriptionID,
	).Scan(&response.ID, &response.UserID, &response.Status, &response.AutoRenew, &response.CancelledAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "subscription not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"subscription": response})
}

func (s Server) listSubscriptions(w http.ResponseWriter, r *http.Request) {
	userID, err := requiredIntQuery(r, "user_id")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	rows, err := s.Pool.Query(
		r.Context(),
		`SELECT s.id, s.plan_code, s.gateway, s.status, s.auto_renew, s.renewal_at, s.created_at,
		        p.name AS plan_name, p.price_bdt
		 FROM subscriptions s
		 JOIN plans p ON p.code = s.plan_code
		 WHERE s.user_id = $1
		 ORDER BY s.created_at DESC`,
		userID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type subscription struct {
		ID        int        `json:"id"`
		PlanCode  string     `json:"plan_code"`
		Gateway   string     `json:"gateway"`
		Status    string     `json:"status"`
		AutoRenew bool       `json:"auto_renew"`
		RenewalAt *time.Time `json:"renewal_at"`
		CreatedAt time.Time  `json:"created_at"`
		PlanName  string     `json:"plan_name"`
		PriceBDT  int        `json:"price_bdt"`
	}
	var subscriptions []subscription
	for rows.Next() {
		var item subscription
		if err := rows.Scan(
			&item.ID,
			&item.PlanCode,
			&item.Gateway,
			&item.Status,
			&item.AutoRenew,
			&item.RenewalAt,
			&item.CreatedAt,
			&item.PlanName,
			&item.PriceBDT,
		); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		subscriptions = append(subscriptions, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"subscriptions": subscriptions})
}

func (s Server) adminSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	users, err := countTable(ctx, s.Pool, "users")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	channels, err := countTable(ctx, s.Pool, "channels")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	subscriptions, err := countTable(ctx, s.Pool, "subscriptions")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	invoices, err := countTable(ctx, s.Pool, "invoices")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"users":         users,
		"channels":      channels,
		"subscriptions": subscriptions,
		"invoices":      invoices,
	})
}

func (s Server) listFeatures(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Pool.Query(
		r.Context(),
		`SELECT key, category, description, enabled, updated_at
		 FROM feature_flags
		 ORDER BY key ASC`,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type feature struct {
		Key         string    `json:"key"`
		Category    string    `json:"category"`
		Description string    `json:"description"`
		Enabled     bool      `json:"enabled"`
		UpdatedAt   time.Time `json:"updated_at"`
	}
	var features []feature
	for rows.Next() {
		var f feature
		if err := rows.Scan(&f.Key, &f.Category, &f.Description, &f.Enabled, &f.UpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		features = append(features, f)
	}
	writeJSON(w, http.StatusOK, map[string]any{"features": features})
}

func (s Server) patchFeature(w http.ResponseWriter, r *http.Request) {
	featureKey := chi.URLParam(r, "featureKey")
	if featureKey == "" {
		writeError(w, http.StatusBadRequest, "feature key is required")
		return
	}
	type request struct {
		Enabled bool `json:"enabled"`
	}
	var body request
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var response struct {
		Key         string    `json:"key"`
		Category    string    `json:"category"`
		Description string    `json:"description"`
		Enabled     bool      `json:"enabled"`
		UpdatedAt   time.Time `json:"updated_at"`
	}
	err := s.Pool.QueryRow(
		r.Context(),
		`UPDATE feature_flags
		 SET enabled = $2, updated_at = NOW()
		 WHERE key = $1
		 RETURNING key, category, description, enabled, updated_at`,
		featureKey, body.Enabled,
	).Scan(&response.Key, &response.Category, &response.Description, &response.Enabled, &response.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "feature key not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"feature": response})
}

func (s Server) getSetting(w http.ResponseWriter, r *http.Request) {
	group := chi.URLParam(r, "group")
	if group == "" {
		writeError(w, http.StatusBadRequest, "settings group is required")
		return
	}
	var value json.RawMessage
	var updatedAt time.Time
	err := s.Pool.QueryRow(
		r.Context(),
		`SELECT value, updated_at FROM settings WHERE key = $1`,
		group,
	).Scan(&value, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "settings group not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"setting": map[string]any{
			"key":        group,
			"value":      json.RawMessage(value),
			"updated_at": updatedAt,
		},
	})
}

func (s Server) putSetting(w http.ResponseWriter, r *http.Request) {
	group := chi.URLParam(r, "group")
	if group == "" {
		writeError(w, http.StatusBadRequest, "settings group is required")
		return
	}
	var payload map[string]any
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var updatedAt time.Time
	err = s.Pool.QueryRow(
		r.Context(),
		`INSERT INTO settings (key, value, updated_at)
		 VALUES ($1, $2::jsonb, NOW())
		 ON CONFLICT (key)
		 DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
		 RETURNING updated_at`,
		group, string(raw),
	).Scan(&updatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"setting": map[string]any{
			"key":        group,
			"value":      payload,
			"updated_at": updatedAt,
		},
	})
}

func (s Server) adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("x-admin-token")
		if token == "" || token != s.AdminToken {
			writeError(w, http.StatusForbidden, "admin token mismatch")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func countTable(ctx context.Context, pool *pgxpool.Pool, table string) (int, error) {
	var count int
	err := pool.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %s", table)).Scan(&count)
	return count, err
}

func isValidGateway(gateway string) bool {
	switch gateway {
	case "sslcommerz", "bkash", "nagad":
		return true
	default:
		return false
	}
}

func decodeJSON[T any](r *http.Request, dst *T) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return err
	}
	return nil
}

func requiredIntQuery(r *http.Request, key string) (int, error) {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return 0, fmt.Errorf("%s query param is required", key)
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}
	return value, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": message})
}
