"use strict";
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { collections, find, findOne, insert, update, remove } = require("../lib/db");
const { authenticate } = require("../middleware/auth");
const { decrypt } = require("../lib/encryption");

const router = express.Router();

function decryptMsg(msg, userId) {
  if (!msg) return msg;
  if (msg.enc !== undefined) {
    const plaintext = decrypt(msg.enc, msg.iv, userId);
    return { ...msg, content: plaintext || "[decryption error]", enc: undefined, iv: undefined };
  }
  return msg;
}

// GET /api/conversations — list conversations, migrate orphan messages on first call
router.get("/", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    let convs = await find(collections.conversations, { userId }, { sort: { updatedAt: -1 } });

    if (convs.length === 0) {
      // One-time migration: pull all pre-existing messages into a legacy conversation
      const orphan = await find(collections.messages, { userId }, { limit: 1 });
      if (orphan.length > 0) {
        const now = new Date().toISOString();
        const migConv = {
          id: uuidv4(), userId,
          title: "Previous Conversations",
          createdAt: now, updatedAt: now,
          archived: false,
        };
        const created = await insert(collections.conversations, migConv);
        // Assign all untagged messages to this conversation
        await new Promise((resolve, reject) => {
          collections.messages.update(
            { userId },
            { $set: { conversationId: migConv.id } },
            { multi: true },
            (err) => { if (err) reject(err); else resolve(); }
          );
        });
        convs = [created];
      }
    }

    res.json({ conversations: convs });
  } catch (err) {
    console.error("[conversations] list error:", err.message);
    res.status(500).json({ error: "Could not load conversations." });
  }
});

// POST /api/conversations — create a blank conversation
router.post("/", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date().toISOString();
    const conv = {
      id: uuidv4(), userId,
      title: "New Conversation",
      createdAt: now, updatedAt: now,
      archived: false,
    };
    const created = await insert(collections.conversations, conv);
    res.json({ conversation: created });
  } catch (err) {
    console.error("[conversations] create error:", err.message);
    res.status(500).json({ error: "Could not create conversation." });
  }
});

// PATCH /api/conversations/:id — rename
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user.id;
    if (!title || !title.trim()) return res.status(400).json({ error: "Title is required." });

    const conv = await findOne(collections.conversations, { id, userId });
    if (!conv) return res.status(404).json({ error: "Conversation not found." });

    await update(collections.conversations, { id, userId }, {
      title: title.trim().slice(0, 100),
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[conversations] rename error:", err.message);
    res.status(500).json({ error: "Could not rename conversation." });
  }
});

// DELETE /api/conversations/:id — delete conversation and all its messages
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const conv = await findOne(collections.conversations, { id, userId });
    if (!conv) return res.status(404).json({ error: "Conversation not found." });

    await new Promise((resolve, reject) => {
      collections.messages.remove({ conversationId: id, userId }, { multi: true }, (err) => {
        if (err) reject(err); else resolve();
      });
    });
    await remove(collections.conversations, { id, userId }, {});
    res.json({ ok: true });
  } catch (err) {
    console.error("[conversations] delete error:", err.message);
    res.status(500).json({ error: "Could not delete conversation." });
  }
});

// GET /api/conversations/:id/messages — messages for one conversation
router.get("/:id/messages", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const conv = await findOne(collections.conversations, { id, userId });
    if (!conv) return res.status(404).json({ error: "Conversation not found." });

    const isPro = req.user.plan && req.user.plan !== "free";
    const limit = isPro ? 200 : 100;
    const rawMsgs = await find(collections.messages, { conversationId: id, userId }, { sort: { createdAt: 1 }, limit });
    const messages = rawMsgs.map(m => decryptMsg(m, userId));

    res.json({ messages, conversation: conv });
  } catch (err) {
    console.error("[conversations] messages error:", err.message);
    res.status(500).json({ error: "Could not load messages." });
  }
});

module.exports = router;
