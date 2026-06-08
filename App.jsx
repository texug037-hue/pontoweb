import { useState, useEffect, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, ReferenceLine } from "recharts";

// ══════════════════════════════════════════════════════
//  PONTOWEB — Sistema de Controle de Ponto
//  CLT: Art.58, 59, 59-A, 73
//  Tolerância hora extra: < 15min = zero; ≥ 15min = cobra TUDO por minuto
// ══════════════════════════════════════════════════════
const TOLERANCIA = 15;
const SERVIDOR_URL = "/.netlify/functions/rhid";
const RHID_CID = "81212";
const USUARIOS_LOCAL=[
  {email:"t.e.x.u.g.o@hotmail.com",senha:"280614",nome:"FABRICIO FERREIRA",empresa:"ILUMI INDUSTRIA E COMERCIO LTDA",cargo:"AUXILIAR ADMINISTRATIVO",modalidade:"12x36-noturno",perfil:"funcionario"},
  {email:"admin@empresa.com",senha:"admin",nome:"ADMINISTRADOR RH",empresa:"ILUMI INDUSTRIA E COMERCIO LTDA",cargo:"GESTOR DE RECURSOS HUMANOS",modalidade:"8h-diurno",perfil:"admin"},
];
const MODALIDADES = {
  "8h-diurno":     { label:"8h Diurno",      jornada:480, intervalo:60, ep:"07:42", sp:"18:00", noturno:false, legal:"Art. 58 CLT",   p1:"07:42 - 12:00", p2:"13:30 - 18:00" },
  "12x36":         { label:"12×36",           jornada:660, intervalo:60, ep:"07:00", sp:"19:00", noturno:false, legal:"Art. 59-A CLT", p1:"07:00 - 19:00", p2:"" },
  "12x36-noturno": { label:"12×36 Noturno",   jornada:660, intervalo:60, ep:"17:00", sp:"05:00", noturno:true,  legal:"Art. 59-A CLT", p1:"17:00 - 05:00", p2:"" },
  "8h-noturno":    { label:"8h Noturno",      jornada:420, intervalo:60, ep:"22:00", sp:"06:00", noturno:true,  legal:"Art. 73 CLT",   p1:"22:00 - 06:00", p2:"" },
  "parcial-30h":   { label:"Parcial 30h/sem", jornada:360, intervalo:15, ep:"07:42", sp:"13:42", noturno:false, legal:"Art. 58-A CLT", p1:"07:42 - 13:42", p2:"" },
  "6x1":           { label:"6×1 (7h20/dia)",  jornada:440, intervalo:60, ep:"07:42", sp:"16:02", noturno:false, legal:"Art. 58 CLT",   p1:"07:42 - 12:00", p2:"13:00 - 16:02" },
};

// ── Utilitários ──────────────────────────────────────────
function toMin(t){ if(!t) return null; const[h,m]=t.split(":").map(Number); return h*60+m; }
function toHHMM(min){ if(min==null||min<0) min=0; return `${String(Math.floor(min/60)).padStart(2,"0")}:${String(min%60).padStart(2,"0")}`; }
function rnd(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
const MESES_PT=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const DIAS_FULL=["Domingo","Segunda-Feira","Terça-Feira","Quarta-Feira","Quinta-Feira","Sexta-Feira","Sábado"];
const nomeDia=d=>DIAS_FULL[new Date(d+"T12:00:00").getDay()];
const fmtDDMM=d=>{ const[,m,dia]=d.split("-"); return`${dia}/${m}`; };
const fmtDataBR=d=>{ const[y,m,dia]=d.split("-"); return`${dia}/${m}/${y}`; };
const fmtDataLonga=d=>new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
const hoje=()=>new Date().toISOString().slice(0,10);
const addDias=(d,n)=>{ const dt=new Date(d+"T12:00:00"); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10); };
const diasEntreDatas=(ini,fim)=>{ const a=new Date(ini+"T12:00:00"),b=new Date(fim+"T12:00:00"); return Math.round((b-a)/86400000)+1; };
const diaSemana=d=>new Date(d+"T12:00:00").getDay();

function toMinN(t,ref){ if(!t) return null; const[h,m]=t.split(":").map(Number); let min=h*60+m; if(ref!=null&&min<ref) min+=1440; return min; }

function calcSaldo(e1,s1,e2,s2,sp,modalidade){
  if(!e1||!s2) return null;
  const m=MODALIDADES[modalidade]||MODALIDADES["8h-diurno"];
  const en=toMin(e1);
  const s1m=s1?toMinN(s1,en):null;
  const e2m=e2?toMinN(e2,en):null;
  const s2m=toMinN(s2,en);
  const spM=toMinN(sp||m.sp,en);
  const p1=s1m?s1m-en:0;
  const p2=(e2m&&s2m)?s2m-e2m:(!e2m&&s2m&&s1m)?s2m-s1m:0;
  const trab=p1+p2;
  const diffS=s2m-spM;
  const jR=(s1m&&e2m)?e2m-s1m:60;
  const jB=Math.max(0,60-jR);
  const eB=Math.max(0,toMinN(m.ep,null)-en);
  const tot=diffS+jB+eB;
  return{trab,extra:tot>=TOLERANCIA?tot:0,falta:tot<=-TOLERANCIA?Math.abs(tot):0};
}

// ── Geração de histórico 2 anos ──────────────────────────
function gerarHistorico(funcId, modalidade){
  const m=MODALIDADES[modalidade]; const dias=[]; let t12=0;
  for(let dt=new Date("2024-01-01"); dt<=new Date(); dt.setDate(dt.getDate()+1)){
    const ds=dt.toISOString().slice(0,10),wd=dt.getDay();
    if(wd===0){ dias.push({data:ds,folga:true,domingo:true}); continue; }
    if(wd===6&&modalidade!=="6x1"){ dias.push({data:ds,folga:true}); continue; }
    if(modalidade==="12x36"||modalidade==="12x36-noturno"){ t12++; if(t12%2===0){dias.push({data:ds,folga:true});continue;} }
    const ent=toMin(m.ep)+rnd(-4,6), iv=m.intervalo+rnd(-5,15);
    const c=rnd(1,10);
    const saidaMin=c<=5?toMin(m.sp)+rnd(1,14):c<=7?toMin(m.sp)+rnd(15,90):c===8?toMin(m.sp)+rnd(91,180):toMin(m.sp)-rnd(10,60);
    dias.push({ data:ds, e1:toHHMM(ent), s1:toHHMM(ent+iv-5), e2:toHHMM(ent+iv+5), s2:toHHMM(saidaMin), saidaPrev:m.sp, modalidade });
  }
  return dias;
}

const FUNCIONARIOS=[
  { id:1, nome:"FABRICIO FERREIRA", empresa:"ILUMI INDUSTRIA E COMERCIO LTDA", cargo:"AUXILIAR ADMINISTRATIVO", modalidade:"12x36-noturno", senha:"1234", perfil:"funcionario" },
  { id:6, nome:"ADMINISTRADOR RH", empresa:"ILUMI INDUSTRIA E COMERCIO LTDA", cargo:"GESTOR DE RECURSOS HUMANOS", modalidade:"8h-diurno", senha:"admin", perfil:"admin" },
];

const HIST={
  1:[
    {data:"2026-06-03",e1:"16:56",s1:"23:11",e2:"",s2:"",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-06-02",e1:"16:56",s1:"22:41",e2:"23:38",s2:"05:02",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-06-01",e1:"16:59",s1:"22:43",e2:"23:42",s2:"05:07",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-28",e1:"16:55",s1:"22:35",e2:"23:32",s2:"05:01",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-27",e1:"16:58",s1:"22:52",e2:"23:45",s2:"05:15",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-26",e1:"16:55",s1:"22:46",e2:"23:45",s2:"05:02",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-25",e1:"16:53",s1:"22:40",e2:"23:40",s2:"05:00",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-21",e1:"16:52",s1:"22:51",e2:"23:46",s2:"05:00",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-20",e1:"16:55",s1:"22:42",e2:"23:40",s2:"05:05",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-19",e1:"16:52",s1:"22:54",e2:"23:49",s2:"05:00",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-18",e1:"16:53",s1:"22:41",e2:"23:40",s2:"05:13",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-14",e1:"16:53",s1:"22:42",e2:"23:42",s2:"05:00",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-13",e1:"16:55",s1:"22:44",e2:"23:40",s2:"05:04",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-12",e1:"16:52",s1:"22:42",e2:"23:40",s2:"05:01",saidaPrev:"05:00",modalidade:"12x36-noturno"},
    {data:"2026-05-11",e1:"17:15",s1:"22:49",e2:"23:49",s2:"05:01",saidaPrev:"05:00",modalidade:"12x36-noturno"},
  ],
  6:[]
};

// ── Paleta corporativa ────────────────────────────────────
const A="#2E8B9A", A2="#236878";
const VE="#2E7D32", VM="#C62828", LA="#E65100";
const TX="#1A1A2E", TX2="#5A6070";
const BG="#F0F2F5", BR="#FFFFFF", BD="#DDE1E7";
const SD="0 1px 3px rgba(0,0,0,0.07),0 4px 12px rgba(0,0,0,0.04)";

// ── SVG Icons ─────────────────────────────────────────────
const IcoSino=({n=0})=>(
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    {n>0&&<><circle cx="18" cy="5" r="5" fill="#C62828" stroke="white" strokeWidth="1.5"/><text x="18" y="8.5" textAnchor="middle" fill="white" fontSize="6.5" fontWeight="bold">{n>9?"9+":n}</text></>}
  </svg>
);
const IcoMenu=()=>(
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const IcoCheck=({size=20,color=VE})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" fill={color+"14"}/>
    <polyline points="7,12.5 10.5,16 17,8.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);
const IcoAviso=({size=20,color=LA})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" fill={color+"14"}/>
    <line x1="12" y1="8" x2="12" y2="13" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="16.5" r="1.2" fill={color}/>
  </svg>
);
const IcoCal=({color=A})=>(
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2.5"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
  </svg>
);

// ── Componentes base ──────────────────────────────────────
const Card=({children,style})=>(
  <div style={{background:BR,borderRadius:12,padding:"16px",marginBottom:12,
    boxShadow:SD,border:"1px solid "+BD,...style}}>{children}</div>
);
const Sel=({label,value,onChange,options})=>(
  <div style={{border:"1px solid "+BD,borderRadius:8,padding:"10px 14px",background:BR,
    marginBottom:10,position:"relative",boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}}>
    {label&&<div style={{fontSize:11,color:A,fontWeight:600,marginBottom:3,letterSpacing:.3}}>{label}</div>}
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",border:"none",outline:"none",fontSize:14,color:TX,
        background:"transparent",fontFamily:"inherit",appearance:"none",paddingRight:20}}>
      {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
    <svg style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TX2} strokeWidth="2.5" strokeLinecap="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </div>
);
const Input=({label,value,onChange,type="text",disabled,placeholder})=>(
  <div style={{border:"1px solid "+BD,borderRadius:8,padding:"10px 14px",
    background:disabled?"#F7F8FA":BR,marginBottom:10,
    boxShadow:disabled?"none":"0 1px 2px rgba(0,0,0,0.03)"}}>
    {label&&<div style={{fontSize:11,color:A,fontWeight:600,marginBottom:3,letterSpacing:.3}}>{label}</div>}
    {disabled?<div style={{fontSize:14,color:"#9E9E9E"}}>{value||"—"}</div>
    :<input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder||""}
        style={{width:"100%",border:"none",outline:"none",fontSize:14,color:TX,
          background:"transparent",fontFamily:"inherit"}}/>}
  </div>
);
const StatusBadge=({status})=>{
  const cfg={"Aprovado":{c:VE},"Reprovado":{c:VM},"Aguardando Retorno":{c:LA}}[status]||{c:TX2};
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,color:cfg.c,fontSize:12,
      fontWeight:600,padding:"3px 10px",background:cfg.c+"12",borderRadius:20,
      border:"1px solid "+cfg.c+"28",whiteSpace:"nowrap"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:cfg.c,display:"inline-block",flexShrink:0}}/>
      {status}
    </span>
  );
};
const SecLabel=({children})=>(
  <div style={{fontSize:11,fontWeight:700,color:TX2,textTransform:"uppercase",
    letterSpacing:.8,marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${BD}`}}>
    {children}
  </div>
);
const MetricCard=({label,value,color,sub})=>(
  <div style={{background:BR,borderRadius:10,padding:"14px 10px",
    boxShadow:SD,border:"1px solid "+BD,borderTop:"3px solid "+color}}>
    <div style={{fontSize:9,color:TX2,fontWeight:700,textTransform:"uppercase",
      letterSpacing:.8,marginBottom:6}}>{label}</div>
    <div style={{fontSize:18,fontWeight:700,color,fontVariantNumeric:"tabular-nums",
      letterSpacing:-.3}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:TX2,marginTop:3}}>{sub}</div>}
  </div>
);

// ══════════════════════════════════════════════════════
//  CALENDÁRIO — estilo Material picker (igual foto Secullum)
// ══════════════════════════════════════════════════════
function BotaoPeriodo({dataIni,dataFim,onClick}){
  const label=dataIni===dataFim?fmtDataBR(dataIni):`${fmtDataBR(dataIni)}  –  ${fmtDataBR(dataFim)}`;
  return(
    <div onClick={onClick} style={{border:"1px solid "+BD,borderRadius:8,padding:"10px 14px",
      background:BR,cursor:"pointer",display:"flex",justifyContent:"space-between",
      alignItems:"center",marginBottom:10,boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}}>
      <div>
        <div style={{fontSize:11,color:A,fontWeight:600,marginBottom:2,letterSpacing:.3}}>Insira o Período</div>
        <div style={{fontSize:14,color:TX,fontWeight:500}}>{label}</div>
        {dataIni!==dataFim&&<div style={{fontSize:11,color:TX2,marginTop:1}}>{diasEntreDatas(dataIni,dataFim)} dias</div>}
      </div>
      <IcoCal/>
    </div>
  );
}

function ModalCalendario({dataIni,dataFim,onConfirmar,onCancelar}){
  const [tmpIni,setTmpIni]=useState(dataIni);
  const [tmpFim,setTmpFim]=useState(dataFim);
  const [fase,setFase]=useState("inicio");
  const [mesVis,setMesVis]=useState(()=>{ const[y,m]=dataIni.split("-"); return{y:+y,m:+m-1}; });

  const dMes=(y,m)=>new Date(y,m+1,0).getDate();
  const p1Dia=(y,m)=>new Date(y,m,1).getDay();
  const navM=dir=>setMesVis(p=>{ let m=p.m+dir,y=p.y; if(m>11){m=0;y++;}else if(m<0){m=11;y--;} return{y,m}; });

  const selDia=ds=>{
    if(fase==="inicio"){setTmpIni(ds);setTmpFim(ds);setFase("fim");}
    else{ if(ds<tmpIni){setTmpIni(ds);setTmpFim(ds);setFase("fim");}else setTmpFim(ds); }
  };

  const atalhos=[
    {l:"Hoje",fn:()=>{const h=hoje();setTmpIni(h);setTmpFim(h);setFase("fim");}},
    {l:"Ontem",fn:()=>{const d=addDias(hoje(),-1);setTmpIni(d);setTmpFim(d);setFase("fim");}},
    {l:"7 dias",fn:()=>{setTmpIni(addDias(hoje(),-6));setTmpFim(hoje());setFase("fim");}},
    {l:"15 dias",fn:()=>{setTmpIni(addDias(hoje(),-14));setTmpFim(hoje());setFase("fim");}},
    {l:"30 dias",fn:()=>{setTmpIni(addDias(hoje(),-29));setTmpFim(hoje());setFase("fim");}},
    {l:"Este mês",fn:()=>{const[y,m]=hoje().split("-");setTmpIni(`${y}-${m}-01`);setTmpFim(hoje());setFase("fim");}},
    {l:"Mês anterior",fn:()=>{const d=new Date();d.setDate(0);const f=d.toISOString().slice(0,10);d.setDate(1);setTmpIni(d.toISOString().slice(0,10));setTmpFim(f);setFase("fim");}},
    {l:"Este ano",fn:()=>{const y=hoje().slice(0,4);setTmpIni(`${y}-01-01`);setTmpFim(hoje());setFase("fim");}},
  ];

  const dtExib=new Date((fase==="inicio"?tmpIni:tmpFim)+"T12:00:00");
  const anoExib=dtExib.getFullYear();
  const diaExib=dtExib.toLocaleDateString("pt-BR",{weekday:"short",day:"numeric",month:"short"})
    .replace(/\./g,"").replace(/^\w/,c=>c.toUpperCase());

  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};},[]);

  const ABREV=["D","S","T","Q","Q","S","S"];

  return(
    <div style={{position:"fixed",inset:0,zIndex:9000,display:"flex",
      alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.45)"}}>
      <div style={{width:"92%",maxWidth:360,background:BR,borderRadius:6,
        boxShadow:"0 12px 48px rgba(0,0,0,0.22)",overflow:"hidden",
        maxHeight:"94vh",display:"flex",flexDirection:"column"}}>

        {/* Cabeçalho escuro com data grande */}
        <div style={{background:A,padding:"18px 20px 14px",flexShrink:0}}>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",fontWeight:400,marginBottom:6}}>
            {anoExib}
          </div>
          <div style={{fontSize:28,fontWeight:300,color:"#fff",letterSpacing:-.3,lineHeight:1.2}}>
            {diaExib}
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginTop:8,
            background:"rgba(255,255,255,0.12)",display:"inline-block",
            padding:"3px 10px",borderRadius:12}}>
            {fase==="inicio"?"Selecione o início":"Selecione o fim do período"}
          </div>
        </div>

        {/* Atalhos rápidos */}
        <div style={{padding:"8px 12px",borderBottom:`1px solid ${BD}`,
          display:"flex",flexWrap:"wrap",gap:5,flexShrink:0,background:"#FAFBFC"}}>
          {atalhos.map(a=>(
            <button key={a.l} onPointerDown={e=>{e.preventDefault();e.stopPropagation();a.fn();}}
              style={{padding:"4px 10px",borderRadius:20,border:"1px solid "+BD,
                background:BR,color:TX2,fontSize:11,fontWeight:500,cursor:"pointer",
                whiteSpace:"nowrap",fontFamily:"inherit"}}>
              {a.l}
            </button>
          ))}
        </div>

        {/* Navegação mês */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"10px 16px",flexShrink:0}}>
          <button onPointerDown={e=>{e.preventDefault();e.stopPropagation();navM(-1);}}
            style={{background:"none",border:"none",cursor:"pointer",color:TX2,
              fontSize:22,padding:"2px 6px",display:"flex",alignItems:"center"}}>‹</button>
          <span style={{fontWeight:500,fontSize:15,color:TX}}>
            {MESES_PT[mesVis.m].toLowerCase()} de {mesVis.y}
          </span>
          <button onPointerDown={e=>{e.preventDefault();e.stopPropagation();navM(1);}}
            style={{background:"none",border:"none",cursor:"pointer",color:TX2,
              fontSize:22,padding:"2px 6px",display:"flex",alignItems:"center",
              opacity:(mesVis.y===new Date().getFullYear()&&mesVis.m>=new Date().getMonth())?0.2:1}}>›</button>
        </div>

        {/* Grade */}
        <div style={{padding:"0 14px 6px",flex:1,overflowY:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:2}}>
            {ABREV.map((d,i)=>(
              <div key={i} style={{textAlign:"center",fontSize:12,fontWeight:500,
                color:TX2,padding:"4px 0"}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {Array(p1Dia(mesVis.y,mesVis.m)).fill(null).map((_,i)=><div key={"e"+i}/>)}
            {Array(dMes(mesVis.y,mesVis.m)).fill(null).map((_,i)=>{
              const ds=`${mesVis.y}-${String(mesVis.m+1).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`;
              const isIni=ds===tmpIni,isFim=ds===tmpFim;
              const inRange=ds>tmpIni&&ds<tmpFim;
              const isHoje=ds===hoje(),futuro=ds>hoje();
              return(
                <div key={ds}
                  onPointerDown={e=>{e.preventDefault();e.stopPropagation();if(!futuro)selDia(ds);}}
                  style={{display:"flex",alignItems:"center",justifyContent:"center",
                    height:40,userSelect:"none",WebkitUserSelect:"none",cursor:"pointer"}}>
                  <div style={{
                    width:36,height:36,borderRadius:"50%",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    background:isIni||isFim?A:inRange?A+"1A":"transparent",
                    color:isIni||isFim?"#fff":futuro?"#8A9099":isHoje?A:TX,
                    fontSize:14,fontWeight:isIni||isFim?600:400,
                    border:isHoje&&!isIni&&!isFim?`1.5px solid ${A}`:"none",
                    transition:"background .12s",
                  }}>
                    {i+1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Botões CANCELAR / OK */}
        <div style={{display:"flex",justifyContent:"flex-end",gap:4,
          padding:"8px 12px 14px",borderTop:"1px solid "+BD,flexShrink:0}}>
          <button onPointerDown={e=>{e.preventDefault();e.stopPropagation();onCancelar();}}
            style={{padding:"10px 18px",borderRadius:4,border:"none",background:"transparent",
              color:TX2,fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit",letterSpacing:.4}}>
            CANCELAR
          </button>
          <button onPointerDown={e=>{e.preventDefault();e.stopPropagation();onConfirmar(tmpIni,tmpFim);}}
            style={{padding:"10px 18px",borderRadius:4,border:"none",background:"transparent",
              color:A,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:.4}}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarioPeriodo({dataIni,dataFim,onAbrirCal}){
  return <BotaoPeriodo dataIni={dataIni} dataFim={dataFim} onClick={onAbrirCal}/>;
}

// ── Header corporativo ─────────────────────────────────────
function Header({titulo,onMenu,notifs,onBell,bellOpen,onCloseBell,onLer,onLerTodas,onNavNotif}){
  const naoLidas=notifs.filter(n=>!n.lida).length;
  return(
    <div style={{position:"sticky",top:0,zIndex:200}}>
      <div style={{background:A,display:"flex",alignItems:"center",
        justifyContent:"space-between",padding:"12px 16px",
        boxShadow:"0 2px 8px rgba(0,0,0,0.12)"}}>
        <button onClick={onMenu} style={{background:"transparent",border:"none",
          cursor:"pointer",padding:4,display:"flex",alignItems:"center"}}>
          <IcoMenu/>
        </button>
        <span style={{color:"#fff",fontWeight:600,fontSize:16,letterSpacing:.2}}>{titulo}</span>
        <button onClick={onBell} style={{background:"transparent",border:"none",
          cursor:"pointer",padding:4,display:"flex",alignItems:"center",position:"relative"}}>
          <IcoSino n={naoLidas}/>
        </button>
      </div>
      {bellOpen&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:300}}>
          <div style={{position:"fixed",inset:0,zIndex:299}} onClick={onCloseBell}/>
          <div style={{position:"absolute",left:8,right:8,top:4,background:BR,
            borderRadius:10,boxShadow:"0 4px 24px rgba(0,0,0,0.12)",zIndex:300,
            overflow:"hidden",border:"1px solid "+BD}}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${BD}`,
              display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F7F8FA"}}>
              <span style={{fontWeight:600,fontSize:14,color:TX}}>Notificações</span>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {naoLidas>0&&<span style={{fontSize:12,fontWeight:600,color:A,cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();onLerTodas();}}>Marcar todas lidas</span>}
                {naoLidas>0&&<span style={{background:VM,color:"#fff",fontSize:11,fontWeight:700,
                  padding:"1px 7px",borderRadius:10}}>{naoLidas}</span>}
              </div>
            </div>
            <div style={{maxHeight:360,overflowY:"auto"}}>
              {notifs.length===0&&(
                <div style={{padding:"28px",textAlign:"center",color:TX2,fontSize:13}}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={BD} strokeWidth="1.5" strokeLinecap="round">p="round" style={{marginBottom:8,display:"block",margin:"0 auto 8px"}}>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    <line x1="2" y1="2" x2="22" y2="22" stroke={BD} strokeWidth="1.5"/>
                  </svg>
                  Nenhuma notificação pendente
                </div>
              )}
              {notifs.map(n=>(
                <div key={n.id}
                  onClick={()=>{onLer(n.id);if(n.tela)onNavNotif(n.tela);onCloseBell();}}
                  style={{padding:"12px 16px",borderBottom:`1px solid ${BD}`,
                    display:"flex",gap:0,alignItems:"stretch",cursor:"pointer",
                    background:n.lida?"#FAFAFA":n.urgente?"#FFF8F0":BR}}>
                  {!n.lida&&<div style={{width:3,borderRadius:2,background:n.urgente?LA:A,flexShrink:0,marginRight:12}}/>}
                  {n.lida&&<div style={{width:3,marginRight:12,flexShrink:0}}/>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:n.lida?400:600,fontSize:13,color:TX,
                      lineHeight:1.4,marginBottom:3}}>{n.titulo}</div>
                    <div style={{fontSize:12,color:TX2,lineHeight:1.4}}>{n.texto}</div>
                    <div style={{fontSize:11,color:"#AAAAAA",marginTop:4}}>{n.tempo}</div>
                    {n.acao&&!n.lida&&<span style={{fontSize:12,fontWeight:600,color:A,
                      display:"inline-block",marginTop:5}}>{n.acao} →</span>}
                  </div>
                  {!n.lida&&<div style={{width:8,height:8,borderRadius:"50%",background:A,
                    flexShrink:0,alignSelf:"center",marginLeft:8}}/>}
                </div>
              ))}
            </div>
            <div style={{padding:"9px",textAlign:"center",borderTop:"1px solid "+BD,background:"#FAFAFA"}}>
              <span onClick={onCloseBell} style={{fontSize:12,color:TX2,cursor:"pointer",fontWeight:500}}>Fechar</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
//  APP
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  TELA DE LOGIN
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  SERVIDOR INTERMEDIÁRIO RHiD
// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════
//  TELA DE LOGIN — com acesso direto ao RHiD
// ══════════════════════════════════════════════════════
function TelaLogin({onLogin}){
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [mostrarSenha,setMostrarSenha]=useState(false);
  const [carregando,setCarregando]=useState(false);
  const [erro,setErro]=useState("");
  const [agora,setAgora]=useState(new Date());
  const [modoLogin,setModoLogin]=useState("rhid");

  useEffect(()=>{const t=setInterval(()=>setAgora(new Date()),1000);return()=>clearInterval(t);},[]);

  const handleLogin=async()=>{
    if(!email||!senha){setErro("Preencha e-mail e senha.");return;}
    setCarregando(true); setErro("");
    // 1. Login local sempre funciona
    const uL=USUARIOS_LOCAL.find(u=>u.email===email&&u.senha===senha);
    if(uL){
      try{localStorage.setItem("pw_email",email);}catch{}
      onLogin({id:uL.perfil==="admin"?6:1,nome:uL.nome,email,empresa:uL.empresa,cargo:uL.cargo,modalidade:uL.modalidade,perfil:uL.perfil});
      return;
    }
    // 2. Login via RHiD
    if(modoLogin==="rhid"){
      try{
        const res=await fetch(`${SERVIDOR_URL}/login.svc`,{
          method:"POST",
          headers:{"Content-Type":"application/json","X-Cid-Rhid":RHID_CID},
          body:JSON.stringify({login:email,senha})
        });
        const data=await res.json();
        const token=data.accessToken||data.token||data.access_token;
        if(!res.ok||!token){setErro("E-mail ou senha do RHiD incorretos.");setCarregando(false);return;}
        try{localStorage.setItem("pw_email",email);}catch{}
        onLogin({id:1,nome:data.nome||email,email,empresa:"ILUMI INDUSTRIA E COMERCIO LTDA",cargo:"AUXILIAR ADMINISTRATIVO",modalidade:"12x36-noturno",perfil:"funcionario",rhidToken:token});
      }catch(e){
        setErro("Erro ao conectar. Verifique sua internet.");
        setCarregando(false);
      }
      return;
    }
    setErro("E-mail ou senha incorretos.");
    setCarregando(false);
  };

  const hora=agora.toTimeString().slice(0,8);
  const dataStr=agora.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1A3A4A 0%,#2E8B9A 60%,#1A5A6A 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 16px",
      fontFamily:"Roboto,'Segoe UI',sans-serif"}}>

      {/* Logo e relógio */}
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:16}}>
          <div style={{width:52,height:52,background:"rgba(255,255,255,0.15)",borderRadius:14,
            display:"flex",alignItems:"center",justifyContent:"center",
            border:"1.5px solid rgba(255,255,255,0.25)"}}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div style={{textAlign:"left"}}>
            <div style={{color:"#fff",fontWeight:800,fontSize:22,letterSpacing:.5,lineHeight:1}}>PontoWeb</div>
            <div style={{color:"rgba(255,255,255,0.6)",fontSize:11,letterSpacing:1.5,textTransform:"uppercase"}}>Central do Funcionário</div>
          </div>
        </div>
        <div style={{color:"rgba(255,255,255,0.9)",fontSize:38,fontWeight:300,letterSpacing:2,
          fontVariantNumeric:"tabular-nums",lineHeight:1}}>{hora}</div>
        <div style={{color:"rgba(255,255,255,0.55)",fontSize:12,marginTop:6,textTransform:"capitalize"}}>{dataStr}</div>
      </div>

      {/* Card */}
      <div style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:16,
        boxShadow:"0 20px 60px rgba(0,0,0,0.25)",overflow:"hidden"}}>

        {/* Cabeçalho */}
        <div style={{background:"#2E8B9A",padding:"20px 24px 16px"}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:17}}>Acesso ao Sistema</div>
          <div style={{color:"rgba(255,255,255,0.7)",fontSize:12,marginTop:3}}>
            {modoLogin==="rhid"?"Entre com seu e-mail e senha do RHiD":"Acesso administrativo"}
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            {[{k:"rhid",l:"Acesso RHiD"},{k:"local",l:"Admin"}].map(t=>(
              <button key={t.k} onClick={()=>{setModoLogin(t.k);setErro("");}}
                style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",
                  fontFamily:"inherit",fontSize:12,fontWeight:600,
                  background:modoLogin===t.k?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.1)",
                  color:"#fff"}}>
                {t.l}
              </button>
            ))}
          </div>
        </div>

        {/* Formulário */}
        <div style={{padding:"24px"}}>
          {erro&&(
            <div style={{background:"#FFF0F0",border:"1px solid #FFCCCC",borderRadius:8,
              padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{fontSize:13,color:"#C62828",fontWeight:500}}>{erro}</span>
            </div>
          )}

          {/* Campo e-mail */}
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:"#5A6070",
              textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>E-mail</label>
            <div style={{border:"1.5px solid #DDE1E7",borderRadius:8,padding:"11px 14px",
              display:"flex",alignItems:"center",gap:10,background:"#F8F9FA"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA0AB" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input id="login-email" type="email" defaultValue={email}
                onBlur={e=>setEmail(e.target.value)}
                placeholder={modoLogin==="rhid"?"E-mail do RHiD":"admin@empresa.com"}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{flex:1,border:"none",outline:"none",fontSize:14,color:"#1A1A2E",
                  background:"transparent",fontFamily:"inherit"}}/>
            </div>
          </div>

          {/* Campo senha */}
          <div style={{marginBottom:20}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:"#5A6070",
              textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Senha</label>
            <div style={{border:"1.5px solid #DDE1E7",borderRadius:8,padding:"11px 14px",
              display:"flex",alignItems:"center",gap:10,background:"#F8F9FA"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA0AB" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input id="login-senha" type={mostrarSenha?"text":"password"} defaultValue={senha}
                onBlur={e=>setSenha(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{flex:1,border:"none",outline:"none",fontSize:14,color:"#1A1A2E",
                  background:"transparent",fontFamily:"inherit"}}/>
              <button onClick={()=>setMostrarSenha(p=>!p)}
                style={{background:"none",border:"none",cursor:"pointer",padding:0,color:"#9AA0AB"}}>
                {mostrarSenha
                  ?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  :<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {/* Botão entrar */}
          <button onClick={()=>{
              const emailVal=document.getElementById("login-email")?.value||email;
              const senhaVal=document.getElementById("login-senha")?.value||senha;
              setEmail(emailVal); setSenha(senhaVal);
              if(!emailVal||!senhaVal){setErro("Preencha e-mail e senha.");return;}
              setCarregando(true); setErro("");
              const uL=USUARIOS_LOCAL.find(u=>u.email===emailVal&&u.senha===senhaVal);
              if(uL){
                try{localStorage.setItem("pw_email",emailVal);}catch{}
                onLogin({id:uL.perfil==="admin"?6:1,nome:uL.nome,email:emailVal,empresa:uL.empresa,cargo:uL.cargo,modalidade:uL.modalidade,perfil:uL.perfil});
                return;
              }
              if(modoLogin==="rhid"){
                fetch(`${SERVIDOR_URL}/login.svc`,{
                  method:"POST",
                  headers:{"Content-Type":"application/json","X-Cid-Rhid":RHID_CID},
                  body:JSON.stringify({login:emailVal,senha:senhaVal})
                }).then(r=>r.json()).then(data=>{
                  const token=data.accessToken||data.token||data.access_token;
                  if(!token){setErro("E-mail ou senha do RHiD incorretos.");setCarregando(false);return;}
                  try{localStorage.setItem("pw_email",emailVal);}catch{}
                  onLogin({id:1,nome:data.nome||emailVal,email:emailVal,empresa:"ILUMI INDUSTRIA E COMERCIO LTDA",cargo:"AUXILIAR ADMINISTRATIVO",modalidade:"12x36-noturno",perfil:"funcionario",rhidToken:token});
                }).catch(()=>{setErro("Erro ao conectar. Verifique sua internet.");setCarregando(false);});
              } else {
                setErro("E-mail ou senha incorretos.");setCarregando(false);
              }
            }}
            disabled={carregando}
            style={{width:"100%",padding:"14px",borderRadius:8,border:"none",
              background:carregando?"#9AA0AB":"#2E8B9A",color:"#fff",fontWeight:700,
              fontSize:15,cursor:carregando?"not-allowed":"pointer",fontFamily:"inherit",
              display:"flex",alignItems:"center",justifyContent:"center",gap:10,
              boxShadow:"0 2px 8px rgba(46,139,154,0.35)",transition:"background .2s"}}>
            {carregando?(
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{animation:"spin 1s linear infinite",transformOrigin:"12px 12px"}}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Conectando ao RHiD...
              </>
            ):"Entrar"}
          </button>

          <div style={{textAlign:"center",marginTop:14}}>
            <span style={{fontSize:12,color:"#2E8B9A",cursor:"pointer",fontWeight:500}}>
              Esqueci minha senha
            </span>
          </div>
        </div>

        {/* Rodapé */}
        <div style={{background:"#F7F8FA",borderTop:"1px solid #DDE1E7",padding:"12px 24px"}}>
          <div style={{fontSize:11,color:"#9AA0AB",textAlign:"center",lineHeight:1.6}}>
            {modoLogin==="rhid"
              ?"Use o mesmo e-mail e senha que você usa em rhid.com.br"
              :"Acesso restrito ao administrador do sistema"
            }
          </div>
        </div>
      </div>

      <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,marginTop:24,textAlign:"center"}}>
        PontoWeb v1.0.0 · ILUMI INDUSTRIA E COMERCIO LTDA
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function App(){
  const [logado,setLogado]=useState(false);

  const [userLogado,setUserLogado]=useState(null);
  const [funcSel,setFuncSel]=useState(1);
  const [perfilAtivo,setPerfilAtivo]=useState("funcionario"); // "admin" | "funcionario"
  const [regs,setRegs]=useState(HIST);
  const [tela,setTela]=useState("cartao");
  const [menu,setMenu]=useState(false);
  const [agora,setAgora]=useState(new Date());
  const [toast,setToast]=useState(null);
  const [vista,setVista]=useState("completo");
  // Período selecionado — padrão: mês atual
  const iniMes="2026-05-01";
  const [periodoIni,setPeriodoIni]=useState(iniMes);
  const [periodoFim,setPeriodoFim]=useState(hoje());
  const [bellOpen,setBellOpen]=useState(false);
  const [arquivoSel,setArquivoSel]=useState(null);
  const [ajData,setAjData]=useState(hoje());
  const [ajHoras,setAjHoras]=useState({e1:"",s1:"",e2:"",s2:"",e3:"",s3:"",e4:"",s4:"",e5:"",s5:""});
  const [justForm,setJustForm]=useState({ausencia:"Dia Específico",data:hoje(),periodo:"Dia Inteiro",motivo:"-",obs:""});
  const [dados,setDados]=useState({end:"",bairro:"",cidade:"",estado:"",cep:"",tel:"",cel:"",email:"",rg:"",exp:"",ssp:"",cpf:"",pai:"",mae:"",nasc:"",nac:"Brasileira",nat:"",escol:"-"});
  const [senhaForm,setSenhaForm]=useState({atual:"",nova:"",conf:""});
  const [assSenha,setAssSenha]=useState("");
  const [assOk,setAssOk]=useState({});
  const [solStatus,setSolStatus]=useState("Todos");
  const [arqSel,setArqSel]=useState(null);       // arquivo selecionado para detalhes
  const [arqExib,setArqExib]=useState("Por período"); // filtro exibição arquivos
  const [arqTipo,setArqTipo]=useState("Todos");   // filtro tipo arquivo
  const [calAberto,setCalAberto]=useState(false);
  // ── RHiD Integração ──────────────────────────────────────────
  const [rhidCfg,setRhidCfg]=useState(()=>{
    try{ return JSON.parse(localStorage.getItem("rhid_cfg")||"null"); }catch{ return null; }
  });
  const [rhidConectado,setRhidConectado]=useState(false);
  const [rhidSincMens,setRhidSincMens]=useState("");
  const [rhidEmail,setRhidEmail]=useState("");
  const [rhidSenha,setRhidSenha]=useState("");
  const [rhidToken,setRhidToken]=useState(null);
  const [csvStatus,setCsvStatus]=useState(""); // mensagem de status do import CSV
  const [csvContagem,setCsvContagem]=useState(0); // quantos registros importados
  const [notifs,setNotifs]=useState([
    {id:1,ico:"✍️",titulo:"Cartão jun/2026 aguardando assinatura",texto:"Seu cartão de ponto de junho/2026 está pronto para assinatura eletrônica.",tempo:"Agora mesmo",lida:false,urgente:true,tela:"assinatura",acao:"Assinar agora"},
    {id:2,ico:"📄",titulo:"Holerite junho/2026 disponível",texto:"Recibo de pagamento jun/2026 liberado para visualização e download.",tempo:"Há 2 horas",lida:false,urgente:false,tela:"arquivos",acao:"Ver holerite"},
    {id:3,ico:"✍️",titulo:"Cartão mai/2026 aguardando assinatura",texto:"Cartão de ponto de maio/2026 ainda não foi assinado.",tempo:"Há 3 horas",lida:false,urgente:true,tela:"assinatura",acao:"Assinar agora"},
    {id:4,ico:"⚠️",titulo:"Ponto pendente — saída não registrada",texto:"Você ainda não registrou a saída de hoje. Registre antes do fim do expediente.",tempo:"Há 6 horas",lida:false,urgente:true,tela:"cartao",acao:"Bater ponto"},
    {id:5,ico:"✅",titulo:"Ajuste de ponto aprovado",texto:"Seu ajuste solicitado em 30/05/2026 foi analisado e aprovado pelo gestor.",tempo:"Há 8 horas",lida:false,urgente:false,tela:"cartao",acao:"Ver cartão"},
    {id:6,ico:"📝",titulo:"Ausência sem justificativa — 29/05",texto:"O dia 29/05/2026 consta como ausência sem justificativa registrada.",tempo:"Ontem",lida:false,urgente:false,tela:"justificar",acao:"Justificar"},
    {id:7,ico:"📄",titulo:"Holerite maio/2026 disponível",texto:"Recibo de pagamento mai/2026 liberado para visualização.",tempo:"2 dias atrás",lida:true,urgente:false,tela:"arquivos",acao:null},
    {id:8,ico:"📋",titulo:"Cartão abr/2026 assinado",texto:"Seu cartão de ponto de abril/2026 foi assinado eletronicamente com sucesso.",tempo:"5 dias atrás",lida:true,urgente:false,tela:"assinatura",acao:null},
    {id:9,ico:"📄",titulo:"Holerite abril/2026 disponível",texto:"Recibo de pagamento abr/2026 liberado para download.",tempo:"8 dias atrás",lida:true,urgente:false,tela:"arquivos",acao:null},
    {id:10,ico:"✅",titulo:"Cartão mar/2026 assinado",texto:"Cartão de março/2026 assinado. Processo concluído.",tempo:"35 dias atrás",lida:true,urgente:false,tela:"assinatura",acao:null},
    {id:11,ico:"🔑",titulo:"Acesso ao sistema",texto:"Novo acesso ao sistema detectado em 01/06/2026 às 07:38.",tempo:"3 dias atrás",lida:true,urgente:false,tela:null,acao:null},
  ]);

  useEffect(()=>{ const t=setInterval(()=>setAgora(new Date()),1000); return()=>clearInterval(t); },[]);

  // ── RHiD: polling a cada 30s para marcações em tempo real ──────
  useEffect(()=>{
    if(!rhidToken) return;
    const buscarMarcacoes=async()=>{
      try{
        setRhidSincMens("Sincronizando...");
        // Busca marcações do dia atual
        const dataHoje=hoje();
        const res=await fetch(
          `${SERVIDOR_URL}/marcacoes?token=${rhidToken}&inicio=${dataHoje}&fim=${dataHoje}`,
          { headers:{ "Authorization":`Bearer ${rhidToken}`, "Content-Type":"application/json" } }
        );
        if(!res.ok){ setRhidConectado(false); setRhidSincMens("Erro de conexão"); return; }
        const dados=await res.json();
        // Converte formato RHiD → formato do app
        if(dados && dados.length>0){
          const marcacoesPorDia={};
          dados.forEach(m=>{
            const d=m.data_hora?.slice(0,10)||dataHoje;
            if(!marcacoesPorDia[d]) marcacoesPorDia[d]={data:d,e1:"",s1:"",e2:"",s2:"",saidaPrev:"18:00",modalidade:"8h-diurno"};
            const hora=m.data_hora?.slice(11,16)||"";
            const reg=marcacoesPorDia[d];
            if(!reg.e1) reg.e1=hora;
            else if(!reg.s1) reg.s1=hora;
            else if(!reg.e2) reg.e2=hora;
            else reg.s2=hora;
          });
          const novosDias=Object.values(marcacoesPorDia);
          setRegs(prev=>{
            const arr=[...(prev[funcSel]||[])];
            novosDias.forEach(novo=>{
              const idx=arr.findIndex(d=>d.data===novo.data);
              if(idx===-1) arr.unshift(novo);
              else arr[idx]={...arr[idx],...novo};
            });
            return{...prev,[funcSel]:arr};
          });
          setRhidConectado(true);
          setRhidSincMens(`Última sync: ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`);
        } else {
          setRhidConectado(true);
          setRhidSincMens(`Sem marcações hoje · ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`);
        }
      }catch(e){ setRhidConectado(false); setRhidSincMens("Sem conexão com RHiD"); }
    };
    buscarMarcacoes();
    const interval=setInterval(buscarMarcacoes,30000);
    return()=>clearInterval(interval);
  },[rhidToken]);

  const loginRhid=async(email,senha)=>{
    try{
      setRhidSincMens("Conectando ao RHiD...");
      const res=await fetch(`${SERVIDOR_URL}/login.svc`,{
        method:"POST",
        headers:{"Content-Type":"application/json","X-Cid-Rhid":RHID_CID},
        body:JSON.stringify({login:email,senha})
      });
      if(!res.ok){ msg("E-mail ou senha incorretos. Verifique e tente novamente.","err"); setRhidSincMens(""); return; }
      const data=await res.json();
      const token=data.accessToken||data.token||data.access_token;
      if(!token){ msg("Erro ao conectar. Tente novamente.","err"); return; }
      setRhidToken(token);
      setRhidConectado(true);
      const cfg={email,token};
      setRhidCfg(cfg);
      try{ localStorage.setItem("rhid_cfg",JSON.stringify(cfg)); }catch{}
      msg("✅ Conectado ao RHiD! Sincronizando dados...");
      setRhidSincMens("Conectado");
    }catch(e){ msg("Erro ao conectar. Verifique sua internet.","err"); setRhidSincMens(""); }
  };

  const desconectarRhid=()=>{
    setRhidToken(null); setRhidConectado(false); setRhidCfg(null);
    setRhidSincMens(""); setRhidEmail(""); setRhidSenha("");
    try{ localStorage.removeItem("rhid_cfg"); }catch{}
    msg("Desconectado do RHiD.");
  };

  const func=FUNCIONARIOS.find(f=>f.id===funcSel)||FUNCIONARIOS[0];
  const mod=MODALIDADES[func.modalidade];
  const todosRegs=regs[funcSel]||[];
  const isAdmin=perfilAtivo==="admin";

  const setPeriodo=useCallback((ini,fim)=>{ setPeriodoIni(ini); setPeriodoFim(fim); },[]);

  // Dias no período filtrado
  const diasPeriodo=useMemo(()=>
    todosRegs.filter(d=>d.data>=periodoIni&&d.data<=periodoFim).sort((a,b)=>b.data.localeCompare(a.data))
  ,[todosRegs,periodoIni,periodoFim]);

  const calcSaldoDia=useCallback((dia)=>{
    if(!dia||dia.folga||!dia.s2) return null;
    return calcSaldo(dia.e1,dia.s1,dia.e2,dia.s2,dia.saidaPrev,func.modalidade);
  },[func.modalidade]);

  const tots=useMemo(()=>diasPeriodo.reduce((a,d)=>{
    const s=calcSaldoDia(d); if(!s) return a;
    return{extra:a.extra+s.extra,falta:a.falta+s.falta,trab:a.trab+s.trab};
  },{extra:0,falta:0,trab:0}),[diasPeriodo,calcSaldoDia]);
  const saldo=tots.extra-tots.falta;

  // Totais históricos
  const totsTotal=useMemo(()=>todosRegs.reduce((a,d)=>{
    const s=calcSaldoDia(d); if(!s) return a;
    return{extra:a.extra+s.extra,falta:a.falta+s.falta,trab:a.trab+s.trab};
  },{extra:0,falta:0,trab:0}),[todosRegs,calcSaldoDia]);

  // Dados gráfico — agrupados por dia ou por mês dependendo do período
  const qtdDias=diasEntreDatas(periodoIni,periodoFim);
  const chartData=useMemo(()=>{
    if(qtdDias<=35){
      // Por dia
      return diasPeriodo.filter(d=>!d.folga&&d.s2).map(d=>{
        const s=calcSaldoDia(d);
        return{name:fmtDDMM(d.data),extra:s?+(s.extra/60).toFixed(2):0,falta:s?+(s.falta/60).toFixed(2):0,data:d.data};
      }).reverse();
    } else {
      // Por mês — agrupa
      const mapa={};
      diasPeriodo.filter(d=>!d.folga&&d.s2).forEach(d=>{
        const mes=d.data.slice(0,7); if(!mapa[mes]) mapa[mes]={extra:0,falta:0};
        const s=calcSaldoDia(d); if(s){mapa[mes].extra+=s.extra;mapa[mes].falta+=s.falta;}
      });
      return Object.entries(mapa).sort(([a],[b])=>a.localeCompare(b)).map(([mes,v])=>{
        const[y,m]=mes.split("-");
        return{name:MESES_PT[+m-1].slice(0,3)+"/"+y.slice(2),extra:+(v.extra/60).toFixed(2),falta:+(v.falta/60).toFixed(2)};
      });
    }
  },[diasPeriodo,qtdDias,calcSaldoDia]);

  // Gráfico histórico anual fixo (não muda com período)
  const chartAnual=useMemo(()=>{
    const mapa={};
    todosRegs.filter(d=>!d.folga&&d.s2).forEach(d=>{
      const mes=d.data.slice(0,7); if(!mapa[mes]) mapa[mes]={extra:0,falta:0};
      const s=calcSaldoDia(d); if(s){mapa[mes].extra+=s.extra;mapa[mes].falta+=s.falta;}
    });
    return Object.entries(mapa).sort(([a],[b])=>a.localeCompare(b)).map(([mes,v])=>{
      const[y,m]=mes.split("-");
      return{name:MESES_PT[+m-1].slice(0,3)+"/"+y.slice(2),extra:+(v.extra/60).toFixed(2),falta:+(v.falta/60).toFixed(2)};
    });
  },[todosRegs,calcSaldoDia]);

  const linhaH=d=>{
    if(d.folga) return "FOLGA";
    return [d.e1,d.s1,d.e2,d.s2].map(h=>h||"--").join("  •  ");
  };

  const msg=(m,t="ok")=>{ setToast({m,t}); setTimeout(()=>setToast(null),3200); };

  const bater=()=>{
    const h=agora.toTimeString().slice(0,5),d=hoje();
    const idxAberto=todosRegs.findIndex(r=>r.e1&&!r.s2);
    if(idxAberto!==-1){
      const dia={...todosRegs[idxAberto]};
      if(!dia.s1)dia.s1=h;
      else if(!dia.e2)dia.e2=h;
      else if(!dia.s2)dia.s2=h;
      else{msg("Ponto do dia completo.","info");return;}
      const arr=[...(regs[funcSel]||[])];
      const ri=arr.findIndex(r=>r.data===todosRegs[idxAberto].data);
      if(ri!==-1)arr[ri]=dia;
      setRegs(p=>({...p,[funcSel]:arr}));
      msg("✅ Ponto registrado: "+h);
    } else {
      setRegs(p=>({...p,[funcSel]:[{data:d,e1:h,s1:"",e2:"",s2:"",saidaPrev:mod.sp,modalidade:func.modalidade},...(p[funcSel]||[])]}));
      msg("✅ Entrada registrada: "+h);
    }
  };

  const navTo=t=>{ setTela(t); setMenu(false); };

  // ═════════════════════════════════════════
  //  TELAS
  // ═════════════════════════════════════════
  const TelaCartao=()=>(
    <>
      <Card>
        <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:10}}>Filtrar</div>
        <CalendarioPeriodo dataIni={periodoIni} dataFim={periodoFim} onAbrirCal={()=>setCalAberto(true)}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
          {["Resumido","Completo"].map(v=>(
            <button key={v} onClick={()=>setVista(v.toLowerCase())} style={{padding:"11px",borderRadius:6,border:"none",background:vista===v.toLowerCase()?A:"#9E9E9E",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>{v}</button>
          ))}
        </div>
      </Card>
      {/* Totais */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <MetricCard label="Horas Trabalhadas" value={toHHMM(tots.trab)} color={A}/>
        <MetricCard label="Horas Extras" value={toHHMM(tots.extra)} color={VE}/>
        <MetricCard label="Horas Falta" value={toHHMM(tots.falta)} color={VM}/>
        <MetricCard label="Saldo" value={(saldo>=0?"+":"-")+toHHMM(Math.abs(saldo))} color={saldo>=0?VE:VM}/>
      </div>
      {diasPeriodo.length===0&&<Card><div style={{textAlign:"center",color:TX2,fontSize:13,padding:"16px 0"}}>Nenhum registro neste período.</div></Card>}
      {diasPeriodo.map((dia,idx)=>{
        const s=calcSaldoDia(dia);
        const saldoMin=s?(s.extra>0?s.extra:-s.falta):null;
        const saldoStr=saldoMin?`${saldoMin>0?"+":"-"}${toHHMM(Math.abs(saldoMin))}`:null;
        const aberto=!dia.folga&&!dia.s2,isDom=dia.domingo;
        const numBatidas=[dia.e1,dia.s1,dia.e2,dia.s2].filter(Boolean).length;
        const corBorda=dia.folga?"#DDE1E7":numBatidas===4?VE:numBatidas===0?"#FF4444":"#FFA500";
        const corFundo=dia.folga?BR:numBatidas===4?"#F0F7F2":numBatidas===0?"#FFF0F0":"#FFF8F0";
        return(
          <div key={idx} style={{background:corFundo,borderRadius:10,padding:"12px 14px",marginBottom:7,borderLeft:`3px solid ${corBorda}`,boxShadow:"0 1px 3px rgba(0,0,0,0.07)",display:"flex",alignItems:"flex-start",gap:10,cursor:dia.folga?"default":"pointer"}}
            onClick={()=>{ if(!dia.folga&&isAdmin){ setAjData(dia.data);setAjHoras({e1:dia.e1||"",s1:dia.s1||"",e2:dia.e2||"",s2:dia.s2||"",e3:"",s3:"",e4:"",s4:"",e5:"",s5:""});setTela("ajustar"); } else if(!dia.folga&&!isAdmin){ msg("Apenas o administrador pode editar registros.","info"); } }}>
            <div style={{flexShrink:0,marginTop:2,display:"flex",alignItems:"center"}}>{aberto?<IcoAviso size={22}/>:<IcoCheck size={22}/>}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,color:isDom?VM:aberto?LA:TX}}>{nomeDia(dia.data)}, {fmtDDMM(dia.data)}</div>
              {vista==="completo"&&<div style={{fontSize:12,color:aberto?LA:TX2,marginTop:3,lineHeight:1.5}}>{linhaH(dia)}</div>}
            </div>
            {saldoStr&&<div style={{flexShrink:0,fontWeight:700,fontSize:13,color:saldoMin>0?VE:VM,fontVariantNumeric:"tabular-nums",marginTop:2}}>{saldoStr}</div>}
          </div>
        );
      })}
      <button onClick={()=>setTela("assinatura")} style={{width:"100%",padding:"13px",borderRadius:8,border:"2px solid "+(assOk[funcSel+"-"+periodoIni]?VE:A),background:assOk[funcSel+"-"+periodoIni]?"#F0F7F0":A,color:assOk[funcSel+"-"+periodoIni]?VE:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",marginTop:4,marginBottom:4}}>
        {assOk[funcSel+"-"+periodoIni]?"✅ Cartão Assinado Eletronicamente":"✍️ Assinar Cartão de Ponto Eletronicamente"}
      </button>
    </>
  );

  const TelaIndicadores=()=>(
    <>
      <Card>
        <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:10}}>Filtrar</div>
        <CalendarioPeriodo dataIni={periodoIni} dataFim={periodoFim} onAbrirCal={()=>setCalAberto(true)}/>
        <div style={{fontSize:11,color:TX2,marginTop:-4}}>{qtdDias<=35?"Agrupado por dia":"Agrupado por mês"} · {diasPeriodo.filter(d=>!d.folga&&d.s2).length} dias trabalhados</div>
      </Card>
      {/* Cards resumo */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        <MetricCard label="Dias Trab." value={diasPeriodo.filter(d=>!d.folga&&d.s2).length} color={A}/>
        <MetricCard label="H. Extras" value={toHHMM(tots.extra)} color={VE}/>
        <MetricCard label="H. Faltas" value={toHHMM(tots.falta)} color={VM}/>
      </div>
      {/* Gráfico horas extras do período */}
      <Card>
        <div style={{fontWeight:700,fontSize:14,color:TX,marginBottom:4}}>📊 Horas Extras — Período Selecionado</div>
        <div style={{fontSize:11,color:TX2,marginBottom:10}}>{(tots.extra/60).toFixed(2)}h no período</div>
        {chartData.length===0?<div style={{textAlign:"center",padding:"20px",color:TX2,fontSize:13}}>Sem dados</div>:(
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} isAnimationActive={false} margin={{top:4,right:4,left:-20,bottom:0}}>
              <XAxis dataKey="name" tick={{fontSize:9}}/><YAxis tick={{fontSize:9}}/>
              <Tooltip formatter={v=>`${v}h`} isAnimationActive={false}/>
              <Bar dataKey="extra" fill={VE} radius={[3,3,0,0]} isAnimationActive={false}/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
      {/* Gráfico horas faltantes do período */}
      <Card>
        <div style={{fontWeight:700,fontSize:14,color:TX,marginBottom:4}}>📉 Horas Faltantes — Período Selecionado</div>
        {tots.falta===0
          ?<div style={{textAlign:"center",padding:"16px",color:VE,fontSize:13,fontWeight:700}}>🎉 Nenhuma falta neste período!</div>
          :<ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} isAnimationActive={false} margin={{top:4,right:4,left:-20,bottom:0}}>
              <XAxis dataKey="name" tick={{fontSize:9}}/><YAxis tick={{fontSize:9}}/>
              <Tooltip formatter={v=>`${v}h`} isAnimationActive={false}/>
              <Bar dataKey="falta" fill={VM} radius={[3,3,0,0]} isAnimationActive={false}/>
            </BarChart>
          </ResponsiveContainer>
        }
      </Card>
      {/* Gráfico histórico FIXO — sempre jan/2024 até hoje */}
      <Card>
        <div style={{fontWeight:700,fontSize:14,color:TX,marginBottom:2}}>📈 Histórico Completo — Jan/2024 até hoje</div>
        <div style={{fontSize:11,color:TX2,marginBottom:10}}>Gráfico fixo · não muda com o filtro</div>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={chartAnual} isAnimationActive={false} margin={{top:4,right:4,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" vertical={false}/>
            <XAxis dataKey="name" tick={{fontSize:8}} interval={1}/>
            <YAxis tick={{fontSize:9}}/>
            <Tooltip formatter={v=>`${v}h`} isAnimationActive={false}/>
            <ReferenceLine y={0} stroke="#CCC"/>
            <Line type="monotone" dataKey="extra" stroke={VE} strokeWidth={2} dot={{r:2,fill:VE}} isAnimationActive={false}/>
            <Line type="monotone" dataKey="falta" stroke={VM} strokeWidth={2} dot={{r:2,fill:VM}} isAnimationActive={false}/>
          </LineChart>
        </ResponsiveContainer>
        <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:6}}>
          <span style={{fontSize:11,color:VE,fontWeight:700}}>● H. Extras</span>
          <span style={{fontSize:11,color:VM,fontWeight:700}}>● H. Faltas</span>
        </div>
      </Card>
      {/* Card acumulado */}
      <Card style={{background:BR}}>
        <div style={{fontWeight:700,fontSize:13,color:A,marginBottom:8}}>📊 Acumulado Histórico Total</div>
        {[{l:"Total trabalhado",v:toHHMM(totsTotal.trab),c:A},{l:"Total extras",v:"+"+toHHMM(totsTotal.extra),c:VE},
          {l:"Total faltas",v:"-"+toHHMM(totsTotal.falta),c:VM},
          {l:"Saldo geral",v:(totsTotal.extra>=totsTotal.falta?"+":"-")+toHHMM(Math.abs(totsTotal.extra-totsTotal.falta)),c:totsTotal.extra>=totsTotal.falta?VE:VM,b:true}
        ].map((it,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<3?`1px solid ${BD}`:"none"}}>
            <span style={{fontSize:13,color:TX,fontWeight:it.b?700:400}}>{it.l}</span>
            <span style={{fontSize:14,fontWeight:800,color:it.c,fontVariantNumeric:"tabular-nums"}}>{it.v}</span>
          </div>
        ))}
      </Card>
    </>
  );

  const TelaAjustar=()=>{
    if(!isAdmin) return(
      <Card style={{textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:12}}>🔒</div>
        <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:8}}>Acesso Restrito</div>
        <div style={{fontSize:13,color:TX2,lineHeight:1.6}}>Apenas o <strong>Administrador</strong> pode ajustar registros de ponto.<br/>Em caso de necessidade, solicite ao seu gestor.</div>
        <button onClick={()=>setTela("solicitacoes")} style={{marginTop:16,padding:"11px 24px",borderRadius:8,border:"none",background:A,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>📄 Enviar Solicitação</button>
      </Card>
    );
    return(
      <Card>
        <div style={{fontSize:12,color:A,marginBottom:14,lineHeight:1.5}}>O ajuste de ponto deve ser utilizado caso o funcionário tenha tido algum problema para registrar o ponto.</div>
        <Input label="Data" value={ajData?fmtDataLonga(ajData):""} disabled/>
        {[["e1","Entrada 1"],["s1","Saída 1"],["e2","Entrada 2"],["s2","Saída 2"],["e3","Entrada 3"],["s3","Saída 3"],["e4","Entrada 4"],["s4","Saída 4"],["e5","Entrada 5"],["s5","Saída 5"]].map(([k,label])=>(
          <div key={k} style={{border:"1.5px solid "+BD,borderRadius:7,padding:"10px 14px",background:BR,marginBottom:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:A,fontWeight:600,marginBottom:3}}>{label}</div>
              <input type="time" value={ajHoras[k]||""} onChange={e=>setAjHoras(p=>({...p,[k]:e.target.value}))}
                style={{border:"none",outline:"none",fontSize:15,fontWeight:600,color:ajHoras[k]?TX:TX2,background:"transparent",fontFamily:"inherit",width:"100%"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              {ajHoras[k]&&<button onClick={()=>setAjHoras(p=>({...p,[k]:""}))} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:TX}}>✕</button>}
              <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:A}}>☰</button>
            </div>
          </div>
        ))}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
          <button onClick={()=>setTela("cartao")} style={{padding:"13px",borderRadius:6,border:"1px solid "+BD,background:BR,color:TX2,fontWeight:700,fontSize:14,cursor:"pointer"}}>Cancelar</button>
          <button onClick={()=>{const idx=todosRegs.findIndex(d=>d.data===ajData);const novo={data:ajData,...ajHoras,saidaPrev:mod.sp,modalidade:func.modalidade};if(idx===-1){setRegs(p=>({...p,[funcSel]:[novo,...(p[funcSel]||[])]}));}else{const arr=[...(regs[funcSel]||[])];arr[idx]={...arr[idx],...ajHoras};setRegs(p=>({...p,[funcSel]:arr}));}msg("Ajuste salvo.");setTela("cartao");}}
            style={{padding:"13px",borderRadius:6,border:"none",background:A,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>Enviar</button>
        </div>
      </Card>
    );
  };

  const TelaJustificar=()=>(
    <Card>
      <div style={{fontSize:12,color:A,marginBottom:14,lineHeight:1.5}}>A justificativa de ausência deve ser utilizada caso você fique ausente do trabalho por um dia ou período específico.</div>
      <Sel label="Ausência em" value={justForm.ausencia} onChange={v=>setJustForm(p=>({...p,ausencia:v}))} options={["Dia Específico","Período"]}/>
      <div style={{border:"1.5px solid "+BD,borderRadius:7,padding:"10px 14px",background:BR,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <div><div style={{fontSize:11,color:A,fontWeight:600,marginBottom:2}}>Data</div><div style={{fontSize:14,color:TX}}>{fmtDataLonga(justForm.data)}</div></div>
        <span style={{fontSize:20,color:A}}>📅</span>
      </div>
      <Sel label="Período da Ausência" value={justForm.periodo} onChange={v=>setJustForm(p=>({...p,periodo:v}))} options={["Dia Inteiro","Período 1","Período 2"]}/>
      <Sel label="Motivo" value={justForm.motivo} onChange={v=>setJustForm(p=>({...p,motivo:v}))} options={["-","Atestado Médico","Licença","Acidente","Outro"]}/>
      <div style={{border:"1.5px solid "+BD,borderRadius:7,padding:"10px 14px",background:BR,marginBottom:10}}>
        <div style={{fontSize:11,color:A,fontWeight:600,marginBottom:3}}>Observação</div>
        <textarea value={justForm.obs} onChange={e=>setJustForm(p=>({...p,obs:e.target.value}))} rows={3}
          style={{width:"100%",border:"none",outline:"none",fontSize:14,resize:"none",background:"transparent",fontFamily:"inherit",color:TX}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <button onClick={()=>setTela("cartao")} style={{padding:"13px",borderRadius:6,border:"1px solid "+BD,background:BR,color:TX2,fontWeight:700,fontSize:14,cursor:"pointer"}}>Cancelar</button>
        <button onClick={()=>{msg("Justificativa enviada!");setTela("cartao");}} style={{padding:"13px",borderRadius:6,border:"none",background:A,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>Enviar</button>
      </div>
    </Card>
  );

  const TODAS_SOLS=[
    {id:1, tipo:"Ajuste de Ponto",          data:"03/06/2026",status:"Aguardando Retorno",desc:"Entrada registrada errada — problema no relógio biométrico"},
    {id:2, tipo:"Justificativa de Ausência", data:"29/05/2026",status:"Aguardando Retorno",desc:"Falta — aguardando envio de atestado médico"},
    {id:3, tipo:"Ajuste de Ponto",          data:"30/05/2026",status:"Aprovado",           desc:"Saída não registrada — sistema offline no momento"},
    {id:4, tipo:"Assinatura Cartão",         data:"19/05/2026",status:"Aprovado",           desc:"Cartão mai/2026 assinado eletronicamente"},
    {id:5, tipo:"Ajuste de Ponto",          data:"15/04/2026",status:"Aprovado",           desc:"Saída antecipada autorizada pelo gestor"},
    {id:6, tipo:"Assinatura Cartão",         data:"19/04/2026",status:"Aprovado",           desc:"Cartão abr/2026 assinado eletronicamente"},
    {id:7, tipo:"Justificativa de Ausência", data:"10/03/2026",status:"Reprovado",          desc:"Ausência dia 10/03 — documentação insuficiente"},
    {id:8, tipo:"Assinatura Cartão",         data:"19/03/2026",status:"Aprovado",           desc:"Cartão mar/2026 assinado eletronicamente"},
    {id:9, tipo:"Ajuste de Ponto",          data:"20/02/2026",status:"Aprovado",           desc:"Esqueceu de registrar saída dia 20/02"},
    {id:10,tipo:"Assinatura Cartão",         data:"19/02/2026",status:"Aprovado",           desc:"Cartão fev/2026 assinado eletronicamente"},
    {id:11,tipo:"Assinatura Cartão",         data:"19/01/2026",status:"Aprovado",           desc:"Cartão jan/2026 assinado eletronicamente"},
    {id:12,tipo:"Justificativa de Ausência", data:"05/12/2025",status:"Aprovado",           desc:"Falta dia 05/12 — atestado médico aprovado"},
    {id:13,tipo:"Assinatura Cartão",         data:"19/12/2025",status:"Aprovado",           desc:"Cartão dez/2025 assinado eletronicamente"},
  ];

  const TelaSolicitacoes=()=>{
    const filtradas=TODAS_SOLS.filter(s=>solStatus==="Todos"||s.status===solStatus);
    const cont={"Todos":TODAS_SOLS.length,"Aguardando Retorno":TODAS_SOLS.filter(s=>s.status==="Aguardando Retorno").length,"Aprovado":TODAS_SOLS.filter(s=>s.status==="Aprovado").length,"Reprovado":TODAS_SOLS.filter(s=>s.status==="Reprovado").length};
    return(
      <>
        <Card>
          <div style={{fontSize:11,color:A,fontWeight:600,marginBottom:10,letterSpacing:.3}}>Filtrar por Status</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {[
              {s:"Todos",     cor:TX2},
              {s:"Aguardando Retorno", cor:LA},
              {s:"Aprovado",  cor:VE},
              {s:"Reprovado", cor:VM},
            ].map(({s,cor})=>{
              const ativo=solStatus===s;
              return(
                <button key={s} onClick={()=>setSolStatus(s)} style={{
                  padding:"10px 8px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",
                  border:"1.5px solid "+(ativo?cor:BD),
                  background:ativo?cor+"14":BR,
                  display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                }}>
                  <span style={{fontSize:20,fontWeight:800,color:ativo?cor:TX}}>{cont[s]}</span>
                  <span style={{fontSize:10,textAlign:"center",lineHeight:1.3,color:ativo?cor:TX2,fontWeight:ativo?700:400}}>{s}</span>
                </button>
              );
            })}
          </div>
          <CalendarioPeriodo dataIni={periodoIni} dataFim={periodoFim} onAbrirCal={()=>setCalAberto(true)}/>
        </Card>
        {filtradas.length===0&&(
          <Card><div style={{textAlign:"center",color:TX2,fontSize:13,padding:"20px 0"}}>
            Nenhuma solicitação com este status.
          </div></Card>
        )}
        {filtradas.map(s=>(
          <div key={s.id} style={{background:BR,borderRadius:10,padding:"14px 16px",
            marginBottom:8,boxShadow:SD,border:"1px solid "+BD,
            borderLeft:`3px solid ${{Aprovado:VE,Reprovado:VM,"Aguardando Retorno":LA}[s.status]||BD}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div style={{fontWeight:600,fontSize:14,color:TX,flex:1,paddingRight:8}}>{s.tipo}</div>
              <StatusBadge status={s.status}/>
            </div>
            <div style={{fontSize:13,color:TX2,marginBottom:4}}>{s.desc}</div>
            <div style={{fontSize:11,color:"#AAAAAA"}}>Data: {s.data}</div>
          </div>
        ))}
      </>
    );
  };

  const TelaAssinatura=()=>{
    const assKey=`${funcSel}-${periodoIni}`;
    const jaAssinado=assOk[assKey];
    const diasComPonto=diasPeriodo.filter(d=>!d.folga&&d.s2);
    return(<>
      <Card>
        <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:6}}>Resumo do Cartão de Ponto</div>
        <div style={{fontSize:12,color:TX2,marginBottom:10}}>Confira os dados antes de assinar</div>
        <CalendarioPeriodo dataIni={periodoIni} dataFim={periodoFim} onAbrirCal={()=>setCalAberto(true)}/>
        <div style={{background:"#F8F9FA",borderRadius:8,padding:"12px",marginTop:4}}>
          <div style={{fontWeight:700,color:TX,fontSize:13,marginBottom:2}}>{func.nome}</div>
          <div style={{fontSize:12,color:A,marginBottom:1}}>{func.empresa}</div>
          <div style={{fontSize:12,color:TX2}}>{func.cargo} · {mod.label}</div>
          <div style={{fontSize:11,color:TX2,marginTop:2}}>Período: {fmtDataBR(periodoIni)} → {fmtDataBR(periodoFim)} ({diasEntreDatas(periodoIni,periodoFim)} dias)</div>
        </div>
      </Card>
      <Card>
        <div style={{fontSize:11,fontWeight:700,color:TX2,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Espelho ({diasComPonto.length} dias trabalhados)</div>
        {diasComPonto.length===0&&<div style={{color:TX2,fontSize:13,textAlign:"center",padding:"12px 0"}}>Nenhum registro neste período.</div>}
        <div style={{maxHeight:240,overflowY:"auto"}}>
          {diasComPonto.map((dia,i)=>{
            const s=calcSaldoDia(dia),extra=s&&s.extra>0,falta=s&&s.falta>0;
            return(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${BD}`,fontSize:12}}>
                <div><span style={{fontWeight:600,color:TX}}>{nomeDia(dia.data).slice(0,3)}, {fmtDDMM(dia.data)}</span>
                  <span style={{color:TX2,marginLeft:8}}>{dia.e1||"--"}–{dia.s2||"--"}</span></div>
                <span style={{fontWeight:700,color:extra?VE:falta?VM:TX2,fontVariantNumeric:"tabular-nums"}}>
                  {s?(extra?`+${toHHMM(s.extra)}`:falta?`-${toHHMM(s.falta)}`:"OK"):"—"}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{marginTop:10,padding:"10px",background:A+"15",borderRadius:8}}>
          {[{l:"Total trabalhado",v:toHHMM(tots.trab),c:A},{l:"Total extra",v:"+"+toHHMM(tots.extra),c:VE},
            {l:"Total falta",v:"-"+toHHMM(tots.falta),c:VM},{l:"Saldo",v:(saldo>=0?"+":"-")+toHHMM(Math.abs(saldo)),c:saldo>=0?VE:VM,b:true}
          ].map((it,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,color:TX,fontWeight:it.b?700:400}}>{it.l}</span>
              <span style={{fontSize:13,fontWeight:800,color:it.c}}>{it.v}</span>
            </div>
          ))}
        </div>
      </Card>
      {!jaAssinado
        ?<Card>
          <div style={{fontWeight:700,fontSize:14,color:TX,marginBottom:4}}>✍️ Assinar Eletronicamente</div>
          <div style={{fontSize:12,color:TX2,marginBottom:12,lineHeight:1.5}}>Ao assinar, você declara que conferiu e concorda com todos os dados do cartão de ponto acima.</div>
          <div style={{border:"1.5px solid "+BD,borderRadius:7,padding:"10px 14px",background:BR,marginBottom:10}}>
            <div style={{fontSize:11,color:A,fontWeight:600,marginBottom:3}}>Sua Senha</div>
            <input type="password" value={assSenha} onChange={e=>setAssSenha(e.target.value)} placeholder="Digite sua senha"
              style={{width:"100%",border:"none",outline:"none",fontSize:14,color:TX,background:"transparent",fontFamily:"inherit"}}/>
          </div>
          <div style={{fontSize:11,color:TX2,marginBottom:12,padding:"8px 10px",background:"#FEF6F0",borderRadius:6}}>💡 Senha padrão demo: <strong>1234</strong></div>
          <button onClick={()=>{
            if(!assSenha){msg("Digite sua senha.","err");return;}
            if(assSenha!==func.senha){msg("Senha incorreta.","err");return;}
            setAssOk(p=>({...p,[assKey]:true}));setAssSenha("");
            msg("✅ Cartão assinado eletronicamente!");
            setNotifs(p=>[{id:Date.now(),ico:"✅",titulo:"Cartão assinado!",texto:`Cartão ${fmtDataBR(periodoIni)}–${fmtDataBR(periodoFim)} assinado em ${new Date().toLocaleString("pt-BR")}.`,tempo:"Agora mesmo",lida:false,urgente:false,tela:"assinatura",acao:null},...p]);
          }} style={{width:"100%",padding:"14px",borderRadius:8,border:"none",background:A,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer"}}>
            ✅ Confirmar Assinatura
          </button>
        </Card>
        :<Card style={{textAlign:"center",background:"#F0F7F0",border:"1.5px solid "+VE}}>
          <div style={{fontSize:36,marginBottom:8}}>✅</div>
          <div style={{fontWeight:800,fontSize:16,color:VE,marginBottom:4}}>Cartão Assinado!</div>
          <div style={{fontSize:12,color:TX2}}>Assinado por <strong>{func.nome}</strong></div>
          <div style={{fontSize:12,color:TX2,marginTop:2}}>Período: {fmtDataBR(periodoIni)} – {fmtDataBR(periodoFim)}</div>
          <div style={{fontSize:11,color:"#BDBDBD",marginTop:6}}>Hash: #{Math.random().toString(36).slice(2,10).toUpperCase()}</div>
        </Card>
      }
    </>);
  };

  // Holerites gerados fora do componente para não re-calcular
  const todosHolerites=useMemo(()=>{
    const arqs=[]; let d=new Date("2024-01-01"); const fim=new Date();
    const now=new Date();
    while(d<=fim){
      const y=d.getFullYear(),m=d.getMonth()+1;
      const passado=y<now.getFullYear()||(y===now.getFullYear()&&m<now.getMonth()+1);
      const tipos=[
        {tipo:"Recibo de Pagamento de Salário",  desc:`Holerite ${MESES_PT[m-1]}/${y}`,          status:passado?"Aprovado":"Aguardando Retorno"},
        ...(m===12?[{tipo:"Informe de Rendimentos",desc:`Informe de Rendimentos ${y}`,              status:passado?"Aprovado":"Aguardando Retorno"}]:[]),
        ...(m%3===0&&passado?[{tipo:"Demonstrativo de FGTS",desc:`FGTS ${MESES_PT[m-1]}/${y}`,    status:"Aprovado"}]:[]),
        ...(m===7&&passado?[{tipo:"Férias — Aviso Prévio",desc:`Aviso Férias ${y}`,                status:"Aprovado"}]:[]),
        ...(m%2===0?[{tipo:"Assinatura Cartão de Ponto",desc:`Cartão ${MESES_PT[m-1]}/${y}`,       status:passado?"Aprovado":"Aguardando Retorno"}]:[]),
      ];
      tipos.forEach((t,ti)=>{
        arqs.push({
          id:`${funcSel}-${y}-${m}-${ti}`,
          nome:`${func.nome.split(" ").slice(0,2).join("_")}_${t.tipo.replace(/[^A-Za-z0-9]/g,"_").slice(0,18)}_${String(m).padStart(2,"0")}_${y}.pdf`,
          tipo:t.tipo,data:`15/${String(m).padStart(2,"0")}/${y}`,
          mes:`${y}-${String(m).padStart(2,"0")}`,desc:t.desc,status:t.status,
        });
      });
      d.setMonth(d.getMonth()+1);
    }
    return arqs.reverse();
  },[funcSel]);

  const TelaArquivos=()=>{
    // Usa arqSel/setArqSel do App level — sem useState local que causa re-render
    const tiposDisponiveis=["Todos",...new Set(todosHolerites.map(h=>h.tipo))];
    const filtrados=todosHolerites.filter(h=>arqTipo==="Todos"||h.tipo===arqTipo);

    if(arqSel){
      const arq=arqSel;
      const corStatus={Aprovado:VE,Reprovado:VM,"Aguardando Retorno":LA}[arq.status]||TX2;
      return(
        <>
          <Card>
            <div style={{fontWeight:600,fontSize:15,color:TX,textAlign:"center",wordBreak:"break-all"}}>{arq.nome}</div>
          </Card>
          <Card>
            <div style={{fontWeight:600,fontSize:15,color:TX,marginBottom:14}}>Informações</div>
            {[{l:"Tipo do Arquivo",v:arq.tipo},{l:"Data do Arquivo",v:arq.data},{l:"Descrição",v:arq.desc}].map((it,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                padding:"11px 0",borderBottom:`1px solid ${BD}`}}>
                <span style={{fontSize:13,color:TX2,flexShrink:0,marginRight:12}}>{it.l}</span>
                <span style={{fontSize:13,color:TX,fontWeight:500,textAlign:"right"}}>{it.v}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0"}}>
              <span style={{fontSize:13,color:TX2}}>Status</span>
              <StatusBadge status={arq.status}/>
            </div>
          </Card>
          <Card style={{textAlign:"center",padding:"12px"}}>
            <div style={{fontSize:12,color:TX2}}>· Carregando coordenadas...</div>
          </Card>
          <Card>
            <div style={{fontWeight:600,fontSize:15,color:TX,marginBottom:12}}>Visualização</div>
            <div style={{background:"#F7F8FA",borderRadius:8,padding:8,marginBottom:8,position:"relative"}}>
              <svg width="100%" viewBox="0 0 320 200" style={{background:"#fff",borderRadius:4,border:"1px solid "+BD}}>
                <rect x="0" y="0" width="320" height="200" fill="#fff"/>
                <rect x="0" y="0" width="320" height="28" fill="#2E8B9A"/>
                <text x="160" y="18" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600">Recibo de Pagamento do Salário</text>
                <text x="8" y="40" fill="#444" fontSize="7">{func.empresa.slice(0,52)}</text>
                <rect x="0" y="56" width="320" height="1" fill="#DDD"/>
                <text x="8" y="67" fill="#888" fontSize="6">Nome do Funcionário</text>
                <text x="8" y="76" fill="#111" fontSize="7" fontWeight="600">{func.nome.slice(0,32)}</text>
                <rect x="0" y="80" width="320" height="1" fill="#DDD"/>
                <text x="8" y="92" fill="#444" fontSize="6">0100   SALÁRIO BASE</text>
                <text x="230" y="92" fill="#444" fontSize="6">40h   2.397,00</text>
                <text x="8" y="104" fill="#444" fontSize="6">1200   HORAS EXTRAS 50%</text>
                <text x="230" y="104" fill="#444" fontSize="6">08h      195,85</text>
                <rect x="0" y="118" width="320" height="1" fill="#DDD"/>
                <text x="180" y="128" fill="#444" fontSize="6">Total Vencimentos:   2.592,85</text>
                <text x="180" y="136" fill="#444" fontSize="6">Total Descontos:       247,32</text>
                <rect x="0" y="142" width="320" height="1" fill="#2E8B9A"/>
                <text x="160" y="152" textAnchor="middle" fill="#2E8B9A" fontSize="9" fontWeight="600">LÍQUIDO A RECEBER: R$ 2.345,53</text>
                <rect x="0" y="178" width="320" height="1" fill="#DDD"/>
                <text x="8" y="190" fill="#888" fontSize="6">DECLARO TER RECEBIDO A IMPORTÂNCIA DISCRIMINADA NESTE RECIBO</text>
                <text x="190" y="197" fill="#888" fontSize="6">______________________</text>
              </svg>
              <button onClick={()=>msg("Compartilhando arquivo...")} style={{position:"absolute",top:12,right:12,
                width:32,height:32,borderRadius:6,border:"1px solid "+BD,background:BR,
                cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>↪</button>
            </div>
          </Card>
          <Card>
            <button onClick={()=>msg("Download iniciado!")} style={{width:"100%",background:"transparent",
              border:"none",color:A,fontWeight:600,fontSize:15,cursor:"pointer",
              textAlign:"left",padding:"4px 0",fontFamily:"inherit"}}>
              ↓  Download do Arquivo
            </button>
          </Card>
          <button onClick={()=>setArqSel(null)} style={{width:"100%",padding:"12px",borderRadius:8,
            border:"1px solid "+BD,background:BR,color:TX2,fontWeight:600,fontSize:14,
            cursor:"pointer",marginBottom:16,fontFamily:"inherit"}}>
            ← Voltar para Arquivos
          </button>
        </>
      );
    }

    return(
      <>
        <Card>
          {/* Filtro por tipo — botões, não dropdown */}
          <div style={{fontSize:11,color:A,fontWeight:600,marginBottom:8,letterSpacing:.3}}>Tipo de Documento</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
            {["Todos","Recibo de Pagamento de Salário","Informe de Rendimentos","Demonstrativo de FGTS","Férias — Aviso Prévio","Assinatura Cartão de Ponto"].map(t=>{
              const ativo=arqTipo===t;
              const label=t==="Recibo de Pagamento de Salário"?"Holerite":t==="Assinatura Cartão de Ponto"?"Cartão Ponto":t;
              return(
                <button key={t} onClick={()=>setArqTipo(t)} style={{
                  padding:"5px 12px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
                  border:"1.5px solid "+(ativo?A:BD),fontSize:12,fontWeight:ativo?600:400,
                  background:ativo?A+"14":BR,color:ativo?A:TX2,
                }}>
                  {label}
                </button>
              );
            })}
          </div>
          <CalendarioPeriodo dataIni={periodoIni} dataFim={periodoFim} onAbrirCal={()=>setCalAberto(true)}/>
        </Card>
        <div style={{fontSize:11,color:TX2,marginBottom:8,paddingLeft:2}}>
          {filtrados.length} documento(s) encontrado(s)
        </div>
        {filtrados.slice(0,30).map((arq,i)=>{
          const corStatus={Aprovado:VE,Reprovado:VM,"Aguardando Retorno":LA}[arq.status]||TX2;
          return(
            <div key={arq.id} onClick={()=>setArqSel(arq)} style={{background:BR,borderRadius:10,
              padding:"12px 14px",marginBottom:8,boxShadow:SD,border:"1px solid "+BD,
              display:"flex",alignItems:"center",gap:12,cursor:"pointer",
              borderLeft:`3px solid ${corStatus}`}}>
              <svg width="28" height="32" viewBox="0 0 24 28" fill="none" style={{flexShrink:0}}>
                <path d="M4 2h11l5 5v19H4V2z" fill="#F0F4F7" stroke={BD} strokeWidth="1.5"/>
                <path d="M15 2v5h5" fill="none" stroke={BD} strokeWidth="1.5"/>
                <line x1="7" y1="11" x2="17" y2="11" stroke={TX2} strokeWidth="1" opacity=".5"/>
                <line x1="7" y1="14" x2="17" y2="14" stroke={TX2} strokeWidth="1" opacity=".5"/>
                <line x1="7" y1="17" x2="13" y2="17" stroke={TX2} strokeWidth="1" opacity=".5"/>
              </svg>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,color:TX,overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{arq.nome}</div>
                <div style={{fontSize:12,color:TX2,marginTop:2}}>{arq.tipo}</div>
                <div style={{fontSize:11,color:"#AAAAAA",marginTop:1}}>{arq.desc} · {arq.data}</div>
              </div>
              <StatusBadge status={arq.status}/>
            </div>
          );
        })}
        {filtrados.length>30&&<div style={{textAlign:"center",padding:"8px",color:TX2,fontSize:12}}>{filtrados.length-30} mais documentos...</div>}
      </>
    );
  };

  const TelaDados=()=>(
    <Card>
      {[["end","Endereço"],["bairro","Bairro"],["cidade","Cidade"],["estado","Estado"],["cep","CEP"],["tel","Telefone"],["cel","Celular"],["email","Email"],["rg","RG"],["exp","Expedição"],["ssp","SSP"],["cpf","CPF"],["pai","Pai"],["mae","Mãe"],["nasc","Nascimento"],["nac","Nacionalidade"],["nat","Naturalidade"]].map(([k,l])=>(
      <Input key={k} label={l} value={dados[k]} onChange={v=>setDados(p=>({...p,[k]:v}))} disabled={!isAdmin}/>
    ))}
    <Sel label="Escolaridade" value={dados.escol} onChange={v=>{if(isAdmin)setDados(p=>({...p,escol:v}));}} options={["-","Fundamental","Médio","Superior","Pós-Graduação"]}/>
    {!isAdmin&&<div style={{padding:"8px 10px",background:"#FEF6F0",borderRadius:6,fontSize:12,color:LA,marginBottom:10}}>🔒 Somente o Administrador pode editar os dados cadastrais.</div>}
    <div style={{textAlign:"center",padding:"8px 0 12px",color:TX2,fontSize:12,cursor:"pointer"}}>📷 Enviar uma foto.</div>
    {isAdmin&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <button onClick={()=>setTela("cartao")} style={{padding:"13px",borderRadius:6,border:"1px solid "+BD,background:BR,color:TX2,fontWeight:700,fontSize:14,cursor:"pointer"}}>Cancelar</button>
      <button onClick={()=>{msg("Dados salvos!");setTela("cartao");}} style={{padding:"13px",borderRadius:6,border:"none",background:A,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>Enviar</button>
    </div>}
  </Card>);

  const TelaSenha=()=>(
    <Card>
      {[["atual","Senha atual"],["nova","Nova senha"],["conf","Confirmar senha"]].map(([k,l])=>(
        <div key={k} style={{border:"1.5px solid "+BD,borderRadius:7,padding:"12px 14px",background:BR,marginBottom:10}}>
          <div style={{fontSize:11,color:A,fontWeight:600,marginBottom:4}}>{l}</div>
          <input type="password" value={senhaForm[k]} onChange={e=>setSenhaForm(p=>({...p,[k]:e.target.value}))}
            style={{width:"100%",border:"none",outline:"none",fontSize:14,color:TX,background:"transparent",fontFamily:"inherit"}}/>
        </div>
      ))}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <button onClick={()=>setTela("cartao")} style={{padding:"13px",borderRadius:6,border:"1px solid "+BD,background:BR,color:TX2,fontWeight:700,fontSize:14,cursor:"pointer"}}>Cancelar</button>
        <button onClick={()=>{
          if(senhaForm.atual!==func.senha){msg("Senha atual incorreta.","err");return;}
          if(senhaForm.nova!==senhaForm.conf){msg("Senhas não conferem.","err");return;}
          msg("Senha alterada com sucesso!");setSenhaForm({atual:"",nova:"",conf:""});setTela("cartao");
        }} style={{padding:"13px",borderRadius:6,border:"none",background:A,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>Salvar</button>
      </div>
    </Card>
  );

  // ── Tela de Integração RHiD ─────────────────────────────────────
  const TelaRhid=()=>(
    <>
      {/* Status atual */}
      <div style={{background:rhidConectado?"#F0F7F2":"#FFF8F0",borderRadius:12,padding:"16px",
        marginBottom:12,border:"1.5px solid "+(rhidConectado?VE:LA),
        boxShadow:SD,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:44,height:44,borderRadius:"50%",flexShrink:0,
          background:rhidConectado?VE:LA,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {rhidConectado
              ?<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
              :<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
            }
          </svg>
        </div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:rhidConectado?VE:LA}}>
            {rhidConectado?"RHiD Conectado":"RHiD Desconectado"}
          </div>
          <div style={{fontSize:12,color:TX2,marginTop:2}}>
            {rhidSincMens||"Configure seu acesso abaixo"}
          </div>
          {rhidCfg?.email&&<div style={{fontSize:11,color:TX2,marginTop:2}}>{rhidCfg.email}</div>}
        </div>
        {rhidConectado&&(
          <div style={{width:10,height:10,borderRadius:"50%",background:VE,
            boxShadow:`0 0 0 3px ${VE}33`,flexShrink:0}}/>
        )}
      </div>

      {/* Como funciona */}
      <div style={{background:BR,borderRadius:12,padding:"16px",marginBottom:12,
        border:"1px solid "+BD,boxShadow:SD}}>
        <div style={{fontWeight:600,fontSize:14,color:TX,marginBottom:12}}>
          Como funciona
        </div>
        {[
          {n:"1",t:"Você passa o dedo no relógio",d:"O RHiD registra a marcação no sistema deles"},
          {n:"2",t:"App busca automaticamente",d:"A cada 30 segundos o app consulta o RHiD"},
          {n:"3",t:"Aparece no seu Cartão Ponto",d:"Em até 30 segundos você vê a batida aqui"},
        ].map((s,i)=>(
          <div key={i} style={{display:"flex",gap:12,marginBottom:i<2?12:0}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:A,
              display:"flex",alignItems:"center",justifyContent:"center",
              color:"#fff",fontWeight:700,fontSize:13,flexShrink:0}}>{s.n}</div>
            <div>
              <div style={{fontWeight:600,fontSize:13,color:TX}}>{s.t}</div>
              <div style={{fontSize:12,color:TX2,marginTop:2}}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Formulário de login */}
      {!rhidConectado?(
        <div style={{background:BR,borderRadius:12,padding:"16px",
          border:"1px solid "+BD,boxShadow:SD}}>
          <div style={{fontWeight:600,fontSize:14,color:TX,marginBottom:4}}>
            Conectar ao RHiD
          </div>
          <div style={{fontSize:12,color:TX2,marginBottom:16,lineHeight:1.5}}>
            Use o mesmo e-mail e senha que você usa em{" "}
            <span style={{color:A,fontWeight:600}}>rhid.com.br</span>
          </div>
          <div style={{border:"1px solid "+BD,borderRadius:8,padding:"10px 14px",
            background:BR,marginBottom:10}}>
            <div style={{fontSize:11,color:A,fontWeight:600,marginBottom:3,letterSpacing:.3}}>
              E-mail
            </div>
            <input
              type="email"
              defaultValue={rhidEmail}
              id="rhid-email-input"
              onChange={e=>setRhidEmail(e.target.value)}
              placeholder="seu@email.com"
              style={{width:"100%",border:"none",outline:"none",fontSize:14,
                color:TX,background:"transparent",fontFamily:"inherit"}}
            />
          </div>
          <div style={{border:"1px solid "+BD,borderRadius:8,padding:"10px 14px",
            background:BR,marginBottom:16}}>
            <div style={{fontSize:11,color:A,fontWeight:600,marginBottom:3,letterSpacing:.3}}>
              Senha
            </div>
            <input
              type="password"
              defaultValue={rhidSenha}
              id="rhid-senha-input"
              onChange={e=>setRhidSenha(e.target.value)}
              placeholder="••••••••"
              style={{width:"100%",border:"none",outline:"none",fontSize:14,
                color:TX,background:"transparent",fontFamily:"inherit"}}
            />
          </div>
          <div style={{fontSize:11,color:TX2,background:"#F7F8FA",borderRadius:8,
            padding:"10px 12px",marginBottom:16,lineHeight:1.6}}>
            🔒 Suas credenciais ficam salvas apenas no seu dispositivo.
            Nunca são enviadas para servidores externos.
          </div>
          <button
            onClick={()=>{
              const emailVal=document.getElementById("rhid-email-input")?.value||rhidEmail;
              const senhaVal=document.getElementById("rhid-senha-input")?.value||rhidSenha;
              if(!emailVal||!senhaVal){msg("Preencha e-mail e senha.","err");return;}
              setRhidEmail(emailVal); setRhidSenha(senhaVal);
              loginRhid(emailVal,senhaVal);
            }}
            style={{width:"100%",padding:"14px",borderRadius:8,border:"none",
              background:A,color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",
              fontFamily:"inherit",boxShadow:`0 2px 8px ${A}44`}}>
            Conectar ao RHiD
          </button>
        </div>
      ):(
        <div style={{background:BR,borderRadius:12,padding:"16px",
          border:"1px solid "+BD,boxShadow:SD}}>
          <div style={{fontWeight:600,fontSize:14,color:TX,marginBottom:12}}>
            Conexão ativa
          </div>
          <div style={{fontSize:13,color:TX2,marginBottom:6}}>
            Conta: <strong style={{color:TX}}>{rhidCfg?.email}</strong>
          </div>
          <div style={{fontSize:13,color:TX2,marginBottom:16}}>
            Sincronização: <strong style={{color:VE}}>automática a cada 30 segundos</strong>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <button
              onClick={()=>{
                setRhidSincMens("Sincronizando agora...");
                msg("Sincronizando com o RHiD...");
              }}
              style={{padding:"12px",borderRadius:8,border:"1px solid "+A,
                background:"#F0F7FA",color:A,fontWeight:600,fontSize:13,
                cursor:"pointer",fontFamily:"inherit"}}>
              ↻ Sincronizar agora
            </button>
            <button
              onClick={desconectarRhid}
              style={{padding:"12px",borderRadius:8,border:"1px solid "+VM,
                background:"#FDF0F0",color:VM,fontWeight:600,fontSize:13,
                cursor:"pointer",fontFamily:"inherit"}}>
              Desconectar
            </button>
          </div>
        </div>
      )}

      {/* Aviso importante */}
      <div style={{background:"#FFFBF0",borderRadius:10,padding:"12px 14px",
        marginTop:4,border:"1px solid #F0D060"}}>
        <div style={{fontSize:12,color:"#7A6020",lineHeight:1.6}}>
          ⚡ <strong>Importante:</strong> Para que a integração automática funcione, você precisa ter
          permissão de acesso à API no seu cadastro do RHiD. Se não funcionar,
          use a importação por CSV abaixo.
        </div>
      </div>

      {/* Importar CSV do RHiD */}
      <div style={{background:BR,borderRadius:12,padding:"16px",marginTop:12,
        border:"1px solid "+BD,boxShadow:SD}}>
        <div style={{fontWeight:600,fontSize:15,color:TX,marginBottom:4}}>
          📂 Importar CSV do RHiD
        </div>
        <div style={{fontSize:12,color:TX2,marginBottom:14,lineHeight:1.6}}>
          No RHiD acesse: <strong>Relatórios → Cartão de Ponto → Exportar CSV</strong>.
          Depois selecione o arquivo aqui para importar automaticamente.
        </div>

        {/* Como exportar do RHiD */}
        <div style={{background:"#F0F7FA",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:A,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Como exportar do RHiD:</div>
          {[
            "1. Acesse rhid.com.br e faça login",
            "2. Clique em Relatórios no menu",
            "3. Selecione Cartão de Ponto",
            "4. Escolha o período desejado",
            "5. Clique em Exportar → CSV",
            "6. Salve o arquivo no celular",
          ].map((p,i)=>(
            <div key={i} style={{fontSize:12,color:TX2,padding:"2px 0"}}>{p}</div>
          ))}
        </div>

        <div style={{background:"#F0F7FA",borderRadius:8,padding:"14px",textAlign:"center",border:"1px solid "+BD}}>
          <div style={{fontSize:13,color:TX2,lineHeight:1.6}}>
            Conecte ao RHiD acima para sincronizar automaticamente.
          </div>
        </div>
      </div>
    </>
  );

  const TelaConfig=()=>(
    <>
      {[{t:"Tela Inicial do Aplicativo",c:[{l:"Tela Inicial",v:"Última tela acessada",o:["Última tela acessada","Cartão Ponto","Indicadores"]}]},
        {t:"Notificações de Registro de Ponto",c:["Entrada 1","Saída 1","Entrada 2","Saída 2","Entrada 3","Saída 3"].map(n=>({l:n,v:"Não notificar",o:["Não notificar","5 min antes","10 min antes","15 min antes"]}))},
        {t:"Modo Offline",c:[{l:"Tempo Máximo (s)",v:"60",o:null},{l:"Desativar Automaticamente",v:"Em 1 hora",o:["Em 1 hora","Em 2 horas","Nunca"]}]},
        {t:"Idioma",c:[{l:"Idioma",v:"Padrão do sistema",o:["Padrão do sistema","Português","English"]}]},
      ].map((sec,i)=>(
        <Card key={i}>
          <div style={{fontWeight:700,fontSize:15,color:TX,marginBottom:10}}>{sec.t}</div>
          {sec.c.map((c,j)=>c.o?<Sel key={j} label={c.l} value={c.v} onChange={()=>{}} options={c.o}/>:<Input key={j} label={c.l} value={c.v} disabled/>)}
        </Card>
      ))}
      <div style={{background:BR,borderRadius:10,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
        <div style={{fontWeight:700,fontSize:13,color:TX,marginBottom:8}}>Identificação do Dispositivo</div>
        <Input label="Identificação" value="81f9224c581db464" disabled/>
        <Input label="Modelo" value="S20 FE Demo" disabled/>
      </div>
      <button onClick={()=>msg("Conta excluída.","err")} style={{width:"100%",padding:"14px",borderRadius:8,border:"none",background:VM,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:4}}>Deletar Conta</button>
      <div style={{textAlign:"center",padding:"8px 0 24px",color:"#BDBDBD",fontSize:10}}>PontoWeb · Central do Funcionário · Versão 1.0.0</div>
    </>
  );

  const TITULOS={
    cartao:"Cartão Ponto", indicadores:"Indicadores", ajustar:"Ajustar Ponto",
    justificar:"Justificar Ausência", solicitacoes:"Minhas Solicitações",
    assinatura:"Assinatura Eletrônica", arquivos:"Arquivos",
    dados:"Dados Cadastrais", senha:"Alterar Senha", config:"Configurações", rhid:"Integração RHiD",
  };
  const tituloAtual=TITULOS[tela]||"Cartão Ponto";
  // Barra de status RHiD no topo do cartão ponto
  const RhidStatusBar=()=>rhidToken?(
    <div style={{background:rhidConectado?"#F0F7F2":"#FFF8F0",padding:"6px 14px",
      display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${BD}`}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:rhidConectado?VE:LA,flexShrink:0}}/>
      <span style={{fontSize:11,color:rhidConectado?VE:LA,fontWeight:600}}>
        RHiD {rhidConectado?"●  ":"○  "}{rhidSincMens}
      </span>
    </div>
  ):null;

  const handleLogin=(user)=>{
    setUserLogado(user);
    setFuncSel(user.id||1);
    if(user.perfil==="admin") setPerfilAtivo("admin");
    // Se veio com token RHiD do login, já conecta automaticamente
    if(user.rhidToken){
      setRhidToken(user.rhidToken);
      setRhidConectado(true);
      setRhidCfg({email:user.email,token:user.rhidToken});
      try{ localStorage.setItem("rhid_cfg",JSON.stringify({email:user.email,token:user.rhidToken})); }catch{}
    }
    setLogado(true);
  };

  const handleLogout=()=>{
    setLogado(false); setUserLogado(null); setPerfilAtivo("funcionario");
  };

  if(!logado) return <TelaLogin onLogin={handleLogin}/>;

  return(
    <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"#F0F2F5",fontFamily:"Roboto,'Segoe UI',sans-serif",position:"relative"}}>

      {toast&&<div style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.t==="err"?VM:toast.t==="info"?A:VE,color:"#fff",padding:"9px 18px",borderRadius:5,fontSize:12,fontWeight:700,boxShadow:"0 3px 10px rgba(0,0,0,0.3)",whiteSpace:"nowrap"}}>{toast.m}</div>}

      {/* CALENDÁRIO — montado no root, nunca desmontado por filho */}
      {calAberto&&(
        <ModalCalendario
          dataIni={periodoIni}
          dataFim={periodoFim}
          onConfirmar={(ini,fim)=>{ setPeriodoIni(ini); setPeriodoFim(fim); setCalAberto(false); }}
          onCancelar={()=>setCalAberto(false)}
        />
      )}

      {/* Menu lateral */}
      {menu&&(
        <div style={{position:"fixed",inset:0,zIndex:500}} onClick={()=>setMenu(false)}>
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:"82%",maxWidth:320,background:BR,boxShadow:"4px 0 20px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            {/* Logo */}
            <div style={{background:A,padding:"20px 16px 14px",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:28,color:"#fff"}}>⏰</span>
              <div><div style={{color:"#fff",fontWeight:900,fontSize:18}}>PontoWeb</div>
                <div style={{color:"rgba(255,255,255,0.7)",fontSize:10,letterSpacing:1}}>CENTRAL DO FUNCIONÁRIO</div></div>
            </div>
            {/* Perfil ativo */}
            <div style={{padding:"14px 16px",borderBottom:`1px solid ${BD}`,background:isAdmin?"#FFF8E1":"#fff"}}>
              {isAdmin&&<div style={{fontSize:10,fontWeight:800,color:LA,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>🔑 Modo Administrador</div>}
              <div style={{fontWeight:800,fontSize:14,color:TX,marginBottom:2}}>{userLogado?.nome||func.nome}</div>
              <div style={{fontSize:12,color:A,fontWeight:600,marginBottom:1,lineHeight:1.3}}>{func.empresa}</div>
              <div style={{fontSize:12,color:A,fontWeight:600,marginBottom:4}}>{func.cargo}</div>
              <div style={{fontSize:12,color:TX2}}>Período 1: {mod.p1}</div>
              {mod.p2&&<div style={{fontSize:12,color:TX2}}>Período 2: {mod.p2}</div>}
              <div style={{fontSize:11,color:TX2,marginTop:4}}>{mod.legal}</div>
            </div>
            {/* Itens menu */}
            {[["indicadores","📊","Indicadores"],["cartao","📋","Cartão Ponto"],["ajustar","✏️","Ajustar Ponto"],["justificar","📝","Justificar Ausência"],["solicitacoes","📄","Minhas Solicitações"],["assinatura","✍️","Assinatura Eletrônica de Cartão Ponto"],["arquivos","📁","Arquivos"],["dados","👤","Dados Cadastrais"],["senha","🔑","Alterar Senha"],["config","⚙️","Configurações"],["rhid","🔗","Integração RHiD — Tempo Real"]].map(([t,ico,label])=>(
              <div key={t} onClick={()=>navTo(t)} style={{padding:"13px 20px",borderBottom:`1px solid ${BD}`,display:"flex",alignItems:"center",gap:12,cursor:"pointer",background:tela===t?"#EAF4F6":BR}}>
                <span style={{fontSize:16}}>{ico}</span>
                <span style={{fontSize:14,color:tela===t?A:TX,fontWeight:tela===t?700:400}}>{label}</span>
              </div>
            ))}
            <div onClick={handleLogout} style={{padding:"13px 20px",borderBottom:`1px solid ${BD}`,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
              <span style={{fontSize:16}}>🚪</span><span style={{fontSize:14,color:TX}}>Sair</span>
            </div>

            {/* Trocar perfil */}
            {isAdmin&&(
            <div style={{padding:"12px 14px",borderTop:"2px solid "+BD,background:"#FAFAFA"}}>
              {[{v:"funcionario",l:"👤 Funcionário",d:"Somente visualização"},
              ].map(p=>(
                <div key={p.v} onClick={()=>{setPerfilAtivo(p.v);msg(`Perfil alterado: ${p.l}`);}}
                  style={{padding:"8px 10px",borderRadius:6,marginBottom:6,cursor:"pointer",
                    background:perfilAtivo===p.v?"#E3F7FB":"#F5F5F5",
                    border:perfilAtivo===p.v?`1.5px solid ${A}`:`1px solid ${BD}`}}>
                  <div style={{fontWeight:700,fontSize:13,color:perfilAtivo===p.v?A:TX}}>{p.l}</div>
                  <div style={{fontSize:11,color:TX2}}>{p.d}</div>
                </div>
              ))}
            </div>
            </div>
            )}
            {/* Trocar funcionário */}
            <div style={{padding:"12px 14px",borderTop:"2px solid "+BD}}>
              <div style={{fontSize:10,color:TX2,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Funcionários (demo)</div>
              {FUNCIONARIOS.filter(f=>f.perfil!=="admin").map(f=>(
                <div key={f.id} onClick={()=>{setFuncSel(f.id);setMenu(false);setAssOk({});}}
                  style={{padding:"7px 10px",borderRadius:5,marginBottom:4,cursor:"pointer",
                    background:funcSel===f.id?"#E8F2F4":"#F7F8FA",
                    color:funcSel===f.id?A:TX,fontWeight:funcSel===f.id?700:400,fontSize:12}}>
                  {f.nome.split(" ").slice(0,2).join(" ")} — {MODALIDADES[f.modalidade].label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Header titulo={tituloAtual} onMenu={()=>setMenu(true)}
        notifs={notifs} onBell={()=>setBellOpen(p=>!p)} bellOpen={bellOpen}
        onCloseBell={()=>setBellOpen(false)}
        onLer={id=>setNotifs(p=>p.map(n=>n.id===id?{...n,lida:true}:n))}
        onLerTodas={()=>setNotifs(p=>p.map(n=>({...n,lida:true})))}
        onNavNotif={t=>{setTela(t);setBellOpen(false);}}/>

      <RhidStatusBar/>
      {tela==="cartao"&&(
        <button onClick={bater} style={{position:"fixed",bottom:24,right:16,zIndex:300,width:56,height:56,borderRadius:"50%",background:A,border:"none",color:"#fff",cursor:"pointer",boxShadow:"0 4px 16px rgba(46,139,154,0.4)",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>
      )}

      <div style={{padding:"12px 12px 80px"}}>
        {tela==="cartao"       && <TelaCartao/>}
        {tela==="indicadores"  && <TelaIndicadores/>}
        {tela==="ajustar"      && <TelaAjustar/>}
        {tela==="justificar"   && <TelaJustificar/>}
        {tela==="solicitacoes" && <TelaSolicitacoes/>}
        {tela==="assinatura"   && <TelaAssinatura/>}
        {tela==="arquivos"     && <TelaArquivos/>}
        {tela==="dados"        && <TelaDados/>}
        {tela==="senha"        && <TelaSenha/>}
        {tela==="config"       && <TelaConfig/>}
        {tela==="rhid"         && <TelaRhid/>}
      </div>
    </div>
  );
}
