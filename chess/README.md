# Dockerized Chess Analysis App (Go + React + Stockfish)

A complete chess analysis web app with:
- Go backend (`net/http`) that talks to Stockfish over UCI
- React + TypeScript frontend with `react-chessboard` and `chess.js`
- Docker Compose orchestration for both services

## Run

```bash
docker compose up --build
```

Then open:
- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8080](http://localhost:8080)

## API Endpoints

- `GET /health` -> `200 ok`
- `POST /api/analyze`

Request JSON:

```json
{
  "fen": "string",
  "depth": 12,
  "movetimeMs": 1000
}
```

Rules:
- If both `depth` and `movetimeMs` are missing, backend defaults to `depth=12`.
- If both are provided, `movetimeMs` is preferred.

Response JSON:

```json
{
  "fen": "...",
  "bestMove": "e2e4",
  "eval": { "type": "cp", "value": 34 },
  "pv": ["e2e4", "e7e5", "g1f3"],
  "depth": 12
}
```

## Sample FEN

Starting position:

```text
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
```

## Troubleshooting

- If analysis times out (`504`), increase engine speed or reduce depth/movetime.
- If you see Stockfish startup errors, rebuild images:

```bash
docker compose build --no-cache
```

- If frontend cannot reach backend, verify Vite proxy is active and requests use `/api/analyze` (not hardcoded host URLs).
