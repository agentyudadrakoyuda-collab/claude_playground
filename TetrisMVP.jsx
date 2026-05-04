import { useState, useEffect, useCallback, useRef } from "react";

const COLS = 10;
const ROWS = 20;
const TICK_MS = 500;

const TETROMINOES = {
  I: { shape: [[1, 1, 1, 1]], color: "#00f0f0" },
  O: { shape: [[1, 1], [1, 1]], color: "#f0f000" },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: "#a000f0" },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: "#00f000" },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: "#f00000" },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: "#0000f0" },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: "#f0a000" },
};

const PIECE_KEYS = Object.keys(TETROMINOES);

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece() {
  const key = PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
  const { shape, color } = TETROMINOES[key];
  return {
    shape,
    color,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
  };
}

function rotate(shape) {
  const rows = shape.length;
  const cols = shape[0].length;
  return Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => shape[rows - 1 - r][c])
  );
}

function isValid(board, shape, x, y) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = x + c;
      const ny = y + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && board[ny][nx]) return false;
    }
  }
  return true;
}

function placePiece(board, piece) {
  const next = board.map((row) => [...row]);
  piece.shape.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell) next[piece.y + r][piece.x + c] = piece.color;
    });
  });
  return next;
}

function clearLines(board) {
  const kept = board.filter((row) => row.some((cell) => !cell));
  const cleared = ROWS - kept.length;
  const empty = Array.from({ length: cleared }, () => Array(COLS).fill(null));
  return { board: [...empty, ...kept], cleared };
}

const SCORES = [0, 100, 300, 500, 800];

export default function TetrisMVP() {
  const [board, setBoard] = useState(emptyBoard);
  const [piece, setPiece] = useState(() => randomPiece());
  const [next, setNext] = useState(() => randomPiece());
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);

  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  boardRef.current = board;
  pieceRef.current = piece;

  const lock = useCallback(() => {
    const b = placePiece(boardRef.current, pieceRef.current);
    const { board: cleared, cleared: count } = clearLines(b);
    setBoard(cleared);
    setScore((s) => s + SCORES[count]);
    setLines((l) => l + count);
    const n = randomPiece();
    if (!isValid(cleared, next.shape, next.x, next.y)) {
      setGameOver(true);
    } else {
      setPiece(next);
      setNext(n);
    }
  }, [next]);

  const moveDown = useCallback(() => {
    const p = pieceRef.current;
    if (isValid(boardRef.current, p.shape, p.x, p.y + 1)) {
      setPiece((prev) => ({ ...prev, y: prev.y + 1 }));
    } else {
      lock();
    }
  }, [lock]);

  // Gravity tick
  useEffect(() => {
    if (gameOver || paused) return;
    const id = setInterval(moveDown, TICK_MS);
    return () => clearInterval(id);
  }, [moveDown, gameOver, paused]);

  // Keyboard controls
  useEffect(() => {
    const handle = (e) => {
      if (gameOver) return;
      if (e.key === "p" || e.key === "P") { setPaused((v) => !v); return; }
      if (paused) return;

      const p = pieceRef.current;
      const b = boardRef.current;

      if (e.key === "ArrowLeft") {
        if (isValid(b, p.shape, p.x - 1, p.y))
          setPiece((prev) => ({ ...prev, x: prev.x - 1 }));
      } else if (e.key === "ArrowRight") {
        if (isValid(b, p.shape, p.x + 1, p.y))
          setPiece((prev) => ({ ...prev, x: prev.x + 1 }));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveDown();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const rotated = rotate(p.shape);
        if (isValid(b, rotated, p.x, p.y))
          setPiece((prev) => ({ ...prev, shape: rotated }));
      } else if (e.key === " ") {
        e.preventDefault();
        // Hard drop
        let ny = p.y;
        while (isValid(b, p.shape, p.x, ny + 1)) ny++;
        setPiece((prev) => ({ ...prev, y: ny }));
        // Lock on next tick via a short timeout so state settles
        setTimeout(lock, 0);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [gameOver, paused, moveDown, lock]);

  const restart = () => {
    setBoard(emptyBoard());
    const p = randomPiece();
    const n = randomPiece();
    setPiece(p);
    setNext(n);
    setScore(0);
    setLines(0);
    setGameOver(false);
    setPaused(false);
  };

  // Merge active piece onto display board
  const display = piece && !gameOver
    ? placePiece(board, piece)
    : board;

  // Ghost piece (landing preview)
  let ghostY = piece?.y ?? 0;
  if (piece && !gameOver) {
    while (isValid(board, piece.shape, piece.x, ghostY + 1)) ghostY++;
  }

  const ghostCells = new Set();
  if (piece && !gameOver && ghostY !== piece.y) {
    piece.shape.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell) ghostCells.add(`${piece.y + r + (ghostY - piece.y)},${piece.x + c}`);
      })
    );
  }

  const level = Math.floor(lines / 10) + 1;

  return (
    <div style={styles.root}>
      <h1 style={styles.title}>TETRIS</h1>
      <div style={styles.layout}>
        {/* Board */}
        <div style={styles.boardWrap}>
          <div style={styles.board}>
            {display.map((row, r) =>
              row.map((color, c) => {
                const isGhost = ghostCells.has(`${r},${c}`);
                return (
                  <div
                    key={`${r}-${c}`}
                    style={{
                      ...styles.cell,
                      background: color
                        ? color
                        : isGhost
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(255,255,255,0.03)",
                      border: color || isGhost
                        ? "1px solid rgba(255,255,255,0.3)"
                        : "1px solid rgba(255,255,255,0.06)",
                      boxShadow: color ? `inset 0 0 6px ${color}88` : "none",
                    }}
                  />
                );
              })
            )}
          </div>
          {(gameOver || paused) && (
            <div style={styles.overlay}>
              <div style={styles.overlayText}>
                {gameOver ? "GAME OVER" : "PAUSED"}
              </div>
              {gameOver && (
                <button style={styles.btn} onClick={restart}>
                  RESTART
                </button>
              )}
              {paused && (
                <button style={styles.btn} onClick={() => setPaused(false)}>
                  RESUME
                </button>
              )}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div style={styles.panel}>
          <Stat label="SCORE" value={score} />
          <Stat label="LINES" value={lines} />
          <Stat label="LEVEL" value={level} />

          <div style={styles.sectionLabel}>NEXT</div>
          <NextPiece piece={next} />

          <div style={styles.controls}>
            <div style={styles.controlsTitle}>CONTROLS</div>
            <div>← → Move</div>
            <div>↑ Rotate</div>
            <div>↓ Soft drop</div>
            <div>Space Hard drop</div>
            <div>P Pause</div>
          </div>

          <button style={styles.btn} onClick={restart}>
            NEW GAME
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function NextPiece({ piece }) {
  const grid = Array.from({ length: 4 }, () => Array(4).fill(null));
  const offR = Math.floor((4 - piece.shape.length) / 2);
  const offC = Math.floor((4 - piece.shape[0].length) / 2);
  piece.shape.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell) grid[offR + r][offC + c] = piece.color;
    })
  );
  return (
    <div style={styles.nextGrid}>
      {grid.map((row, r) =>
        row.map((color, c) => (
          <div
            key={`${r}-${c}`}
            style={{
              ...styles.nextCell,
              background: color || "rgba(255,255,255,0.03)",
              border: color
                ? "1px solid rgba(255,255,255,0.3)"
                : "1px solid rgba(255,255,255,0.06)",
              boxShadow: color ? `inset 0 0 4px ${color}88` : "none",
            }}
          />
        ))
      )}
    </div>
  );
}

const CELL = 28;

const styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "100vh",
    background: "#0d0d1a",
    color: "#e0e0ff",
    fontFamily: "'Courier New', monospace",
    padding: "24px 16px",
  },
  title: {
    fontSize: 32,
    letterSpacing: 12,
    color: "#a0a0ff",
    marginBottom: 20,
    textShadow: "0 0 20px #6060ff",
  },
  layout: {
    display: "flex",
    gap: 24,
    alignItems: "flex-start",
  },
  boardWrap: {
    position: "relative",
  },
  board: {
    display: "grid",
    gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
    gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
    border: "2px solid rgba(160,160,255,0.3)",
    boxShadow: "0 0 30px rgba(100,100,255,0.15)",
  },
  cell: {
    width: CELL,
    height: CELL,
    boxSizing: "border-box",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.75)",
    gap: 16,
  },
  overlayText: {
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: 4,
    color: "#fff",
    textShadow: "0 0 20px #fff",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: 140,
  },
  stat: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(160,160,255,0.2)",
    borderRadius: 6,
    padding: "8px 12px",
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#8080cc",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#e0e0ff",
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 3,
    color: "#8080cc",
    marginBottom: -8,
  },
  nextGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 24px)",
    gridTemplateRows: "repeat(4, 24px)",
    border: "1px solid rgba(160,160,255,0.2)",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 4,
    padding: 4,
  },
  nextCell: {
    width: 24,
    height: 24,
    boxSizing: "border-box",
  },
  controls: {
    fontSize: 11,
    color: "#6666aa",
    lineHeight: 1.7,
  },
  controlsTitle: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#8080cc",
    marginBottom: 4,
  },
  btn: {
    background: "rgba(100,100,255,0.2)",
    border: "1px solid rgba(160,160,255,0.4)",
    color: "#c0c0ff",
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    letterSpacing: 2,
    padding: "8px 16px",
    cursor: "pointer",
    borderRadius: 4,
    transition: "background 0.2s",
  },
};
