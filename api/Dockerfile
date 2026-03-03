FROM golang:1.22-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*

# Debian installs stockfish under /usr/games.
ENV PATH="/usr/games:${PATH}"

WORKDIR /app

COPY go.mod .
COPY . .

RUN go build -o /usr/local/bin/api ./main.go

EXPOSE 8080

CMD ["/usr/local/bin/api"]
