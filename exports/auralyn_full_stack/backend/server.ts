import express from "express";
const app = express();
app.use(express.json());

app.get("/api/health", (_, res) => res.send("OK"));

app.listen(3000, () => console.log("Backend running on :3000"));
