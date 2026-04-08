/**
 * Netlify Function v2 — /.netlify/functions/magic-link
 *
 * POST { email }
 *   → Genereert token, slaat op in magicTokens, stuurt inloglink via Resend.
 *   → Retourneert altijd { ok: true } (ook als e-mail niet bestaat) om leakage te voorkomen.
 *
 * GET  ?token=...
 *   → Verifieert token, retourneert { customToken } voor signInWithCustomToken().
 *
 * Benodigde env vars:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   RESEND_API_KEY, RESEND_FROM (optioneel)
 *   VITE_APP_URL of URL (Netlify-siteURL)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth }      from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID }   from 'crypto'

const APP_URL    = process.env.VITE_APP_URL || process.env.URL || 'https://eventstaff-app.netlify.app'
const TOKEN_TTL  = 15 * 60 * 1000  // 15 minuten
const FROM       = process.env.RESEND_FROM || 'EventStaff <onboarding@resend.dev>'
const RESEND_KEY = process.env.RESEND_API_KEY || ''

// ── Firebase Admin init ────────────────────────────────────────────────────────

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })

async function sendMagicEmail(email, magicUrl) {
  if (!RESEND_KEY) return
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    FROM,
      to:      [email],
      subject: 'Jouw EventStaff inloglink',
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <div style="font-size:22px;font-weight:800;color:#2563eb;margin-bottom:16px">EventStaff</div>
          <h2 style="color:#1a1a1a;margin-bottom:8px;">Inloggen zonder wachtwoord</h2>
          <p style="color:#555;line-height:1.6;margin-bottom:24px;">
            Klik op de knop hieronder om direct in te loggen.<br>
            De link is <strong>15 minuten</strong> geldig en kan maar één keer worden gebruikt.
          </p>
          <a href="${magicUrl}"
             style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;
                    border-radius:8px;font-weight:700;text-decoration:none;font-size:15px;">
            Inloggen bij EventStaff →
          </a>
          <p style="color:#aaa;font-size:12px;margin-top:32px;">
            Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.
          </p>
        </div>
      `,
    }),
  })
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const url = new URL(req.url)

  // ── OPTIONS (CORS preflight) ──────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' },
    })
  }

  // ── POST — vraag magic link aan ───────────────────────────────────────────
  if (req.method === 'POST') {
    let email
    try { ({ email } = await req.json()) } catch { return json({ error: 'bad_request' }, 400) }
    if (!email) return json({ error: 'missing_email' }, 400)

    // Controleer of het e-mailadres bij een Firebase-account hoort
    // Stille success bij onbekend adres (geen user-enumeration)
    try {
      await getAuth().getUserByEmail(email)
    } catch {
      return json({ ok: true })
    }

    const token     = randomUUID()
    const expiresAt = Date.now() + TOKEN_TTL

    await getFirestore().collection('magicTokens').doc(token).set({
      email, expiresAt, used: false, createdAt: new Date(),
    })

    await sendMagicEmail(email, `${APP_URL}/?magic=${token}`)

    return json({ ok: true })
  }

  // ── GET — verifieer token → geef Firebase custom token terug ─────────────
  if (req.method === 'GET') {
    const token = url.searchParams.get('token')
    if (!token) return json({ error: 'missing_token' }, 400)

    const db      = getFirestore()
    const docRef  = db.collection('magicTokens').doc(token)
    const snap    = await docRef.get()

    if (!snap.exists)              return json({ error: 'invalid' }, 404)
    const data = snap.data()
    if (data.used)                 return json({ error: 'used' }, 410)
    if (data.expiresAt < Date.now()) return json({ error: 'expired' }, 410)

    // Zoek Firebase-account op basis van e-mail
    let uid
    try {
      const userRecord = await getAuth().getUserByEmail(data.email)
      uid = userRecord.uid
    } catch {
      return json({ error: 'no_account' }, 404)
    }

    // Markeer token als verbruikt vóórdat custom token wordt aangemaakt
    await docRef.update({ used: true })

    const customToken = await getAuth().createCustomToken(uid)
    return json({ customToken })
  }

  return new Response('Method not allowed', { status: 405 })
}
