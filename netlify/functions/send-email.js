// ─── Netlify Function: send-email ─────────────────────────────────────────────
// Stuurt e-mails via Resend. Verwacht POST body:
//   { type: 'invite'|'assignment', ...params }
//
// Env var nodig op Netlify: RESEND_API_KEY
// Afzender: stel RESEND_FROM in (bijv. "EventStaff <noreply@jouwdomein.nl>")
//            of laat leeg voor testmodus (onboarding@resend.dev)

const FROM    = process.env.RESEND_FROM    || 'EventStaff <onboarding@resend.dev>'
const API_KEY = process.env.RESEND_API_KEY || ''

function inviteHtml({ name, bureauName, inviteUrl }) {
  return `
<!DOCTYPE html><html lang="nl"><body style="font-family:Inter,Arial,sans-serif;background:#f8f7f4;margin:0;padding:32px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
  <div style="font-size:22px;font-weight:800;color:#2563eb;margin-bottom:8px">EventStaff</div>
  <h2 style="margin:0 0 16px;color:#1a1a1a">Je bent uitgenodigd!</h2>
  <p style="color:#5a5a5a;line-height:1.6">Hoi <strong>${name}</strong>,</p>
  <p style="color:#5a5a5a;line-height:1.6">
    <strong>${bureauName}</strong> heeft je uitgenodigd voor het EventStaff-portaal.
    Activeer je account via de knop hieronder.
  </p>
  <div style="text-align:center;margin:32px 0">
    <a href="${inviteUrl}"
       style="background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block">
      Portaal activeren
    </a>
  </div>
  <p style="color:#9a9a9a;font-size:12px">
    Of kopieer deze link in je browser:<br>
    <a href="${inviteUrl}" style="color:#2563eb">${inviteUrl}</a>
  </p>
  <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0">
  <p style="color:#9a9a9a;font-size:12px;margin:0">
    Deze uitnodiging is persoonlijk en kan maar één keer gebruikt worden.
  </p>
</div>
</body></html>`
}

function assignmentHtml({ name, eventTitle, eventDate, eventLocation, role, callTime, appUrl, confirmUrl, rejectUrl }) {
  const actieKnoppen = confirmUrl ? `
  <div style="text-align:center;margin:24px 0;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
    <a href="${confirmUrl}"
       style="background:#22c55e;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">
      ✓ Bevestigen
    </a>
    <a href="${rejectUrl}"
       style="background:#f1f5f9;color:#ef4444;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;border:1px solid #fecaca">
      ✗ Afwijzen
    </a>
  </div>
  <p style="color:#9a9a9a;font-size:12px;text-align:center;margin:0 0 16px">
    Of <a href="${appUrl}" style="color:#2563eb">bekijk de opdracht in je portaal</a>.
  </p>` : `
  <div style="text-align:center;margin:24px 0">
    <a href="${appUrl}"
       style="background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block">
      Opdracht bekijken
    </a>
  </div>
  <p style="color:#9a9a9a;font-size:12px;margin:0">Bevestig of wijs af via je portaal.</p>`

  return `
<!DOCTYPE html><html lang="nl"><body style="font-family:Inter,Arial,sans-serif;background:#f8f7f4;margin:0;padding:32px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
  <div style="font-size:22px;font-weight:800;color:#2563eb;margin-bottom:8px">EventStaff</div>
  <h2 style="margin:0 0 16px;color:#1a1a1a">Nieuwe opdracht voor jou</h2>
  <p style="color:#5a5a5a;line-height:1.6">Hoi <strong>${name}</strong>,</p>
  <p style="color:#5a5a5a;line-height:1.6">Je bent ingepland voor een evenement:</p>
  <div style="background:#f8f7f4;border-radius:8px;padding:20px;margin:20px 0">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="color:#9a9a9a;font-size:13px;padding:4px 0;width:120px">Evenement</td>
          <td style="font-weight:600;color:#1a1a1a">${eventTitle}</td></tr>
      <tr><td style="color:#9a9a9a;font-size:13px;padding:4px 0">Datum</td>
          <td style="color:#1a1a1a">${eventDate}</td></tr>
      ${eventLocation ? `<tr><td style="color:#9a9a9a;font-size:13px;padding:4px 0">Locatie</td>
          <td style="color:#1a1a1a">${eventLocation}</td></tr>` : ''}
      ${role ? `<tr><td style="color:#9a9a9a;font-size:13px;padding:4px 0">Rol</td>
          <td style="color:#1a1a1a">${role}</td></tr>` : ''}
      ${callTime ? `<tr><td style="color:#9a9a9a;font-size:13px;padding:4px 0">Aanwezigheid</td>
          <td style="color:#1a1a1a">${callTime}</td></tr>` : ''}
    </table>
  </div>
  ${actieKnoppen}
</div>
</body></html>`
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  if (!API_KEY) {
    console.error('RESEND_API_KEY niet ingesteld')
    return { statusCode: 500, body: 'E-mail niet geconfigureerd' }
  }

  let body
  try { body = JSON.parse(event.body || '{}') }
  catch { return { statusCode: 400, body: 'Ongeldige JSON' } }

  const { type } = body
  let payload

  if (type === 'invite') {
    const { name, email, bureauName, inviteUrl } = body
    if (!email) return { statusCode: 400, body: 'email verplicht' }
    payload = {
      from:    FROM,
      to:      [email],
      subject: `Je bent uitgenodigd door ${bureauName || 'een eventbureau'}`,
      html:    inviteHtml({ name: name || email, bureauName: bureauName || '', inviteUrl: inviteUrl || '' }),
    }
  } else if (type === 'assignment') {
    const { name, email, eventTitle, eventDate, eventLocation, role, callTime, appUrl, assignmentToken } = body
    if (!email) return { statusCode: 400, body: 'email verplicht' }
    const fnBase   = (appUrl || APP_URL).replace(/\/$/, '')
    const confirmUrl = assignmentToken ? `${fnBase}/.netlify/functions/confirm-assignment?token=${assignmentToken}&r=bevestigd` : null
    const rejectUrl  = assignmentToken ? `${fnBase}/.netlify/functions/confirm-assignment?token=${assignmentToken}&r=afgewezen`  : null
    payload = {
      from:    FROM,
      to:      [email],
      subject: `Nieuwe opdracht: ${eventTitle || 'evenement'}`,
      html:    assignmentHtml({ name: name || email, eventTitle: eventTitle || '', eventDate: eventDate || '',
                                eventLocation, role, callTime, appUrl: appUrl || '', confirmUrl, rejectUrl }),
    }
  } else {
    return { statusCode: 400, body: 'Onbekend type' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Resend fout:', err)
    return { statusCode: 500, body: err }
  }

  return { statusCode: 200, body: 'OK' }
}
