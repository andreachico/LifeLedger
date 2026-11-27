package habit

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
)

// Handler bundles the dependencies the HTTP handlers need (just a Store).
type Handler struct {
	store Store
}

// NewHandler returns a Handler wired to the given Store.
func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// Register attaches the habit routes to the given router.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /habits", h.list)
	mux.HandleFunc("POST /habits", h.create)
	mux.HandleFunc("PUT /habits/{id}", h.update)
	mux.HandleFunc("DELETE /habits/{id}", h.delete)
	mux.HandleFunc("DELETE /habits/{id}/months/{month}", h.hideMonth)
	mux.HandleFunc("PUT /habits/{id}/checkins/{date}", h.addCheckin)
	mux.HandleFunc("DELETE /habits/{id}/checkins/{date}", h.removeCheckin)
}

// list returns all of the caller's habits with their check-ins.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.List(r.Context())
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var item Habit
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

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return
	}
	var item Habit
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	item.Normalize()
	if err := item.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := h.store.Update(r.Context(), id, item)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
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

// hideMonth removes one of the caller's habits from a single "YYYY-MM" month,
// leaving it visible in every other month.
func (h *Handler) hideMonth(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return
	}
	month := r.PathValue("month")
	if !ValidMonth(month) {
		writeError(w, http.StatusBadRequest, "month must be in YYYY-MM format")
		return
	}
	if err := h.store.HideMonth(r.Context(), id, month); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) addCheckin(w http.ResponseWriter, r *http.Request) {
	id, date, ok := checkinParams(w, r)
	if !ok {
		return
	}
	if err := h.store.AddCheckin(r.Context(), id, date); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) removeCheckin(w http.ResponseWriter, r *http.Request) {
	id, date, ok := checkinParams(w, r)
	if !ok {
		return
	}
	if err := h.store.RemoveCheckin(r.Context(), id, date); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// checkinParams parses and validates the {id} and {date} path values shared by
// the add/remove check-in handlers.
func checkinParams(w http.ResponseWriter, r *http.Request) (int, string, bool) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return 0, "", false
	}
	date := r.PathValue("date")
	if !ValidDate(date) {
		writeError(w, http.StatusBadRequest, "date must be in YYYY-MM-DD format")
		return 0, "", false
	}
	return id, date, true
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
		writeError(w, http.StatusNotFound, "habit not found")
		return
	}
	writeError(w, http.StatusInternalServerError, "internal server error")
}
