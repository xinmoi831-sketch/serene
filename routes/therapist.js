// Serene — Therapist System
// Signup, verification, profiles, booking, video sessions

const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const { collections, find, findOne, insert, update } = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const router   = express.Router();

const SERENE_CUT = 0.20; // Serene takes 20% of each session

// ── THERAPIST SIGNUP ──────────────────────────────────────────────
// POST /api/therapist/apply
router.post('/apply', async (req, res) => {
  try {
    const {
      fullName, email, phone, location,
      licenseNumber, nrcNumber, yearsExperience,
      specializations, sessionPriceMW,
      bio, references,
    } = req.body;

    // Validate minimum requirements
    if (!fullName || !email || !phone || !licenseNumber || !nrcNumber) {
      return res.status(400).json({ error: 'Please fill in all required fields.' });
    }
    if (parseInt(yearsExperience) < 3) {
      return res.status(400).json({ error: 'Serene requires a minimum of 3 years experience.' });
    }
    if (!references || references.length < 2) {
      return res.status(400).json({ error: 'Please provide at least 2 traceable references.' });
    }

    // Check if already applied
    const existing = await findOne(collections.therapists, { email: email.toLowerCase() });
    if (existing) return res.status(400).json({ error: 'An application with this email already exists.' });

    const therapist = {
      id:               uuidv4(),
      fullName,
      email:            email.toLowerCase(),
      phone,
      location:         location || 'Zambia',
      licenseNumber,
      nrcNumber,
      yearsExperience:  parseInt(yearsExperience),
      specializations:  specializations || [],
      sessionPrice:     parseFloat(sessionPriceMW) || 300,
      serenePrice:      parseFloat(sessionPriceMW) * (1 - SERENE_CUT) || 240,
      bio:              bio || '',
      references:       references || [],
      status:           'pending', // pending | approved | rejected
      verified:         false,
      rating:           0,
      reviewCount:      0,
      createdAt:        new Date().toISOString(),
    };

    await insert(collections.therapists, therapist);

    res.json({
      message: 'Application submitted successfully. Our team will review your credentials within 2-3 business days.',
      applicationId: therapist.id,
    });
  } catch (err) {
    console.error('[Therapist] Apply error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── GET APPROVED THERAPISTS ───────────────────────────────────────
// GET /api/therapist/list
router.get('/list', async (req, res) => {
  try {
    const therapists = await find(collections.therapists, { status: 'approved', verified: true });
    const safe = therapists.map(t => ({
      id:              t.id,
      fullName:        t.fullName,
      location:        t.location,
      specializations: t.specializations,
      yearsExperience: t.yearsExperience,
      sessionPrice:    t.sessionPrice,
      bio:             t.bio,
      rating:          t.rating,
      reviewCount:     t.reviewCount,
    }));
    res.json({ therapists: safe });
  } catch (err) {
    res.status(500).json({ error: 'Could not load therapists.' });
  }
});

// ── GET THERAPIST PROFILE ─────────────────────────────────────────
// GET /api/therapist/:id
router.get('/:id', async (req, res) => {
  try {
    const t = await findOne(collections.therapists, { id: req.params.id, status: 'approved' });
    if (!t) return res.status(404).json({ error: 'Therapist not found.' });
    res.json({
      id: t.id, fullName: t.fullName, location: t.location,
      specializations: t.specializations, yearsExperience: t.yearsExperience,
      sessionPrice: t.sessionPrice, bio: t.bio,
      rating: t.rating, reviewCount: t.reviewCount,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load therapist profile.' });
  }
});

// ── BOOK A SESSION ────────────────────────────────────────────────
// POST /api/therapist/book
router.post('/book', authenticate, async (req, res) => {
  try {
    const { therapistId, scheduledAt, notes } = req.body;
    if (!therapistId || !scheduledAt) {
      return res.status(400).json({ error: 'Therapist and scheduled time are required.' });
    }

    const therapist = await findOne(collections.therapists, { id: therapistId, status: 'approved' });
    if (!therapist) return res.status(404).json({ error: 'Therapist not found.' });

    // Generate Jitsi room — unique per booking
    const roomName   = 'serene-' + uuidv4().slice(0, 8);
    const jitsiUrl   = 'https://meet.jit.si/' + roomName;

    const booking = {
      id:           uuidv4(),
      userId:       req.user.id,
      therapistId,
      therapistName: therapist.fullName,
      scheduledAt,
      notes:        notes || '',
      roomName,
      jitsiUrl,
      status:       'confirmed', // confirmed | completed | cancelled
      sessionPrice: therapist.sessionPrice,
      sereneEarns:  therapist.sessionPrice * SERENE_CUT,
      createdAt:    new Date().toISOString(),
    };

    await insert(collections.bookings, booking);

    res.json({
      message:      'Session booked successfully!',
      bookingId:    booking.id,
      jitsiUrl,
      roomName,
      scheduledAt,
      therapistName: therapist.fullName,
      sessionPrice: therapist.sessionPrice,
    });
  } catch (err) {
    console.error('[Therapist] Book error:', err.message);
    res.status(500).json({ error: 'Could not book session. Please try again.' });
  }
});

// ── GET USER BOOKINGS ─────────────────────────────────────────────
// GET /api/therapist/bookings/mine
router.get('/bookings/mine', authenticate, async (req, res) => {
  try {
    const bookings = await find(collections.bookings, { userId: req.user.id });
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: 'Could not load bookings.' });
  }
});

// ── JOIN SESSION ──────────────────────────────────────────────────
// GET /api/therapist/session/:bookingId
router.get('/session/:bookingId', authenticate, async (req, res) => {
  try {
    const booking = await findOne(collections.bookings, {
      id: req.params.bookingId,
      userId: req.user.id,
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    res.json({
      jitsiUrl:     booking.jitsiUrl,
      roomName:     booking.roomName,
      therapistName: booking.therapistName,
      scheduledAt:  booking.scheduledAt,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load session.' });
  }
});

// ── ADMIN — APPROVE/REJECT ────────────────────────────────────────
// POST /api/therapist/admin/review (protected by admin token)
router.post('/admin/review', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    const { therapistId, action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject.' });
    }

    await update(collections.therapists, { id: therapistId }, {
      status:   action === 'approve' ? 'approved' : 'rejected',
      verified: action === 'approve',
      reviewedAt: new Date().toISOString(),
      reviewReason: reason || '',
    });

    res.json({ message: 'Therapist ' + action + 'd successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update therapist.' });
  }
});

// ── ADMIN — LIST PENDING ──────────────────────────────────────────
router.get('/admin/pending', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }
    const pending = await find(collections.therapists, { status: 'pending' });
    res.json({ therapists: pending });
  } catch (err) {
    res.status(500).json({ error: 'Could not load pending therapists.' });
  }
});

module.exports = router;
