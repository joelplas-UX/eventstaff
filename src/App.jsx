// ─── EventStaff — Multi-tenant SaaS voor eventplanners ──────────────────────
import { useState, useEffect, useRef } from 'react'
import { initializeApp } from 'firebase/app'
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  signInWithCustomToken,
} from 'firebase/auth'
import {
  getFirestore, doc, collection, getDoc, getDocs,
  setDoc, deleteDoc, onSnapshot,
} from 'firebase/firestore'

// ─── Firebase ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FB_API_KEY            || '',
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN        || '',
  projectId:         import.meta.env.VITE_FB_PROJECT_ID         || '',
  storageBucket:     import.meta.env.VITE_FB_STORAGE_BUCKET     || '',
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID|| '',
  appId:             import.meta.env.VITE_FB_APP_ID             || '',
}
const fbApp = initializeApp(firebaseConfig)
const db    = getFirestore(fbApp)
const auth  = getAuth(fbApp)
const SUPERADMIN = import.meta.env.VITE_SUPERADMIN_EMAIL || ''

// ─── Utilities ───────────────────────────────────────────────────────────────
const uid  = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36)
const toDay = () => new Date().toISOString().slice(0,10)
const addDays = (d, n) => { const dt = new Date(d+'T12:00'); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10) }
const fmtDate = d => d ? new Date(d+'T12:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'}) : '—'
const fmtDateLong = d => d ? new Date(d+'T12:00').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : '—'
const fmtDateShort = d => d ? new Date(d+'T12:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'}) : '—'

// ─── Firestore helpers ───────────────────────────────────────────────────────
const tRef = (tid)          => doc(db,'tenants',tid)
const tCol = (tid,col)      => collection(db,'tenants',tid,col)
const tDoc = (tid,col,id)   => doc(db,'tenants',tid,col,id)

async function saveDoc(tid,col,data) {
  const id = data.id || uid()
  await setDoc(tDoc(tid,col,id), {...data,id}, {merge:true})
  return id
}
async function removeDoc(tid,col,id) { await deleteDoc(tDoc(tid,col,id)) }
async function linkUser(uid,tenantId,role='admin') {
  await setDoc(doc(db,'users',uid),{tenantId,role},{merge:true})
}

// ─── Email helpers (Resend via Netlify Function) ──────────────────────────────
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

async function callEmailFn(payload) {
  try {
    const res = await fetch('/.netlify/functions/send-email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    if (!res.ok) console.warn('Email mislukt:', await res.text())
  } catch(e) { console.warn('Email mislukt:', e) }
}

function sendInviteEmail({ name, email, inviteToken, tenantId, bureauName }) {
  const inviteUrl = `${APP_URL}/?invite=${inviteToken}&tid=${tenantId}`
  return callEmailFn({ type:'invite', name, email, bureauName, inviteUrl })
}

function sendAssignmentEmail({ name, email, eventTitle, eventDate, location, role, callTime, assignmentToken }) {
  return callEmailFn({
    type:'assignment', name, email,
    eventTitle, eventDate: fmtDateLong(eventDate),
    eventLocation: location || '', role: role || '', callTime: callTime || '',
    appUrl: APP_URL, assignmentToken: assignmentToken || null,
  })
}

// ─── Constants ───────────────────────────────────────────────────────────────
const EVENT_TYPES  = ['bruiloft','bedrijfsfeest','concert','galadiner','festival','overig']
const PERS_TYPES   = {staff:'👔 Staff',freelancer:'🔧 Freelancer',act:'🎤 Act',supplier:'📦 Leverancier'}
const ASS_STATUS   = {uitgenodigd:'Uitgenodigd',bevestigd:'Bevestigd',afgewezen:'Afgewezen'}
const STATUS_COLOR = {definitief:'var(--green)',optie:'var(--orange)',gecancelled:'var(--red)'}
const STATUS_BG    = {definitief:'var(--green-light)',optie:'var(--orange-light)',gecancelled:'var(--red-light)'}
const AV_STATUS    = {beschikbaar:'Beschikbaar',optie:'Optie',niet_beschikbaar:'Niet beschikbaar'}
const AV_COLOR     = {beschikbaar:'var(--green)',optie:'var(--orange)',niet_beschikbaar:'var(--red)'}
const AV_BG        = {beschikbaar:'var(--green-light)',optie:'var(--orange-light)',niet_beschikbaar:'var(--red-light)'}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&family=Sora:wght@700;800&display=swap');

:root {
  --bg:           #f5f5f0;
  --card:         #ffffff;
  --ink:          #1a1a18;
  --ink2:         #52524e;
  --ink3:         #9c9c96;
  --border:       #e8e8e3;
  --accent:       #2563eb;
  --accent-light: #eff6ff;
  --green:        #16a34a;
  --green-light:  #f0fdf4;
  --orange:       #ea580c;
  --orange-light: #fff7ed;
  --red:          #dc2626;
  --red-light:    #fef2f2;
  --sh:           0 1px 6px rgba(0,0,0,.07), 0 2px 16px rgba(0,0,0,.05);
  --sh-lg:        0 4px 24px rgba(0,0,0,.12);
  --r:            10px;
  --sb-w:         240px;
}
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Inter',system-ui,sans-serif; background:var(--bg); color:var(--ink); font-size:14px; line-height:1.5; }
button { font-family:inherit; cursor:pointer; border:none; background:none; }
input,select,textarea { font-family:inherit; font-size:14px; }
a { color:var(--accent); }

/* Layout */
.layout { display:flex; height:100vh; overflow:hidden; }
.main   { flex:1; overflow-y:auto; display:flex; flex-direction:column; min-width:0; }

/* Sidebar */
.sb { width:var(--sb-w); background:var(--card); border-right:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0; transition:width .2s; }
.sb.col { width:54px; }
.sb-logo { padding:20px 16px 12px; display:flex; align-items:center; gap:10px; font-family:'Sora',sans-serif; font-size:16px; font-weight:800; color:var(--accent); white-space:nowrap; overflow:hidden; }
.sb-logo span { opacity:1; transition:opacity .2s; }
.sb.col .sb-logo span { opacity:0; width:0; }
.sb-nav { flex:1; padding:8px 8px; display:flex; flex-direction:column; gap:2px; }
.sb-item { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:8px; color:var(--ink2); font-weight:500; font-size:13.5px; white-space:nowrap; overflow:hidden; transition:background .15s,color .15s; }
.sb-item:hover { background:var(--bg); color:var(--ink); }
.sb-item.active { background:var(--accent-light); color:var(--accent); }
.sb-item svg { flex-shrink:0; }
.sb-item span { overflow:hidden; transition:opacity .15s,width .15s; }
.sb.col .sb-item span { opacity:0; width:0; }
.sb-bottom { padding:12px 8px; border-top:1px solid var(--border); display:flex; flex-direction:column; gap:2px; }
.sb-toggle { display:flex; align-items:center; justify-content:center; padding:8px; border-radius:8px; color:var(--ink3); }
.sb-toggle:hover { background:var(--bg); color:var(--ink); }

/* Page */
.ph { padding:20px 28px 0; }
.ph-t { font-family:'Sora',sans-serif; font-size:22px; font-weight:800; color:var(--ink); }
.ph-s { color:var(--ink3); font-size:13px; margin-top:2px; }
.page-body { padding:20px 28px; flex:1; }

/* Cards */
.card { background:var(--card); border-radius:var(--r); box-shadow:var(--sh); }
.card-p { padding:20px; }

/* Stat cards */
.stats { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:14px; margin-bottom:24px; }
.stat { background:var(--card); border-radius:var(--r); box-shadow:var(--sh); padding:18px 20px; }
.stat-n { font-size:2rem; font-weight:700; font-family:'Sora',sans-serif; line-height:1; }
.stat-l { font-size:11.5px; color:var(--ink3); text-transform:uppercase; letter-spacing:.5px; margin-top:6px; }

/* Table */
.tbl { width:100%; border-collapse:collapse; }
.tbl th { text-align:left; font-size:11.5px; font-weight:600; color:var(--ink3); text-transform:uppercase; letter-spacing:.5px; padding:0 14px 10px; }
.tbl td { padding:12px 14px; border-top:1px solid var(--border); vertical-align:middle; }
.tbl tr:hover td { background:#fafaf8; }
.tbl-wrap { background:var(--card); border-radius:var(--r); box-shadow:var(--sh); overflow:hidden; }

/* Badge */
.badge { display:inline-flex; align-items:center; padding:3px 10px; border-radius:20px; font-size:11.5px; font-weight:600; white-space:nowrap; }

/* Buttons */
.btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:8px; font-weight:600; font-size:13.5px; transition:opacity .15s,background .15s; }
.btn:hover { opacity:.88; }
.btn-primary { background:var(--accent); color:#fff; }
.btn-ghost { background:var(--bg); color:var(--ink); border:1px solid var(--border); }
.btn-danger { background:var(--red-light); color:var(--red); }
.btn-sm { padding:5px 12px; font-size:12.5px; }

/* Form */
.form-row { display:grid; gap:14px; margin-bottom:14px; }
.form-row.cols2 { grid-template-columns:1fr 1fr; }
.form-row.cols3 { grid-template-columns:1fr 1fr 1fr; }
.form-label { display:block; font-size:12px; font-weight:600; color:var(--ink2); margin-bottom:5px; }
.form-input { width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); color:var(--ink); outline:none; transition:border-color .15s; }
.form-input:focus { border-color:var(--accent); }
select.form-input { cursor:pointer; }
textarea.form-input { resize:vertical; min-height:80px; }
.form-section { font-size:11.5px; font-weight:700; color:var(--ink3); text-transform:uppercase; letter-spacing:.8px; padding:4px 0; border-bottom:1px solid var(--border); margin:18px 0 14px; }

/* Modal */
.overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; }
.modal { background:var(--card); border-radius:14px; box-shadow:var(--sh-lg); width:100%; max-height:90vh; overflow-y:auto; display:flex; flex-direction:column; }
.modal-sm { max-width:460px; }
.modal-md { max-width:640px; }
.modal-lg { max-width:820px; }
.modal-head { padding:20px 24px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
.modal-head h2 { font-size:17px; font-weight:700; }
.modal-body { padding:24px; flex:1; }
.modal-foot { padding:16px 24px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px; }

/* Toast */
.toast { position:fixed; bottom:24px; right:24px; background:var(--ink); color:#fff; padding:12px 20px; border-radius:10px; font-size:13.5px; font-weight:500; z-index:200; box-shadow:var(--sh-lg); animation:fadeUp .2s; }
@keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }

/* Login */
.login-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); }
.login-box { background:var(--card); border-radius:16px; box-shadow:var(--sh-lg); padding:40px 40px 36px; width:100%; max-width:400px; }
.login-logo { font-family:'Sora',sans-serif; font-size:24px; font-weight:800; color:var(--accent); margin-bottom:6px; }
.login-sub { color:var(--ink3); font-size:13.5px; margin-bottom:28px; }
.login-err { background:var(--red-light); color:var(--red); padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:14px; }

/* Upcoming list */
.event-row { display:flex; align-items:center; gap:14px; padding:13px 18px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .12s; }
.event-row:last-child { border-bottom:none; }
.event-row:hover { background:#fafaf8; }
.event-date-block { width:48px; text-align:center; flex-shrink:0; }
.event-date-block .day { font-size:22px; font-weight:800; font-family:'Sora',sans-serif; line-height:1; }
.event-date-block .mon { font-size:11px; color:var(--ink3); text-transform:uppercase; }
.event-info { flex:1; min-width:0; }
.event-title { font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.event-meta  { font-size:12px; color:var(--ink3); margin-top:2px; }

/* Availability list (bandcalendar-stijl) */
.av-row { display:flex; align-items:center; gap:0; border-bottom:1px solid var(--border); transition:background .12s; cursor:pointer; }
.av-row:last-child { border-bottom:none; }
.av-row:hover { background:#fafaf8; }
.av-row-bar { width:4px; align-self:stretch; flex-shrink:0; border-radius:0; }
.av-row-content { display:flex; align-items:center; gap:14px; padding:13px 18px; flex:1; min-width:0; }
.av-date-block { width:52px; text-align:center; flex-shrink:0; }
.av-date-block .day { font-size:22px; font-weight:800; font-family:'Sora',sans-serif; line-height:1; }
.av-date-block .mon { font-size:11px; color:var(--ink3); text-transform:uppercase; }
.av-date-block .dow { font-size:10px; color:var(--ink3); margin-top:1px; }

/* Section heading */
.section-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
.section-title { font-size:16px; font-weight:700; }

/* Event detail panel */
.detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.detail-field { margin-bottom:12px; }
.detail-label { font-size:11.5px; font-weight:600; color:var(--ink3); text-transform:uppercase; letter-spacing:.5px; margin-bottom:3px; }
.detail-value { font-size:14px; color:var(--ink); }

/* Filter bar */
.filter-bar { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
.filter-btn { padding:5px 14px; border-radius:20px; border:1px solid var(--border); background:var(--card); color:var(--ink2); font-size:12.5px; font-weight:500; cursor:pointer; transition:background .12s,color .12s; }
.filter-btn.active { background:var(--accent); color:#fff; border-color:var(--accent); }

/* Empty state */
.empty { text-align:center; padding:60px 20px; color:var(--ink3); }
.empty-icon { font-size:40px; margin-bottom:12px; }
.empty-text { font-size:14px; }

/* Checkbox toggle */
.toggle-wrap { display:flex; align-items:center; gap:10px; cursor:pointer; }
.toggle { width:38px; height:22px; border-radius:11px; background:var(--border); position:relative; transition:background .2s; flex-shrink:0; }
.toggle.on { background:var(--green); }
.toggle::after { content:''; position:absolute; width:16px; height:16px; border-radius:50%; background:#fff; top:3px; left:3px; transition:left .2s; box-shadow:0 1px 3px rgba(0,0,0,.2); }
.toggle.on::after { left:19px; }

/* Onboarding */
.onboard-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); padding:24px; }
.onboard-box { background:var(--card); border-radius:16px; box-shadow:var(--sh-lg); padding:40px; width:100%; max-width:480px; }
.step-dots { display:flex; gap:6px; margin-bottom:28px; }
.step-dot { width:8px; height:8px; border-radius:50%; background:var(--border); transition:background .2s; }
.step-dot.active { background:var(--accent); width:24px; border-radius:4px; }
`

// ─── Icons (inline SVG helpers) ──────────────────────────────────────────────
const Ic = ({ d, size=18, color='currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
)
const IcHome      = () => <Ic d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
const IcCalendar  = () => <Ic d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
const IcUsers     = () => <Ic d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
const IcGrid      = () => <Ic d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>
const IcChevronL  = () => <Ic d="M15 18l-6-6 6-6"/>
const IcChevronR  = () => <Ic d="M9 18l6-6-6-6"/>
const IcX         = () => <Ic d="M18 6 6 18M6 6l12 12"/>
const IcPlus      = () => <Ic d="M12 5v14M5 12h14"/>
const IcEdit      = () => <Ic d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
const IcTrash     = () => <Ic d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
const IcLogout    = () => <Ic d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
const IcShield    = () => <Ic d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
const IcCheck     = () => <Ic d="M20 6 9 17l-5-5"/>

// ─── Toast ───────────────────────────────────────────────────────────────────
function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t) }, [])
  return <div className="toast">{msg}</div>
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, size='modal-md', footer, children }) {
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={`modal ${size}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><IcX/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ view, setView, onLogout, isSuperadmin, collapsed, setCollapsed }) {
  const nav = [
    { id:'dashboard',      label:'Dashboard',      Icon:IcHome },
    { id:'evenementen',    label:'Evenementen',    Icon:IcCalendar },
    { id:'personeel',      label:'Personeel',      Icon:IcUsers },
    { id:'beschikbaarheid',label:'Beschikbaarheid',Icon:IcGrid },
  ]
  if (isSuperadmin) nav.push({ id:'beheer', label:'Beheer', Icon:IcShield })

  return (
    <div className={`sb${collapsed?' col':''}`}>
      <div className="sb-logo">
        <IcCalendar size={22}/>
        <span>EventStaff</span>
      </div>
      <div className="sb-nav">
        {nav.map(({id,label,Icon})=>(
          <button key={id} className={`sb-item${view===id?' active':''}`} onClick={()=>setView(id)}>
            <Icon size={18}/>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="sb-bottom">
        <button className="sb-item" onClick={onLogout}>
          <IcLogout size={18}/><span>Uitloggen</span>
        </button>
        <button className="sb-toggle" onClick={()=>setCollapsed(c=>!c)}>
          {collapsed ? <IcChevronR size={16}/> : <IcChevronL size={16}/>}
        </button>
      </div>
    </div>
  )
}

// ─── LoginScreen ─────────────────────────────────────────────────────────────
function LoginScreen({ onRegister }) {
  const [email,      setEmail]      = useState('')
  const [pass,       setPass]       = useState('')
  const [err,        setErr]        = useState('')
  const [busy,       setBusy]       = useState(false)
  const [mode,       setMode]       = useState('password')  // 'password' | 'magic'
  const [magicSent,  setMagicSent]  = useState(false)

  // Controleer bij laden of er een ?magic=TOKEN in de URL staat
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('magic')
    if (!token) return
    setBusy(true); setErr('')
    fetch(`/.netlify/functions/magic-link?token=${token}`)
      .then(res => res.json())
      .then(async data => {
        if (data.customToken) {
          await signInWithCustomToken(auth, data.customToken)
          window.history.replaceState({}, '', '/')
        } else {
          setErr(data.error === 'expired' ? 'De inloglink is verlopen. Vraag een nieuwe aan.' : 'Ongeldige inloglink.')
        }
      })
      .catch(() => setErr('Inloggen via link mislukt. Probeer het opnieuw.'))
      .finally(() => setBusy(false))
  }, [])

  const handlePassword = async e => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass)
    } catch(ex) {
      const msgs = {
        'auth/user-not-found':     'Geen account met dit e-mailadres.',
        'auth/wrong-password':     'Onjuist wachtwoord.',
        'auth/invalid-email':      'Ongeldig e-mailadres.',
        'auth/invalid-credential': 'E-mailadres of wachtwoord onjuist.',
      }
      setErr(msgs[ex.code] || 'Inloggen mislukt. Probeer het opnieuw.')
    } finally { setBusy(false) }
  }

  const handleMagic = async e => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/.netlify/functions/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) throw new Error()
      setMagicSent(true)
    } catch {
      setErr('Kon geen link versturen. Controleer het e-mailadres.')
    } finally { setBusy(false) }
  }

  if (busy && new URLSearchParams(window.location.search).get('magic')) {
    return (
      <div className="login-wrap">
        <div style={{color:'var(--ink3)'}}>Inloggen via link…</div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">EventStaff</div>
        <div className="login-sub">Personeelsplanning voor eventprofessionals</div>
        {err && <div className="login-err">{err}</div>}

        {/* Mode toggle */}
        <div style={{display:'flex',gap:0,marginBottom:20,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          <button type="button" onClick={()=>{setMode('password');setMagicSent(false);setErr('')}}
            style={{flex:1,padding:'8px 0',fontSize:13,fontWeight:mode==='password'?700:400,
              background:mode==='password'?'var(--accent)':'transparent',
              color:mode==='password'?'#fff':'var(--ink2)',border:'none',cursor:'pointer'}}>
            Wachtwoord
          </button>
          <button type="button" onClick={()=>{setMode('magic');setErr('')}}
            style={{flex:1,padding:'8px 0',fontSize:13,fontWeight:mode==='magic'?700:400,
              background:mode==='magic'?'var(--accent)':'transparent',
              color:mode==='magic'?'#fff':'var(--ink2)',border:'none',cursor:'pointer'}}>
            Inloglink per mail
          </button>
        </div>

        {mode === 'password' ? (
          <form onSubmit={handlePassword}>
            <div className="form-row">
              <div>
                <label className="form-label">E-mailadres</label>
                <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus/>
              </div>
            </div>
            <div className="form-row" style={{marginBottom:20}}>
              <div>
                <label className="form-label">Wachtwoord</label>
                <input className="form-input" type="password" value={pass} onChange={e=>setPass(e.target.value)} required/>
              </div>
            </div>
            <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} disabled={busy}>
              {busy ? 'Bezig…' : 'Inloggen'}
            </button>
          </form>
        ) : magicSent ? (
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{fontSize:40,marginBottom:12}}>📧</div>
            <div style={{fontWeight:700,marginBottom:8}}>Controleer je inbox</div>
            <div style={{fontSize:13,color:'var(--ink2)',lineHeight:1.6}}>
              We hebben een inloglink gestuurd naar <strong>{email}</strong>.<br/>
              De link is 15 minuten geldig.
            </div>
            <button className="btn btn-ghost" style={{marginTop:16,width:'100%',justifyContent:'center'}}
              onClick={()=>setMagicSent(false)}>
              Opnieuw versturen
            </button>
          </div>
        ) : (
          <form onSubmit={handleMagic}>
            <div className="form-row" style={{marginBottom:20}}>
              <div>
                <label className="form-label">E-mailadres</label>
                <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus
                  placeholder="Vul je e-mailadres in"/>
              </div>
            </div>
            <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} disabled={busy||!email.trim()}>
              {busy ? 'Versturen…' : 'Inloglink versturen'}
            </button>
          </form>
        )}

        <div style={{marginTop:20,textAlign:'center',fontSize:13,color:'var(--ink3)'}}>
          Nog geen account?{' '}
          <button style={{color:'var(--accent)',fontWeight:600,fontSize:13}} onClick={onRegister}>
            Bureau registreren
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── OnboardingScreen ────────────────────────────────────────────────────────
function OnboardingScreen({ onDone }) {
  const [stap,  setStap]  = useState(1) // 1=bureau-info, 2=account, 3=aanmaken
  const [naam,  setNaam]  = useState('')
  const [stad,  setStad]  = useState('')
  const [email, setEmail] = useState('')
  const [pass,  setPass]  = useState('')
  const [pass2, setPass2] = useState('')
  const [err,   setErr]   = useState('')
  const [busy,  setBusy]  = useState(false)

  const maakAan = async e => {
    e.preventDefault(); setErr('')
    if (pass !== pass2) { setErr('Wachtwoorden komen niet overeen.'); return }
    if (pass.length < 6) { setErr('Wachtwoord minimaal 6 tekens.'); return }
    setBusy(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass)
      const tid  = uid()
      await setDoc(doc(db,'tenants',tid), {
        id: tid, name: naam.trim(), city: stad.trim(),
        createdAt: Date.now(), plan:'gratis',
        adminUid: cred.user.uid, adminEmail: email.trim(),
      })
      await linkUser(cred.user.uid, tid, 'admin')
      onDone(tid)
    } catch(ex) {
      const msgs = {
        'auth/email-already-in-use': 'Dit e-mailadres is al in gebruik.',
        'auth/weak-password':        'Wachtwoord te zwak (minimaal 6 tekens).',
        'auth/invalid-email':        'Ongeldig e-mailadres.',
      }
      setErr(msgs[ex.code] || 'Registratie mislukt: ' + ex.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="onboard-wrap">
      <div className="onboard-box">
        <div className="login-logo" style={{marginBottom:4}}>EventStaff</div>
        <div style={{color:'var(--ink3)',fontSize:13,marginBottom:24}}>Nieuw bureau registreren</div>
        <div className="step-dots">
          {[1,2].map(s=><div key={s} className={`step-dot${stap>=s?' active':''}`}/>)}
        </div>
        {err && <div className="login-err">{err}</div>}

        {stap===1 && (
          <form onSubmit={e=>{e.preventDefault();if(!naam.trim()||!stad.trim()){setErr('Vul alle velden in.');return}setErr('');setStap(2)}}>
            <div className="form-row" style={{marginBottom:14}}>
              <div>
                <label className="form-label">Naam bureau / organisatie</label>
                <input className="form-input" value={naam} onChange={e=>setNaam(e.target.value)} placeholder="bv. Events by Janssen" required autoFocus/>
              </div>
            </div>
            <div className="form-row" style={{marginBottom:24}}>
              <div>
                <label className="form-label">Stad / vestigingsplaats</label>
                <input className="form-input" value={stad} onChange={e=>setStad(e.target.value)} placeholder="bv. Amsterdam" required/>
              </div>
            </div>
            <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}}>Volgende</button>
          </form>
        )}

        {stap===2 && (
          <form onSubmit={maakAan}>
            <div style={{marginBottom:14,fontSize:13,color:'var(--ink2)'}}>
              <strong>{naam}</strong> · {stad}
              <button style={{marginLeft:10,color:'var(--accent)',fontSize:12}} onClick={()=>{setErr('');setStap(1)}}>wijzig</button>
            </div>
            <div className="form-row" style={{marginBottom:14}}>
              <div>
                <label className="form-label">E-mailadres (admin)</label>
                <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus/>
              </div>
            </div>
            <div className="form-row" style={{marginBottom:14}}>
              <div>
                <label className="form-label">Wachtwoord</label>
                <input className="form-input" type="password" value={pass} onChange={e=>setPass(e.target.value)} required minLength={6}/>
              </div>
            </div>
            <div className="form-row" style={{marginBottom:24}}>
              <div>
                <label className="form-label">Wachtwoord herhalen</label>
                <input className="form-input" type="password" value={pass2} onChange={e=>setPass2(e.target.value)} required/>
              </div>
            </div>
            <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} disabled={busy}>
              {busy ? 'Bureau aanmaken…' : 'Account aanmaken & starten'}
            </button>
          </form>
        )}

        <div style={{marginTop:18,textAlign:'center',fontSize:13,color:'var(--ink3)'}}>
          Al een account?{' '}
          <button style={{color:'var(--accent)',fontWeight:600,fontSize:13}} onClick={()=>signOut(auth).catch(()=>{})}>
            Inloggen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DashboardView ───────────────────────────────────────────────────────────
function DashboardView({ events, personnel, assignments, setView, setSelectedEventId }) {
  const now = toDay()
  const in14 = addDays(now, 14)
  const in7  = addDays(now, 7)

  const upcoming = events
    .filter(e => e.date >= now && e.status !== 'gecancelled')
    .sort((a,b) => a.date.localeCompare(b.date))

  const stats = [
    { n: upcoming.filter(e=>e.date===now).length,           l:'Vandaag' },
    { n: upcoming.filter(e=>e.date<=in7).length,            l:'Komende 7 dagen' },
    { n: assignments.filter(a=>a.status==='uitgenodigd').length, l:'Open uitnodigingen' },
    { n: personnel.length,                                   l:'Personeelsleden' },
  ]

  const openEvent = ev => { setSelectedEventId(ev.id); setView('event-detail') }

  return (
    <>
      <div className="ph">
        <div className="ph-t">Dashboard</div>
        <div className="ph-s">{fmtDateLong(now)}</div>
      </div>
      <div className="page-body">
        <div className="stats">
          {stats.map((s,i) => (
            <div key={i} className="stat">
              <div className="stat-n">{s.n}</div>
              <div className="stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        <div className="section-head">
          <div className="section-title">Komende evenementen</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setView('evenementen')}>Alle evenementen</button>
        </div>
        <div className="tbl-wrap">
          {upcoming.length === 0
            ? <div className="empty"><div className="empty-icon">📅</div><div className="empty-text">Geen geplande evenementen</div></div>
            : upcoming.slice(0,8).map(ev => {
                const dt  = new Date(ev.date+'T12:00')
                const day = dt.toLocaleDateString('nl-NL',{day:'numeric'})
                const mon = dt.toLocaleDateString('nl-NL',{month:'short'})
                const ass = assignments.filter(a=>a.eventId===ev.id)
                return (
                  <div key={ev.id} className="event-row" onClick={()=>openEvent(ev)}>
                    <div className="event-date-block">
                      <div className="day">{day}</div>
                      <div className="mon">{mon}</div>
                    </div>
                    <div className="event-info">
                      <div className="event-title">{ev.title}</div>
                      <div className="event-meta">{ev.location || ev.city || ''}{ev.startTime ? ' · '+ev.startTime : ''}</div>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span className="badge" style={{background:STATUS_BG[ev.status],color:STATUS_COLOR[ev.status]}}>
                        {ev.status}
                      </span>
                      {ass.length > 0 && (
                        <span style={{fontSize:12,color:'var(--ink3)'}}>{ass.length} persoon{ass.length!==1?'en':''}</span>
                      )}
                    </div>
                  </div>
                )
              })
          }
        </div>
      </div>
    </>
  )
}

// ─── EventModal ──────────────────────────────────────────────────────────────
function EventModal({ tid, event, onSave, onClose }) {
  const def = {
    id:'', title:'', date:'', endDate:'', status:'optie', type:'bruiloft',
    location:'', address:'', city:'', client:{name:'',email:'',phone:''},
    callTime:'', soundcheck:'', startTime:'', endTime:'',
    catering:false, budget:'', notes:'',
  }
  const [f, setF] = useState({...def, ...event, client:{...def.client,...(event?.client||{})}})
  const [busy, setBusy] = useState(false)

  const set = (k,v) => setF(p=>({...p,[k]:v}))
  const setClient = (k,v) => setF(p=>({...p,client:{...p.client,[k]:v}}))

  const submit = async e => {
    e.preventDefault()
    if (!f.title.trim() || !f.date) return
    setBusy(true)
    try {
      await saveDoc(tid,'events',{...f, updatedAt:Date.now()})
      onSave()
    } finally { setBusy(false) }
  }

  return (
    <Modal title={f.id ? 'Evenement bewerken' : 'Nieuw evenement'} onClose={onClose} size="modal-lg"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy?'Opslaan…':'Opslaan'}</button>
      </>}>

      <form onSubmit={submit}>
        <div className="form-section">Algemeen</div>
        <div className="form-row">
          <div><label className="form-label">Naam evenement *</label>
            <input className="form-input" value={f.title} onChange={e=>set('title',e.target.value)} required autoFocus placeholder="bv. Bruiloft De Vries – Van Dam"/></div>
        </div>
        <div className="form-row cols3">
          <div><label className="form-label">Datum *</label>
            <input className="form-input" type="date" value={f.date} onChange={e=>set('date',e.target.value)} required/></div>
          <div><label className="form-label">Einddatum</label>
            <input className="form-input" type="date" value={f.endDate} onChange={e=>set('endDate',e.target.value)}/></div>
          <div><label className="form-label">Status</label>
            <select className="form-input" value={f.status} onChange={e=>set('status',e.target.value)}>
              <option value="optie">Optie</option>
              <option value="definitief">Definitief</option>
              <option value="gecancelled">Gecancelled</option>
            </select></div>
        </div>
        <div className="form-row cols2">
          <div><label className="form-label">Type evenement</label>
            <select className="form-input" value={f.type} onChange={e=>set('type',e.target.value)}>
              {EVENT_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select></div>
          <div><label className="form-label">Budget (€)</label>
            <input className="form-input" type="number" min="0" value={f.budget} onChange={e=>set('budget',e.target.value)} placeholder="0"/></div>
        </div>

        <div className="form-section">Locatie</div>
        <div className="form-row">
          <div><label className="form-label">Locatienaam</label>
            <input className="form-input" value={f.location} onChange={e=>set('location',e.target.value)} placeholder="bv. De Roode Hoed"/></div>
        </div>
        <div className="form-row cols2">
          <div><label className="form-label">Adres</label>
            <input className="form-input" value={f.address} onChange={e=>set('address',e.target.value)}/></div>
          <div><label className="form-label">Stad</label>
            <input className="form-input" value={f.city} onChange={e=>set('city',e.target.value)}/></div>
        </div>

        <div className="form-section">Opdrachtgever</div>
        <div className="form-row cols3">
          <div><label className="form-label">Naam</label>
            <input className="form-input" value={f.client.name} onChange={e=>setClient('name',e.target.value)}/></div>
          <div><label className="form-label">E-mail</label>
            <input className="form-input" type="email" value={f.client.email} onChange={e=>setClient('email',e.target.value)}/></div>
          <div><label className="form-label">Telefoon</label>
            <input className="form-input" type="tel" value={f.client.phone} onChange={e=>setClient('phone',e.target.value)}/></div>
        </div>

        <div className="form-section">Tijden & logistiek</div>
        <div className="form-row cols2" style={{gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
          <div><label className="form-label">Aanvangstijd personeel</label>
            <input className="form-input" type="time" value={f.callTime} onChange={e=>set('callTime',e.target.value)}/></div>
          <div><label className="form-label">Soundcheck</label>
            <input className="form-input" type="time" value={f.soundcheck} onChange={e=>set('soundcheck',e.target.value)}/></div>
          <div><label className="form-label">Start evenement</label>
            <input className="form-input" type="time" value={f.startTime} onChange={e=>set('startTime',e.target.value)}/></div>
          <div><label className="form-label">Einde evenement</label>
            <input className="form-input" type="time" value={f.endTime} onChange={e=>set('endTime',e.target.value)}/></div>
        </div>
        <div className="form-row" style={{marginBottom:0}}>
          <div>
            <label className="form-label">Catering aanwezig</label>
            <div className="toggle-wrap" onClick={()=>set('catering',!f.catering)}>
              <div className={`toggle${f.catering?' on':''}`}/>
              <span style={{fontSize:13,color:'var(--ink2)'}}>{f.catering ? 'Ja' : 'Nee'}</span>
            </div>
          </div>
        </div>

        <div className="form-section">Notities</div>
        <div className="form-row" style={{marginBottom:0}}>
          <div><textarea className="form-input" value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Bijzonderheden, instructies, etc." style={{minHeight:80}}/></div>
        </div>
      </form>
    </Modal>
  )
}

// ─── AssignmentModal ──────────────────────────────────────────────────────────
function AssignmentModal({ tid, eventId, eventDate, eventTitle, eventLocation, personnel, existing, onSave, onClose }) {
  const [pid,    setPid]    = useState(existing?.personnelId || '')
  const [role,   setRole]   = useState(existing?.role || '')
  const [call,   setCall]   = useState(existing?.callTime || '')
  const [end,    setEnd]    = useState(existing?.endTime || '')
  const [fee,    setFee]    = useState(existing?.fee || '')
  const [status, setStatus] = useState(existing?.status || 'uitgenodigd')
  const [busy,   setBusy]   = useState(false)

  const submit = async e => {
    e.preventDefault()
    if (!pid) return
    setBusy(true)
    const isNew  = !existing?.id
    const assId  = existing?.id || uid()
    try {
      await saveDoc(tid,'assignments',{
        id: assId, eventId, personnelId:pid,
        role, callTime:call, endTime:end, fee, status, createdAt:Date.now(),
      })
      // Stuur notificatiemail bij nieuw assignment of statuswijziging naar 'uitgenodigd'
      const person = personnel.find(p=>p.id===pid)
      if (person?.email && (isNew || (existing?.status !== status && status === 'uitgenodigd'))) {
        // Sla een bevestigingstoken op (7 dagen geldig) voor één-klik reactie via e-mail
        const assignmentToken = uid()
        await setDoc(doc(db,'assignmentTokens',assignmentToken), {
          tenantId: tid, assignmentId: assId, personnelId: pid,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        })
        sendAssignmentEmail({
          name: person.name, email: person.email,
          eventTitle: eventTitle||'', eventDate: eventDate||'',
          location: eventLocation||'', role, callTime: call,
          assignmentToken,
        })
      }
      onSave()
    } finally { setBusy(false) }
  }

  return (
    <Modal title={existing ? 'Toewijzing bewerken' : 'Personeel toewijzen'} onClose={onClose} size="modal-sm"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy||!pid}>{busy?'Opslaan…':'Opslaan'}</button>
      </>}>
      <form onSubmit={submit}>
        <div className="form-row">
          <div><label className="form-label">Personeelslid *</label>
            <select className="form-input" value={pid} onChange={e=>setPid(e.target.value)} required autoFocus>
              <option value="">— Kies persoon —</option>
              {personnel.map(p=><option key={p.id} value={p.id}>{p.name} ({PERS_TYPES[p.type]||p.type})</option>)}
            </select></div>
        </div>
        <div className="form-row">
          <div><label className="form-label">Rol bij dit evenement</label>
            <input className="form-input" value={role} onChange={e=>setRole(e.target.value)} placeholder="bv. Ceremoniemeester"/></div>
        </div>
        <div className="form-row cols2">
          <div><label className="form-label">Aanvangstijd</label>
            <input className="form-input" type="time" value={call} onChange={e=>setCall(e.target.value)}/></div>
          <div><label className="form-label">Eindtijd</label>
            <input className="form-input" type="time" value={end} onChange={e=>setEnd(e.target.value)}/></div>
        </div>
        <div className="form-row cols2" style={{marginBottom:0}}>
          <div><label className="form-label">Vergoeding (€)</label>
            <input className="form-input" type="number" min="0" value={fee} onChange={e=>setFee(e.target.value)}/></div>
          <div><label className="form-label">Status</label>
            <select className="form-input" value={status} onChange={e=>setStatus(e.target.value)}>
              {Object.entries(ASS_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select></div>
        </div>
      </form>
    </Modal>
  )
}

// ─── EventDetailPanel ─────────────────────────────────────────────────────────
function EventDetailPanel({ tid, event, assignments, personnel, eventTasks, onEdit, onDelete, onClose, toast }) {
  const [showAssModal, setShowAssModal] = useState(false)
  const [editAss,      setEditAss]      = useState(null)
  const [newTask,      setNewTask]      = useState('')
  const [addingTask,   setAddingTask]   = useState(false)

  const myAss = assignments.filter(a => a.eventId === event.id)
  const assStatusColor = { uitgenodigd:'var(--orange)', bevestigd:'var(--green)', afgewezen:'var(--red)' }
  const assStatusBg    = { uitgenodigd:'var(--orange-light)', bevestigd:'var(--green-light)', afgewezen:'var(--red-light)' }

  const delAss = async (id) => {
    if (!confirm('Toewijzing verwijderen?')) return
    await removeDoc(tid,'assignments',id)
    toast('Toewijzing verwijderd')
  }

  // ── Taken helpers ────────────────────────────────────────────────────────
  const addTask = async () => {
    if (!newTask.trim()) return
    setAddingTask(true)
    try {
      await saveDoc(tid,'eventTasks',{ id:uid(), eventId:event.id, title:newTask.trim(), done:false, createdAt:Date.now() })
      setNewTask('')
    } finally { setAddingTask(false) }
  }
  const toggleTask = (task) => saveDoc(tid,'eventTasks',{...task, done:!task.done})
  const delTask    = async (id) => { if (!confirm('Taak verwijderen?')) return; await removeDoc(tid,'eventTasks',id) }

  const df = (v,fallback='—') => v || fallback

  return (
    <>
      <Modal title={event.title} onClose={onClose} size="modal-lg"
        footer={<>
          <button className="btn btn-danger btn-sm" onClick={onDelete}><IcTrash size={14}/>Verwijderen</button>
          <div style={{flex:1}}/>
          <button className="btn btn-ghost" onClick={onClose}>Sluiten</button>
          <button className="btn btn-primary" onClick={onEdit}><IcEdit size={14}/>Bewerken</button>
        </>}>

        {/* Status + type */}
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          <span className="badge" style={{background:STATUS_BG[event.status],color:STATUS_COLOR[event.status],fontSize:13}}>
            {event.status}
          </span>
          <span className="badge" style={{background:'var(--bg)',color:'var(--ink2)',fontSize:13}}>
            {event.type}
          </span>
          {event.catering && <span className="badge" style={{background:'var(--accent-light)',color:'var(--accent)',fontSize:13}}>🍽 Catering</span>}
        </div>

        <div className="detail-grid">
          {/* Left column */}
          <div>
            <div className="detail-field">
              <div className="detail-label">Datum</div>
              <div className="detail-value">{fmtDateLong(event.date)}{event.endDate && event.endDate!==event.date ? ' t/m '+fmtDateLong(event.endDate) : ''}</div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Locatie</div>
              <div className="detail-value">{df(event.location)}</div>
              {event.address && <div style={{fontSize:12,color:'var(--ink3)'}}>{event.address}{event.city ? ', '+event.city : ''}</div>}
            </div>
            <div className="detail-field">
              <div className="detail-label">Opdrachtgever</div>
              <div className="detail-value">{df(event.client?.name)}</div>
              {event.client?.email && <div style={{fontSize:12,color:'var(--ink3)'}}>{event.client.email}</div>}
              {event.client?.phone && <div style={{fontSize:12,color:'var(--ink3)'}}>{event.client.phone}</div>}
            </div>
            {event.budget && <div className="detail-field">
              <div className="detail-label">Budget</div>
              <div className="detail-value">€{Number(event.budget).toLocaleString('nl-NL')}</div>
            </div>}
          </div>
          {/* Right column — Tijden */}
          <div>
            <div className="detail-field">
              <div className="detail-label">Tijden</div>
              {event.callTime && <div className="detail-value" style={{marginBottom:4}}>
                <span style={{fontSize:11,color:'var(--ink3)',width:140,display:'inline-block'}}>Aanvangstijd personeel</span>
                <strong>{event.callTime}</strong>
              </div>}
              {event.soundcheck && <div className="detail-value" style={{marginBottom:4}}>
                <span style={{fontSize:11,color:'var(--ink3)',width:140,display:'inline-block'}}>Soundcheck</span>
                <strong>{event.soundcheck}</strong>
              </div>}
              {event.startTime && <div className="detail-value" style={{marginBottom:4}}>
                <span style={{fontSize:11,color:'var(--ink3)',width:140,display:'inline-block'}}>Start evenement</span>
                <strong>{event.startTime}</strong>
              </div>}
              {event.endTime && <div className="detail-value">
                <span style={{fontSize:11,color:'var(--ink3)',width:140,display:'inline-block'}}>Einde evenement</span>
                <strong>{event.endTime}</strong>
              </div>}
              {!event.callTime && !event.startTime && <div style={{color:'var(--ink3)'}}>—</div>}
            </div>
            {event.notes && <div className="detail-field">
              <div className="detail-label">Notities</div>
              <div className="detail-value" style={{fontSize:13,color:'var(--ink2)',whiteSpace:'pre-wrap'}}>{event.notes}</div>
            </div>}
          </div>
        </div>

        {/* Assignments */}
        <div style={{marginTop:24}}>
          <div className="section-head">
            <div className="section-title" style={{fontSize:14}}>Bezetting ({myAss.length})</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setEditAss(null);setShowAssModal(true)}}>
              <IcPlus size={14}/>Personeel toevoegen
            </button>
          </div>
          {myAss.length===0
            ? <div style={{color:'var(--ink3)',fontSize:13,padding:'10px 0'}}>Nog niemand toegewezen</div>
            : <table className="tbl" style={{background:'transparent'}}>
                <thead><tr>
                  <th>Naam</th><th>Rol</th><th>Aanvangstijd</th><th>Eindtijd</th><th>Status</th><th>Vergoeding</th><th></th>
                </tr></thead>
                <tbody>
                  {myAss.map(a => {
                    const p = personnel.find(x=>x.id===a.personnelId)
                    return (
                      <tr key={a.id}>
                        <td style={{fontWeight:500}}>{p?.name||'Onbekend'}</td>
                        <td style={{color:'var(--ink2)'}}>{a.role||'—'}</td>
                        <td>{a.callTime||'—'}</td>
                        <td>{a.endTime||'—'}</td>
                        <td><span className="badge" style={{background:assStatusBg[a.status],color:assStatusColor[a.status]}}>{ASS_STATUS[a.status]||a.status}</span></td>
                        <td>{a.fee ? '€'+Number(a.fee).toLocaleString('nl-NL') : '—'}</td>
                        <td>
                          <div style={{display:'flex',gap:6}}>
                            <button className="btn btn-ghost btn-sm" onClick={()=>{setEditAss(a);setShowAssModal(true)}}><IcEdit size={13}/></button>
                            <button className="btn btn-ghost btn-sm" onClick={()=>delAss(a.id)}><IcTrash size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
          }
        </div>

        {/* ── Taken ───────────────────────────────────────────────────── */}
        <div style={{padding:'0 24px 8px'}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:1,marginBottom:12,marginTop:4}}>
            Taken checklist
          </div>
          {(eventTasks||[]).length === 0 && (
            <div style={{fontSize:13,color:'var(--ink3)',marginBottom:10}}>Nog geen taken voor dit evenement.</div>
          )}
          {(eventTasks||[]).sort((a,b)=>a.createdAt-b.createdAt).map(t => (
            <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
              <input type="checkbox" checked={t.done} onChange={()=>toggleTask(t)}
                style={{width:16,height:16,accentColor:'var(--accent)',cursor:'pointer',flexShrink:0}}/>
              <span style={{flex:1,fontSize:14,color:t.done?'var(--ink3)':'var(--ink)',
                textDecoration:t.done?'line-through':'none',lineHeight:1.4}}>
                {t.title}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={()=>delTask(t.id)} style={{padding:'2px 6px',opacity:.5}}>
                <IcTrash size={12}/>
              </button>
            </div>
          ))}
          <div style={{display:'flex',gap:8,marginTop:10}}>
            <input className="form-input" style={{flex:1,fontSize:13}} placeholder="Nieuwe taak toevoegen…"
              value={newTask} onChange={e=>setNewTask(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addTask())}/>
            <button className="btn btn-ghost btn-sm" onClick={addTask} disabled={addingTask||!newTask.trim()}>
              <IcPlus size={14}/>
            </button>
          </div>
        </div>
      </Modal>

      {showAssModal && (
        <AssignmentModal
          tid={tid} eventId={event.id} eventDate={event.date}
          eventTitle={event.title} eventLocation={event.location}
          personnel={personnel} existing={editAss}
          onSave={()=>{setShowAssModal(false); toast('Toewijzing opgeslagen')}}
          onClose={()=>setShowAssModal(false)}
        />
      )}
    </>
  )
}

// ─── EvenementenView ──────────────────────────────────────────────────────────
function EvenementenView({ tid, events, personnel, assignments, onOpenDetail, toast }) {
  const [showModal,  setShowModal]  = useState(false)
  const [editEvent,  setEditEvent]  = useState(null)
  const [filterStat, setFilterStat] = useState('alle')
  const [filterType, setFilterType] = useState('alle')
  const [query,      setQuery]      = useState('')

  const filtered = events
    .filter(e => filterStat==='alle' || e.status===filterStat)
    .filter(e => filterType==='alle' || e.type===filterType)
    .filter(e => !query || e.title.toLowerCase().includes(query.toLowerCase()) || (e.location||'').toLowerCase().includes(query.toLowerCase()) || (e.city||'').toLowerCase().includes(query.toLowerCase()))
    .sort((a,b) => a.date.localeCompare(b.date))

  const del = async ev => {
    if (!confirm(`"${ev.title}" verwijderen?`)) return
    await removeDoc(tid,'events',ev.id)
    toast('Evenement verwijderd')
  }

  return (
    <>
      <div className="ph" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <div className="ph-t">Evenementen</div>
          <div className="ph-s">{events.length} evenement{events.length!==1?'en':''} totaal</div>
        </div>
        <button className="btn btn-primary" style={{marginTop:4}} onClick={()=>{setEditEvent(null);setShowModal(true)}}>
          <IcPlus size={16}/>Nieuw evenement
        </button>
      </div>
      <div className="page-body">
        {/* Filters */}
        <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
          <input className="form-input" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Zoeken…" style={{width:200}}/>
          <div className="filter-bar" style={{marginBottom:0}}>
            {['alle','optie','definitief','gecancelled'].map(s=>(
              <button key={s} className={`filter-btn${filterStat===s?' active':''}`} onClick={()=>setFilterStat(s)}>
                {s.charAt(0).toUpperCase()+s.slice(1)}
              </button>
            ))}
          </div>
          <div className="filter-bar" style={{marginBottom:0}}>
            {['alle',...EVENT_TYPES].map(t=>(
              <button key={t} className={`filter-btn${filterType===t?' active':''}`} onClick={()=>setFilterType(t)}>
                {t.charAt(0).toUpperCase()+t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filtered.length===0
          ? <div className="empty"><div className="empty-icon">📅</div><div className="empty-text">Geen evenementen gevonden</div></div>
          : <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>
                  <th>Datum</th><th>Naam</th><th>Type</th><th>Locatie</th><th>Status</th><th>Tijden</th><th>Bezetting</th><th></th>
                </tr></thead>
                <tbody>
                  {filtered.map(ev => {
                    const ass = assignments.filter(a=>a.eventId===ev.id)
                    return (
                      <tr key={ev.id} style={{cursor:'pointer'}} onClick={()=>onOpenDetail(ev)}>
                        <td style={{whiteSpace:'nowrap',fontWeight:500}}>{fmtDate(ev.date)}</td>
                        <td style={{fontWeight:600,maxWidth:200}}>
                          <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ev.title}</div>
                          {ev.client?.name && <div style={{fontSize:11.5,color:'var(--ink3)',fontWeight:400}}>{ev.client.name}</div>}
                        </td>
                        <td><span style={{color:'var(--ink2)',fontSize:13}}>{ev.type}</span></td>
                        <td style={{color:'var(--ink2)',fontSize:13}}>{ev.location||ev.city||'—'}</td>
                        <td>
                          <span className="badge" style={{background:STATUS_BG[ev.status],color:STATUS_COLOR[ev.status]}}>
                            {ev.status}
                          </span>
                        </td>
                        <td style={{fontSize:13,color:'var(--ink2)',whiteSpace:'nowrap'}}>
                          {ev.startTime ? ev.startTime+(ev.endTime?'–'+ev.endTime:'') : '—'}
                        </td>
                        <td style={{fontSize:13,color:ass.length?'var(--ink2)':'var(--ink3)'}}>
                          {ass.length} pers.
                        </td>
                        <td onClick={e=>e.stopPropagation()}>
                          <div style={{display:'flex',gap:6}}>
                            <button className="btn btn-ghost btn-sm" onClick={()=>{setEditEvent(ev);setShowModal(true)}}><IcEdit size={13}/></button>
                            <button className="btn btn-ghost btn-sm" onClick={()=>del(ev)}><IcTrash size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
        }
      </div>

      {showModal && (
        <EventModal tid={tid} event={editEvent} onClose={()=>setShowModal(false)}
          onSave={()=>{setShowModal(false); toast('Evenement opgeslagen')}}/>
      )}
    </>
  )
}

// ─── PersoneelModal ───────────────────────────────────────────────────────────
function PersoneelModal({ tid, person, tenantName, onSave, onClose }) {
  const def = { id:'', name:'', email:'', phone:'', type:'freelancer', function:'', rate:'', notes:'', portalEnabled:false }
  const [f,           setF]           = useState({...def,...person})
  const [busy,        setBusy]        = useState(false)
  const [inviteBusy,  setInviteBusy]  = useState(false)
  const [inviteSent,  setInviteSent]  = useState(false)
  const set = (k,v) => setF(p=>({...p,[k]:v}))

  const hasPortal   = !!f.uid                           // al geaccepteerd
  const isInvited   = !!f.inviteToken && !f.uid         // uitgenodigd, nog niet geaccepteerd
  const canInvite   = f.email && !hasPortal && f.id     // kan worden uitgenodigd

  const submit = async e => {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true)
    try {
      const isNew = !f.id
      const newId = isNew ? uid() : f.id
      await saveDoc(tid,'personnel',{...f, id:newId, updatedAt:Date.now()})

      // Feature: auto-invite bij aanmaken nieuw personeelslid met e-mailadres
      if (isNew && f.email) {
        const token = uid()
        await saveDoc(tid,'personnel',{ id:newId, inviteToken:token, invitedAt:Date.now(), portalEnabled:true })
        sendInviteEmail({ name:f.name, email:f.email, inviteToken:token, tenantId:tid, bureauName:tenantName||'EventStaff' })
        onSave('Personeelslid aangemaakt + uitnodiging verstuurd!')
      } else {
        onSave()
      }
    } finally { setBusy(false) }
  }

  const sendInvite = async () => {
    if (!canInvite) return
    setInviteBusy(true)
    try {
      const token = uid()
      await saveDoc(tid,'personnel',{...f, inviteToken:token, invitedAt:Date.now(), portalEnabled:true})
      await sendInviteEmail({
        name: f.name, email: f.email,
        inviteToken: token, tenantId: tid,
        bureauName: tenantName || 'EventStaff',
      })
      setF(p=>({...p, inviteToken:token, portalEnabled:true}))
      setInviteSent(true)
    } finally { setInviteBusy(false) }
  }

  const portalStatusBadge = () => {
    if (hasPortal)   return <span className="badge" style={{background:'var(--green-light)',color:'var(--green)'}}>✓ Portaal actief</span>
    if (isInvited)   return <span className="badge" style={{background:'var(--orange-light)',color:'var(--orange)'}}>📧 Uitgenodigd</span>
    return <span className="badge" style={{background:'var(--bg)',color:'var(--ink3)'}}>Geen portaal</span>
  }

  return (
    <Modal title={f.id ? 'Personeelslid bewerken' : 'Nieuw personeelslid'} onClose={onClose} size="modal-md"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Opslaan…' : (!f.id && f.email) ? '📧 Toevoegen & uitnodigen' : 'Opslaan'}
        </button>
      </>}>
      <form onSubmit={submit}>
        <div className="form-row">
          <div><label className="form-label">Naam *</label>
            <input className="form-input" value={f.name} onChange={e=>set('name',e.target.value)} required autoFocus/></div>
        </div>
        <div className="form-row cols2">
          <div><label className="form-label">Type</label>
            <select className="form-input" value={f.type} onChange={e=>set('type',e.target.value)}>
              {Object.entries(PERS_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="form-label">Functie / rol</label>
            <input className="form-input" value={f.function} onChange={e=>set('function',e.target.value)} placeholder="bv. DJ, Fotograaf, Catering"/></div>
        </div>
        <div className="form-row cols2">
          <div><label className="form-label">E-mailadres</label>
            <input className="form-input" type="email" value={f.email} onChange={e=>set('email',e.target.value)}/></div>
          <div><label className="form-label">Telefoonnummer</label>
            <input className="form-input" type="tel" value={f.phone} onChange={e=>set('phone',e.target.value)}/></div>
        </div>
        <div className="form-row cols2" style={{marginBottom:0}}>
          <div><label className="form-label">Dagvergoeding / uurtarief (€)</label>
            <input className="form-input" type="number" min="0" value={f.rate} onChange={e=>set('rate',e.target.value)} placeholder="0"/></div>
        </div>
        <div className="form-row" style={{marginBottom:0}}>
          <div><label className="form-label">Notities</label>
            <textarea className="form-input" value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Bijzonderheden, skills, voorkeuren…"/></div>
        </div>

        {/* Portaalsectie — alleen bij bestaande records */}
        {f.id && (
          <>
            <div className="form-section">Portaaltoegang</div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
              <div>
                {portalStatusBadge()}
                {hasPortal && <div style={{fontSize:12,color:'var(--ink3)',marginTop:4}}>Inloggen via {f.email}</div>}
                {isInvited && !inviteSent && <div style={{fontSize:12,color:'var(--ink3)',marginTop:4}}>Uitnodiging verstuurd — nog niet geaccepteerd</div>}
                {inviteSent && <div style={{fontSize:12,color:'var(--green)',marginTop:4}}>✓ Uitnodiging zojuist verstuurd naar {f.email}</div>}
                {!hasPortal && !isInvited && !f.email && <div style={{fontSize:12,color:'var(--ink3)',marginTop:4}}>Voeg een e-mailadres toe om uit te nodigen</div>}
              </div>
              {canInvite && !hasPortal && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={sendInvite} disabled={inviteBusy||inviteSent}>
                  {inviteBusy ? 'Versturen…' : inviteSent ? '✓ Verstuurd' : isInvited ? '↩ Opnieuw uitnodigen' : '📧 Uitnodiging sturen'}
                </button>
              )}
            </div>
          </>
        )}
        {!f.id && f.email && (
          <div style={{fontSize:12,color:'var(--ink2)',marginTop:12,padding:'10px 14px',background:'var(--bg)',borderRadius:8}}>
            📧 Er wordt automatisch een uitnodigingsmail verstuurd na het aanmaken.
          </div>
        )}
      </form>
    </Modal>
  )
}

// ─── PersoneelView ────────────────────────────────────────────────────────────
function PersoneelView({ tid, personnel, assignments, events, tenantName, toast, currentUserUid }) {
  const [showModal,   setShowModal]   = useState(false)
  const [editPerson,  setEditPerson]  = useState(null)
  const [filterType,  setFilterType]  = useState('alle')
  const [query,       setQuery]       = useState('')

  const filtered = personnel
    .filter(p => filterType==='alle' || p.type===filterType)
    .filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()) || (p.function||'').toLowerCase().includes(query.toLowerCase()))
    .sort((a,b) => a.name.localeCompare(b.name,'nl'))

  const del = async p => {
    if (p.uid && p.uid === currentUserUid) {
      alert('Je kunt je eigen account niet verwijderen.')
      return
    }
    if (!confirm(`"${p.name}" verwijderen?`)) return
    await removeDoc(tid,'personnel',p.id)
    toast('Personeelslid verwijderd')
  }

  const upcoming = (pid) => assignments
    .filter(a => a.personnelId===pid)
    .filter(a => { const ev = events.find(e=>e.id===a.eventId); return ev && ev.date >= toDay() })
    .length

  return (
    <>
      <div className="ph" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <div className="ph-t">Personeel</div>
          <div className="ph-s">{personnel.length} personeelslid{personnel.length!==1?'en':''}</div>
        </div>
        <button className="btn btn-primary" style={{marginTop:4}} onClick={()=>{setEditPerson(null);setShowModal(true)}}>
          <IcPlus size={16}/>Toevoegen
        </button>
      </div>
      <div className="page-body">
        <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
          <input className="form-input" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Zoeken op naam of functie…" style={{width:220}}/>
          <div className="filter-bar" style={{marginBottom:0}}>
            {['alle',...Object.keys(PERS_TYPES)].map(t=>(
              <button key={t} className={`filter-btn${filterType===t?' active':''}`} onClick={()=>setFilterType(t)}>
                {t==='alle' ? 'Alle' : PERS_TYPES[t]}
              </button>
            ))}
          </div>
        </div>

        {filtered.length===0
          ? <div className="empty"><div className="empty-icon">👥</div><div className="empty-text">Geen personeelsleden gevonden</div></div>
          : <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>
                  <th>Naam</th><th>Type</th><th>Functie</th><th>Contact</th><th>Tarief</th><th>Portaal</th><th>Komende events</th><th></th>
                </tr></thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.name}</td>
                      <td><span className="badge" style={{background:'var(--bg)',color:'var(--ink2)'}}>{PERS_TYPES[p.type]||p.type}</span></td>
                      <td style={{color:'var(--ink2)'}}>{p.function||'—'}</td>
                      <td style={{fontSize:13}}>
                        {p.email && <div><a href={`mailto:${p.email}`}>{p.email}</a></div>}
                        {p.phone && <div style={{color:'var(--ink2)'}}>{p.phone}</div>}
                        {!p.email && !p.phone && <span style={{color:'var(--ink3)'}}>—</span>}
                      </td>
                      <td style={{color:'var(--ink2)'}}>{p.rate ? '€'+Number(p.rate).toLocaleString('nl-NL') : '—'}</td>
                      <td>
                        {p.uid
                          ? <span className="badge" style={{background:'var(--green-light)',color:'var(--green)'}}>✓ Actief</span>
                          : p.inviteToken
                          ? <span className="badge" style={{background:'var(--orange-light)',color:'var(--orange)'}}>📧 Uitgenodigd</span>
                          : <span style={{color:'var(--ink3)',fontSize:12}}>—</span>
                        }
                      </td>
                      <td style={{color:'var(--ink2)'}}>{upcoming(p.id)}</td>
                      <td>
                        <div style={{display:'flex',gap:6}}>
                          <button className="btn btn-ghost btn-sm" onClick={()=>{setEditPerson(p);setShowModal(true)}}><IcEdit size={13}/></button>
                          <button className="btn btn-ghost btn-sm" onClick={()=>del(p)}
                            disabled={!!(p.uid && p.uid===currentUserUid)}
                            title={p.uid && p.uid===currentUserUid ? 'Je kunt jezelf niet verwijderen' : undefined}>
                            <IcTrash size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      {showModal && (
        <PersoneelModal tid={tid} person={editPerson} tenantName={tenantName}
          onClose={()=>setShowModal(false)}
          onSave={msg=>{setShowModal(false); toast(msg||'Personeelslid opgeslagen')}}/>
      )}
    </>
  )
}

// ─── AvailabilityModal ────────────────────────────────────────────────────────
function AvailabilityModal({ tid, record, personnel, defaultPersonnelId, onSave, onClose }) {
  const def = {
    id:'', personnelId: defaultPersonnelId||'', date:'', status:'beschikbaar',
    timeFrom:'', timeTo:'', notes:'',
  }
  const [f, setF]   = useState({...def, ...record})
  const [busy, setBusy] = useState(false)
  const set = (k,v) => setF(p=>({...p,[k]:v}))

  const submit = async e => {
    e.preventDefault()
    if (!f.personnelId || !f.date || !f.status) return
    setBusy(true)
    try {
      await saveDoc(tid, 'availability', {...f, updatedAt: Date.now()})
      onSave()
    } finally { setBusy(false) }
  }

  return (
    <Modal
      title={f.id ? 'Beschikbaarheid bewerken' : 'Beschikbaarheid toevoegen'}
      onClose={onClose}
      size="modal-md"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy||!f.personnelId||!f.date}>
          {busy ? 'Opslaan…' : 'Opslaan'}
        </button>
      </>}
    >
      <form onSubmit={submit}>
        <div className="form-row">
          <div>
            <label className="form-label">Personeelslid *</label>
            <select className="form-input" value={f.personnelId} onChange={e=>set('personnelId',e.target.value)} required autoFocus>
              <option value="">— Kies persoon —</option>
              {[...personnel].sort((a,b)=>a.name.localeCompare(b.name,'nl')).map(p=>(
                <option key={p.id} value={p.id}>{p.name} · {PERS_TYPES[p.type]||p.type}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row cols2">
          <div>
            <label className="form-label">Datum *</label>
            <input className="form-input" type="date" value={f.date} onChange={e=>set('date',e.target.value)} required/>
          </div>
          <div>
            <label className="form-label">Status *</label>
            <select className="form-input" value={f.status} onChange={e=>set('status',e.target.value)}>
              {Object.entries(AV_STATUS).map(([k,v])=>(
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-section">Tijden</div>
        <div className="form-row cols2">
          <div>
            <label className="form-label">Beschikbaar van</label>
            <input className="form-input" type="time" value={f.timeFrom} onChange={e=>set('timeFrom',e.target.value)}/>
          </div>
          <div>
            <label className="form-label">Beschikbaar tot</label>
            <input className="form-input" type="time" value={f.timeTo} onChange={e=>set('timeTo',e.target.value)}/>
          </div>
        </div>

        <div className="form-row" style={{marginBottom:0}}>
          <div>
            <label className="form-label">Notities / bijzonderheden</label>
            <textarea className="form-input" value={f.notes} onChange={e=>set('notes',e.target.value)}
              placeholder="bv. Alleen 's avonds, auto beschikbaar, etc."/>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ─── BeschikbaarheidView ──────────────────────────────────────────────────────
function BeschikbaarheidView({ tid, personnel, availability, events, toast }) {
  const [tab,        setTab]        = useState('toekomend')  // toekomend | verleden | alle
  const [filterType, setFilterType] = useState('alle')
  const [query,      setQuery]      = useState('')
  const [showModal,  setShowModal]  = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [defaultPid, setDefaultPid] = useState('')
  const now = toDay()

  // Filter en sorteer beschikbaarheidsrecords
  const records = availability
    .filter(r => {
      if (tab === 'toekomend') return r.date >= now
      if (tab === 'verleden')  return r.date <  now
      return true
    })
    .filter(r => {
      if (filterType === 'alle') return true
      const p = personnel.find(x => x.id === r.personnelId)
      return p?.type === filterType
    })
    .filter(r => {
      if (!query) return true
      const p = personnel.find(x => x.id === r.personnelId)
      return (
        p?.name.toLowerCase().includes(query.toLowerCase()) ||
        (r.notes||'').toLowerCase().includes(query.toLowerCase())
      )
    })
    .sort((a,b) => {
      const d = a.date.localeCompare(b.date)
      if (d !== 0) return tab === 'verleden' ? -d : d  // verleden: nieuwste eerst
      const pa = personnel.find(x=>x.id===a.personnelId)
      const pb = personnel.find(x=>x.id===b.personnelId)
      return (pa?.name||'').localeCompare(pb?.name||'','nl')
    })

  // Evenementdatums voor markering
  const eventDates = new Set(events.map(e=>e.date))

  const openNew = (pid='') => { setEditRecord(null); setDefaultPid(pid); setShowModal(true) }
  const openEdit = r => { setEditRecord(r); setDefaultPid(r.personnelId); setShowModal(true) }

  const del = async r => {
    const p = personnel.find(x=>x.id===r.personnelId)
    if (!confirm(`Beschikbaarheid van ${p?.name||'?'} op ${fmtDate(r.date)} verwijderen?`)) return
    await removeDoc(tid, 'availability', r.id)
    toast('Verwijderd')
  }

  // Vandaag beschikbaar overzicht voor de pageheader
  const vandaag = availability.filter(r => r.date === now)
  const vandaagBeschikbaar = vandaag.filter(r => r.status === 'beschikbaar').length

  return (
    <>
      <div className="ph" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <div className="ph-t">Beschikbaarheid</div>
          <div className="ph-s">
            {vandaagBeschikbaar > 0
              ? `${vandaagBeschikbaar} persoon${vandaagBeschikbaar!==1?'en':''} beschikbaar vandaag`
              : 'Beschikbaarheid van personeel per datum'
            }
          </div>
        </div>
        <button className="btn btn-primary" style={{marginTop:4}} onClick={()=>openNew()}>
          <IcPlus size={16}/>Toevoegen
        </button>
      </div>

      <div className="page-body">

        {/* Tabs: toekomend / verleden / alle */}
        <div style={{display:'flex',gap:0,marginBottom:16,borderBottom:'2px solid var(--border)'}}>
          {[
            {key:'toekomend', label:`Toekomend (${availability.filter(r=>r.date>=now).length})`},
            {key:'verleden',  label:`Verleden (${availability.filter(r=>r.date<now).length})`},
            {key:'alle',      label:`Alle (${availability.length})`},
          ].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{
              padding:'8px 18px', fontWeight:600, fontSize:13, border:'none', background:'none',
              cursor:'pointer', color: tab===t.key ? 'var(--accent)' : 'var(--ink3)',
              borderBottom: tab===t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom:'-2px',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Filterbar */}
        <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
          <input className="form-input" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Zoeken op naam of notitie…" style={{width:220}}/>
          <div className="filter-bar" style={{marginBottom:0}}>
            {['alle',...Object.keys(PERS_TYPES)].map(t=>(
              <button key={t} className={`filter-btn${filterType===t?' active':''}`} onClick={()=>setFilterType(t)}>
                {t==='alle' ? 'Alle typen' : PERS_TYPES[t]}
              </button>
            ))}
          </div>
          {/* Legenda */}
          <div style={{fontSize:12,color:'var(--ink3)',display:'flex',gap:12,marginLeft:'auto'}}>
            {Object.entries(AV_STATUS).map(([k,v])=>(
              <span key={k} style={{color:AV_COLOR[k]}}>■ {v}</span>
            ))}
          </div>
        </div>

        {records.length === 0
          ? (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div className="empty-text">
                {availability.length === 0
                  ? 'Nog geen beschikbaarheid ingevoerd'
                  : 'Geen resultaten voor deze filters'
                }
              </div>
              {availability.length === 0 && (
                <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>openNew()}>
                  <IcPlus size={16}/>Eerste invoer toevoegen
                </button>
              )}
            </div>
          )
          : (
            <div className="tbl-wrap">
              {records.map(r => {
                const person   = personnel.find(x=>x.id===r.personnelId)
                const dt       = new Date(r.date+'T12:00')
                const day      = dt.toLocaleDateString('nl-NL',{day:'numeric'})
                const mon      = dt.toLocaleDateString('nl-NL',{month:'short'})
                const dow      = dt.toLocaleDateString('nl-NL',{weekday:'short'})
                const isEvent  = eventDates.has(r.date)
                const barColor = AV_COLOR[r.status] || 'var(--ink3)'

                return (
                  <div key={r.id} className="av-row" onClick={()=>openEdit(r)}>
                    {/* Gekleurde statusbalk links */}
                    <div className="av-row-bar" style={{background:barColor}}/>
                    <div className="av-row-content">
                      {/* Datumblok */}
                      <div className="av-date-block">
                        <div className="day">{day}</div>
                        <div className="mon">{mon}</div>
                        <div className="dow">{dow}</div>
                      </div>

                      {/* Persoon + type */}
                      <div style={{flex:'0 0 200px',minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:14}}>{person?.name||'Onbekend'}</div>
                        <div style={{fontSize:12,color:'var(--ink3)'}}>{PERS_TYPES[person?.type]||person?.type||''}</div>
                        {person?.function && <div style={{fontSize:11.5,color:'var(--ink3)'}}>{person.function}</div>}
                      </div>

                      {/* Status badge */}
                      <div style={{flex:'0 0 140px'}}>
                        <span className="badge" style={{background:AV_BG[r.status],color:AV_COLOR[r.status],fontSize:13}}>
                          {AV_STATUS[r.status]||r.status}
                        </span>
                        {isEvent && (
                          <div style={{fontSize:11,color:'var(--accent)',marginTop:4}}>📅 event gepland</div>
                        )}
                      </div>

                      {/* Tijden */}
                      <div style={{flex:'0 0 120px',fontSize:13,color:'var(--ink2)'}}>
                        {r.timeFrom || r.timeTo
                          ? <>{r.timeFrom||'?'} – {r.timeTo||'?'}</>
                          : <span style={{color:'var(--ink3)'}}>Hele dag</span>
                        }
                      </div>

                      {/* Notities */}
                      <div style={{flex:1,minWidth:0}}>
                        {r.notes
                          ? <span style={{fontSize:13,color:'var(--ink2)',fontStyle:'italic',
                              overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                              {r.notes}
                            </span>
                          : null
                        }
                      </div>

                      {/* Acties */}
                      <div style={{display:'flex',gap:6,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(r)}>
                          <IcEdit size={13}/>
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>del(r)}>
                          <IcTrash size={13}/>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }

        {/* Per-persoon snelkoppelingen als er personeel is maar geen records */}
        {records.length === 0 && availability.length === 0 && personnel.length > 0 && (
          <div style={{marginTop:20}}>
            <div style={{fontSize:13,color:'var(--ink3)',marginBottom:10}}>Snel toevoegen per persoon:</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {[...personnel].sort((a,b)=>a.name.localeCompare(b.name,'nl')).map(p=>(
                <button key={p.id} className="btn btn-ghost btn-sm" onClick={()=>openNew(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <AvailabilityModal
          tid={tid}
          record={editRecord}
          personnel={personnel}
          defaultPersonnelId={defaultPid}
          onClose={()=>setShowModal(false)}
          onSave={()=>{ setShowModal(false); toast('Beschikbaarheid opgeslagen') }}
        />
      )}
    </>
  )
}

// ─── InviteAcceptScreen ───────────────────────────────────────────────────────
// Getoond als URL ?invite=TOKEN&tid=TID aanwezig is
function InviteAcceptScreen({ inviteToken, tenantId, onDone }) {
  const [personnel, setPersonnel] = useState(null)   // gevonden personeelslid
  const [notFound,  setNotFound]  = useState(false)
  const [pass,      setPass]      = useState('')
  const [pass2,     setPass2]     = useState('')
  const [err,       setErr]       = useState('')
  const [busy,      setBusy]      = useState(false)
  const [done,      setDone]      = useState(false)

  // Zoek het personeelslid op via inviteToken
  useEffect(() => {
    if (!tenantId || !inviteToken) { setNotFound(true); return }
    getDocs(tCol(tenantId,'personnel')).then(snap => {
      const found = snap.docs.map(d=>({id:d.id,...d.data()}))
        .find(p => p.inviteToken === inviteToken)
      if (found) setPersonnel(found)
      else setNotFound(true)
    })
  }, [inviteToken, tenantId])

  const submit = async e => {
    e.preventDefault()
    setErr('')
    if (pass !== pass2) { setErr('Wachtwoorden komen niet overeen.'); return }
    if (pass.length < 6) { setErr('Minimaal 6 tekens.'); return }
    setBusy(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, personnel.email, pass)
      // Koppel auth-uid aan personeelsdoc + aan /users
      await setDoc(tDoc(tenantId,'personnel',personnel.id), {
        uid: cred.user.uid, inviteToken: null, invitedAt: personnel.invitedAt,
        portalEnabled: true,
      }, { merge: true })
      await linkUser(cred.user.uid, tenantId, 'personnel')
      setDone(true)
      setTimeout(() => onDone(), 1500)
    } catch(ex) {
      const msgs = {
        'auth/email-already-in-use': 'Dit e-mailadres heeft al een account. Probeer in te loggen.',
        'auth/weak-password': 'Wachtwoord te zwak.',
      }
      setErr(msgs[ex.code] || ex.message)
    } finally { setBusy(false) }
  }

  if (notFound) return (
    <div className="login-wrap">
      <div className="login-box" style={{textAlign:'center'}}>
        <div className="login-logo">EventStaff</div>
        <div style={{marginTop:16,color:'var(--ink2)'}}>
          Deze uitnodigingslink is ongeldig of al gebruikt.
        </div>
        <button className="btn btn-ghost" style={{marginTop:20,width:'100%',justifyContent:'center'}}
          onClick={()=>window.location.href='/'}>Naar inlogpagina</button>
      </div>
    </div>
  )

  if (!personnel) return (
    <div className="login-wrap">
      <div style={{color:'var(--ink3)'}}>Uitnodiging valideren…</div>
    </div>
  )

  if (done) return (
    <div className="login-wrap">
      <div className="login-box" style={{textAlign:'center'}}>
        <div style={{fontSize:40,marginBottom:12}}>✅</div>
        <div style={{fontWeight:700,fontSize:18}}>Account aangemaakt!</div>
        <div style={{color:'var(--ink3)',marginTop:8}}>Je wordt automatisch ingelogd…</div>
      </div>
    </div>
  )

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">EventStaff</div>
        <div className="login-sub">Je bent uitgenodigd door een eventbureau</div>
        <div style={{background:'var(--bg)',borderRadius:8,padding:'12px 16px',marginBottom:20}}>
          <div style={{fontSize:12,color:'var(--ink3)',marginBottom:2}}>Welkom</div>
          <div style={{fontWeight:700}}>{personnel.name}</div>
          <div style={{fontSize:13,color:'var(--ink2)'}}>{personnel.email}</div>
          {personnel.function && <div style={{fontSize:12,color:'var(--ink3)'}}>{personnel.function}</div>}
        </div>
        <div style={{fontSize:13,color:'var(--ink2)',marginBottom:20}}>
          Kies een wachtwoord om je portaal te activeren.
        </div>
        {err && <div className="login-err">{err}</div>}
        <form onSubmit={submit}>
          <div className="form-row" style={{marginBottom:14}}>
            <div>
              <label className="form-label">Wachtwoord</label>
              <input className="form-input" type="password" value={pass}
                onChange={e=>setPass(e.target.value)} required minLength={6} autoFocus/>
            </div>
          </div>
          <div className="form-row" style={{marginBottom:24}}>
            <div>
              <label className="form-label">Wachtwoord herhalen</label>
              <input className="form-input" type="password" value={pass2}
                onChange={e=>setPass2(e.target.value)} required/>
            </div>
          </div>
          <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} disabled={busy}>
            {busy ? 'Account aanmaken…' : 'Portaal activeren'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── PersonnelPortal ──────────────────────────────────────────────────────────
// Eigen portaal voor ingelogd personeelslid
function PersonnelPortal({ tid, myPersonnel, allEvents, allAssignments, availability, toast, onLogout }) {
  const [tab,       setTab]       = useState('assignments')  // assignments | beschikbaarheid
  const [showAvMod, setShowAvMod] = useState(false)
  const [editAvRec, setEditAvRec] = useState(null)
  const now = toDay()

  // Eigen assignments
  const myAssignments = allAssignments
    .filter(a => a.personnelId === myPersonnel.id)
    .sort((a,b) => {
      const ea = allEvents.find(e=>e.id===a.eventId)
      const eb = allEvents.find(e=>e.id===b.eventId)
      return (ea?.date||'').localeCompare(eb?.date||'')
    })

  const upcoming = myAssignments.filter(a => {
    const ev = allEvents.find(e=>e.id===a.eventId)
    return ev && ev.date >= now && ev.status !== 'gecancelled'
  })
  const past = myAssignments.filter(a => {
    const ev = allEvents.find(e=>e.id===a.eventId)
    return ev && ev.date < now
  })

  // Eigen beschikbaarheid
  const myAv = availability.filter(r => r.personnelId === myPersonnel.id)

  // Bevestig / wijs af assignment
  const respondAssignment = async (ass, status) => {
    await saveDoc(tid, 'assignments', {...ass, status})
    toast(status === 'bevestigd' ? '✓ Bevestigd!' : '✗ Afgewezen')
  }

  const assStatusColor = {uitgenodigd:'var(--orange)',bevestigd:'var(--green)',afgewezen:'var(--red)'}
  const assStatusBg    = {uitgenodigd:'var(--orange-light)',bevestigd:'var(--green-light)',afgewezen:'var(--red-light)'}

  const renderAssignmentList = (list, showPast=false) => {
    if (list.length === 0) return (
      <div className="empty">
        <div className="empty-icon">{showPast ? '📁' : '🎉'}</div>
        <div className="empty-text">{showPast ? 'Geen verleden opdrachten' : 'Geen aankomende opdrachten'}</div>
      </div>
    )
    return (
      <div className="tbl-wrap">
        {list.map(a => {
          const ev = allEvents.find(e=>e.id===a.eventId)
          if (!ev) return null
          const dt  = new Date(ev.date+'T12:00')
          const day = dt.toLocaleDateString('nl-NL',{day:'numeric'})
          const mon = dt.toLocaleDateString('nl-NL',{month:'short'})
          const dow = dt.toLocaleDateString('nl-NL',{weekday:'short'})
          return (
            <div key={a.id} style={{
              display:'flex', alignItems:'center', gap:0,
              borderBottom:'1px solid var(--border)',
            }}>
              <div style={{width:4,alignSelf:'stretch',background:STATUS_COLOR[ev.status]||'var(--ink3)',flexShrink:0}}/>
              <div style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',flex:1,minWidth:0}}>
                {/* Datum */}
                <div style={{width:52,textAlign:'center',flexShrink:0}}>
                  <div style={{fontSize:22,fontWeight:800,fontFamily:"'Sora',sans-serif",lineHeight:1}}>{day}</div>
                  <div style={{fontSize:11,color:'var(--ink3)',textTransform:'uppercase'}}>{mon}</div>
                  <div style={{fontSize:10,color:'var(--ink3)'}}>{dow}</div>
                </div>
                {/* Event info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:15}}>{ev.title}</div>
                  <div style={{fontSize:12.5,color:'var(--ink2)',marginTop:2}}>
                    {ev.location||ev.city||''}
                    {a.role ? ` · ${a.role}` : ''}
                    {a.callTime ? ` · aanwezig ${a.callTime}` : ev.startTime ? ` · start ${ev.startTime}` : ''}
                  </div>
                  {ev.notes && <div style={{fontSize:12,color:'var(--ink3)',marginTop:4,fontStyle:'italic'}}>{ev.notes}</div>}
                </div>
                {/* Status + knoppen */}
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8,flexShrink:0}}>
                  <span className="badge" style={{background:assStatusBg[a.status],color:assStatusColor[a.status]}}>
                    {ASS_STATUS[a.status]||a.status}
                  </span>
                  {!showPast && a.status === 'uitgenodigd' && (
                    <div style={{display:'flex',gap:6}}>
                      <button className="btn btn-sm" style={{background:'var(--green-light)',color:'var(--green)'}}
                        onClick={()=>respondAssignment(a,'bevestigd')}>
                        <IcCheck size={13}/>Bevestigen
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        onClick={()=>respondAssignment(a,'afgewezen')}>
                        Afwijzen
                      </button>
                    </div>
                  )}
                  {!showPast && a.status === 'bevestigd' && (
                    <button className="btn btn-ghost btn-sm"
                      onClick={()=>respondAssignment(a,'afgewezen')}>
                      Afzeggen
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <style>{CSS}</style>
      <div style={{minHeight:'100vh',background:'var(--bg)'}}>
        {/* Header */}
        <div style={{
          background:'var(--card)', borderBottom:'1px solid var(--border)',
          padding:'14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,color:'var(--accent)',fontSize:18}}>EventStaff</div>
            <div style={{width:1,height:20,background:'var(--border)'}}/>
            <div>
              <div style={{fontWeight:600,fontSize:14}}>{myPersonnel.name}</div>
              <div style={{fontSize:12,color:'var(--ink3)'}}>{PERS_TYPES[myPersonnel.type]||''}{myPersonnel.function ? ' · '+myPersonnel.function : ''}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}><IcLogout size={14}/>Uitloggen</button>
        </div>

        {/* Stats */}
        <div style={{padding:'20px 24px 0'}}>
          <div className="stats" style={{gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))'}}>
            <div className="stat">
              <div className="stat-n" style={{color:'var(--orange)'}}>{upcoming.filter(a=>a.status==='uitgenodigd').length}</div>
              <div className="stat-l">Open uitnodigingen</div>
            </div>
            <div className="stat">
              <div className="stat-n" style={{color:'var(--green)'}}>{upcoming.filter(a=>a.status==='bevestigd').length}</div>
              <div className="stat-l">Bevestigd</div>
            </div>
            <div className="stat">
              <div className="stat-n">{myAv.filter(r=>r.date>=now&&r.status==='beschikbaar').length}</div>
              <div className="stat-l">Beschikbaar (komend)</div>
            </div>
            <div className="stat">
              <div className="stat-n">{past.length}</div>
              <div className="stat-l">Verleden opdrachten</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{padding:'0 24px',borderBottom:'2px solid var(--border)',display:'flex',gap:0,marginTop:16}}>
          {[
            {key:'assignments', label:`Opdrachten (${myAssignments.length})`},
            {key:'beschikbaarheid', label:`Mijn beschikbaarheid (${myAv.length})`},
          ].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{
              padding:'10px 20px', fontWeight:600, fontSize:13, border:'none',
              background:'none', cursor:'pointer',
              color: tab===t.key ? 'var(--accent)' : 'var(--ink3)',
              borderBottom: tab===t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom:'-2px',
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{padding:'20px 24px'}}>
          {/* Opdrachten tab */}
          {tab === 'assignments' && (
            <>
              {upcoming.filter(a=>a.status==='uitgenodigd').length > 0 && (
                <div style={{
                  background:'var(--orange-light)',border:'1px solid var(--orange)',
                  borderRadius:10,padding:'14px 18px',marginBottom:20,fontSize:13,
                }}>
                  <strong>Je hebt {upcoming.filter(a=>a.status==='uitgenodigd').length} open uitnodiging{upcoming.filter(a=>a.status==='uitgenodigd').length!==1?'en':''}</strong> — bevestig of wijs af hieronder.
                </div>
              )}
              <div className="section-head" style={{marginBottom:12}}>
                <div className="section-title" style={{fontSize:15}}>Aankomend</div>
              </div>
              {renderAssignmentList(upcoming)}

              {past.length > 0 && (
                <>
                  <div className="section-head" style={{marginTop:28,marginBottom:12}}>
                    <div className="section-title" style={{fontSize:15,color:'var(--ink3)'}}>Verleden</div>
                  </div>
                  {renderAssignmentList(past, true)}
                </>
              )}
            </>
          )}

          {/* Beschikbaarheid tab */}
          {tab === 'beschikbaarheid' && (
            <>
              <div className="section-head" style={{marginBottom:16}}>
                <div className="section-title" style={{fontSize:15}}>Mijn beschikbaarheid</div>
                <button className="btn btn-primary btn-sm" onClick={()=>{setEditAvRec(null);setShowAvMod(true)}}>
                  <IcPlus size={14}/>Toevoegen
                </button>
              </div>
              <BeschikbaarheidView
                tid={tid}
                personnel={[myPersonnel]}
                availability={myAv}
                events={allEvents}
                toast={toast}
              />
            </>
          )}
        </div>
      </div>

      {showAvMod && (
        <AvailabilityModal
          tid={tid}
          record={editAvRec}
          personnel={[myPersonnel]}
          defaultPersonnelId={myPersonnel.id}
          onClose={()=>setShowAvMod(false)}
          onSave={()=>{ setShowAvMod(false); toast('Beschikbaarheid opgeslagen') }}
        />
      )}
    </>
  )
}

// ─── BeheerView (superadmin) ──────────────────────────────────────────────────
function BeheerView({ onImpersonate }) {
  const [tenants, setTenants] = useState([])
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    getDocs(collection(db,'tenants')).then(snap => {
      setTenants(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.name||'').localeCompare(b.name||'','nl')))
      setBusy(false)
    })
  }, [])

  return (
    <>
      <div className="ph">
        <div className="ph-t">Beheerpaneel</div>
        <div className="ph-s">Superadmin — alle tenants</div>
      </div>
      <div className="page-body">
        {busy
          ? <div style={{color:'var(--ink3)'}}>Laden…</div>
          : <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Bureau</th><th>Stad</th><th>Plan</th><th>Aangemaakt</th><th></th></tr></thead>
                <tbody>
                  {tenants.map(t=>(
                    <tr key={t.id}>
                      <td style={{fontWeight:600}}>{t.name||'—'}</td>
                      <td>{t.city||'—'}</td>
                      <td><span className="badge" style={{background:'var(--bg)',color:'var(--ink2)'}}>{t.plan||'gratis'}</span></td>
                      <td style={{fontSize:13,color:'var(--ink3)'}}>{t.createdAt ? new Date(t.createdAt).toLocaleDateString('nl-NL') : '—'}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={()=>onImpersonate(t.id)}>
                          Inloggen als bureau
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>
    </>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [authUser,    setAuthUser]    = useState(undefined)   // undefined=loading
  const [tenantId,    setTenantId]    = useState(null)
  const [tenantName,  setTenantName]  = useState('')
  const [userRole,    setUserRole]    = useState(null)        // 'admin'|'planner'|'personnel'
  const [myPersonnel, setMyPersonnel] = useState(null)
  const [data, setData] = useState({ events:[], personnel:[], assignments:[], availability:[], eventTasks:[] })
  const [view,        setView]        = useState('dashboard')
  const [loading,     setLoading]     = useState(true)
  const [toastMsg,    setToastMsg]    = useState(null)
  const [collapsed,   setCollapsed]   = useState(false)
  const [showRegister,setShowRegister]= useState(false)
  const [selectedEvId,setSelectedEvId]= useState(null)
  const [showDetail,  setShowDetail]  = useState(false)
  const [editEvent,   setEditEvent]   = useState(null)
  const [showEditEv,  setShowEditEv]  = useState(false)
  const unsubsRef = useRef([])

  // ── Invite URL params ──────────────────────────────────────────────────────
  const _params     = new URLSearchParams(window.location.search)
  const inviteToken = _params.get('invite')
  const inviteTid   = _params.get('tid')

  const toast = msg => { setToastMsg(null); setTimeout(()=>setToastMsg(msg), 10) }

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user ?? null)
      if (!user) { setTenantId(null); setData({events:[],personnel:[],assignments:[],availability:[]}); setLoading(false) }
    })
    return unsub
  }, [])

  // ── Fetch tenantId + role ──────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return
    if (authUser.email === SUPERADMIN) { setLoading(false); return }
    getDoc(doc(db,'users',authUser.uid)).then(snap => {
      if (snap.exists() && snap.data().tenantId) {
        const ud = snap.data()
        setTenantId(ud.tenantId)
        setUserRole(ud.role || 'admin')
      } else {
        setLoading(false) // No tenant → onboarding
      }
    })
  }, [authUser])

  // ── Realtime listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return
    unsubsRef.current.forEach(u=>u())

    const sub = (col,key) => onSnapshot(tCol(tenantId,col), snap => {
      const docs = snap.docs.map(d=>({id:d.id,...d.data()}))
      setData(p=>({...p,[key]:docs}))
    })

    unsubsRef.current = [
      sub('events','events'),
      sub('personnel','personnel'),
      sub('assignments','assignments'),
      sub('availability','availability'),
      sub('eventTasks','eventTasks'),
    ]
    setLoading(false)
    return () => unsubsRef.current.forEach(u=>u())
  }, [tenantId])

  // ── Load tenantName ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return
    getDoc(tRef(tenantId)).then(snap => {
      if (snap.exists()) setTenantName(snap.data().name || '')
    })
  }, [tenantId])

  // ── Resolve myPersonnel (for personnel role) ───────────────────────────────
  useEffect(() => {
    if (userRole !== 'personnel' || !authUser || !data.personnel.length) return
    const found = data.personnel.find(p => p.uid === authUser.uid)
    if (found) setMyPersonnel(found)
  }, [userRole, authUser, data.personnel])

  // ── Superadmin impersonation ───────────────────────────────────────────────
  const impersonate = tid => {
    sessionStorage.setItem('es_impersonate', tid)
    setTenantId(tid)
  }
  useEffect(() => {
    if (authUser?.email === SUPERADMIN) {
      const imp = sessionStorage.getItem('es_impersonate')
      if (imp) setTenantId(imp)
    }
  }, [authUser])

  const logout = async () => {
    sessionStorage.removeItem('es_impersonate')
    await signOut(auth)
    setTenantId(null)
    setView('dashboard')
  }

  const selectedEvent = data.events.find(e=>e.id===selectedEvId)

  const openDetail = ev => { setSelectedEvId(ev.id); setShowDetail(true) }

  const handleSetView = v => {
    setView(v)
    if (v==='event-detail') { setShowDetail(true) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authUser === undefined || loading) {
    return (
      <>
        <style>{CSS}</style>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--ink3)'}}>
          Laden…
        </div>
      </>
    )
  }

  if (!authUser) {
    // Invite link: show account creation screen
    if (inviteToken && inviteTid) {
      return (
        <>
          <style>{CSS}</style>
          <InviteAcceptScreen
            inviteToken={inviteToken}
            tenantId={inviteTid}
            onDone={() => { window.history.replaceState({}, '', '/') }}
          />
        </>
      )
    }
    return (
      <>
        <style>{CSS}</style>
        {showRegister
          ? <OnboardingScreen onDone={tid=>{setTenantId(tid);setShowRegister(false)}}/>
          : <LoginScreen onRegister={()=>setShowRegister(true)}/>
        }
      </>
    )
  }

  if (authUser.email === SUPERADMIN && !tenantId) {
    return (
      <>
        <style>{CSS}</style>
        <div className="layout">
          <div className={`sb${collapsed?' col':''}`}>
            <div className="sb-logo"><IcCalendar size={22}/><span>EventStaff</span></div>
            <div className="sb-nav">
              <button className="sb-item active"><IcShield size={18}/><span>Beheer</span></button>
            </div>
            <div className="sb-bottom">
              <button className="sb-item" onClick={logout}><IcLogout size={18}/><span>Uitloggen</span></button>
            </div>
          </div>
          <div className="main">
            <BeheerView onImpersonate={impersonate}/>
          </div>
        </div>
      </>
    )
  }

  if (authUser && !tenantId) {
    return (
      <>
        <style>{CSS}</style>
        <OnboardingScreen onDone={tid=>{ setTenantId(tid) }}/>
      </>
    )
  }

  // Personnel portaal — eigen beperkte weergave
  if (userRole === 'personnel') {
    return (
      <>
        <style>{CSS}</style>
        {myPersonnel
          ? <PersonnelPortal
              tid={tenantId}
              myPersonnel={myPersonnel}
              allEvents={data.events}
              allAssignments={data.assignments}
              availability={data.availability}
              toast={toast}
              onLogout={logout}
            />
          : <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--ink3)'}}>
              Portaal laden…
            </div>
        }
        {toastMsg && <Toast msg={toastMsg} onClose={()=>setToastMsg(null)}/>}
      </>
    )
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="layout">
        <Sidebar
          view={view} setView={v=>{setView(v);setShowDetail(false)}}
          onLogout={logout} isSuperadmin={authUser.email===SUPERADMIN}
          collapsed={collapsed} setCollapsed={setCollapsed}
        />
        <div className="main">
          {view==='dashboard' && (
            <DashboardView
              events={data.events} personnel={data.personnel} assignments={data.assignments}
              setView={handleSetView} setSelectedEventId={setSelectedEvId}
            />
          )}
          {view==='evenementen' && (
            <EvenementenView
              tid={tenantId} events={data.events} personnel={data.personnel}
              assignments={data.assignments} onOpenDetail={openDetail} toast={toast}
            />
          )}
          {view==='personeel' && (
            <PersoneelView
              tid={tenantId} personnel={data.personnel} assignments={data.assignments}
              events={data.events} tenantName={tenantName} toast={toast}
              currentUserUid={authUser?.uid}
            />
          )}
          {view==='beschikbaarheid' && (
            <BeschikbaarheidView
              tid={tenantId} personnel={data.personnel} availability={data.availability}
              events={data.events} toast={toast}
            />
          )}
          {view==='beheer' && authUser.email===SUPERADMIN && (
            <BeheerView onImpersonate={tid=>{impersonate(tid);setView('dashboard')}}/>
          )}
        </div>
      </div>

      {/* Event detail panel */}
      {showDetail && selectedEvent && (
        <EventDetailPanel
          tid={tenantId} event={selectedEvent}
          assignments={data.assignments} personnel={data.personnel}
          eventTasks={data.eventTasks.filter(t=>t.eventId===selectedEvent.id)}
          toast={toast}
          onClose={()=>setShowDetail(false)}
          onEdit={()=>{ setEditEvent(selectedEvent); setShowDetail(false); setShowEditEv(true) }}
          onDelete={async()=>{
            if (!confirm(`"${selectedEvent.title}" verwijderen?`)) return
            await removeDoc(tenantId,'events',selectedEvent.id)
            setShowDetail(false)
            toast('Evenement verwijderd')
          }}
        />
      )}
      {showEditEv && editEvent && (
        <EventModal tid={tenantId} event={editEvent}
          onClose={()=>setShowEditEv(false)}
          onSave={()=>{ setShowEditEv(false); toast('Evenement opgeslagen') }}
        />
      )}

      {toastMsg && <Toast msg={toastMsg} onClose={()=>setToastMsg(null)}/>}
    </>
  )
}
