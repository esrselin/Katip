import { useState, useRef, useEffect } from "react";

const SYS_CHAT = `Sen KATİP, Türk hukuku alanında uzmanlaşmış yapay zekâ destekli bir hukuk araştırma asistanısın. Her zaman Türkçe yanıt ver. Yanıtlarını kaynaklarla destekle. Markdown formatında yanıt ver. Kısa ve öz ol. Sonuna "Bu bilgi referans amaçlıdır, hukuki tavsiye niteliği taşımaz." ekle.`;

const SYS_DILEKCE = `Sen KATİP Dilekçe Asistanı. Türk hukuku çerçevesinde profesyonel dilekçe taslağı hazırlıyorsun.

KURALLAR:
- Her zaman Türkçe yaz
- Resmi dilekçe formatını kullan (başlık, mahkeme, taraflar, konu, açıklamalar, sonuç ve istem)
- İlgili mevzuat maddelerini ve Yargıtay kararlarını dilekçeye entegre et
- Markdown formatında yaz
- Profesyonel hukuki dil kullan
- Dilekçe sonuna "Bu taslak referans amaçlıdır, kullanmadan önce bir avukata danışınız." ekle`;

const SYS_KARAR = `Sen KATİP Karar Arama asistanısın. Kullanıcının aradığı konuyla ilgili Yargıtay, Danıştay veya emsal kararları bul ve özetle.

KURALLAR:
- Her zaman Türkçe yanıt ver
- Her karar için: Mahkeme, Daire, Esas No, Karar No, Tarih, ve kısa özet ver
- En güncel ve ilgili kararları öncelikle sun
- Markdown formatında, her kararı ayrı blok olarak göster
- 3-5 karar sun
- Her kararın sonuna "[Bu kararı dilekçeye ekle]" yaz`;

const TEMPLATES = [
  { id: "ise_iade", name: "İşe İade Davası", icon: "⚖️", cat: "İş Hukuku", desc: "4857 sayılı İş Kanunu m.18-21" },
  { id: "kiralanan_tahliye", name: "Kiralananın Tahliyesi", icon: "🏠", cat: "Kira Hukuku", desc: "6098 sayılı TBK m.347-356" },
  { id: "bosanma", name: "Anlaşmalı Boşanma", icon: "👨‍👩‍👧", cat: "Aile Hukuku", desc: "4721 sayılı TMK m.166" },
  { id: "tazminat", name: "Maddi/Manevi Tazminat", icon: "💰", cat: "Borçlar Hukuku", desc: "6098 sayılı TBK m.49-58" },
  { id: "itiraz", name: "İcra Takibine İtiraz", icon: "📋", cat: "İcra Hukuku", desc: "2004 sayılı İİK m.62-72" },
  { id: "iptal", name: "İdari İşlem İptali", icon: "🏛️", cat: "İdare Hukuku", desc: "2577 sayılı İYUK m.2" },
];

const CHAT_EXAMPLES = [
  { icon: "⚖️", text: "İşe iade davası şartları nelerdir?" },
  { icon: "🏠", text: "Kiracı tahliye süreci nasıl işler?" },
  { icon: "💰", text: "Kıdem tazminatı hesaplama kriterleri" },
];

function md(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#d4e4f4'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<h4 style="font-size:13.5px;font-weight:600;margin:12px 0 4px;color:#b8d0e8">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:14.5px;font-weight:600;margin:14px 0 6px;color:#c8ddef">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="font-size:15.5px;font-weight:700;margin:16px 0 8px;color:#dce8f4">$1</h2>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:14px;position:relative;margin:2px 0"><span style="position:absolute;left:3px;color:#4a6fa5">•</span>$1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:20px;position:relative;margin:2px 0"><span style="position:absolute;left:1px;color:#4a6fa5;font-size:12px;font-weight:600">$1.</span>$2</div>')
    .replace(/\[Bu kararı dilekçeye ekle\]/g, '<span style="display:inline-block;margin-top:6px;padding:3px 10px;border-radius:6px;font-size:10.5px;font-weight:600;background:rgba(52,211,153,0.12);color:#34d399;border:1px solid rgba(52,211,153,0.15);cursor:pointer">+ Dilekçeye ekle</span>')
    .replace(/\n{2,}/g, '<div style="height:8px"></div>')
    .replace(/\n/g, "<br/>");
}

function Dots() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "6px 0" }}>
      {[0,1,2].map(i => <div key={i} style={{ width:7,height:7,borderRadius:"50%",background:"#4a6fa5",animation:`bp 1.4s ease ${i*.2}s infinite` }}/>)}
      <style>{`@keyframes bp{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1.1)}}`}</style>
    </div>
  );
}

async function callAPI(system, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages,
    }),
  });
  const data = await res.json();
  let text = "", sources = [];
  if (data.content) {
    for (const b of data.content) {
      if (b.type === "text") text += b.text;
      if (b.type === "web_search_tool_result" && b.content)
        for (const it of b.content)
          if (it.type === "web_search_result" && sources.length < 5)
            sources.push({ url: it.url, title: it.title });
    }
  }
  if (!text) text = data.error ? "Hata: " + data.error.message : "Yanıt alınamadı.";
  return { text, sources };
}

function NavBtn({ icon, label, active, onClick, badge }) {
  return (
    <div onClick={onClick} style={{
      padding: "10px 14px", borderRadius: 10, cursor: "pointer",
      background: active ? "rgba(74,111,165,0.12)" : "transparent",
      borderLeft: active ? "3px solid #4a6fa5" : "3px solid transparent",
      transition: "all 0.15s", marginBottom: 2
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(74,111,165,0.06)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, color: active ? "#9ec5e8" : "#4a6680" }}>{label}</span>
        {badge && <span style={{
          marginLeft: "auto", fontSize: 9, fontWeight: 700, padding: "1px 7px",
          borderRadius: 10, background: "rgba(52,211,153,0.12)", color: "#34d399"
        }}>{badge}</span>}
      </div>
    </div>
  );
}

function SourceBadges({ sources }) {
  if (!sources || !sources.length) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <span style={{ fontSize: 9, color: "#2d4a6a", fontWeight: 700, letterSpacing: 1 }}>KAYNAKLAR</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
        {sources.slice(0,4).map((s,j) => (
          <a key={j} href={s.url} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 9px", borderRadius: 6, fontSize: 10,
            background: "rgba(74,111,165,0.1)", color: "#6a9fd4",
            textDecoration: "none", border: "1px solid rgba(74,111,165,0.1)",
            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}>
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 1H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V7M7 1h4m0 0v4m0-4L5.5 6.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {s.title || new URL(s.url).hostname}
          </a>
        ))}
      </div>
    </div>
  );
}

function ChatModule() {
  const [msgs, setMsgs] = useState([]);
  const [inp, setInp] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  async function send(t) {
    const q = (t || inp).trim(); if (!q || loading) return;
    setInp("");
    setMsgs(p => [...p, { role: "user", content: q }]);
    setLoading(true);
    const hist = [...msgs.filter(m=>m.role==="user"||m.role==="assistant").map(m=>({role:m.role,content:m.content})),{role:"user",content:q}];
    try {
      const r = await callAPI(SYS_CHAT, hist);
      setMsgs(p => [...p, { role: "assistant", content: r.text, sources: r.sources }]);
    } catch(e) {
      setMsgs(p => [...p, { role: "assistant", content: "Bağlantı hatası." }]);
    }
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {msgs.length === 0 && !loading && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
            <div style={{ fontSize:17, fontWeight:600, color:"#8ab0d4" }}>Hukuki sorunuzu sorun</div>
            <div style={{ fontSize:12, color:"#3d5a80", textAlign:"center", maxWidth:340, lineHeight:1.6 }}>
              Yargıtay, Danıştay ve emsal kararlar taranarak kaynaklı yanıt üretilir.
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center", marginTop:8 }}>
              {CHAT_EXAMPLES.map((ex,i) => (
                <div key={i} onClick={() => send(ex.text)} style={{
                  padding:"8px 14px", borderRadius:10, fontSize:12, color:"#7bafd4", cursor:"pointer",
                  background:"rgba(74,111,165,0.07)", border:"1px solid rgba(74,111,165,0.1)", transition:"all 0.15s"
                }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(74,111,165,0.14)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(74,111,165,0.07)"}}>
                  {ex.icon} {ex.text}
                </div>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m,i) => (
          <div key={i} style={{ alignSelf: m.role==="user"?"flex-end":"flex-start", maxWidth:"88%" }}>
            {m.role==="assistant" && <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
              <div style={{width:18,height:18,borderRadius:5,background:"linear-gradient(135deg,#4a6fa5,#2a4a78)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#fff"}}>K</div>
              <span style={{fontSize:10.5,color:"#4a6fa5",fontWeight:600}}>KATİP</span>
            </div>}
            <div style={{
              padding: m.role==="user"?"10px 16px":"14px 18px",
              borderRadius: m.role==="user"?"16px 16px 4px 16px":"4px 16px 16px 16px",
              background: m.role==="user"?"linear-gradient(135deg,#3d6a9e,#2d4f7a)":"rgba(255,255,255,0.025)",
              border: m.role==="user"?"none":"1px solid rgba(255,255,255,0.05)",
              color: m.role==="user"?"#e8f0f8":"#94b0cc", fontSize:13, lineHeight:1.65
            }}>
              {m.role==="user" ? m.content : <div dangerouslySetInnerHTML={{__html:md(m.content)}}/>}
            </div>
            <SourceBadges sources={m.sources}/>
          </div>
        ))}
        {loading && <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
          <div style={{width:18,height:18,borderRadius:5,background:"linear-gradient(135deg,#4a6fa5,#2a4a78)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#fff",flexShrink:0}}>K</div>
          <div style={{padding:"10px 16px",borderRadius:"4px 14px 14px 14px",background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.05)"}}>
            <div style={{fontSize:10.5,color:"#4a6fa5",fontWeight:500}}>Kaynaklar taranıyor...</div><Dots/>
          </div>
        </div>}
        <div ref={endRef}/>
      </div>
      <div style={{ padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display:"flex", gap:8, background:"rgba(255,255,255,0.03)", borderRadius:12, border:"1px solid rgba(255,255,255,0.06)", padding:"3px 5px 3px 14px" }}>
          <input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();send();}}}
            placeholder="Hukuki sorunuzu yazın..." disabled={loading}
            style={{ flex:1,background:"none",border:"none",outline:"none",color:"#c8d6e5",fontSize:13,padding:"8px 0",fontFamily:"inherit" }}/>
          <button onClick={()=>send()} disabled={loading||!inp.trim()} style={{
            width:36,height:36,borderRadius:10,border:"none",
            background:inp.trim()&&!loading?"linear-gradient(135deg,#4a6fa5,#2d4f7a)":"rgba(255,255,255,0.03)",
            color:inp.trim()&&!loading?"#fff":"#1e3348",cursor:inp.trim()&&!loading?"pointer":"default",
            display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",flexShrink:0
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2L7 9M14 2L9.5 14L7 9M14 2L2 6.5L7 9"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function DilekceModule() {
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ davaci:"", davali:"", konu:"", mahkeme:"" });
  const [result, setResult] = useState("");
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const resRef = useRef(null);

  useEffect(() => { if (result) resRef.current?.scrollIntoView({ behavior: "smooth" }); }, [result]);

  async function generate() {
    setLoading(true); setStep(2);
    const t = TEMPLATES.find(t=>t.id===sel);
    const prompt = `Aşağıdaki bilgilere göre "${t.name}" dilekçesi hazırla:

- Mahkeme: ${form.mahkeme || t.cat + " Mahkemesi"}
- Davacı: ${form.davaci}
- Davalı: ${form.davali}
- Konu/Açıklama: ${form.konu}
- İlgili Mevzuat: ${t.desc}

Profesyonel dilekçe formatında, ilgili mevzuat maddeleri ve güncel Yargıtay/Danıştay kararlarına atıf yaparak hazırla. Dilekçe başlığı, taraflar, açıklamalar, hukuki dayanaklar, deliller ve sonuç-istem bölümlerini içersin.`;

    try {
      const r = await callAPI(SYS_DILEKCE, [{ role: "user", content: prompt }]);
      setResult(r.text);
      setSources(r.sources);
    } catch(e) {
      setResult("Bağlantı hatası. Lütfen tekrar deneyin.");
    }
    setLoading(false);
  }

  if (step === 0) return (
    <div style={{ padding: "20px", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#c8ddef", marginBottom: 4 }}>Dilekçe Şablonu Seçin</div>
        <div style={{ fontSize: 12, color: "#3d5a80" }}>Şablon seçin, bilgileri girin, AI dilekçenizi emsal kararlarla hazırlasın.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {TEMPLATES.map(t => (
          <div key={t.id} onClick={() => { setSel(t.id); setStep(1); }} style={{
            padding: "16px", borderRadius: 12, cursor: "pointer",
            background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)",
            transition: "all 0.2s"
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(74,111,165,0.1)"; e.currentTarget.style.borderColor = "rgba(74,111,165,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"; }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>{t.icon}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#b8d0e8", marginBottom: 3 }}>{t.name}</div>
            <div style={{ fontSize: 10.5, color: "#3d5a80", marginBottom: 6 }}>{t.cat}</div>
            <div style={{ fontSize: 10, color: "#2d4a6a", fontFamily: "monospace" }}>{t.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const tmpl = TEMPLATES.find(t => t.id === sel);

  if (step === 1) return (
    <div style={{ padding: "20px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setStep(0)} style={{
          background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "#4a6fa5",
          borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12
        }}>← Geri</button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#c8ddef" }}>{tmpl.icon} {tmpl.name}</div>
          <div style={{ fontSize: 11, color: "#3d5a80" }}>{tmpl.desc}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {[
          { key: "mahkeme", label: "Mahkeme", ph: `Örn: İstanbul 1. İş Mahkemesi` },
          { key: "davaci", label: "Davacı", ph: "Ad Soyad / Ünvan" },
          { key: "davali", label: "Davalı", ph: "Ad Soyad / Ünvan" },
          { key: "konu", label: "Konu ve Açıklama", ph: "Davanın konusu, önemli detaylar...", area: true },
        ].map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6a8caa", marginBottom: 5, display: "block", letterSpacing: 0.3 }}>{f.label}</label>
            {f.area ? (
              <textarea value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})}
                placeholder={f.ph} rows={4}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10, padding: "10px 14px", color: "#c8d6e5", fontSize: 13,
                  fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box"
                }}/>
            ) : (
              <input value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})}
                placeholder={f.ph}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10, padding: "10px 14px", color: "#c8d6e5", fontSize: 13,
                  fontFamily: "inherit", outline: "none", boxSizing: "border-box"
                }}/>
            )}
          </div>
        ))}

        <button onClick={generate} disabled={!form.davaci || !form.davali || !form.konu} style={{
          padding: "12px 20px", borderRadius: 12, border: "none", fontWeight: 600, fontSize: 13.5,
          background: form.davaci && form.davali && form.konu
            ? "linear-gradient(135deg, #4a6fa5, #2d4f7a)" : "rgba(255,255,255,0.04)",
          color: form.davaci && form.davali && form.konu ? "#fff" : "#2d4a6a",
          cursor: form.davaci && form.davali && form.konu ? "pointer" : "default",
          fontFamily: "inherit", transition: "all 0.2s", marginTop: 4,
          boxShadow: form.davaci && form.davali && form.konu ? "0 4px 16px rgba(74,111,165,0.25)" : "none"
        }}>
          Dilekçe Oluştur (AI + Emsal Kararlar)
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: "20px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => { setStep(0); setResult(""); setSources([]); }} style={{
            background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "#4a6fa5",
            borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12
          }}>← Yeni Dilekçe</button>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#b8d0e8" }}>{tmpl.icon} {tmpl.name}</div>
        </div>
        {result && !loading && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => navigator.clipboard.writeText(result)} style={{
              background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.15)",
              color: "#34d399", borderRadius: 8, padding: "5px 12px", cursor: "pointer",
              fontSize: 11, fontWeight: 600
            }}>Kopyala</button>
            <span style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: "rgba(74,111,165,0.1)", color: "#7bafd4", border: "1px solid rgba(74,111,165,0.15)"
            }}>UDF (yakında)</span>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #4a6fa5, #2a4a78)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "bpulse2 2s ease infinite"
          }}>
            <span style={{ fontSize: 22 }}>📝</span>
          </div>
          <style>{`@keyframes bpulse2{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}`}</style>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#8ab0d4", marginBottom: 4 }}>Dilekçe hazırlanıyor...</div>
            <div style={{ fontSize: 11.5, color: "#3d5a80" }}>Emsal kararlar taranıyor ve dilekçeye entegre ediliyor</div>
          </div>
          <Dots />
        </div>
      ) : result && (
        <div>
          <div style={{
            padding: "20px", borderRadius: 14,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            fontSize: 13, lineHeight: 1.75, color: "#94b0cc"
          }}>
            <div dangerouslySetInnerHTML={{ __html: md(result) }} />
          </div>
          <SourceBadges sources={sources} />
          <div ref={resRef} />
        </div>
      )}
    </div>
  );
}

function KararModule() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);

  async function search(t) {
    const q = (t || query).trim(); if (!q || loading) return;
    setQuery(""); setLoading(true); setResult("");
    try {
      const r = await callAPI(SYS_KARAR, [{ role: "user", content: q }]);
      setResult(r.text);
      setSources(r.sources);
    } catch(e) { setResult("Bağlantı hatası."); }
    setLoading(false);
  }

  const QUICK = [
    "İşe iade Yargıtay kararları 2024-2025",
    "Kiracı tahliye emsal kararlar",
    "Mobbing tazminat Yargıtay kararları",
    "Kıdem tazminatı hesaplama içtihat",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: 8, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "3px 5px 3px 14px" }}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); search(); }}}
            placeholder="Karar arayın... (örn: işe iade Yargıtay)" disabled={loading}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#c8d6e5", fontSize: 13, padding: "9px 0", fontFamily: "inherit" }}/>
          <button onClick={() => search()} disabled={loading || !query.trim()} style={{
            padding: "0 14px", height: 36, borderRadius: 10, border: "none", fontWeight: 600, fontSize: 12,
            background: query.trim() && !loading ? "linear-gradient(135deg,#4a6fa5,#2d4f7a)" : "rgba(255,255,255,0.03)",
            color: query.trim() && !loading ? "#fff" : "#1e3348", cursor: query.trim() && !loading ? "pointer" : "default",
            transition: "all 0.2s", flexShrink: 0
          }}>Ara</button>
        </div>
        {!result && !loading && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
            {QUICK.map((q, i) => (
              <div key={i} onClick={() => { setQuery(q); search(q); }} style={{
                padding: "5px 11px", borderRadius: 8, fontSize: 11, color: "#6a9fd4", cursor: "pointer",
                background: "rgba(74,111,165,0.06)", border: "1px solid rgba(74,111,165,0.08)", transition: "all 0.15s"
              }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(74,111,165,0.14)"; }}
                 onMouseLeave={e => { e.currentTarget.style.background = "rgba(74,111,165,0.06)"; }}>
                {q}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#8ab0d4" }}>Kararlar taranıyor...</div>
            <div style={{ fontSize: 11.5, color: "#3d5a80" }}>Yargıtay, Danıştay, emsal kararlar aranıyor</div>
            <Dots />
          </div>
        )}
        {result && !loading && (
          <div>
            <div style={{
              padding: "18px", borderRadius: 14,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              fontSize: 13, lineHeight: 1.7, color: "#94b0cc"
            }}>
              <div dangerouslySetInnerHTML={{ __html: md(result) }} />
            </div>
            <SourceBadges sources={sources} />
          </div>
        )}
        {!result && !loading && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>🔍</div>
            <div style={{ fontSize: 14, color: "#3d5a80", fontWeight: 500 }}>Anahtar kelime veya konu yazarak karar arayın</div>
            <div style={{ fontSize: 11.5, color: "#2d4a6a", marginTop: 4 }}>Yargıtay, Danıştay ve emsal kararlar taranır</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KatipFullDemo() {
  const [tab, setTab] = useState("chat");

  return (
    <div style={{
      display: "flex", height: "85vh", minHeight: 520, maxHeight: 740,
      background: "#080e1a", borderRadius: 18, overflow: "hidden",
      fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
      border: "1px solid rgba(255,255,255,0.05)",
      boxShadow: "0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>

      <div style={{
        width: 220, background: "#0a1222", borderRight: "1px solid rgba(255,255,255,0.04)",
        display: "flex", flexDirection: "column", flexShrink: 0
      }}>
        <div style={{ padding: "20px 16px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 11,
              background: "linear-gradient(135deg, #4a6fa5 0%, #2a4a78 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, fontWeight: 800, color: "#fff",
              boxShadow: "0 4px 14px rgba(74,111,165,0.3)"
            }}>K</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#e8eff7", letterSpacing: -0.5 }}>KATİP</div>
              <div style={{ fontSize: 9, color: "#4a6fa5", fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>v2.0 · 2026</div>
            </div>
          </div>
        </div>

        <div style={{ padding: "8px 10px", flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#1e3348", letterSpacing: 1.5, textTransform: "uppercase", padding: "0 6px 10px" }}>Modüller</div>
          <NavBtn icon="💬" label="AI Sohbet" active={tab==="chat"} onClick={()=>setTab("chat")} />
          <NavBtn icon="📝" label="Dilekçe Asistanı" active={tab==="dilekce"} onClick={()=>setTab("dilekce")} badge="YENİ" />
          <NavBtn icon="🔍" label="Karar Arama" active={tab==="karar"} onClick={()=>setTab("karar")} />

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.03)", marginTop: 16, paddingTop: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#1e3348", letterSpacing: 1.5, textTransform: "uppercase", padding: "0 6px 8px" }}>Yakında</div>
            <div style={{ padding: "8px 14px", borderRadius: 8, opacity: 0.35 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13 }}>🔔</span>
                <span style={{ fontSize: 11.5, color: "#4a6680" }}>Karar Uyarıları</span>
              </div>
            </div>
            <div style={{ padding: "8px 14px", borderRadius: 8, opacity: 0.35 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13 }}>📊</span>
                <span style={{ fontSize: 11.5, color: "#4a6680" }}>İçtihat Analizi</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 8px rgba(52,211,153,0.4)" }} />
            <span style={{ fontSize: 10, color: "#3d5a80" }}>Claude Sonnet 4.6</span>
          </div>
          <div style={{ fontSize: 9.5, color: "#1a2d42", marginTop: 5 }}>14 kurum · Web search · RAG</div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{
          padding: "11px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(255,255,255,0.008)"
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#b8d0e8" }}>
            {tab === "chat" ? "💬 Hukuk Araştırma" : tab === "dilekce" ? "📝 Dilekçe Asistanı" : "🔍 Karar Arama Motoru"}
          </div>
          <div style={{
            padding: "3px 12px", borderRadius: 20, fontSize: 9.5, fontWeight: 700,
            background: "rgba(52,211,153,0.08)", color: "#34d399",
            border: "1px solid rgba(52,211,153,0.12)", letterSpacing: 0.5
          }}>DEMO</div>
        </div>

        <div style={{ flex: 1, overflow: "hidden" }}>
          {tab === "chat" && <ChatModule />}
          {tab === "dilekce" && <DilekceModule />}
          {tab === "karar" && <KararModule />}
        </div>

        <div style={{ padding: "6px 16px 8px", borderTop: "1px solid rgba(255,255,255,0.03)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9, color: "#14233a" }}>Bu bilgiler referans amaçlıdır, hukuki tavsiye niteliği taşımaz.</span>
          <span style={{ fontSize: 9, color: "#14233a" }}>KATİP © 2026 · Bilişim Vadisi</span>
        </div>
      </div>
    </div>
  );
}
