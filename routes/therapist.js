// routes/therapist.js — Complete Therapist System
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

// ── DB helper — works with your existing NeDB setup ───────────────
const Datastore = require('@seald-io/nedb');
const path      = require('path');
const dataDir   = path.join(__dirname, '..', 'data');

const therapistsDB = new Datastore({ filename: path.join(dataDir, 'therapists.db'), autoload: true });
const bookingsDB   = new Datastore({ filename: path.join(dataDir, 'bookings.db'),   autoload: true });

// Promisify NeDB
function dbFind(db, query)         { return new Promise((res,rej) => db.find(query, (e,d) => e ? rej(e) : res(d))); }
function dbFindOne(db, query)      { return new Promise((res,rej) => db.findOne(query, (e,d) => e ? rej(e) : res(d))); }
function dbInsert(db, doc)         { return new Promise((res,rej) => db.insert(doc, (e,d) => e ? rej(e) : res(d))); }
function dbUpdate(db, q, u, opts)  { return new Promise((res,rej) => db.update(q, {$set:u}, opts||{}, (e,n) => e ? rej(e) : res(n))); }

const { authenticate } = require('../middleware/auth');
const SERENE_CUT = 0.20; // Serene takes 20%

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

    // Validate required fields
    const missing = [];
    if (!fullName)      missing.push('Full name');
    if (!email)         missing.push('Email');
    if (!phone)         missing.push('Phone');
    if (!licenseNumber) missing.push('License number');
    if (!nrcNumber)     missing.push('NRC number');
    if (!yearsExperience) missing.push('Years of experience');
    if (missing.length) return res.status(400).json({ error: missing.join(', ') + ' required.' });

    // Enforce 3 year minimum
    if (parseInt(yearsExperience) < 3) {
      return res.status(400).json({ error: 'Serene requires minimum 3 years of experience.' });
    }

    // Enforce 2 references
    if (!reference1Name || !reference1Phone || !reference2Name || !reference2Phone) {
      return res.status(400).json({ error: 'Two traceable references with phone numbers are required.' });
    }

    // Check duplicate
    const existing = await dbFindOne(therapistsDB, { email: email.toLowerCase().trim() });
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
      status:       'pending',   // pending | approved | rejected
      verified:     false,
      rating:       0,
      reviewCount:  0,
      availability: [],
      createdAt:    new Date().toISOString(),
    };

    await dbInsert(therapistsDB, therapist);

    console.log('[Therapist] New application:', therapist.fullName, therapist.email);
    res.json({
      ok: true,
      message: 'Application submitted! We will review your credentials within 2-3 business days.',
      applicationId: therapist.id,
    });
  } catch (err) {
    console.error('[Therapist] Apply error:', err.message);
    res.status(500).json({ error: 'Could not submit application. Please try again.' });
  }
});

// ── GET /api/therapist/list ───────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const all = await dbFind(therapistsDB, { status: 'approved', verified: true });
    res.json({
      therapists: all.map(t => ({
        id:              t.id,
        fullName:        t.fullName,
        location:        t.location,
        specializations: t.specializations,
        yearsExperience: t.yearsExperience,
        sessionPrice:    t.sessionPrice,
        bio:             t.bio,
        rating:          t.rating,
        reviewCount:     t.reviewCount,
        availability:    t.availability,
      })),
    });
  } catch (err) {
    console.error('[Therapist] List error:', err.message);
    res.status(500).json({ error: 'Could not load therapists.' });
  }
});

// ── GET /api/therapist/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const t = await dbFindOne(therapistsDB, { id: req.params.id, status: 'approved' });
    if (!t) return res.status(404).json({ error: 'Therapist not found.' });
    res.json({
      id: t.id, fullName: t.fullName, location: t.location,
      specializations: t.specializations, yearsExperience: t.yearsExperience,
      sessionPrice: t.sessionPrice, bio: t.bio,
      rating: t.rating, reviewCount: t.reviewCount, availability: t.availability,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load therapist.' });
  }
});

// ── POST /api/therapist/book ──────────────────────────────────────
router.post('/book', authenticate, async (req, res) => {
  try {
    const { therapistId, scheduledAt, notes } = req.body;
    if (!therapistId || !scheduledAt) {
      return res.status(400).json({ error: 'Therapist and scheduled time required.' });
    }

    const therapist = await dbFindOne(therapistsDB, { id: therapistId, status: 'approved' });
    if (!therapist) return res.status(404).json({ error: 'Therapist not found.' });

    // Generate unique Jitsi room
    const roomName = 'serene-' + uuidv4().replace(/-/g, '').slice(0, 12);
    const jitsiUrl = 'https://meet.jit.si/' + roomName;

    const booking = {
      id:            uuidv4(),
      userId:        req.user.id,
      userEmail:     req.user.email,
      therapistId,
      therapistName: therapist.fullName,
      therapistEmail: therapist.email,
      scheduledAt,
      notes:         notes || '',
      roomName,
      jitsiUrl,
      status:        'confirmed',
      sessionPrice:  therapist.sessionPrice,
      sereneEarns:   Math.round(therapist.sessionPrice * SERENE_CUT),
      therapistEarns: Math.round(therapist.sessionPrice * (1 - SERENE_CUT)),
      createdAt:     new Date().toISOString(),
    };

    await dbInsert(bookingsDB, booking);
    console.log('[Therapist] Booking created:', booking.id, 'for user:', req.user.id);

    res.json({
      ok:           true,
      bookingId:    booking.id,
      jitsiUrl,
      roomName,
      scheduledAt,
      therapistName: therapist.fullName,
      sessionPrice:  therapist.sessionPrice,
      message:      'Session booked! Use the session link to join at your scheduled time.',
    });
  } catch (err) {
    console.error('[Therapist] Book error:', err.message);
    res.status(500).json({ error: 'Could not book session.' });
  }
});

// ── GET /api/therapist/bookings/mine ─────────────────────────────
router.get('/bookings/mine', authenticate, async (req, res) => {
  try {
    const bookings = await dbFind(bookingsDB, { userId: req.user.id });
    bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: 'Could not load bookings.' });
  }
});

// ── GET /api/therapist/session/:bookingId ─────────────────────────
router.get('/session/:bookingId', authenticate, async (req, res) => {
  try {
    const booking = await dbFindOne(bookingsDB, { id: req.params.bookingId, userId: req.user.id });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    res.json({ jitsiUrl: booking.jitsiUrl, roomName: booking.roomName, therapistName: booking.therapistName, scheduledAt: booking.scheduledAt });
  } catch (err) {
    res.status(500).json({ error: 'Could not load session.' });
  }
});

// ── ADMIN: GET /api/therapist/admin/pending ───────────────────────
router.get('/admin/pending', async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized.' });
  try {
    const pending = await dbFind(therapistsDB, { status: 'pending' });
    res.json({ therapists: pending });
  } catch (err) {
    res.status(500).json({ error: 'Could not load pending.' });
  }
});

// ── ADMIN: POST /api/therapist/admin/review ───────────────────────
router.post('/admin/review', async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized.' });
  try {
    const { therapistId, action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });
    await dbUpdate(therapistsDB, { id: therapistId }, {
      status: action === 'approve' ? 'approved' : 'rejected',
      verified: action === 'approve',
      reviewedAt: new Date().toISOString(),
      reviewReason: reason || '',
    }, {});
    res.json({ ok: true, message: 'Therapist ' + action + 'd.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update.' });
  }
});

module.exports = router;
