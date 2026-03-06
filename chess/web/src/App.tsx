import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { analyzePosition, type AnalyzeResponse } from './api'

type Move = {
  from: string
  to: string
  promotion?: string
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const PIECE_CODES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as const

type PieceCode = (typeof PIECE_CODES)[number]
type TurnColor = 'w' | 'b'
type BoardPosition = Record<string, string>

export default function App() {
  const [game, setGame] = useState(() => new Chess())
  const [fen, setFen] = useState(game.fen())
  const [fenInput, setFenInput] = useState(game.fen())
  const [boardSize, setBoardSize] = useState(680)
  const [boardMaxSize, setBoardMaxSize] = useState(520)
  const [depth, setDepth] = useState(12)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editorPosition, setEditorPosition] = useState<BoardPosition>({})
  const [editorTurn, setEditorTurn] = useState<TurnColor>('w')
  const [editorPiece, setEditorPiece] = useState<PieceCode | 'erase'>('wP')
  const boardShellRef = useRef<HTMLDivElement | null>(null)

  const boardPosition = useMemo(() => fen, [fen])
  const displayPosition = useMemo(() => (editMode ? editorPosition : boardPosition), [editMode, editorPosition, boardPosition])
  const boardSliderMax = useMemo(() => Math.max(320, Math.min(920, boardMaxSize)), [boardMaxSize])
  const effectiveBoardSize = useMemo(() => Math.min(boardSize, boardSliderMax), [boardSize, boardSliderMax])
  const movePairs = useMemo(() => {
    const history = game.history()
    const lines: string[] = []
    for (let i = 0; i < history.length; i += 2) {
      const moveNumber = i / 2 + 1
      const white = history[i]
      const black = history[i + 1]
      lines.push(black ? `${moveNumber}. ${white} ${black}` : `${moveNumber}. ${white}`)
    }
    return lines
  }, [game])
  const checkmateMessage = useMemo(() => {
    if (!game.isCheckmate()) {
      return null
    }

    const winner = game.turn() === 'w' ? 'Black' : 'White'
    return `Checkmate. ${winner} wins.`
  }, [game])
  const kingSquareForColor = (color: 'w' | 'b') => {
    const board = game.board()
    for (let rankIdx = 0; rankIdx < board.length; rankIdx++) {
      for (let fileIdx = 0; fileIdx < board[rankIdx].length; fileIdx++) {
        const piece = board[rankIdx][fileIdx]
        if (piece && piece.type === 'k' && piece.color === color) {
          const file = String.fromCharCode('a'.charCodeAt(0) + fileIdx)
          const rank = String(8 - rankIdx)
          return `${file}${rank}`
        }
      }
    }

    return null
  }
  const checkedKingSquare = useMemo(() => {
    if (!game.isCheck()) {
      return null
    }
    return kingSquareForColor(game.turn())
  }, [game])
  const matedKingSquare = useMemo(() => {
    if (!game.isCheckmate()) {
      return null
    }
    return kingSquareForColor(game.turn())
  }, [game])
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {}

    if (selectedSquare) {
      styles[selectedSquare] = {
        boxShadow: 'inset 0 0 0 4px rgba(37, 99, 235, 0.95)',
      }
    }

    if (checkedKingSquare) {
      styles[checkedKingSquare] = {
        ...(styles[checkedKingSquare] || {}),
        backgroundColor: 'rgba(245, 158, 11, 0.45)',
        boxShadow: 'inset 0 0 0 4px rgba(217, 119, 6, 0.95)',
      }
    }

    if (matedKingSquare) {
      styles[matedKingSquare] = {
        ...(styles[matedKingSquare] || {}),
        backgroundColor: 'rgba(220, 38, 38, 0.55)',
        boxShadow: 'inset 0 0 0 4px rgba(185, 28, 28, 0.95)',
      }
    }

    return styles
  }, [selectedSquare, checkedKingSquare, matedKingSquare])

  useEffect(() => {
    const node = boardShellRef.current
    if (!node) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? 0)
      if (width > 0) {
        setBoardMaxSize(width)
      }
    })
    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (boardSize > boardSliderMax) {
      setBoardSize(boardSliderMax)
    }
  }, [boardSize, boardSliderMax])

  const updateGame = (next: Chess) => {
    setGame(next)
    const nextFen = next.fen()
    setFen(nextFen)
    setFenInput(nextFen)
    if (!editMode) {
      setEditorPosition(positionFromGame(next))
      setEditorTurn(next.turn())
    }
  }

  const cloneGame = (current: Chess) => {
    const next = new Chess()
    const pgn = current.pgn()
    if (pgn.trim().length > 0) {
      next.loadPgn(pgn)
      return next
    }

    next.load(current.fen())
    return next
  }

  const positionFromGame = (current: Chess): BoardPosition => {
    const out: BoardPosition = {}
    const board = current.board()
    for (let rankIdx = 0; rankIdx < board.length; rankIdx++) {
      for (let fileIdx = 0; fileIdx < board[rankIdx].length; fileIdx++) {
        const piece = board[rankIdx][fileIdx]
        if (!piece) {
          continue
        }
        const square = `${FILES[fileIdx]}${8 - rankIdx}`
        out[square] = `${piece.color}${piece.type.toUpperCase()}`
      }
    }
    return out
  }

  const positionToFEN = (position: BoardPosition, turn: TurnColor) => {
    const ranks: string[] = []
    for (let rank = 8; rank >= 1; rank--) {
      let line = ''
      let empties = 0
      for (let fileIdx = 0; fileIdx < FILES.length; fileIdx++) {
        const square = `${FILES[fileIdx]}${rank}`
        const piece = position[square]
        if (!piece) {
          empties++
          continue
        }
        if (empties > 0) {
          line += String(empties)
          empties = 0
        }
        const color = piece[0]
        const type = piece[1]
        line += color === 'w' ? type.toUpperCase() : type.toLowerCase()
      }
      if (empties > 0) {
        line += String(empties)
      }
      ranks.push(line || '8')
    }
    return `${ranks.join('/')} ${turn} - - 0 1`
  }

  const tryMove = (sourceSquare: string, targetSquare: string) => {
    const next = cloneGame(game)
    const move = next.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    } as Move)

    if (move == null) {
      return false
    }

    updateGame(next)
    setResult(null)
    setError(null)
    return true
  }

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (editMode) {
      return false
    }
    const moved = tryMove(sourceSquare, targetSquare)
    setSelectedSquare(null)
    return moved
  }

  const onSquareClick = (square: string) => {
    if (editMode) {
      setEditorPosition((prev) => {
        const next = { ...prev }
        if (editorPiece === 'erase') {
          delete next[square]
          return next
        }
        next[square] = editorPiece
        return next
      })
      return
    }

    if (!selectedSquare) {
      const piece = game.get(square)
      if (!piece || piece.color !== game.turn()) {
        return
      }
      setSelectedSquare(square)
      return
    }

    if (selectedSquare === square) {
      setSelectedSquare(null)
      return
    }

    const moved = tryMove(selectedSquare, square)
    if (moved) {
      setSelectedSquare(null)
      return
    }

    const piece = game.get(square)
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square)
      return
    }

    setSelectedSquare(null)
  }

  const onReset = () => {
    const next = new Chess()
    updateGame(next)
    setResult(null)
    setError(null)
    setSelectedSquare(null)
  }

  const onUndo = () => {
    const next = cloneGame(game)
    next.undo()
    updateGame(next)
    setResult(null)
    setError(null)
    setSelectedSquare(null)
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

  const onApplyFen = () => {
    const next = new Chess()
    try {
      next.load(fenInput.trim())
      updateGame(next)
      setResult(null)
      setError(null)
      setSelectedSquare(null)
    } catch {
      setError('Invalid FEN. Please enter a valid FEN string.')
    }
  }

  const onToggleEditMode = () => {
    setEditMode((prev) => {
      const nextMode = !prev
      if (nextMode) {
        setEditorPosition(positionFromGame(game))
        setEditorTurn(game.turn())
        setSelectedSquare(null)
      }
      return nextMode
    })
    setError(null)
  }

  const onApplySetup = () => {
    const next = new Chess()
    const fenFromEditor = positionToFEN(editorPosition, editorTurn)
    try {
      next.load(fenFromEditor)
      updateGame(next)
      setResult(null)
      setError(null)
      setSelectedSquare(null)
      setEditMode(false)
    } catch {
      setError('Invalid setup. Ensure the board has a legal FEN (including valid king placement).')
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1>Chess Position Analyzer</h1>
        <div className="main-grid">
          <div className="history-panel result history">
            <h2>Move History</h2>
            {movePairs.length === 0 ? <p>No moves yet.</p> : <pre className="history-text">{movePairs.join('\n')}</pre>}
          </div>

          <div className="board-panel">
            {checkmateMessage && <p className="checkmate-banner">{checkmateMessage}</p>}
            <div className="board-shell" ref={boardShellRef}>
              <Chessboard
                id="main-board"
                position={displayPosition}
                boardWidth={effectiveBoardSize}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customSquareStyles={customSquareStyles}
                arePiecesDraggable={!editMode}
              />
            </div>
            <p className="hint">
              {editMode
                ? 'Editor mode: choose a piece, then click squares to place it. Use Erase to remove pieces.'
                : 'You can drag pieces or click a piece, then click a destination square.'}
            </p>
          </div>

          <div className="side-panel">
            <div className="result editor-panel">
              <h2>Board Editor</h2>
              <div className="editor-actions">
                <button type="button" onClick={onToggleEditMode}>
                  {editMode ? 'Exit Editor' : 'Enter Editor'}
                </button>
                {editMode && (
                  <button type="button" onClick={onApplySetup}>
                    Apply Setup
                  </button>
                )}
              </div>
              {editMode && (
                <>
                  <div className="editor-turn">
                    <span>Side To Move</span>
                    <select value={editorTurn} onChange={(e) => setEditorTurn(e.target.value as TurnColor)}>
                      <option value="w">White</option>
                      <option value="b">Black</option>
                    </select>
                  </div>
                  <div className="piece-grid">
                    {PIECE_CODES.map((piece) => (
                      <button
                        key={piece}
                        type="button"
                        className={editorPiece === piece ? 'piece-btn active' : 'piece-btn'}
                        onClick={() => setEditorPiece(piece)}
                      >
                        {piece}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={editorPiece === 'erase' ? 'piece-btn active' : 'piece-btn'}
                      onClick={() => setEditorPiece('erase')}
                    >
                      Erase
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="fen-header">
              <label className="label" htmlFor="fen">
                Current FEN
              </label>
              <button type="button" onClick={onApplyFen}>
                Apply FEN
              </button>
            </div>
            <textarea
              id="fen"
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              rows={3}
              disabled={editMode}
            />

            <div className="controls">
              <label htmlFor="board-size">Board Size</label>
              <input
                id="board-size"
                type="range"
                min={320}
                max={boardSliderMax}
                step={10}
                value={boardSize}
                onChange={(e) => setBoardSize(Number(e.target.value))}
              />
              <span className="value-chip">{effectiveBoardSize}px</span>

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
      </div>
    </div>
  )
}
