import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Chess } from 'chess.js';

const socket = io(import.meta.env.VITE_API_URL);

const piecesUrl = {
  w: {
    k: "https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg",
    q: "https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg",
    r: "https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg",
    b: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg",
    n: "https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg",
    p: "https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg"
  },
  b: {
    k: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg",
    q: "https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg",
    r: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg",
    b: "https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg",
    n: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg",
    p: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg"
  }
};

/** Convert grid indices to algebraic square notation e.g. (0,4) → "e8" */
function toAlgebraic(row, col) {
  return `${String.fromCharCode(97 + col)}${8 - row}`;
}

function App() {
  const [chess] = useState(new Chess());
  const [board, setBoard] = useState(chess.board());
  const [playerRole, setPlayerRole] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [moveHistory, setMoveHistory] = useState([]);
  const [animatingMove, setAnimatingMove] = useState(null);
  const [imageErrors, setImageErrors] = useState({});

  // Click-based selection state
  const [selectedSquare, setSelectedSquare] = useState(null);   // { row, col }
  const [legalMoves, setLegalMoves] = useState([]);             // array of algebraic target squares

  const boardRef = useRef(null);

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    socket.on("connect", () => console.log("Connected to chess server"));
    socket.on("disconnect", () => console.warn("Disconnected from chess server"));
    socket.on("connect_error", (err) => console.error("Socket.io connection error:", err.message || err));

    socket.on("playerrole", (role) => setPlayerRole(role));
    socket.on("spectator", () => setPlayerRole(null));

    socket.on("gamestate", ({ fen, lastMove: nextLastMove, canUndo: nextCanUndo, canRedo: nextCanRedo }) => {
      chess.load(fen);
      setBoard(chess.board());
      setLastMove(nextLastMove || null);
      setCanUndo(Boolean(nextCanUndo));
      setCanRedo(Boolean(nextCanRedo));
      setMoveHistory(chess.history({ verbose: true }));

      // Clear selection whenever game state refreshes
      setSelectedSquare(null);
      setLegalMoves([]);

      if (nextLastMove) {
        setAnimatingMove(nextLastMove);
        setTimeout(() => setAnimatingMove(null), 500);
      }
    });

    socket.on("invalidmove", (move) => console.warn("Invalid move attempted:", move));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("playerrole");
      socket.off("spectator");
      socket.off("gamestate");
      socket.off("invalidmove");
    };
  }, [chess]);

  // ── Move execution ──────────────────────────────────────────────────────────
  const executeMove = (source, targetAlg) => {
    const sourceAlg = toAlgebraic(source.row, source.col);
    const piece = chess.get(sourceAlg);
    const targetRow = 8 - parseInt(targetAlg[1]);
    const isPromotion = piece && piece.type === 'p' && (targetRow === 0 || targetRow === 7);

    const move = {
      from: sourceAlg,
      to: targetAlg,
      promotion: isPromotion ? "q" : undefined,
    };

    // Validate locally before emitting
    const tempChess = new Chess(chess.fen());
    if (tempChess.move(move)) {
      socket.emit("move", move);
    } else {
      console.warn("Rejected invalid move locally:", move);
    }
  };

  // ── Click handler ───────────────────────────────────────────────────────────
  const handleSquareClick = (rowIndex, colIndex, squarePiece) => {
    const clickedAlg = toAlgebraic(rowIndex, colIndex);

    // ── Case 1: A piece is already selected ──
    if (selectedSquare) {
      const isSameSquare = selectedSquare.row === rowIndex && selectedSquare.col === colIndex;

      // Clicking selected square again → deselect
      if (isSameSquare) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      // Clicking a legal move target → execute the move
      if (legalMoves.includes(clickedAlg)) {
        executeMove(selectedSquare, clickedAlg);
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      // Clicking another friendly piece → re-select it
      if (squarePiece && squarePiece.color === playerRole) {
        selectPiece(rowIndex, colIndex, clickedAlg);
        return;
      }

      // Clicking anything else → deselect
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    // ── Case 2: No piece selected yet ──
    // Only the current player may select their own pieces on their turn
    if (squarePiece && squarePiece.color === playerRole && chess.turn() === playerRole) {
      selectPiece(rowIndex, colIndex, clickedAlg);
    }
  };

  const selectPiece = (row, col, alg) => {
    const moves = chess.moves({ square: alg, verbose: true });
    setSelectedSquare({ row, col });
    setLegalMoves(moves.map((m) => m.to));
  };

  // ── Undo / Redo ─────────────────────────────────────────────────────────────
  const handleUndo = () => socket.emit("undo");
  const handleRedo = () => socket.emit("redo");

  // ── Status string ───────────────────────────────────────────────────────────
  const status = () => {
    if (playerRole === null) return "Watching as Spectator";
    if (chess.isGameOver()) {
      if (chess.isCheckmate()) return "Game Over – Checkmate!";
      if (chess.isDraw()) return "Game Over – Draw!";
      return "Game Over";
    }
    if (chess.turn() === playerRole) {
      return `Your turn${chess.inCheck() ? ' – CHECK!' : ''}`;
    }
    return `Opponent's turn${chess.inCheck() ? ' – CHECK!' : ''}`;
  };

  // ── Square renderer ─────────────────────────────────────────────────────────
  const renderSquare = (squarePiece, rowIndex, colIndex) => {
    const isLight = (rowIndex + colIndex) % 2 === 0;
    const algNotation = toAlgebraic(rowIndex, colIndex);

    const isLastMoveSquare = lastMove && (
      (rowIndex === 8 - parseInt(lastMove.from[1]) && colIndex === lastMove.from.charCodeAt(0) - 97) ||
      (rowIndex === 8 - parseInt(lastMove.to[1])   && colIndex === lastMove.to.charCodeAt(0) - 97)
    );

    const isSelected = selectedSquare?.row === rowIndex && selectedSquare?.col === colIndex;
    const isLegalTarget = legalMoves.includes(algNotation);
    const isCapture = isLegalTarget && squarePiece !== null;

    return (
      <div
        key={`${rowIndex}-${colIndex}`}
        className={[
          'square',
          isLight ? 'light' : 'dark',
          isSelected ? 'selected' : '',
        ].join(' ')}
        onClick={() => handleSquareClick(rowIndex, colIndex, squarePiece)}
      >
        {/* Rank coordinate */}
        {colIndex === 0 && (
          <span className={`coord rank-coord ${playerRole === 'b' ? 'flipped' : ''}`}>
            {8 - rowIndex}
          </span>
        )}
        {/* File coordinate */}
        {rowIndex === 7 && (
          <span className={`coord file-coord ${playerRole === 'b' ? 'flipped' : ''}`}>
            {String.fromCharCode(97 + colIndex)}
          </span>
        )}

        {/* Last-move highlight */}
        {isLastMoveSquare && <div className="highlight" />}

        {/* Legal move indicators */}
        {isLegalTarget && !isCapture && <div className="move-dot" />}
        {isLegalTarget && isCapture  && <div className="capture-ring" />}

        {/* Chess piece */}
        {squarePiece && (
          <div
            className={[
              'piece',
              isSelected ? 'piece-selected' : '',
              animatingMove?.to === algNotation ? 'moving' : '',
            ].join(' ')}
            style={{
              backgroundImage: imageErrors[`${squarePiece.color}${squarePiece.type}`]
                ? 'none'
                : `url(${piecesUrl[squarePiece.color][squarePiece.type]})`,
            }}
          >
            {imageErrors[`${squarePiece.color}${squarePiece.type}`] && (
              <span style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: squarePiece.color === 'w' ? '#000' : '#fff',
                textShadow: squarePiece.color === 'w'
                  ? '1px 1px 2px rgba(255,255,255,0.8)'
                  : '1px 1px 2px rgba(0,0,0,0.8)',
              }}>
                {squarePiece.type === 'k' ? '♔' :
                 squarePiece.type === 'q' ? '♕' :
                 squarePiece.type === 'r' ? '♖' :
                 squarePiece.type === 'b' ? '♗' :
                 squarePiece.type === 'n' ? '♘' :
                 squarePiece.type === 'p' ? '♙' : ''}
              </span>
            )}
            <img
              src={piecesUrl[squarePiece.color][squarePiece.type]}
              alt=""
              style={{ display: 'none' }}
              onError={() =>
                setImageErrors(prev => ({ ...prev, [`${squarePiece.color}${squarePiece.type}`]: true }))
              }
            />
          </div>
        )}
      </div>
    );
  };

  const isPlayer = playerRole === "w" || playerRole === "b";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="text-slate-100 min-h-screen font-sans flex flex-col items-center justify-center p-4 m-0 overflow-hidden">
      {/* Header */}
      <div className="mb-6 flex flex-col items-center z-10 w-full max-w-[80vh]">
        <div className="flex items-center justify-between w-full mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shadow-inner border border-slate-700">
              <svg className="w-6 h-6 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight text-white/90">Opponent</h2>
              <div className="text-xs text-white/50">Connected</div>
            </div>
          </div>
          <div
            id="status-bar"
            className="px-5 py-2 text-sm font-semibold rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-xl text-center min-w-[200px] transition-all duration-300"
          >
            {status()}
          </div>
        </div>
      </div>

      {/* Board + Move History */}
      <div className="flex gap-8 items-start">
        {/* Board */}
        <div className="w-[min(80vh,100vw)] h-[min(80vh,100vw)] max-w-full max-h-full flex items-center justify-center relative shadow-2xl rounded-lg">
          <div
            ref={boardRef}
            className={`chessboard transition-transform duration-700 ease-in-out ${playerRole === "b" ? 'flipped' : ''}`}
          >
            {board.map((row, rowIndex) =>
              row.map((squarePiece, colIndex) => renderSquare(squarePiece, rowIndex, colIndex))
            )}
          </div>
        </div>

        {/* Move History */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-4 max-h-[80vh] overflow-y-auto">
          <h3 className="text-white/90 font-bold mb-2">Move History</h3>
          <div className="space-y-1">
            {moveHistory.map((move, index) => (
              <div key={index} className="text-white/70 text-sm">
                {Math.floor(index / 2) + 1}.{index % 2 === 0 ? '' : '..'} {move.san}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="w-full max-w-[80vh] mt-4 flex items-center justify-center gap-3">
        <button
          onClick={handleUndo}
          disabled={!isPlayer || !canUndo}
          className="px-4 py-2 rounded-md bg-white/10 border border-white/15 text-sm font-semibold text-white/90 backdrop-blur-md transition hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={!isPlayer || !canRedo}
          className="px-4 py-2 rounded-md bg-white/10 border border-white/15 text-sm font-semibold text-white/90 backdrop-blur-md transition hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Redo
        </button>
      </div>

      {/* Player Info Footer */}
      <div className="mt-6 flex flex-col items-center z-10 w-full max-w-[80vh]">
        <div className="flex items-center justify-between w-full mt-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shadow-inner border border-slate-700">
              <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight text-white/90">You</h2>
              <div className="text-xs text-white/50 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-sm text-[10px] uppercase font-bold tracking-wider ${
                  playerRole === 'w' ? 'bg-slate-200 text-slate-800' :
                  playerRole === 'b' ? 'bg-slate-800 text-slate-200 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]' :
                  'bg-gray-500/30'
                }`}>
                  {playerRole ? `PLAYING ${playerRole === 'w' ? 'WHITE' : 'BLACK'}` : 'SPECTATOR'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium">
            <div className="flex items-center gap-2 opacity-70">
              <div className="w-3 h-3 rounded-full bg-[#e2e8f0] shadow-sm" />
              <span className="text-slate-300 text-xs uppercase tracking-wider">White</span>
            </div>
            <div className="flex items-center gap-2 opacity-70">
              <div className="w-3 h-3 rounded-full bg-[#475569] shadow-sm" />
              <span className="text-slate-300 text-xs uppercase tracking-wider">Black</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;