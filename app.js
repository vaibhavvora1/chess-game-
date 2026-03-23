const express = require("express"); // install express
const socket = require("socket.io"); // install socket.io
const http = require("http"); // install http
const { Chess } = require("chess.js"); // install chess.js

const app = express(); //asign express as app
const path = require("path"); //install path

const server = http.createServer(app); //create server
const io = socket(server); //create socket server

const chess = new Chess(); //create chess object

let player = {}; //create player object
let currentplayer = "w"; //create currentplayer object

app.set("view engine", "ejs"); //set view engine as ejs
app.use(express.static("public")); //set views as path

app.get("/", (req, res) => {
  // make route
  res.render("index", { title: "Chess game" }); //render index.ejs
});

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
        currentplayer = chess.turn();
        io.emit("move", move); //hmne ye frontend me bhej diya
        io.emit("boardstate", chess.fen()); //ye frontend me board ki and peice ki current state bata dega
      } else {
        console.log("Invalid move : ", move); // koi invalid move hoga wo dikh jayega
        uniquesocket.emit("invalidmove", move); // wo sirf wo player ko hi dikhega
      }
    } catch (err) {
      console.log(err);
      uniquesocket.emit("invalidmove", move);
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
