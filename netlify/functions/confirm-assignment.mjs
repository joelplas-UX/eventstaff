/**
 * Netlify Function v2 — GET /.netlify/functions/confirm-assignment
 *
 * Query params:
 *   token — de assignment-bevestigingstoken (uit de e-mail)
 *   r     — 'bevestigd' | 'afgewezen'
 *
 * Werking:
 * 1. Leest token uit top-level Firestore-collectie assignmentTokens/{token}
 * 2. Werkt de assignment-status bij in tenants/{tid}/assignments/{id}
 * 3. Verwijdert het token (eenmalig gebruik)
 * 4. Toont een HTML-bevestigingspagina + auto-redirect naar de app
 *
 * Geen login vereist — token is het geheim.
 *
 * Benodigde env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore }                  from 'firebase-admin/firestore'

const APP_URL = process.env.VITE_APP_URL || process.env.URL || 'https://eventstaff-app.netlify.app'

const VALID_RESPONSES = ['bevestigd', 'afgewezen']
const RESPONSE_MSG    = {
  bevestigd: 'Je aanwezigheid is bevestigd!',
  afgewezen: 'Je hebt de opdracht afgewezen.',
}
const RESPONSE_ICON = { bevestigd: '✓', afgewezen: '✗' }
const RESPONSE_COLOR = { bevestigd: '#22c55e', afgewezen: '#ef4444' }

// ── Firebase Admin init ────────────────────────────────────────────────────────

function getDb() {
  const projectId   = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials not configured')
  }
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  }
  return getFirestore()
}

// ── HTML helper ────────────────────────────────────────────────────────────────

function htmlPage(message, icon = '✓', color = '#22c55e', isError = false) {
  return new Response(
    `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  ${!isError ? `<meta http-equiv="refresh" content="4;url=${APP_URL}">` : ''}
  <title>EventStaff</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,Arial,sans-serif;background:#f8f7f4;
         display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{background:#fff;border-radius:16px;padding:40px 32px;text-align:center;
          box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:400px;width:100%}
    .logo{color:#2563eb;font-size:22px;font-weight:800;margin-bottom:20px}
    .icon{font-size:56px;margin-bottom:16px}
    .msg{font-size:18px;font-weight:700;margin-bottom:8px;color:${color}}
    .sub{font-size:14px;color:#6b7280}
    .link{display:inline-block;margin-top:20px;color:#2563eb;font-size:13px;text-decoration:none}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">EventStaff</div>
    <div class="icon">${icon}</div>
    <div class="msg">${message}</div>
    ${!isError ? '<div class="sub">Je wordt over 4 seconden doorgestuurd…</div>' : ''}
    <a class="link" href="${APP_URL}">Naar de app →</a>
  </div>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const url      = new URL(req.url)
  const token    = url.searchParams.get('token')
  const response = url.searchParams.get('r')

  if (!token || !VALID_RESPONSES.includes(response)) {
    return htmlPage('Ongeldige link.', '⚠️', '#ef4444', true)
  }

  let db
  try { db = getDb() } catch (e) {
    console.error('Admin SDK init fout:', e)
    return htmlPage('Serverfout — probeer het later.', '⚠️', '#ef4444', true)
  }

  const tokenRef  = db.collection('assignmentTokens').doc(token)
  const tokenSnap = await tokenRef.get()

  if (!tokenSnap.exists) {
    return htmlPage('Deze link is ongeldig of al eerder gebruikt.', '⚠️', '#ef4444', true)
  }

  const { tenantId, assignmentId, expiresAt } = tokenSnap.data()

  if (expiresAt < Date.now()) {
    await tokenRef.delete()
    return htmlPage('Deze link is verlopen. Neem contact op met je bureau.', '⏱', '#f59e0b', true)
  }

  // Update assignment + verwijder token (parallel)
  await Promise.all([
    db.doc(`tenants/${tenantId}/assignments/${assignmentId}`).update({ status: response }),
    tokenRef.delete(),
  ])

  return htmlPage(
    RESPONSE_MSG[response],
    RESPONSE_ICON[response],
    RESPONSE_COLOR[response],
  )
}
