
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
module.exports = (q,p=[]) => pool.query(q,p);
