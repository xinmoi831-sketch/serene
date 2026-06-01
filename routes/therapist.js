// routes/therapist.js
const express  = require("express");
const { v4: uuidv4 } = require("uuid");
const router   = express.Router();
const { collections, find, findOne, insert, update } = require("../lib/db");
const { authenticate } = require("../middleware/auth");

const SERENE_CUT = 0.20;

// POST /api/therapist/apply
router.post("/apply", async (req, res) => {
  try {
    const {
      fullName, email, phone, country, city,
      profession, specializations, yearsExperience,
      languages, bio, degrees, certifications,
      licenseNumber, sessionPrice,
      reference1Name, reference1Phone,
      reference2Name, reference2Phone,
    } = req.body;

    if (!fullName || !email || !phone || !profession || !yearsExperience) {
      return res.status(400).json({ error: "Please fill in all required fields." });
    }
    if (parseInt(yearsExperience) < 3) {
      return res.status(400).json({ error: "Serene requires minimum 3 years of experience." });
    }
    if (!reference1Name || !reference1Phone || !reference2Name || !reference2Phone) {
      return res.status(400).json({ error: "Two traceable references with phone numbers are required." });
    }

    const existing = await findOne(collections.therapists, { email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: "An application with this email already exists." });

    const therapist = {
      id:              uuidv4(),
      fullName:        fullName.trim(),
      email:           email.toLowerCase().trim(),
      phone:           phone.trim(),
      country:         country || "Zambia",
      city:            city || "Lusaka",
      profession:      profession.trim(),
      specializations: Array.isArray(specializations)
        ? specializations
        : (specializations || "").split(",").map(s => s.trim()).filter(Boolean),
      yearsExperience: parseInt(yearsExperience),
      languages:       Array.isArray(languages)
        ? languages
        : (languages || "English").split(",").map(s => s.trim()).filter(Boolean),
      bio:             bio || "",
      degrees:         degrees || "",
      certifications:  certifications || "",
      licenseNumber:   licenseNumber || "",
      sessionPrice:    parseFloat(sessionPrice) || 300,
      references: [
        { name: reference1Name.trim(), phone: reference1Phone.trim() },
        { name: reference2Name.trim(), phone: reference2Phone.trim() },
      ],
      status:      "pending",
      verified:    false,
      rating:      0,
      reviewCount: 0,
      createdAt:   new Date().toISOString(),
    };

    await insert(collections.therapists, therapist);
    console.log("[Therapist] New application:", therapist.fullName);

    res.json({
      ok: true,
      message: "Application submitted! Our team will review your credentials within 2-3 business days.",
      applicationId: therapist.id,
    });
  } catch (err) {
    console.error("[Therapist] Apply error:", err.message);
    res.status(500).json({ error: "Could not submit application. Please try again." });
  }
});

// GET /api/therapist/list
router.get("/list", async (req, res) => {
  try {
    const { search, specialization, language } = req.query;
    let all = await find(collections.therapists, { status: "approved", verified: true });

    if (search)         all = all.filter(t => t.fullName.toLowerCase().includes(search.toLowerCase()));
    if (specialization) all = all.filter(t => t.specializations.some(s => s.toLowerCase().includes(specialization.toLowerCase())));
    if (language)       all = all.filter(t => t.languages.some(l => l.toLowerCase().includes(language.toLowerCase())));

    res.json({
      therapists: all.map(t => ({
        id:              t.id,
        fullName:        t.fullName,
        city:            t.city,
        country:         t.country,
        profession:      t.profession,
        specializations: t.specializations,
        yearsExperience: t.yearsExperience,
        languages:       t.languages,
        bio:             t.bio,
        sessionPrice:    t.sessionPrice,
        rating:          t.rating,
        reviewCount:     t.reviewCount,
      })),
    });
  } catch (err) {
    console.error("[Therapist] List error:", err.message);
    res.status(500).json({ error: "Could not load therapists." });
  }
});

// POST /api/therapist/book
router.post("/book", authenticate, async (req, res) => {
  try {
    const { therapistId, scheduledAt, notes } = req.body;
    if (!therapistId || !scheduledAt) {
      return res.status(400).json({ error: "Therapist and scheduled time are required." });
    }

    const therapist = await findOne(collections.therapists, { id: therapistId, status: "approved" });
    if (!therapist) return res.status(404).json({ error: "Therapist not found." });

    const conflict = await findOne(collections.bookings, { therapistId, scheduledAt, status: "confirmed" });
    if (conflict) return res.status(409).json({ error: "This time slot is already booked. Please choose another time." });

    const roomName = "serene-" + uuidv4().replace(/-/g, "").slice(0, 12);
    const jitsiUrl = "https://meet.jit.si/" + roomName;

    const booking = {
      id:             uuidv4(),
      userId:         req.user.id,
      userEmail:      req.user.email,
      therapistId,
      therapistName:  therapist.fullName,
      therapistEmail: therapist.email,
      scheduledAt,
      notes:          notes || "",
      roomName,
      jitsiUrl,
      status:         "confirmed",
      sessionPrice:   therapist.sessionPrice,
      sereneEarns:    Math.round(therapist.sessionPrice * SERENE_CUT),
      therapistEarns: Math.round(therapist.sessionPrice * (1 - SERENE_CUT)),
      createdAt:      new Date().toISOString(),
    };

    await insert(collections.bookings, booking);
    console.log("[Therapist] Booking created:", booking.id);

    res.json({
      ok:            true,
      bookingId:     booking.id,
      jitsiUrl,
      roomName,
      scheduledAt,
      therapistName: therapist.fullName,
      sessionPrice:  therapist.sessionPrice,
    });
  } catch (err) {
    console.error("[Therapist] Book error:", err.message);
    res.status(500).json({ error: "Could not book session. Please try again." });
  }
});

// GET /api/therapist/bookings/mine
router.get("/bookings/mine", authenticate, async (req, res) => {
  try {
    const bookings = await find(collections.bookings, { userId: req.user.id }, { sort: { createdAt: -1 } });
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: "Could not load bookings." });
  }
});

// ADMIN: GET /api/therapist/admin/pending
router.get("/admin/pending", async (req, res) => {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_KEY) return res.status(403).json({ error: "Unauthorized." });
  try {
    const pending = await find(collections.therapists, { status: "pending" });
    res.json({ therapists: pending, count: pending.length });
  } catch (err) {
    res.status(500).json({ error: "Could not load pending." });
  }
});

// ADMIN: POST /api/therapist/admin/review
router.post("/admin/review", async (req, res) => {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_KEY) return res.status(403).json({ error: "Unauthorized." });
  try {
    const { therapistId, action, reason } = req.body;
    if (!["approve", "reject", "suspend"].includes(action)) {
      return res.status(400).json({ error: "Action must be approve, reject or suspend." });
    }
    const statusMap = { approve: "approved", reject: "rejected", suspend: "suspended" };
    await update(collections.therapists, { id: therapistId }, {
      status:       statusMap[action],
      verified:     action === "approve",
      reviewedAt:   new Date().toISOString(),
      reviewReason: reason || "",
    });
    res.json({ ok: true, message: "Therapist " + action + "d." });
  } catch (err) {
    res.status(500).json({ error: "Could not update therapist." });
  }
});

module.exports = router;
