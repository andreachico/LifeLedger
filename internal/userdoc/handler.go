package userdoc

import (
	"encoding/json"
	"io"
	"net/http"
	"regexp"
)

// keyPattern restricts document keys to a bounded, safe charset so a client
// can't pass arbitrary or oversized keys.
var keyPattern = regexp.MustCompile(`^[a-zA-Z0-9_.-]{1,64}$`)

// maxBodyBytes caps a single document's size so one account can't store
// unbounded data.
const maxBodyBytes = 1 << 20 // 1 MiB

// Handler exposes per-user documents over HTTP. It depends on the Store
// interface, so it works with either the in-memory or PostgreSQL implementation.
type Handler struct {
	store Store
}

// NewHandler builds a Handler around a Store.
func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// Register wires the read/replace document routes onto the router. The document
// key is a path segment, e.g. GET /userdoc/travel-destinations.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /userdoc/{key}", h.get)
	mux.HandleFunc("PUT /userdoc/{key}", h.save)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if !keyPattern.MatchString(key) {
		writeError(w, http.StatusBadRequest, "invalid document key")
		return
	}
	data, err := h.store.Get(r.Context(), key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if len(data) == 0 {
		// No document saved yet: return JSON null so the client treats it as empty.
		_, _ = w.Write([]byte("null"))
		return
	}
	_, _ = w.Write(data)
}

func (h *Handler) save(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if !keyPattern.MatchString(key) {
		writeError(w, http.StatusBadRequest, "invalid document key")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "document too large")
		return
	}
	// The column is JSONB, so reject anything that isn't well-formed JSON.
	if !json.Valid(body) {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := h.store.Save(r.Context(), key, json.RawMessage(body)); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// writeError returns a consistent {"error": "..."} JSON shape.
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
