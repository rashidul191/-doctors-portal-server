const express = require("express");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// get root port
app.get("/", (req, res) => {
  res.send("Running Server side");
});

// listen port number
app.listen(port, () => {
  console.log("lister port: ", port);
});
