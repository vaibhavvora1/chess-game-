const express = require("express"); // install express
const socket = require("socket.io"); // install socket.io
const http = require("http"); // install http
const path = require("path"); //install path
const { Chess } = require("chess.js"); // install chess.js

const app = express(); //asign express as app

const server = http.createServer(app); //create server
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
app.use(express.static(path.join(__dirname, "client", "dist")));

// Catch all handler: send back React's index.html file for client-side routing
app.use((req, res, next) => {
  if (req.path.startsWith("/socket.io")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

const chess = new Chess(); //create chess object
let redoStack = [];

let player = {}; //create player object
let currentplayer = "w"; //create currentplayer object

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
  //on connection
  console.log("New user connected  "); //print new user connected

  // uniquesocket.on("join", function () {
  //frontend se jo request aai usko hmne backend me implement kiya

  //     console.log("user joined");

  //     io.emit("all user joined"); //hmne firse backend se frontend pe ye bheja
  //   });

  //players role
  if (!player.white) {
    // jo hamara pehla player aaye ga usko check hoga and wo white nahi hua to use white diya jayega
    player.white = uniquesocket.id;
    uniquesocket.emit("playerrole", "w");
  } else if (!player.black) {
    player.black = uniquesocket.id;
    uniquesocket.emit("playerrole", "b");
  } // jo hamara dusra player aaye ga usko check hoga and wo black nahi hua to use black diya jayega
  else {
    uniquesocket.emit("spectator");
  }

  emitGameState(uniquesocket);

  //disconnect player
  uniquesocket.on("disconnect", function () {
    if (uniquesocket.id === player.white) {
      //agar hmara white player disconnect hoga to wo player delete ho jayega
      delete player.white;
    } else if (uniquesocket.id === player.black) {
      //agar hmara black player disconnect hoga to wo player delete ho jayega
      delete player.black;
    }
  });

  //right move and wrong move

  uniquesocket.on("move", function (move) {
    try {
      if (chess.turn() === "w" && uniquesocket.id !== player.white) return; // jab turn hoga white ka and move black krega to wo return ho jayega
      if (chess.turn() === "b" && uniquesocket.id !== player.black) return; // jab turn hoga black ka and move white krega to wo return ho jayega

      let result = chess.move(move); // chess sabhi peice ko move krayega agara koi piece ka move galat ho jaye to wo result false hoga
      if (result) {
        //result true aaye ga to turn change hoga
        redoStack = [];
        currentplayer = chess.turn();
        emitGameState(); //ye frontend me board ki and peice ki current state bata dega
      } else {
        console.log("Invalid move : ", move); // koi invalid move hoga wo dikh jayega
        uniquesocket.emit("invalidmove", move); // wo sirf wo player ko hi dikhega
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
