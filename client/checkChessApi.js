const { Chess } = require("./node_modules/chess.js");
const c = new Chess();
console.log(
  Object.getOwnPropertyNames(Object.getPrototypeOf(c)).sort().join("\n"),
);
