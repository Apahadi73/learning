package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"chess/api/internal/engine"
	httpx "chess/api/internal/http"
)

func main() {
	eng, err := engine.New("stockfish")
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
