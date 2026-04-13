
require("dotenv").config();
const express = require("express");
const routes = require("./routes");

const app = express();
app.use(express.json());
app.use("/api", routes);

app.listen(3000, ()=>console.log("Phase 5 running"));
