
const express = require("express");
const db = require("./db");
const { SOFA, CURB65, HEART, WELLS } = require("./clinicalScores");
const { dosing, contraindications } = require("./intervention");

const router = express.Router();

router.post("/patient", async (req,res)=>{
  const { name, age, vitals } = req.body;

  const p = await db("INSERT INTO patients(name,age,vitals) VALUES($1,$2,$3) RETURNING *",
    [name,age,vitals]);

  const sofa = SOFA(vitals);
  const curb = CURB65(vitals);
  const heart = HEART(vitals);
  const wells = WELLS(vitals);

  await db("INSERT INTO scores(patient_id,sofa,curb65,heart,wells) VALUES($1,$2,$3,$4,$5)",
    [p.rows[0].id,sofa,curb,heart,wells]);

  const dose = dosing(vitals.weight || 70);
  const contra = contraindications(vitals);

  const order = dose + " | " + contra;

  await db("INSERT INTO orders(patient_id,order_text) VALUES($1,$2)",
    [p.rows[0].id, order]);

  await db("INSERT INTO audit_log(patient_id,action,reasoning) VALUES($1,$2,$3)",
    [p.rows[0].id,"order",JSON.stringify({sofa,curb,heart,wells})]);

  res.json({ patient:p.rows[0], scores:{sofa,curb,heart,wells}, order });
});

router.get("/dashboard", async (req,res)=>{
  const data = await db("SELECT * FROM scores ORDER BY sofa DESC");
  res.json(data.rows);
});

module.exports = router;
