// lib/memory.js
// SERENE Memory System
//
// Two tiers:
//   FREE  — session context (50-100 messages) + daily summary
//   PAID  — long-term memory: recurring themes, patterns, preferences, insights
//
// Memory is never exposed to the user directly.
// It is injected into system prompts as natural context.
// SERENE should feel like it remembers — not like it is reading from a file.
"use strict";

const { v4: uuidv4 }                          = require("uuid");
const { collections, findOne, insert, update } = require("./db");

// ── CONSTANTS ─────────────────────────────────────────────────────────────
const FREE_CONTEXT_LIMIT = 50;   // messages loaded for free tier
const PAID_CONTEXT_LIMIT = 100;  // messages loaded for paid tier

// ── LONG-TERM MEMORY SCHEMA ───────────────────────────────────────────────
// One document per user in memory.db
// {
//   id, userId, updatedAt,
//   recurringThemes:    string[]   — e.g. ["relationship conflict", "work stress"]
//   recurringPatterns:  string[]   — e.g. ["catastrophic thinking", "isolation when stressed"]
//   knownTriggers:      string[]   — e.g. ["arguments with spouse", "financial pressure"]
//   copingStrategies:   string[]   — strategies that have resonated with this user
//   failedStrategies:   string[]   — things already tried that haven't helped
//   keyRelationships:   string[]   — e.g. ["difficult marriage", "unsupportive family"]
//   personalDetails:    string[]   — non-sensitive context ["works night shift", "has 2 children"]
//   sessionSummaries:   object[]   — last 10 session summaries [{date, summary, topic, mood}]
//   totalSessions:      number
//   lastSeen:           string     — ISO date
// }

// ── LOAD LONG-TERM MEMORY ─────────────────────────────────────────────────
async function loadLongTermMemory(userId) {
  try {
    const mem = await findOne(collections.memory, { userId });
    return mem || null;
  } catch {
    return null;
  }
}

// ── SAVE / UPDATE LONG-TERM MEMORY ────────────────────────────────────────
async function saveLongTermMemory(userId, updates) {
  try {
    const existing = await findOne(collections.memory, { userId });
    const now = new Date().toISOString();
    if (existing) {
      await update(collections.memory, { userId }, { ...updates, updatedAt: now });
    } else {
      await insert(collections.memory, {
        id: uuidv4(),
        userId,
        recurringThemes:   [],
        recurringPatterns: [],
        knownTriggers:     [],
        copingStrategies:  [],
        failedStrategies:  [],
        keyRelationships:  [],
        personalDetails:   [],
        sessionSummaries:  [],
        totalSessions:     0,
        lastSeen:          now,
        createdAt:         now,
        updatedAt:         now,
        ...updates,
      });
    }
  } catch (err) {
    console.error("[MEMORY] Could not save long-term memory:", err.message);
  }
}

// ── LOAD DAILY SESSION SUMMARY ────────────────────────────────────────────
async function loadDailySession(userId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    return await findOne(collections.sessions, { userId, date: today });
  } catch {
    return null;
  }
}

// ── GENERATE SESSION SUMMARY ──────────────────────────────────────────────
// Creates a structured summary from a conversation.
// Called at end of each message exchange — updates rolling summary.
async function updateSessionSummary(userId, newMessage, aiReply, emotionalState, topic) {
  try {
    const today   = new Date().toISOString().slice(0, 10);
    const session = await findOne(collections.sessions, { userId, date: today });

    // Build a compact summary entry for this exchange
    const exchangeSummary = {
      userMessage: newMessage.slice(0, 120), // first 120 chars
      topic:       topic || "general",
      mood:        emotionalState ? emotionalState.safetyLevel : "green",
      mode:        emotionalState ? emotionalState.mode : "VALIDATION",
      timestamp:   new Date().toISOString(),
    };

    if (session) {
      // Append to rolling exchanges, keep last 20
      const exchanges = session.exchanges || [];
      exchanges.push(exchangeSummary);
      if (exchanges.length > 20) exchanges.shift();

      await update(collections.sessions, { userId, date: today }, {
        exchanges,
        lastTopic:    topic || session.lastTopic || "general",
        lastMood:     emotionalState ? emotionalState.safetyLevel : session.lastMood,
        messageCount: (session.messageCount || 0) + 1,
        updatedAt:    new Date().toISOString(),
      });
    }
    // Note: session creation is handled by saveEmotionalState in chat.js
  } catch (err) {
    console.error("[MEMORY] Could not update session summary:", err.message);
  }
}

// ── EXTRACT MEMORY SIGNALS FROM CONVERSATION ──────────────────────────────
// Analyses a message exchange for memory-worthy signals.
// Returns structured signals to be stored in long-term memory.
function extractMemorySignals(userMessage, history, emotionalState) {
  const signals = {
    themes:      [],
    patterns:    [],
    triggers:    [],
    strategies:  [],
    failed:      [],
    personal:    [],
    relationship:[],
  };

  const lower = userMessage.toLowerCase();

  // ── Theme detection ───────────────────────────────────────────────
  if (/(partner|husband|wife|boyfriend|girlfriend|marriage|divorce|relationship)/.test(lower))
    signals.themes.push("relationship issues");
  if (/(work|job|boss|fired|salary|money|debt|loan)/.test(lower))
    signals.themes.push("work or financial stress");
  if (/(mother|father|parent|family|sibling|brother|sister|in-law)/.test(lower))
    signals.themes.push("family conflict");
  if (/(anxious|anxiety|worry|panic|scared|fear)/.test(lower))
    signals.themes.push("anxiety");
  if (/(sad|depressed|empty|hopeless|numb|worthless)/.test(lower))
    signals.themes.push("low mood / depression");
  if (/(trauma|abuse|assault|happened to me|can't forget)/.test(lower))
    signals.themes.push("trauma");
  if (/(baby|pregnant|birth|postpartum|new mother)/.test(lower))
    signals.themes.push("postpartum struggles");

  // ── Pattern detection ─────────────────────────────────────────────
  if (/(nothing works|nothing changes|always happens|never gets better)/.test(lower))
    signals.patterns.push("feels stuck in repeating patterns");
  if (/(i always|i never|i can't ever|i keep doing)/.test(lower))
    signals.patterns.push("negative self-labeling");
  if (/(worst case|what if|something bad|going to go wrong)/.test(lower))
    signals.patterns.push("catastrophic thinking");
  if (/(alone|no one|nobody|by myself)/.test(lower))
    signals.patterns.push("isolation tendency");

  // ── Failed strategy detection ─────────────────────────────────────
  if (/(i tried|already tried|tried that|doesn't work for me|didn't help)/.test(lower))
    signals.failed.push("user mentioned something they already tried");
  if (/(talked to them|already spoke|already told them)/.test(lower))
    signals.failed.push("direct communication already attempted");

  // ── Personal context ──────────────────────────────────────────────
  if (/(i have \d+ kid|children|my child|my son|my daughter)/.test(lower))
    signals.personal.push("has children");
  if (/(night shift|work late|work nights)/.test(lower))
    signals.personal.push("works non-standard hours");
  if (/(church|faith|god|prayer|pastor)/.test(lower))
    signals.personal.push("faith is important to them");

  return signals;
}

// ── APPLY MEMORY SIGNALS TO LONG-TERM STORE ───────────────────────────────
async function applyMemorySignals(userId, signals, isPro) {
  if (!isPro) return; // Long-term memory only for paid tier
  try {
    const existing = await loadLongTermMemory(userId) || {};

    // Helper: add unique items to an array, cap at 10
    function addUnique(arr, items) {
      const set = new Set(arr || []);
      items.forEach(i => set.add(i));
      return [...set].slice(-10);
    }

    const updates = {};

    if (signals.themes.length)
      updates.recurringThemes = addUnique(existing.recurringThemes, signals.themes);
    if (signals.patterns.length)
      updates.recurringPatterns = addUnique(existing.recurringPatterns, signals.patterns);
    if (signals.triggers.length)
      updates.knownTriggers = addUnique(existing.knownTriggers, signals.triggers);
    if (signals.failed.length)
      updates.failedStrategies = addUnique(existing.failedStrategies, signals.failed);
    if (signals.personal.length)
      updates.personalDetails = addUnique(existing.personalDetails, signals.personal);
    if (signals.relationship.length)
      updates.keyRelationships = addUnique(existing.keyRelationships, signals.relationship);

    updates.lastSeen     = new Date().toISOString();
    updates.totalSessions = (existing.totalSessions || 0) + 0; // incremented elsewhere

    if (Object.keys(updates).length > 0) {
      await saveLongTermMemory(userId, updates);
    }
  } catch (err) {
    console.error("[MEMORY] Could not apply signals:", err.message);
  }
}

// ── STORE SESSION SUMMARY IN LONG-TERM MEMORY ────────────────────────────
// Called once per session (e.g. when session ends or next day starts)
async function archiveSessionToLongTerm(userId, sessionDoc, isPro) {
  if (!isPro) return;
  try {
    const existing = await loadLongTermMemory(userId);
    if (!existing) return;

    const summary = {
      date:         sessionDoc.date,
      topic:        sessionDoc.lastTopic || "general",
      mood:         sessionDoc.lastMood  || "green",
      messageCount: sessionDoc.messageCount || 0,
    };

    const summaries = existing.sessionSummaries || [];
    summaries.push(summary);
    // Keep last 10 session summaries
    if (summaries.length > 10) summaries.shift();

    await saveLongTermMemory(userId, {
      sessionSummaries: summaries,
      totalSessions: (existing.totalSessions || 0) + 1,
      lastSeen: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[MEMORY] Could not archive session:", err.message);
  }
}

// ── BUILD MEMORY CONTEXT STRING ────────────────────────────────────────────
// Assembles a natural-language memory block for injection into system prompt.
// Never sounds like a database readout. Sounds like what a therapist remembers.
function buildMemoryContext(longTermMemory, sessionDoc, plan) {
  const lines = [];

  // ── Session context (all tiers) ───────────────────────────────────
  if (sessionDoc) {
    if (sessionDoc.lastTopic && sessionDoc.lastTopic !== "general") {
      lines.push(`In this conversation, the user has been discussing: ${sessionDoc.lastTopic}.`);
    }
    if (sessionDoc.messageCount > 1) {
      lines.push(`This is message ${sessionDoc.messageCount + 1} in this session.`);
    }
    // Recent exchanges for continuity
    if (sessionDoc.exchanges && sessionDoc.exchanges.length > 0) {
      const recent = sessionDoc.exchanges.slice(-3);
      const recentTopics = [...new Set(recent.map(e => e.topic).filter(t => t !== "general"))];
      if (recentTopics.length > 0) {
        lines.push(`Recent topics covered: ${recentTopics.join(", ")}.`);
      }
    }
  }

  // ── Long-term memory (paid tier only) ────────────────────────────
  if (plan && plan !== "free" && longTermMemory) {
    if (longTermMemory.recurringThemes && longTermMemory.recurringThemes.length > 0) {
      lines.push(`This user has previously discussed: ${longTermMemory.recurringThemes.slice(-3).join(", ")}.`);
    }
    if (longTermMemory.recurringPatterns && longTermMemory.recurringPatterns.length > 0) {
      lines.push(`Patterns observed across sessions: ${longTermMemory.recurringPatterns.slice(-2).join(", ")}.`);
    }
    if (longTermMemory.failedStrategies && longTermMemory.failedStrategies.length > 0) {
      lines.push(`The user has mentioned things they have already tried that haven't worked. Avoid repeating these suggestions.`);
    }
    if (longTermMemory.personalDetails && longTermMemory.personalDetails.length > 0) {
      lines.push(`Known context: ${longTermMemory.personalDetails.slice(-3).join(", ")}.`);
    }
    if (longTermMemory.sessionSummaries && longTermMemory.sessionSummaries.length > 1) {
      const last = longTermMemory.sessionSummaries[longTermMemory.sessionSummaries.length - 1];
      if (last) {
        lines.push(`Last session (${last.date}): discussed ${last.topic}, ${last.messageCount} messages.`);
      }
    }
  }

  if (lines.length === 0) return null;

  return `\n\nCONVERSATION MEMORY [use naturally, never quote or reference directly]:
${lines.join("\n")}
Use this context to make the conversation feel continuous and personal.
Do NOT say "I remember that you..." or "Based on our history..." — just know it and respond from it.`;
}

// ── EMOJI ENGINE ──────────────────────────────────────────────────────────
// Returns emoji guidance for the current emotional context.
// Max 1 emoji in most responses. Never in crisis situations.
function getEmojiGuidance(emotionalState, mode) {
  // NEVER use emojis in these modes
  if (mode === "CRITICAL_ESCALATION" || mode === "GUIDED_ESCALATION") {
    return `\n\nEMOJI RULE: Do NOT use any emojis in this response. The situation is too serious.`;
  }

  if (!emotionalState) return "";

  const { safetyLevel, trend } = emotionalState;

  // No emojis in red/critical safety situations
  if (safetyLevel === "red" || safetyLevel === "critical") {
    return `\n\nEMOJI RULE: Do NOT use any emojis in this response.`;
  }

  // Improving or positive — occasional warm emoji allowed
  if (trend === "improving" || safetyLevel === "green") {
    return `\n\nEMOJI RULE: You may occasionally use ONE emoji if it feels genuinely warm and natural — not forced. Good choices: 🌱 🌿 😊 ❤️ 💪. Most responses should have no emoji. Use your judgment.`;
  }

  // Stable neutral state — very occasional emoji
  if (safetyLevel === "yellow") {
    return `\n\nEMOJI RULE: Only use an emoji if it adds genuine warmth. Maximum one. Skip it if in doubt.`;
  }

  // Orange or declining — no emojis
  return `\n\nEMOJI RULE: Do not use emojis in this response. The user needs grounded presence, not warmth signals.`;
}

module.exports = {
  loadLongTermMemory,
  saveLongTermMemory,
  loadDailySession,
  updateSessionSummary,
  extractMemorySignals,
  applyMemorySignals,
  archiveSessionToLongTerm,
  buildMemoryContext,
  getEmojiGuidance,
  FREE_CONTEXT_LIMIT,
  PAID_CONTEXT_LIMIT,
};
