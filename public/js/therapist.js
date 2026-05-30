// routes/therapist.js — Fixed to use existing db.js
const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();
const { collections, find, findOne, insert, update } = require('../lib/db');
const { authenticate } = require('../middleware/auth');

const SERENE_CUT = 0.20;

// ── POST /api/therapist/apply ─────────────────────────────────────
router.post('/apply', async (req, res) => {
  try {
    const {
      fullName, email, phone, location,
      licenseNumber, nrcNumber, yearsExperience,
      specializations, sessionPrice, bio,
      reference1Name, reference1Phone,
      reference2Name, reference2Phone,
    } = req.body;

    if (!fullName || !email || !phone || !licenseNumber || !nrcNumber || !yearsExperience) {
      return res.status(400).json({ error: 'Please fill in all required fields.' });
    }
    if (parseInt(yearsExperience) < 3) {
      return res.status(400).json({ error: 'Serene requires minimum 3 years of experience.' });
    }
    if (!reference1Name || !reference1Phone || !reference2Name || !reference2Phone) {
      return res.status(400).json({ error: 'Two traceable references with phone numbers are required.' });
    }

    const existing = await findOne(collections.therapists, { email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: 'An application with this email already exists.' });

    const therapist = {
      id:             uuidv4(),
      fullName:       fullName.trim(),
      email:          email.toLowerCase().trim(),
      phone:          phone.trim(),
      location:       location || 'Lusaka, Zambia',
      licenseNumber:  licenseNumber.trim(),
      nrcNumber:      nrcNumber.trim(),
      yearsExperience: parseInt(yearsExperience),
      specializations: Array.isArray(specializations)
        ? specializations
        : (specializations || '').split(',').map(s => s.trim()).filter(Boolean),
      sessionPrice:   parseFloat(sessionPrice) || 300,
      bio:            bio || '',
      references: [
        { name: reference1Name.trim(), phone: reference1Phone.trim() },
        { name: reference2Name.trim(), phone: reference2Phone.trim() },
      ],
      status:      'pending',
      verified:    false,
      rating:      0,
      reviewCount: 0,
      createdAt:   new Date().toISOString(),
    };

    await insert(collections.therapists, therapist);
    console.log('[Therapist] New application:', therapist.fullName);
    res.json({ ok: true, message: 'Application submitted! We will review your credentials within 2-3 business days.', applicationId: therapist.id });
  } catch (err) {
    console.error('[Therapist] Apply error:', err.message);
    res.status(500).json({ error: 'Could not submit application. Please try again.' });
  }
});

// ── GET /api/therapist/list ───────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const all = await find(collections.therapists, { status: 'approved', verified: true });
    res.json({
      therapists: all.map(t => ({
        id: t.id, fullName: t.fullName, location: t.location,
        specializations: t.specializations, yearsExperience: t.yearsExperience,
        sessionPrice: t.sessionPrice, bio: t.bio,
        rating: t.rating, reviewCount: t.reviewCount,
      })),
    });
  } catch (err) {
    console.error('[Therapist] List error:', err.message);
    res.status(500).json({ error: 'Could not load therapists.' });
  }
});

// ── POST /api/therapist/book ──────────────────────────────────────
router.post('/book', authenticate, async (req, res) => {
  try {
    const { therapistId, scheduledAt, notes } = req.body;
    if (!therapistId || !scheduledAt) {
      return res.status(400).json({ error: 'Therapist and scheduled time required.' });
    }

    const therapist = await findOne(collections.therapists, { id: therapistId, status: 'approved' });
    if (!therapist) return res.status(404).json({ error: 'Therapist not found.' });

    const roomName = 'serene-' + uuidv4().replace(/-/g, '').slice(0, 12);
    const jitsiUrl = 'https://meet.jit.si/' + roomName;

    const booking = {
      id:             uuidv4(),
      userId:         req.user.id,
      therapistId,
      therapistName:  therapist.fullName,
      scheduledAt,
      notes:          notes || '',
      roomName,
      jitsiUrl,
      status:         'confirmed',
      sessionPrice:   therapist.sessionPrice,
      sereneEarns:    Math.round(therapist.sessionPrice * SERENE_CUT),
      therapistEarns: Math.round(therapist.sessionPrice * (1 - SERENE_CUT)),
      createdAt:      new Date().toISOString(),
    };

    await insert(collections.bookings, booking);
    console.log('[Therapist] Booking created:', booking.id);

    res.json({
      ok: true,
      bookingId:     booking.id,
      jitsiUrl,
      roomName,
      scheduledAt,
      therapistName: therapist.fullName,
      sessionPrice:  therapist.sessionPrice,
    });
  } catch (err) {
    console.error('[Therapist] Book error:', err.message);
    res.status(500).json({ error: 'Could not book session.' });
  }
});

// ── GET /api/therapist/bookings/mine ─────────────────────────────
router.get('/bookings/mine', authenticate, async (req, res) => {
  try {
    const bookings = await find(collections.bookings, { userId: req.user.id });
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: 'Could not load bookings.' });
  }
});

// ── ADMIN: GET pending ────────────────────────────────────────────
router.get('/admin/pending', async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized.' });
  try {
    const pending = await find(collections.therapists, { status: 'pending' });
    res.json({ therapists: pending });
  } catch (err) {
    res.status(500).json({ error: 'Could not load pending.' });
  }
});

// ── ADMIN: POST review ────────────────────────────────────────────
router.post('/admin/review', async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized.' });
  try {
    const { therapistId, action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });
    await update(collections.therapists, { id: therapistId }, {
      status:       action === 'approve' ? 'approved' : 'rejected',
      verified:     action === 'approve',
      reviewedAt:   new Date().toISOString(),
      reviewReason: reason || '',
    });
    res.json({ ok: true, message: 'Therapist ' + action + 'd.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update.' });
  }
});

module.exports = router;
