package investment

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

// Handler bundles the dependencies the HTTP handlers need (just a Store).
type Handler struct {
	store Store
}

// NewHandler returns a Handler wired to the given Store.
func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// Register attaches the investment-sale routes to the given router.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /investments", h.list)
	mux.HandleFunc("POST /investments", h.create)
	mux.HandleFunc("DELETE /investments/{id}", h.delete)

	// Holding catalog. The literal "holdings" segment takes precedence over the
	// "{id}" wildcard above, so these never collide with the record routes.
	mux.HandleFunc("GET /investments/holdings", h.listHoldings)
	mux.HandleFunc("POST /investments/holdings", h.createHolding)
	mux.HandleFunc("PATCH /investments/holdings", h.renameHolding)
	mux.HandleFunc("DELETE /investments/holdings", h.deleteHolding)
}

// list returns all of the caller's investment sales.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.List(r.Context())
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var item Sale
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	item.Normalize()
	if err := item.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := h.store.Create(r.Context(), item)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return
	}
	if err := h.store.Delete(r.Context(), id); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// listHoldings returns the caller's saved holding names.
func (h *Handler) listHoldings(w http.ResponseWriter, r *http.Request) {
	holdings, err := h.store.ListHoldings(r.Context())
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, holdings)
}

func (h *Handler) createHolding(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if err := h.store.CreateHolding(r.Context(), name); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) renameHolding(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OldName string `json:"oldName"`
		NewName string `json:"newName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	oldName := strings.TrimSpace(body.OldName)
	newName := strings.TrimSpace(body.NewName)
	if oldName == "" || newName == "" {
		writeError(w, http.StatusBadRequest, "oldName and newName are required")
		return
	}
	if err := h.store.RenameHolding(r.Context(), oldName, newName); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) deleteHolding(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if err := h.store.DeleteHolding(r.Context(), name); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- small helpers ---

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "sale not found")
		return
	}
	writeError(w, http.StatusInternalServerError, "internal server error")
}
