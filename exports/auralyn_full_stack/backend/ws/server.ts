import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

setInterval(() => {
  const patient = {
    id: 1,
    vitals: {
      hr: 120,
      spo2: 91,
      temp: 101.2,
      bp: "90/60"
    }
  };

  wss.clients.forEach((c: any) => {
    c.send(JSON.stringify({ type: "PATIENT_UPDATE", data: [patient] }));
  });
}, 2000);
