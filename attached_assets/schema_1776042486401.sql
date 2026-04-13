
CREATE TABLE patients (
  id SERIAL PRIMARY KEY,
  name TEXT,
  age INT,
  vitals JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE scores (
  id SERIAL PRIMARY KEY,
  patient_id INT,
  sofa INT,
  curb65 INT,
  heart INT,
  wells INT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  patient_id INT,
  action TEXT,
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  patient_id INT,
  order_text TEXT,
  created_at TIMESTAMP DEFAULT now()
);
