import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { analyzePosition, type AnalyzeResponse } from './api'

type Move = {
  from: string
  to: string
  promotion?: string
}

export default function App() {
  const [game, setGame] = useState(() => new Chess())
  const [fen, setFen] = useState(game.fen())
  const [depth, setDepth] = useState(12)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)

  const boardPosition = useMemo(() => fen, [fen])

  const updateGame = (next: Chess) => {
    setGame(next)
    setFen(next.fen())
  }

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    const next = new Chess(game.fen())
    const move = next.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    } as Move)

    if (move == null) {
      return false
    }

    updateGame(next)
    return true
  }

  const onReset = () => {
    const next = new Chess()
    updateGame(next)
    setResult(null)
    setError(null)
  }

  const onUndo = () => {
    const next = new Chess(game.fen())
    next.undo()
    updateGame(next)
    setResult(null)
    setError(null)
  }

  const onAnalyze = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await analyzePosition({
        fen,
        depth,
      })
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1>Chess Position Analyzer</h1>

        <div className="board-panel">
          <Chessboard id="main-board" position={boardPosition} onPieceDrop={onDrop} />
        </div>

        <label className="label" htmlFor="fen">
          Current FEN
        </label>
        <textarea id="fen" readOnly value={fen} rows={3} />

        <div className="controls">
          <label htmlFor="depth">Depth</label>
          <input
            id="depth"
            type="number"
            min={1}
            max={30}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value) || 12)}
          />
          <button type="button" onClick={onReset}>
            Reset
          </button>
          <button type="button" onClick={onUndo}>
            Undo
          </button>
          <button type="button" onClick={onAnalyze} disabled={loading}>
            {loading ? 'Analyzing...' : 'Analyze Position'}
          </button>
        </div>

        {loading && <p className="status">Running Stockfish analysis...</p>}
        {error && <p className="error">{error}</p>}

        {result && (
          <div className="result">
            <h2>Analysis</h2>
            <p>
              <strong>Best Move:</strong> {result.bestMove}
            </p>
            <p>
              <strong>Eval:</strong> {result.eval.type} {result.eval.value}
            </p>
            <p>
              <strong>Depth:</strong> {result.depth}
            </p>
            <p>
              <strong>PV:</strong> {result.pv.join(' ')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
