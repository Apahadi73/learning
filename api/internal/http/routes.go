package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"chess/api/internal/engine"
)

type AnalyzeRequest struct {
	FEN        string `json:"fen"`
	Depth      *int   `json:"depth,omitempty"`
	MoveTimeMs *int   `json:"movetimeMs,omitempty"`
}

type AnalyzeResponse struct {
	FEN      string      `json:"fen"`
	BestMove string      `json:"bestMove"`
	Eval     engine.Eval `json:"eval"`
	PV       []string    `json:"pv"`
	Depth    int         `json:"depth"`
}

func NewMux(eng *engine.Engine) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			writeCORSHeaders(w)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		writeCORSHeaders(w)
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("ok"))
	})

	mux.HandleFunc("/api/analyze", func(w http.ResponseWriter, r *http.Request) {
		writeCORSHeaders(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		if eng == nil {
			writeError(w, http.StatusInternalServerError, "stockfish engine is unavailable")
			return
		}

		var req AnalyzeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		if req.FEN == "" {
			writeError(w, http.StatusBadRequest, "fen is required")
			return
		}

		depth := 12
		if req.Depth != nil {
			depth = *req.Depth
		}
		movetime := 0
		if req.MoveTimeMs != nil {
			movetime = *req.MoveTimeMs
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		analysis, err := eng.Analyze(ctx, req.FEN, depth, movetime)
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
				writeError(w, http.StatusGatewayTimeout, "analysis timed out")
				return
			}
			if errors.Is(err, context.Canceled) {
				writeError(w, http.StatusRequestTimeout, "request canceled")
				return
			}
			writeError(w, http.StatusInternalServerError, "analysis failed: "+err.Error())
			return
		}

		writeJSON(w, http.StatusOK, AnalyzeResponse{
			FEN:      req.FEN,
			BestMove: analysis.BestMove,
			Eval:     analysis.Eval,
			PV:       analysis.PV,
			Depth:    analysis.Depth,
		})
	})

	return mux
}

func writeCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}
