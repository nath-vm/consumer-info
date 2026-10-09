// Minimal Resend client (https://resend.com/docs/api-reference/emails/send-email).
// Uses Node's built-in fetch (Node 18+), so no extra dependency is needed.
//
// Env:
//   RESEND_API_KEY  required to send
//   MAIL_FROM       optional, e.g. "Consumer Info <alerts@yourdomain.com>".
//                   Defaults to Resend's test sender, which can ONLY deliver to the
//                   email address that owns your Resend account.

const DEFAULT_FROM = 'Consumer Info <onboarding@resend.dev>';

function isMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendMail({ to, subject, text }) {
  if (!isMailConfigured()) throw new Error('RESEND_API_KEY is not set');
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) throw new Error('No recipients');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || DEFAULT_FROM,
      to: recipients,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Resend responded ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

module.exports = { sendMail, isMailConfigured };
