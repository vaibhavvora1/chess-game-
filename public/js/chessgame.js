const socket = io(); //create socket object
const chess = new Chess(); //create chess object

let boardelement = document.querySelector(".chessboard");

let draggedpiece = null;
let sourcesquare = null;
let playerrole = null;

const renderboard = function () {
  // renderboard ka function banaya
  const board = chess.board(); //board me chess.board store kiya

  boardelement.innerHTML = ""; // board refres hoga
  board.forEach(function (row, rowindex) {
    // board ki row and index me foreach lagaya
    row.forEach(function (square, squareindex) {
      // row ki square and index me foreach lagaya
      const squareelement = document.createElement("div"); //new element banya square ke liya
      squareelement.classList.add(
        // usme squre class add ki
        "square",
        (rowindex + squareindex) % 2 === 0 ? "light" : "dark", // and jo rowindex and squareindex ka total 2 se division ke bad 0 hoga wo squre light hoga and dosra black
      );

      squareelement.dataset.row = rowindex;
      squareelement.dataset.square = squareindex;

      if (square) {
        const pieceelement = document.createElement("div");
        pieceelement.classList.add(
          "piece",
          square.color === "w" ? "white" : "black",
        );
        pieceelement.innerText = getpieceunicode(square);
        pieceelement.draggable = playerrole === square.color;

        pieceelement.addEventListener("dragstart", function (e) {
          if (pieceelement.draggable) {
            draggedpiece = pieceelement;
            sourcesquare = { row: rowindex, col: squareindex };
            e.dataTransfer.setData("text/plain", "");
          }
        });
        pieceelement.addEventListener("dragend", function () {
          draggedpiece = null;
          sourcesquare = null;
        });
        squareelement.appendChild(pieceelement);
      }

      squareelement.addEventListener("dragover", function (e) {
        e.preventDefault();
      });
      squareelement.addEventListener("drop", function (e) {
        e.preventDefault();
        const targetsource = {
          row: parseInt(squareelement.dataset.row),
          col: parseInt(squareelement.dataset.square),
        };

        handlemove(sourcesquare, targetsource);
      });
      boardelement.appendChild(squareelement);
    });
  });
  if (playerrole === "b") {
    boardelement.classList.add("flipped");
  } else {
    boardelement.classList.remove("flipped");
  }
};

const handlemove = function (source, target) {
  const move = {
    from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
    to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
    promotion: "q",
  };

  socket.emit("move", move);
};

const getpieceunicode = function (piece) {
  const unicodepieces = {
    p: "♙",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "♛",
    k: "♚",
    P: "♙",
    R: "♖",
    N: "♘",
    B: "♗",
    Q: "♕",
    K: "♔",
  };
  return unicodepieces[piece.type] || "";
};

renderboard();

socket.on("playerrole", function (role) {
  playerrole = role;
  renderboard();
});

socket.on("spectatorrole", function () {
  playerrole = null;
  renderboard();
});

socket.on("boardstate", function (fen) {
  chess.load(fen);
  renderboard();
});

socket.on("move", function (move) {
  chess.move(move);
  renderboard();
});

// socket.emit("join"); //frontend se hmne backend me bheja

// socket.on("all user joined", function () {
//   //backend se jo aaya usko yaha pe implement kiya
//   console.log("all user joined");
// });
