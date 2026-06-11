"use strict";

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { collections, find, insert } = require("../lib/db");

const router = express.Router();

const DEFAULT_HOTLINES = [
  {
    id: uuidv4(),
    name: "Police Emergency",
    description: "Immediate police response for emergencies, crime, or threats to safety.",
    phone_number: "999",
    category: "emergency",
    is_active: true,
  },
  {
    id: uuidv4(),
    name: "Ambulance Service",
    description: "Emergency medical services and ambulance dispatch.",
    phone_number: "991",
    category: "emergency",
    is_active: true,
  },
  {
    id: uuidv4(),
    name: "General Emergency (All Services)",
    description: "One number for police, fire, and ambulance — available across all networks.",
    phone_number: "112",
    category: "emergency",
    is_active: true,
  },
  {
    id: uuidv4(),
    name: "Fire Brigade",
    description: "Emergency fire and rescue services.",
    phone_number: "993",
    category: "emergency",
    is_active: true,
  },
  {
    id: uuidv4(),
    name: "Zambia Red Cross",
    description: "Humanitarian support, emergency relief, and disaster response services.",
    phone_number: "+260 211 250173",
    category: "emergency",
    is_active: true,
  },
  {
    id: uuidv4(),
    name: "Mental Health Support Line",
    description: "Confidential emotional support and mental health guidance, available 24/7.",
    phone_number: "+260 211 234567",
    category: "mental_health",
    is_active: true,
  },
  {
    id: uuidv4(),
    name: "CRIBS Zambia",
    description: "Crisis intervention and counselling support for individuals in emotional distress.",
    phone_number: "+260 211 237885",
    category: "mental_health",
    is_active: true,
  },
  {
    id: uuidv4(),
    name: "Gender Based Violence Hotline",
    description: "Free, confidential support for survivors of gender-based violence.",
    phone_number: "5600",
    category: "support",
    is_active: true,
  },
  {
    id: uuidv4(),
    name: "Child Helpline Zambia",
    description: "Support for children and young people in crisis or distress.",
    phone_number: "116",
    category: "support",
    is_active: true,
  },
];

// GET /api/hotlines — list all active hotlines, auto-seed on first call
router.get("/", async (req, res) => {
  try {
    let hotlines = await find(collections.hotlines, { is_active: true });
    if (!hotlines.length) {
      for (const h of DEFAULT_HOTLINES) {
        await insert(collections.hotlines, h);
      }
      hotlines = await find(collections.hotlines, { is_active: true });
    }
    res.json({ hotlines });
  } catch (err) {
    console.error("[Hotlines] GET error:", err.message);
    res.status(500).json({ error: "Could not load hotlines." });
  }
});

module.exports = router;
