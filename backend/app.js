const express = require("express");
const http = require("http");
const socket = require("socket.io");
const { Chess } = require("chess.js");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// ── SOCKET SETUP ─────────────────────────────
const io = socket(server, {
  cors: {
    origin: ["http://localhost:5173", "https://chess-mocha-three.vercel.app"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ── MIDDLEWARE ───────────────────────────────
app.use(cors());
app.use(express.json());

// optional test route
app.get("/", (req, res) => {
  res.send("Chess backend running 🚀");
});

// ── CHESS STATE ──────────────────────────────
const chess = new Chess();
let redoStack = [];

let players = {
  white: null,
  black: null,
};

// ── HELPERS ───────────────────────────────────
function serializeMove(move) {
  if (!move) return null;

  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion,
  };
}

function getLastMove() {
  const history = chess.history({ verbose: true });
  return serializeMove(history[history.length - 1] || null);
}

function emitGameState(target = io) {
  target.emit("gamestate", {
    fen: chess.fen(),
    lastMove: getLastMove(),
    canUndo: chess.history().length > 0,
    canRedo: redoStack.length > 0,
  });
}

// ── SOCKET CONNECTION ─────────────────────────
io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  // assign roles
  if (!players.white) {
    players.white = socket.id;
    socket.emit("playerrole", "w");
  } else if (!players.black) {
    players.black = socket.id;
    socket.emit("playerrole", "b");
  } else {
    socket.emit("spectator");
  }

  emitGameState(socket);

  // ── DISCONNECT ─────────────────────────────
  socket.on("disconnect", () => {
    if (socket.id === players.white) {
      players.white = null;
    } else if (socket.id === players.black) {
      players.black = null;
    }
  });

  // ── MOVE ───────────────────────────────────
  socket.on("move", (move) => {
    try {
      if (chess.turn() === "w" && socket.id !== players.white) return;
      if (chess.turn() === "b" && socket.id !== players.black) return;

      const result = chess.move(move);

      if (result) {
        redoStack = [];
        emitGameState();
      } else {
        socket.emit("invalidmove", move);
      }
    } catch (err) {
      console.log("Move error:", err);
      socket.emit("invalidmove", move);
    }
  });

  // ── UNDO ───────────────────────────────────
  socket.on("undo", () => {
    if (socket.id !== players.white && socket.id !== players.black) return;

    const undone = chess.undo();
    if (!undone) return;

    redoStack.push(serializeMove(undone));
    emitGameState();
  });

  // ── REDO ───────────────────────────────────
  socket.on("redo", () => {
    if (socket.id !== players.white && socket.id !== players.black) return;

    const move = redoStack.pop();
    if (!move) return;

    const result = chess.move(move);

    if (!result) {
      redoStack = [];
    }

    emitGameState();
  });
});

// ── SERVER START ─────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Chess server running on port ${PORT}`);
});
