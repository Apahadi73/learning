package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"chess/api/internal/engine"
	httpx "chess/api/internal/http"
)

func main() {
	stockfishPath, err := resolveStockfishPath()
	if err != nil {
		log.Fatalf("failed to locate stockfish: %v", err)
	}

	eng, err := engine.New(stockfishPath)
	if err != nil {
		log.Fatalf("failed to initialize stockfish: %v", err)
	}
	defer func() {
		if cerr := eng.Close(); cerr != nil {
			log.Printf("engine close error: %v", cerr)
		}
	}()

	mux := httpx.NewMux(eng)
	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	go func() {
		log.Println("API listening on :8080")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}

func resolveStockfishPath() (string, error) {
	if p, err := exec.LookPath("stockfish"); err == nil {
		return p, nil
	}

	fallback := "/usr/games/stockfish"
	if _, err := os.Stat(fallback); err == nil {
		return fallback, nil
	}

	return "", fmt.Errorf("stockfish not found in PATH or at %s", fallback)
}
