// lib/email.js — Resend email service (replaces Brevo)
async function sendEmail(to, subject, htmlContent, textContent) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[Email] No RESEND_API_KEY — skipping email to", to);
    return { ok: false, error: "Email not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    process.env.EMAIL_FROM || "Serene <onboarding@resend.dev>",
        to:      [to],
        subject: subject,
        html:    htmlContent,
        text:    textContent || "",
      }),
    });

    const data = await res.json();
    if (res.ok) {
      console.log("[Email] Sent to:", to, "ID:", data.id);
      return { ok: true, id: data.id };
    } else {
      console.error("[Email] Failed:", data.message || data.name);
      return { ok: false, error: data.message };
    }
  } catch (err) {
    console.error("[Email] Error:", err.message);
    return { ok: false, error: err.message };
  }
}

// Serene branded email wrapper
function sereneEmail(content) {
  return `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0d1428;color:#f0f4ff;border-radius:16px;padding:32px">
      <div style="font-size:36px;text-align:center;margin-bottom:16px">🌿</div>
      <h2 style="font-size:20px;font-weight:600;color:#f0f4ff;text-align:center;margin-bottom:8px">Serene</h2>
      <p style="font-size:12px;color:#8b9dc3;text-align:center;margin-bottom:24px">Your mental wellness companion</p>
      ${content}
      <p style="font-size:11px;color:#4a5568;text-align:center;margin-top:24px">Serene Mental Health · Zambia</p>
    </div>
  `;
}

// Send verification code email
async function sendVerificationCode(to, code) {
  return sendEmail(
    to,
    "Your Serene verification code",
    sereneEmail(`
      <div style="background:rgba(99,102,241,0.1);border:0.5px solid rgba(99,102,241,0.3);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
        <div style="font-size:13px;color:#8b9dc3;margin-bottom:10px">Your verification code</div>
        <div style="font-size:40px;font-weight:700;color:#a5b4fc;letter-spacing:10px">${code}</div>
        <div style="font-size:12px;color:#8b9dc3;margin-top:8px">Expires in 10 minutes</div>
      </div>
      <p style="font-size:13px;color:#8b9dc3;text-align:center">If you did not request this, ignore this email.</p>
    `),
    "Your Serene verification code is: " + code + ". Expires in 10 minutes."
  );
}

// Send login code email
async function sendLoginCode(to, code) {
  return sendEmail(
    to,
    "Your Serene login code",
    sereneEmail(`
      <div style="background:rgba(99,102,241,0.1);border:0.5px solid rgba(99,102,241,0.3);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
        <div style="font-size:13px;color:#8b9dc3;margin-bottom:10px">Your login code</div>
        <div style="font-size:40px;font-weight:700;color:#a5b4fc;letter-spacing:10px">${code}</div>
        <div style="font-size:12px;color:#8b9dc3;margin-top:8px">Expires in 10 minutes</div>
      </div>
      <p style="font-size:13px;color:#8b9dc3;text-align:center">If you did not request this, ignore this email.</p>
    `),
    "Your Serene login code is: " + code + ". Expires in 10 minutes."
  );
}

// Send password reset code
async function sendResetCode(to, code) {
  return sendEmail(
    to,
    "Reset your Serene password",
    sereneEmail(`
      <div style="background:rgba(99,102,241,0.1);border:0.5px solid rgba(99,102,241,0.3);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
        <div style="font-size:13px;color:#8b9dc3;margin-bottom:10px">Password reset code</div>
        <div style="font-size:40px;font-weight:700;color:#a5b4fc;letter-spacing:10px">${code}</div>
        <div style="font-size:12px;color:#8b9dc3;margin-top:8px">Expires in 10 minutes</div>
      </div>
      <p style="font-size:13px;color:#8b9dc3;text-align:center">If you did not request this, ignore this email.</p>
    `),
    "Your Serene password reset code is: " + code + ". Expires in 10 minutes."
  );
}

// Send therapist approval/rejection notification
async function sendTherapistNotification(therapist, action, reason) {
  const isApproved = action === "approve";
  return sendEmail(
    therapist.email,
    isApproved ? "🎉 Your Serene therapist application has been approved!" : "Update on your Serene therapist application",
    sereneEmail(isApproved ? `
      <div style="background:rgba(74,222,128,0.1);border:0.5px solid rgba(74,222,128,0.3);border-radius:12px;padding:16px;margin-bottom:20px">
        <div style="font-size:13px;color:#4ade80;font-weight:600;margin-bottom:6px">✅ Application Approved</div>
        <div style="font-size:13px;color:#8b9dc3">Dear <strong style="color:#f0f4ff">${therapist.fullName}</strong>, your profile is now live on Serene.</div>
      </div>
      <p style="font-size:13px;color:#8b9dc3;line-height:1.7;margin-bottom:20px">Users can now discover your profile and book sessions with you. Session price is fixed at K120. You earn K96 per session (80%).</p>
      <div style="text-align:center"><a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/therapist-dashboard" style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:500">Open Your Dashboard</a></div>
    ` : `
      <div style="background:rgba(244,63,94,0.08);border:0.5px solid rgba(244,63,94,0.25);border-radius:12px;padding:16px;margin-bottom:20px">
        <div style="font-size:13px;color:#f43f5e;font-weight:600;margin-bottom:6px">❌ Application Not Approved</div>
        <div style="font-size:13px;color:#8b9dc3">Dear <strong style="color:#f0f4ff">${therapist.fullName}</strong>, we are unable to approve your application at this time.</div>
      </div>
      ${reason ? `<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:14px;margin-bottom:16px"><div style="font-size:12px;color:#8b9dc3;margin-bottom:6px">Reason</div><div style="font-size:13px;color:#f0f4ff">${reason}</div></div>` : ""}
      <p style="font-size:13px;color:#8b9dc3;line-height:1.7">You are welcome to reapply after addressing the concerns above.</p>
    `),
    isApproved ? "Congratulations! Your Serene therapist application has been approved." : "Your Serene therapist application was not approved. " + (reason || "")
  );
}

// Send session reminder
async function sendSessionReminder(to, therapistName, scheduledAt) {
  const sessionTime = new Date(scheduledAt).toLocaleString("en-US", {
    weekday:"long", year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit"
  });
  return sendEmail(
    to,
    "Your session starts in 1 hour — Serene",
    sereneEmail(`
      <div style="background:rgba(99,102,241,0.1);border:0.5px solid rgba(99,102,241,0.3);border-radius:12px;padding:16px;margin-bottom:20px">
        <div style="font-size:13px;color:#8b9dc3;margin-bottom:6px">Therapist</div>
        <div style="font-size:16px;font-weight:600;color:#f0f4ff;margin-bottom:12px">${therapistName}</div>
        <div style="font-size:13px;color:#8b9dc3;margin-bottom:6px">Session Time</div>
        <div style="font-size:15px;font-weight:500;color:#a5b4fc">${sessionTime}</div>
      </div>
      <div style="text-align:center"><a href="${process.env.FRONTEND_URL || "http://localhost:3000"}" style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:500">Open Serene</a></div>
    `),
    "Your session with " + therapistName + " starts in 1 hour at " + sessionTime
  );
}

module.exports = { sendEmail, sendVerificationCode, sendLoginCode, sendResetCode, sendTherapistNotification, sendSessionReminder };
