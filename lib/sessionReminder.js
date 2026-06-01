// lib/sessionReminder.js
// Checks bookings every 15 minutes and sends email reminders 1 hour before session

const { collections, find, update } = require("./db");

async function sendReminderEmail(to, therapistName, scheduledAt) {
  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  if (!apiKey) {
    console.log("[Reminder] No BREVO_API_KEY — skipping email to", to);
    return;
  }

  const sessionTime = new Date(scheduledAt).toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method:  "POST",
      headers: {
        "api-key":      apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender:  { name: "Serene", email: process.env.EMAIL_FROM || "noreply@serene.app" },
        to:      [{ email: to }],
        subject: "Your session starts in 1 hour — Serene",
        htmlContent: `
          <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0d1428;color:#f0f4ff;border-radius:16px;padding:32px">
            <div style="font-size:32px;margin-bottom:16px;text-align:center">🌿</div>
            <h2 style="font-size:20px;font-weight:600;color:#f0f4ff;margin-bottom:8px;text-align:center">Session Reminder</h2>
            <p style="font-size:14px;color:#8b9dc3;text-align:center;margin-bottom:24px">Your session is coming up soon</p>
            <div style="background:rgba(99,102,241,0.1);border:0.5px solid rgba(99,102,241,0.3);border-radius:12px;padding:16px;margin-bottom:24px">
              <div style="font-size:13px;color:#8b9dc3;margin-bottom:6px">Therapist</div>
              <div style="font-size:16px;font-weight:600;color:#f0f4ff;margin-bottom:12px">${therapistName}</div>
              <div style="font-size:13px;color:#8b9dc3;margin-bottom:6px">Session Time</div>
              <div style="font-size:15px;font-weight:500;color:#a5b4fc">${sessionTime}</div>
            </div>
            <p style="font-size:13px;color:#8b9dc3;text-align:center;margin-bottom:20px">Log in to Serene to join your session when it starts.</p>
            <div style="text-align:center">
              <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}" style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:500">Open Serene</a>
            </div>
            <p style="font-size:11px;color:#4a5568;text-align:center;margin-top:24px">Serene Mental Health · Your wellness companion</p>
          </div>
        `,
      }),
    });

    if (res.ok) {
      console.log("[Reminder] Email sent to", to);
    } else {
      const err = await res.text();
      console.error("[Reminder] Email failed:", err);
    }
  } catch (err) {
    console.error("[Reminder] Email error:", err.message);
  }
}

async function checkAndSendReminders() {
  try {
    const now      = Date.now();
    const oneHour  = 60 * 60 * 1000;
    const window   = 15 * 60 * 1000; // 15 min check window

    // Find all confirmed bookings that haven't been reminded yet
    const bookings = await find(collections.bookings, {
      status:          "confirmed",
      reminderSent:    { $ne: true },
    });

    for (const booking of bookings) {
      const sessionTime = new Date(booking.scheduledAt).getTime();
      const timeUntil   = sessionTime - now;

      // Send reminder if session is 45min to 75min away
      if (timeUntil > (oneHour - window) && timeUntil < (oneHour + window)) {
        console.log("[Reminder] Sending reminder for booking:", booking.id);
        await sendReminderEmail(booking.userEmail, booking.therapistName, booking.scheduledAt);

        // Mark as reminded so we don't send again
        await update(collections.bookings, { id: booking.id }, { reminderSent: true });
      }
    }
  } catch (err) {
    console.error("[Reminder] Check error:", err.message);
  }
}

function startReminderService() {
  console.log("[Reminder] Service started — checking every 15 minutes");
  checkAndSendReminders(); // run once immediately
  setInterval(checkAndSendReminders, 15 * 60 * 1000); // then every 15 min
}

module.exports = { startReminderService };
