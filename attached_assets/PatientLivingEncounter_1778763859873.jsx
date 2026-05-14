// AURALYN — Patient Living Encounter
// Patient-facing visual summary + ongoing update channel
// Route: /my-visit/:shareToken

import { useState, useEffect, useRef } from "react";

const DISPOSITION_CONFIG = {
  green: {
    label: "You're on track",
    sublabel: "Follow home care instructions",
    bg: "linear-gradient(135deg, #0f4c2a 0%, #166534 100%)",
    accent: "#22c55e", light: "#dcfce7", text: "#f0fdf4",
    ring: "rgba(34,197,94,0.3)", icon: "✓",
  },
  yellow: {
    label: "Watch and monitor",
    sublabel: "Check back if symptoms worsen",
    bg: "linear-gradient(135deg, #713f12 0%, #92400e 100%)",
    accent: "#f59e0b", light: "#fef3c7", text: "#fffbeb",
    ring: "rgba(245,158,11,0.3)", icon: "◎",
  },
  orange: {
    label: "Needs attention",
    sublabel: "Contact your care team today",
    bg: "linear-gradient(135deg, #7c2d12 0%, #9a3412 100%)",
    accent: "#f97316", light: "#ffedd5", text: "#fff7ed",
    ring: "rgba(249,115,22,0.3)", icon: "⚠",
  },
  red: {
    label: "Seek care now",
    sublabel: "Go to the ER or call 911",
    bg: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)",
    accent: "#ef4444", light: "#fee2e2", text: "#fef2f2",
    ring: "rgba(239,68,68,0.4)", icon: "!",
  },
};

function DispositionRing({ color }) {
  const cfg = DISPOSITION_CONFIG[color] || DISPOSITION_CONFIG.green;
  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"36px 24px 28px", background: cfg.bg,
      borderRadius:"24px 24px 0 0", position:"relative", overflow:"hidden",
    }}>
      <style>{`
        @keyframes pulse-ring {
          0%{transform:translate(-50%,-50%) scale(0.8);opacity:0.5}
          100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}
        }
        @keyframes pop-in {
          0%{transform:scale(0)} 80%{transform:scale(1.1)} 100%{transform:scale(1)}
        }
        @keyframes slide-up {
          from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)}
        }
      `}</style>
      {[0,1,2].map(i => (
        <div key={i} style={{
          position:"absolute", width:180+i*60, height:180+i*60,
          borderRadius:"50%", border:`1px solid ${cfg.ring}`,
          animation:`pulse-ring 3s ease-out ${i*0.9}s infinite`,
          top:"50%", left:"50%", pointerEvents:"none",
        }}/>
      ))}
      <div style={{
        width:88, height:88, borderRadius:"50%", background:cfg.accent,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:42, color:"#fff", fontWeight:700, marginBottom:18,
        boxShadow:`0 0 40px ${cfg.ring}`, position:"relative", zIndex:1,
        animation:"pop-in 0.6s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {cfg.icon}
      </div>
      <div style={{textAlign:"center", position:"relative", zIndex:1}}>
        <div style={{fontSize:26,fontWeight:700,color:cfg.text,letterSpacing:"-0.5px",marginBottom:6,fontFamily:"Georgia,serif"}}>
          {cfg.label}
        </div>
        <div style={{fontSize:15,color:cfg.accent,fontWeight:500}}>{cfg.sublabel}</div>
      </div>
    </div>
  );
}

function ReasoningTrail({ factors }) {
  if (!factors?.length) return null;
  return (
    <div style={{padding:"20px 20px 0"}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",color:"#6b7280",textTransform:"uppercase",marginBottom:14}}>
        Why this recommendation
      </div>
      {factors.map((f, i) => (
        <div key={i} style={{
          display:"flex", alignItems:"flex-start", gap:10, marginBottom:12,
          animation:`slide-up 0.4s ease ${i*0.08}s both`,
        }}>
          <div style={{
            width:26, height:26, borderRadius:"50%", flexShrink:0,
            background: f.type==="concern"?"#fee2e2": f.type==="reassuring"?"#dcfce7":"#f3f4f6",
            color: f.type==="concern"?"#dc2626": f.type==="reassuring"?"#16a34a":"#6b7280",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:13, fontWeight:700, marginTop:1,
          }}>
            {f.type==="concern"?"▲": f.type==="reassuring"?"✓":"—"}
          </div>
          <div>
            <div style={{fontSize:14,color:"#111827",fontWeight:500,lineHeight:1.4}}>{f.label}</div>
            {f.detail && <div style={{fontSize:13,color:"#6b7280",marginTop:2,lineHeight:1.4}}>{f.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function WatchList({ erItems, returnItems }) {
  return (
    <div style={{padding:"16px 20px 0"}}>
      {erItems?.length > 0 && (
        <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#dc2626",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>
            Call 911 or go to ER if
          </div>
          {erItems.map((item,i) => (
            <div key={i} style={{fontSize:14,color:"#7f1d1d",paddingLeft:12,borderLeft:"2px solid #ef4444",marginBottom:i<erItems.length-1?6:0,lineHeight:1.4}}>
              {item}
            </div>
          ))}
        </div>
      )}
      {returnItems?.length > 0 && (
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#92400e",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8}}>
            Call us or come back if
          </div>
          {returnItems.map((item,i) => (
            <div key={i} style={{fontSize:14,color:"#78350f",paddingLeft:12,borderLeft:"2px solid #f59e0b",marginBottom:i<returnItems.length-1?6:0,lineHeight:1.4}}>
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SymptomTimeline({ updates }) {
  if (!updates?.length) return null;
  const colorMap = {improvement:"#16a34a",worsening:"#dc2626",new_symptom:"#d97706",question:"#2563eb",resolved:"#16a34a"};
  return (
    <div style={{padding:"20px"}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",color:"#6b7280",textTransform:"uppercase",marginBottom:14}}>
        Your symptom timeline
      </div>
      <div style={{position:"relative",paddingLeft:24}}>
        <div style={{position:"absolute",left:7,top:0,bottom:0,width:2,background:"#e5e7eb"}}/>
        {updates.map((u,i) => (
          <div key={i} style={{position:"relative",marginBottom:16}}>
            <div style={{
              position:"absolute",left:-17,top:2,width:12,height:12,
              borderRadius:"50%",background:colorMap[u.update_type]||"#6b7280",
              border:"2px solid #fff",boxShadow:`0 0 0 2px ${colorMap[u.update_type]||"#6b7280"}30`,
            }}/>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:2}}>
              {new Date(u.updated_at).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}
            </div>
            <div style={{fontSize:14,color:"#111827",lineHeight:1.4}}>{u.patient_message}</div>
            {u.physician_alerted && (
              <span style={{display:"inline-block",fontSize:11,background:"#fef3c7",color:"#92400e",borderRadius:4,padding:"2px 6px",marginTop:4,fontWeight:600}}>
                Care team notified
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LivingChat({ encounterId, shareToken, onAlert }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {role:"auralyn",text:"How are you feeling since your visit? Tell me if things are better, worse, or if you have a question.",time:new Date()}
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const send = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    setMessages(prev => [...prev,{role:"patient",text,time:new Date()}]);
    try {
      const res = await fetch(`/api/encounters/${encounterId}/update`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({patientMessage:text,shareToken}),
      });
      const data = await res.json();
      setMessages(prev => [...prev,{role:"auralyn",text:data.message,alertSent:data.physicianAlertSent,time:new Date()}]);
      if (data.physicianAlertSent) onAlert?.(data);
    } catch {
      setMessages(prev => [...prev,{role:"auralyn",text:"Something went wrong. If this is urgent, please call 911 or the clinic directly.",time:new Date()}]);
    } finally {
      setSending(false);
      setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),100);
    }
  };

  return (
    <div style={{borderTop:"1px solid #e5e7eb"}}>
      <button onClick={()=>setOpen(!open)} style={{
        width:"100%",padding:"16px 20px",background:"none",border:"none",cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        fontSize:15,fontWeight:600,color:"#111827",
      }}>
        <span>💬 Update your care team</span>
        <span style={{color:"#6b7280",fontSize:13}}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{padding:"0 16px 20px"}}>
          <div style={{fontSize:13,color:"#6b7280",marginBottom:12,lineHeight:1.5}}>
            Tell us how you're feeling, report a new symptom, or ask a question.
            Urgent updates go directly to your care team.
          </div>
          <div style={{background:"#f9fafb",borderRadius:12,padding:12,maxHeight:260,overflowY:"auto",marginBottom:10}}>
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",flexDirection:m.role==="patient"?"row-reverse":"row",gap:8,marginBottom:10}}>
                <div style={{
                  maxWidth:"80%",
                  background:m.role==="patient"?"#2563eb":"#fff",
                  color:m.role==="patient"?"#fff":"#111827",
                  borderRadius:m.role==="patient"?"16px 16px 4px 16px":"16px 16px 16px 4px",
                  padding:"10px 14px",fontSize:14,lineHeight:1.5,
                  boxShadow:"0 1px 3px rgba(0,0,0,0.08)",
                }}>
                  {m.text}
                  {m.alertSent && <div style={{fontSize:11,color:"#fbbf24",marginTop:4,fontWeight:600}}>⚠ Care team alerted</div>}
                </div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <input
              value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&send()}
              placeholder="How are you feeling?"
              style={{flex:1,padding:"10px 14px",borderRadius:24,border:"1px solid #d1d5db",fontSize:14,outline:"none"}}
            />
            <button onClick={send} disabled={sending||!input.trim()} style={{
              width:44,height:44,borderRadius:"50%",border:"none",cursor:"pointer",
              background:sending||!input.trim()?"#d1d5db":"#2563eb",
              color:"#fff",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",
            }}>
              {sending?"…":"↑"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PatientLivingEncounter({ shareToken }) {
  const [summary, setSummary] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  useEffect(()=>{
    Promise.all([
      fetch(`/api/patient-summary/${shareToken}`).then(r=>r.ok?r.json():null),
      fetch(`/api/encounters/updates/${shareToken}`).then(r=>r.ok?r.json():null),
    ]).then(([s,u])=>{
      if(s) setSummary(s);
      if(u) setUpdates(u.updates||[]);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[shareToken]);

  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"#6b7280"}}>
      Loading your visit summary…
    </div>
  );

  const color = summary?.disposition_color || "green";
  const cfg = DISPOSITION_CONFIG[color];

  const reasoningFactors = summary?.reasoningFactors || [];

  return (
    <div style={{maxWidth:440,margin:"0 auto",minHeight:"100vh",background:"#fff",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

      <DispositionRing color={color}/>

      {alert?.physicianAlertSent && (
        <div style={{background:"#ef4444",color:"#fff",padding:"12px 20px",fontSize:14,fontWeight:600,textAlign:"center"}}>
          ⚠ Your care team has been alerted and will contact you shortly
        </div>
      )}

      {/* Top differential chips */}
      {summary?.topDifferential?.length > 0 && (
        <div style={{padding:"20px 20px 0"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",color:"#6b7280",textTransform:"uppercase",marginBottom:10}}>
            What we're evaluating
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {summary.topDifferential.map((dx,i)=>(
              <span key={i} style={{
                background:i===0?cfg.light:"#f3f4f6",
                color:i===0?"#1f2937":"#374151",
                padding:"6px 12px",borderRadius:20,fontSize:13,fontWeight:i===0?600:400,
              }}>
                {dx}
              </span>
            ))}
          </div>
        </div>
      )}

      <ReasoningTrail factors={reasoningFactors}/>

      <WatchList erItems={summary?.erTriggers} returnItems={summary?.returnPrecautions}/>

      {updates.length > 0 && (
        <>
          <div style={{height:1,background:"#e5e7eb",margin:"20px 20px 0"}}/>
          <SymptomTimeline updates={updates}/>
        </>
      )}

      <LivingChat
        encounterId={summary?.encounterId}
        shareToken={shareToken}
        onAlert={setAlert}
      />

      <div style={{padding:"16px 20px 40px",textAlign:"center",fontSize:12,color:"#9ca3af",lineHeight:1.6}}>
        This summary is for your reference and does not replace medical advice.
        <br/>In an emergency, call 911.
      </div>
    </div>
  );
}
