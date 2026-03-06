

.PHONY: fmt lint vet build test

fmt: 
	go fmt ./...

lint: fmt
	golangci-lint run

vet: fmt 
	go vet ./...

build: vet
	go build main.go

test: build
	go test -v ./...
