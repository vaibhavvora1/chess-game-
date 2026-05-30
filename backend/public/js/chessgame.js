const socket = io();
const chess = new Chess();

const boardElement = document.querySelector(".chessboard");
const statusBar = document.getElementById("status-bar");
const opponentStatus = document.getElementById("opponent-status");
const playerRoleBadge = document.getElementById("player-role-badge");
const undoButton = document.getElementById("undo-button");
const redoButton = document.getElementById("redo-button");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let lastMove = null;
let canUndo = false;
let canRedo = false;
let announcedResult = null;

// High quality SVGs from Wikimedia Commons
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

const updateStatus = () => {
  let status = "";
  let oppStatus = "Connected";
  const isPlayer = playerRole === "w" || playerRole === "b";
  
  if (playerRole === null) {
    status = "Watching as Spectator";
    playerRoleBadge.innerText = "SPECTATOR";
    playerRoleBadge.className = "px-2 py-0.5 rounded-sm bg-gray-500/30 text-[10px] uppercase font-bold tracking-wider";
  } else {
    const roleText = playerRole === 'w' ? 'White' : 'Black';
    playerRoleBadge.innerText = `PLAYING ${roleText}`;
    if (playerRole === 'w') {
      playerRoleBadge.className = "px-2 py-0.5 rounded-sm bg-slate-200 text-slate-800 text-[10px] uppercase font-bold tracking-wider";
    } else {
      playerRoleBadge.className = "px-2 py-0.5 rounded-sm bg-slate-800 text-slate-200 text-[10px] uppercase font-bold tracking-wider shadow-[0_0_0_1px_rgba(255,255,255,0.2)]";
    }

    if (chess.game_over()) {
      if (chess.in_checkmate()) status = `Game Over - Checkmate!`;
      else if (chess.in_draw()) status = `Game Over - Draw!`;
      else status = 'Game Over';
    } else {
      const turnRole = chess.turn() === 'w' ? 'White' : 'Black';
      if (chess.turn() === playerRole) {
        status = `Your turn`;
        oppStatus = "Waiting...";
        statusBar.classList.add("bg-blue-500/20", "border-blue-500/50", "text-blue-200");
        statusBar.classList.remove("bg-white/10", "border-white/20");
        if (chess.in_check()) status += ' - CHECK!';
      } else {
        status = `Opponent's turn`;
        oppStatus = "Thinking...";
        statusBar.classList.remove("bg-blue-500/20", "border-blue-500/50", "text-blue-200");
        statusBar.classList.add("bg-white/10", "border-white/20");
        if (chess.in_check()) status += ' - CHECK!';
      }
    }
  }
  statusBar.innerText = status;
  opponentStatus.innerText = oppStatus;
  undoButton.disabled = !isPlayer || !canUndo;
  redoButton.disabled = !isPlayer || !canRedo;
};

const maybeAnnounceCheckmate = () => {
  if (!chess.in_checkmate()) {
    announcedResult = null;
    return;
  }

  const winner = chess.turn() === "w" ? "Black" : "White";
  const announcementKey = `${chess.fen()}|${winner}`;
  if (announcedResult === announcementKey) return;

  announcedResult = announcementKey;
  window.alert(`Checkmate! ${winner} wins.`);
};

const renderBoard = () => {
  const board = chess.board();
  boardElement.innerHTML = "";

  board.forEach((row, rowIndex) => {
    row.forEach((square, squareIndex) => {
      const squareElement = document.createElement("div");
      squareElement.classList.add(
        "square",
        (rowIndex + squareIndex) % 2 === 0 ? "light" : "dark"
      );

      squareElement.dataset.row = rowIndex;
      squareElement.dataset.col = squareIndex;

      // Add coordinate labels
      if (squareIndex === 0) {
        const rankLabel = document.createElement("span");
        rankLabel.innerText = 8 - rowIndex;
        rankLabel.classList.add("coord", "absolute", "top-1", "left-1", "text-[10px]", "font-bold", "opacity-80");
        if (playerRole === 'b') rankLabel.classList.add("flipped");
        squareElement.appendChild(rankLabel);
      }
      if (rowIndex === 7) {
        const fileLabel = document.createElement("span");
        fileLabel.innerText = String.fromCharCode(97 + squareIndex);
        fileLabel.classList.add("coord", "absolute", "bottom-1", "right-1.5", "text-[10px]", "font-bold", "opacity-80");
        if (playerRole === 'b') fileLabel.classList.add("flipped");
        squareElement.appendChild(fileLabel);
      }

      // Highlight last move
      if (lastMove) {
        const fromRow = 8 - parseInt(lastMove.from[1]);
        const fromCol = lastMove.from.charCodeAt(0) - 97;
        const toRow = 8 - parseInt(lastMove.to[1]);
        const toCol = lastMove.to.charCodeAt(0) - 97;
        if ((rowIndex === fromRow && squareIndex === fromCol) || (rowIndex === toRow && squareIndex === toCol)) {
          const highlight = document.createElement("div");
          highlight.classList.add("highlight");
          squareElement.appendChild(highlight);
        }
      }

      if (square) {
        const pieceElement = document.createElement("div");
        pieceElement.classList.add("piece");
        pieceElement.style.backgroundImage = `url(${piecesUrl[square.color][square.type]})`;
        pieceElement.draggable = playerRole === square.color;

        pieceElement.addEventListener("dragstart", (e) => {
          if (pieceElement.draggable) {
            draggedPiece = pieceElement;
            sourceSquare = { row: rowIndex, col: squareIndex };
            // Optional ghost image set
            e.dataTransfer.setData("text/plain", "");
            setTimeout(() => {
              pieceElement.style.opacity = '0.5';
            }, 0);
          }
        });

        pieceElement.addEventListener("dragend", () => {
          draggedPiece.style.opacity = '1';
          draggedPiece = null;
          sourceSquare = null;
        });

        squareElement.appendChild(pieceElement);
      }

      squareElement.addEventListener("dragover", (e) => {
        // Only allow drop if we are currently dragging a piece
        if (draggedPiece) {
            e.preventDefault();
        }
      });

      squareElement.addEventListener("drop", (e) => {
        e.preventDefault();
        if (sourceSquare) {
          const targetSquare = {
            row: parseInt(squareElement.dataset.row),
            col: parseInt(squareElement.dataset.col),
          };
          handleMove(sourceSquare, targetSquare);
        }
      });

      boardElement.appendChild(squareElement);
    });
  });

  if (playerRole === "b") {
    boardElement.classList.add("flipped");
  } else {
    boardElement.classList.remove("flipped");
  }

  updateStatus();
};

const handleMove = (source, target) => {
  const sourceMove = `${String.fromCharCode(97 + source.col)}${8 - source.row}`;
  const targetMove = `${String.fromCharCode(97 + target.col)}${8 - target.row}`;

  // Simple promotion to queen always for now (chess.js requirement if pawn reaches end)
  const piece = chess.get(sourceMove);
  const isPromotion = piece && piece.type === 'p' && (target.row === 0 || target.row === 7);

  const move = {
    from: sourceMove,
    to: targetMove,
    promotion: isPromotion ? "q" : undefined,
  };

  // Optimistic update locally? We shouldn't actually, because backend validates.
  // Actually, we can check if it's valid with chess.js locally before sending.
  const tempChess = new Chess(chess.fen());
  const moveRes = tempChess.move(move);
  
  if (moveRes) {
    // We send move to server, it will broadcast back to us.
    // In this implementation, app.js will emit "move" which does `chess.move(move)` globally.
    socket.emit("move", move);
  }
};

socket.on("playerrole", (role) => {
  playerRole = role;
  renderBoard();
});

socket.on("spectator", () => {
  playerRole = null;
  renderBoard();
});

socket.on("gamestate", ({ fen, lastMove: nextLastMove, canUndo: nextCanUndo, canRedo: nextCanRedo }) => {
  chess.load(fen);
  lastMove = nextLastMove || null;
  canUndo = Boolean(nextCanUndo);
  canRedo = Boolean(nextCanRedo);
  renderBoard();
  maybeAnnounceCheckmate();
});

undoButton.addEventListener("click", () => {
  if (!undoButton.disabled) {
    socket.emit("undo");
  }
});

redoButton.addEventListener("click", () => {
  if (!redoButton.disabled) {
    socket.emit("redo");
  }
});

// Initialization
renderBoard();
