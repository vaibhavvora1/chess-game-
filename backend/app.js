const express = require("express");
const socket = require("socket.io");
const http = require("http");
const path = require("path");
const { Chess } = require("chess.js");

const app = express();

const server = http.createServer(app);
const io = socket(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Serve static files from React build
// (using ../client/dist since this file is in backend folder)
app.use(express.static(path.join(__dirname, "../client", "dist")));

// Catch all handler: send back React's index.html file for client-side routing
app.use((req, res, next) => {
  if (req.path.startsWith("/socket.io")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "../client", "dist", "index.html"));
});

const chess = new Chess();
let redoStack = [];

let player = {}; // Fixed missing variable
let currentplayer = "w"; // Fixed missing variable

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

io.on("connection", function (uniquesocket) {
  console.log("New user connected");

  //players role
  if (!player.white) {
    player.white = uniquesocket.id;
    uniquesocket.emit("playerrole", "w");
  } else if (!player.black) {
    player.black = uniquesocket.id;
    uniquesocket.emit("playerrole", "b");
  } else {
    uniquesocket.emit("spectator");
  }

  emitGameState(uniquesocket);

  //disconnect player
  uniquesocket.on("disconnect", function () {
    if (uniquesocket.id === player.white) {
      delete player.white;
    } else if (uniquesocket.id === player.black) {
      delete player.black;
    }
  });

  //right move and wrong move
  uniquesocket.on("move", function (move) {
    try {
      if (chess.turn() === "w" && uniquesocket.id !== player.white) return;
      if (chess.turn() === "b" && uniquesocket.id !== player.black) return;

      let result = chess.move(move);
      if (result) {
        redoStack = [];
        currentplayer = chess.turn();
        emitGameState();
      } else {
        console.log("Invalid move : ", move);
        uniquesocket.emit("invalidmove", move);
      }
    } catch (err) {
      console.log(err);
      uniquesocket.emit("invalidmove", move);
    }
  });

  uniquesocket.on("undo", function () {
    if (uniquesocket.id !== player.white && uniquesocket.id !== player.black)
      return;

    const undoneMove = chess.undo();
    if (!undoneMove) return;

    redoStack.push(serializeMove(undoneMove));
    currentplayer = chess.turn();
    emitGameState();
  });

  uniquesocket.on("redo", function () {
    if (uniquesocket.id !== player.white && uniquesocket.id !== player.black)
      return;

    const move = redoStack.pop();
    if (!move) return;

    const redoneMove = chess.move(move);
    if (!redoneMove) {
      redoStack = [];
      emitGameState();
      return;
    }

    currentplayer = chess.turn();
    emitGameState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chess server listening on http://localhost:${PORT}`);
});
