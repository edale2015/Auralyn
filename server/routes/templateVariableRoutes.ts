import express from "express";
import { SecretStore } from "../templateStudio/secretStore";
import { VariableResolver } from "../templateStudio/variableResolver";

const router = express.Router();
const secretStore = new SecretStore();
const resolver = new VariableResolver(secretStore);

router.get("/secrets", async (_req, res) => {
  const secrets = await secretStore.list();
  res.json({ secrets });
});

router.post("/secrets", async (req, res) => {
  const { name, value, provider, tags } = req.body;
  const secret = await secretStore.create(name, value, provider, tags);
  res.json({ secret });
});

router.post("/resolve", async (req, res) => {
  const { definitions, bindings } = req.body;
  const result = await resolver.resolve(definitions, bindings);
  res.json(result);
});

router.post("/interpolate", async (req, res) => {
  const { value, values } = req.body;
  const result = resolver.interpolateObject(value, values || {});
  res.json({ result });
});

export default router;
