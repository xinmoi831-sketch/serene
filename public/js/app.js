// Serene — Main App
let state = {
  user: null,
  mood: "okay",
  chatMessages: [],
  journalEntries: [],
  moodHistory: [],
  currentPage: "chat",
  sending: false,
  voiceUsedToday: 0,
  VOICE_FREE_LIMIT: 3,
};

window.addEventListener("DOMContentLoaded", async () => {
  window.APP_LANG = localStorage.getItem("serene_lang") || "en";
  const token = api.getToken();
  if (!token) { showPage("login"); return; }
  const res = await api.me(token);
  if (res.ok) {
    state.user = res.data.user;
    const today = new Date().toISOString().slice(0, 10);
    const stored = JSON.parse(localStorage.getItem("serene_voice_usage") || "{}");
    state.voiceUsedToday = stored.date === today ? (stored.count || 0) : 0;
    showApp();
  } else {
    api.clearToken();
    showPage("login");
  }
});

function showApp() {
  showPage("app");
  updateUserUI();
  navigateTo("chat");
  setTimeout(function() {
    if (typeof EmotionTracker !== "undefined") EmotionTracker.init();
    if (typeof ScrollEngine !== "undefined") ScrollEngine.init();
  }, 300);
}

function navigateTo(tab) {
  state.currentPage = tab;
  document.querySelectorAll(".bnav-item").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector('[data-tab="' + tab + '"]');
  if (btn) btn.classList.add("active");
  document.querySelectorAll(".tab-content").forEach(el => el.style.display = "none");
  const tabEl = document.getElementById("tab-" + tab);
  if (tabEl) tabEl.style.display = "flex";
  const labels = { chat: "Chat", journal: "Journal", insights: "Insights", settings: "Settings" };
  const lbl = document.getElementById("currentTabLabel");
  if (lbl) lbl.textContent = labels[tab] || tab;
  document.querySelectorAll(".drawer-nav-item[data-tab]").forEach(b => b.classList.remove("active"));
  const active = document.querySelector(".drawer-nav-item[data-tab='" + tab + "']");
  if (active) active.classList.add("active");
  if (tab === "journal") loadJournal();
  if (tab === "insights") loadInsights();
  if (tab === "settings") loadSettings();
  if (tab === "chat") loadChat();
}

// ── Auth ──────────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  const alrt = document.getElementById("loginAlert");
  if (!email || !pass) return showAlert(alrt, "Please fill in all fields.", "error");
  setLoading("loginBtn", true);
  const res = await api.login(email, pass);
  setLoading("loginBtn", false);
  if (res.ok) {
    api.setToken(res.data.token);
    state.user = res.data.user;
    showApp();
  } else {
    showAlert(alrt, res.data.error || "Incorrect email or password.", "error");
  }
}

async function doRegister() {
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const pass = document.getElementById("regPass").value;
  const alrt = document.getElementById("regAlert");
  if (!name || !email || !pass) return showAlert(alrt, "Please fill in all fields.", "error");
  if (pass.length < 8) return showAlert(alrt, "Password must be at least 8 characters.", "error");
  setLoading("regBtn", true);
  const res = await api.register(email, pass, name);
  setLoading("regBtn", false);
  if (res.ok) {
    api.setToken(res.data.token);
    state.user = res.data.user;
    showApp();
  } else {
    showAlert(alrt, res.data.error || "Could not create account.", "error");
  }
}

function doLogout() {
  api.clearToken();
  state.user = null;
  state.chatMessages = [];
  showPage("login");
}

// ── User UI ───────────────────────────────────────────────────────
function updateUserUI() {
  if (!state.user) return;
  const u = state.user;
  function el(id) { return document.getElementById(id); }
  if (el("userPlan")) {
    const cls = u.plan === "free" ? "plan-free" : u.plan === "annual" ? "plan-annual" : "plan-pro";
    const lbl = u.plan === "free" ? "Free" : u.plan === "annual" ? "Pro Annual" : "Pro";
    el("userPlan").innerHTML = '<span class="plan-badge ' + cls + '">' + lbl + "</span>";
  }
  if (el("drawerAvatar")) el("drawerAvatar").textContent = (u.name || u.email).charAt(0).toUpperCase();
  if (el("drawerUsername")) el("drawerUsername").textContent = u.name || u.email.split("@")[0];
  if (el("drawerEmail")) el("drawerEmail").textContent = u.email;
  if (el("drawerPlanChip")) {
    var labels = { free: "Free plan", pro: "Pro Monthly", annual: "Pro Annual" };
    el("drawerPlanChip").textContent = labels[u.plan] || "Free plan";
  }
  updateVoiceBtn();
}

// ── Voice limits ──────────────────────────────────────────────────
function updateVoiceBtn() {
  const btn = document.getElementById("voiceModeBtn");
  if (!btn) return;
  const isPro = state.user && state.user.plan !== "free";
  const left = state.VOICE_FREE_LIMIT - state.voiceUsedToday;
  const badge = document.getElementById("voiceBadge");
  if (isPro) {
    btn.title = "Voice mode — unlimited";
    if (badge) badge.style.display = "none";
  } else {
    btn.title = left > 0 ? ("Voice mode — " + left + " free sessions left today") : "Voice limit reached — upgrade to Pro";
    if (badge) { badge.style.display = "flex"; badge.textContent = left > 0 ? left : "X"; }
  }
}

function canUseVoice() {
  if (state.user && state.user.plan !== "free") return true;
  return state.voiceUsedToday < state.VOICE_FREE_LIMIT;
}

function handleVoiceBtnClick() {
  if (canUseVoice()) {
    if (typeof VoiceSystem !== "undefined") {
      VoiceSystem.toggleVoiceMode();
      state.voiceUsedToday++;
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem("serene_voice_usage", JSON.stringify({ date: today, count: state.voiceUsedToday }));
      updateVoiceBtn();
    }
  } else {
    showVoiceLimitModal();
  }
}

function showVoiceLimitModal() {
  const m = document.getElementById("voiceLimitModal");
  if (m) m.style.display = "flex";
}
function hideVoiceLimitModal() {
  const m = document.getElementById("voiceLimitModal");
  if (m) m.style.display = "none";
}

// ── Welcome message ───────────────────────────────────────────────
function getWelcomeHTML() {
  var name = state.user && state.user.name ? state.user.name.split(" ")[0] : "there";
  var hour = new Date().getHours();
  var greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  var bodies = [
    "Think of me as that one friend who actually read all the medical and psychology books so you do not have to. I am here for the big things, the small things, and everything in between. No judgment, no rush. What is on your mind today?",
    "Whatever brought you here today — stress, symptoms, sadness, or just needing someone to talk to — you made the right call. I am genuinely here for you. Real, warm, and always on your side.",
    "Whether you need medical guidance, emotional support, or just someone who actually listens without jumping to solutions — I have got you. Always."
  ];
  var body = bodies[Math.floor(Math.random() * bodies.length)];
  return '<div class="welcome-card-new">' +
    '<div class="wcn-glow-ring"></div>' +
    '<div class="wcn-glow-ring wcn-ring2"></div>' +
    '<div class="wcn-logo">🌿</div>' +
    '<div class="wcn-brand">Serene</div>' +
    '<div class="wcn-lines">' +
      '<div class="wcn-line wcn-line1">We are here for you</div>' +
      '<div class="wcn-line wcn-line2">You are never alone</div>' +
      '<div class="wcn-line wcn-line3">Your mental health matters</div>' +
    '</div>' +
    '<div class="wcn-greeting">' + greet + ", " + name + ".</div>" +
    '<div class="wcn-body">' + body + '</div>' +
    '<div class="wcn-dots"><span></span><span></span><span></span></div>' +
  '</div>';
}

// ── Chat ──────────────────────────────────────────────────────────
async function loadChat() {
  if (state.chatMessages.length > 0) return renderChat();
  const res = await api.getChatHistory(api.getToken());
  if (res.ok) state.chatMessages = res.data.messages || [];
  renderChat();
}

function renderChat() {
  const area = document.getElementById("chatMessages");
  if (!area) return;
  area.innerHTML = "";
  if (state.chatMessages.length === 0) {
    var d = document.createElement("div");
    d.innerHTML = getWelcomeHTML();
    if (d.firstElementChild) {
      var anc = document.getElementById("scrollAnchor");
      if (anc) area.insertBefore(d.firstElementChild, anc);
      else area.appendChild(d.firstElementChild);
    }
  } else {
    state.chatMessages.forEach(function(m) {
      appendMessageToDOM(m.role, m.content, m.createdAt, false);
    });
  }
  ScrollEngine.onLoad();
}



let msgCounter = 0;
function appendMessageToDOM(role, content, time, isNew) {
  if (isNew === undefined) isNew = true;
  const area = document.getElementById("chatMessages");
  if (!area) return;
  const msgId = "msg-" + (++msgCounter);
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : "ai");
  div.setAttribute("data-msg-id", msgId);
  const timeStr = time ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const bubbleCls = "bubble" + (isNew && role === "assistant" ? " new-reply" : "");
  const ttsBtn = (role === "assistant" && typeof TTS !== "undefined" && TTS.isSupported())
    ? '<div class="msg-actions"><button class="tts-play-btn" onclick="TTS.play(\'' + msgId + '\')" title="Play audio"><i class="ti ti-volume"></i></button><span class="msg-time-inline">' + timeStr + "</span></div>"
    : '<div class="msg-time">' + timeStr + "</div>";
  div.innerHTML = '<div class="msg-sender">' + (role === "user" ? "You" : "Serene") + "</div>" +
    '<div class="' + bubbleCls + '">' + escHtml(content) + "</div>" + ttsBtn;
  var anc2 = document.getElementById("scrollAnchor");
  if (anc2) area.insertBefore(div, anc2);
  else area.appendChild(div);
  if (role === "user") ScrollEngine.onUserMessage();
  else ScrollEngine.onAIMessage();
}

function showThinking() {
  const area = document.getElementById("chatMessages");
  if (!area) return;
  const welcome = area.querySelector(".welcome-card");
  if (welcome) welcome.style.opacity = "0.4";
  const div = document.createElement("div");
  div.className = "msg ai";
  div.id = "thinkingIndicator";
  div.innerHTML = '<div class="msg-sender">Serene</div><div class="thinking-bubble"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div>';
  var anc3 = document.getElementById("scrollAnchor");
  if (anc3) area.insertBefore(div, anc3);
  else area.appendChild(div);
  ScrollEngine.onUserMessage();
}

function hideThinking() {
  const el = document.getElementById("thinkingIndicator");
  if (el) el.remove();
  const welcome = document.querySelector(".welcome-card");
  if (welcome) welcome.style.opacity = "1";
}

async function sendMessage() {
  if (state.sending) return;
  const input = document.getElementById("chatInput");
  const text = input ? input.value.trim() : "";
  if (!text) return;

  const welcome = document.querySelector(".welcome-card");
  if (welcome) {
    welcome.style.transition = "all 0.3s ease";
    welcome.style.opacity = "0";
    welcome.style.transform = "scale(0.95)";
    setTimeout(function() { if (welcome.parentNode) welcome.parentNode.removeChild(welcome); }, 300);
  }

  state.sending = true;
  input.value = "";
  input.style.height = "auto";
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.disabled = true;

  appendMessageToDOM("user", text, new Date().toISOString(), false);
  state.chatMessages.push({ role: "user", content: text, createdAt: new Date().toISOString() });
  showThinking();

  const res = await api.sendMessage(text, state.mood, api.getToken());
  hideThinking();

  if (res.ok) {
    const reply = res.data.reply;
    appendMessageToDOM("assistant", reply, new Date().toISOString(), true);
    state.chatMessages.push({ role: "assistant", content: reply, createdAt: new Date().toISOString() });
    if (typeof EmotionTracker !== "undefined") EmotionTracker.track(text, reply);
    const crisisBanner = document.getElementById("crisisBanner");
    if (res.data.isCrisis && crisisBanner) crisisBanner.style.display = "flex";
    if (res.data.dailyLimit && res.data.dailyUsed) {
      const remaining = res.data.dailyLimit - res.data.dailyUsed;
      if (remaining <= 2 && state.user && state.user.plan === "free") {
        setTimeout(function() {
          appendMessageToDOM("assistant", "Just so you know — you have " + remaining + " message" + (remaining === 1 ? "" : "s") + " left today on the free plan. Upgrading to Pro gives you 500 messages a day.", new Date().toISOString(), true);
        }, 1000);
      }
    }
  } else {
    appendMessageToDOM("assistant", "I am so sorry — something went wrong on my end. Could you try sending that again?", new Date().toISOString(), true);
  }

  state.sending = false;
  if (sendBtn) sendBtn.disabled = false;
}

function setMood(mood, el) {
  state.mood = mood;
  document.querySelectorAll(".mood-pill").forEach(function(p) { p.classList.remove("active"); });
  el.classList.add("active");
  api.logMood(mood, null, api.getToken());
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 100) + "px";
}

function handleChatKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// ── Chat Summary ──────────────────────────────────────────────────
async function summarizeChat() {
  if (state.chatMessages.length < 4) { alert("Have a longer conversation first before summarising."); return; }
  const btn = document.getElementById("summaryBtn");
  if (btn) { btn.disabled = true; btn.textContent = "..."; }
  const res = await api.sendMessage("Please summarise our conversation so far in 3-4 sentences. What were the main topics we discussed and how is the user feeling? Write it in third person as a brief note.", state.mood, api.getToken());
  if (btn) { btn.disabled = false; btn.textContent = "📋"; }
  if (res.ok) {
    const summary = res.data.reply;
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:500;display:flex;align-items:center;justify-content:center;padding:1.5rem";
    overlay.innerHTML = '<div style="background:#0d1428;border:0.5px solid rgba(255,255,255,0.15);border-radius:20px;padding:1.75rem;max-width:400px;width:100%"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h3 style="color:#a5b4fc;font-size:16px">Conversation Summary</h3><button onclick="this.closest(\'[style*=fixed]\').remove()" style="background:none;border:none;color:#8b9dc3;font-size:20px;cursor:pointer">X</button></div><p style="font-size:14px;color:#f0f4ff;line-height:1.7">' + escHtml(summary) + "</p></div>";
    document.body.appendChild(overlay);
  }
}

// ── Journal ───────────────────────────────────────────────────────
async function loadJournal() {
  const res = await api.getEntries(api.getToken());
  if (res.ok) state.journalEntries = res.data.entries || [];
  renderJournal();
}

function renderJournal() {
  const list = document.getElementById("journalList");
  if (!list) return;
  if (!state.journalEntries.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📓</div><div class="empty-title">No journal entries yet</div><div class="empty-sub">Start writing to track your mental wellness journey</div></div>';
    return;
  }
  list.innerHTML = state.journalEntries.map(function(e) {
    var date = new Date(e.created_at || e.createdAt).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" });
    return '<div class="journal-entry"><div class="journal-date">' + date + '</div><div class="journal-content">' + escHtml(e.content) + "</div>" + (e.reflection ? '<div class="journal-reflection">💭 ' + escHtml(e.reflection) + "</div>" : "") + "</div>";
  }).join("");
}

function showNewEntry() { document.getElementById("newEntryForm").style.display = "block"; document.getElementById("journalContent").focus(); }
function hideNewEntry() { document.getElementById("newEntryForm").style.display = "none"; document.getElementById("journalContent").value = ""; }

async function saveJournalEntry() {
  const content = document.getElementById("journalContent").value.trim();
  const wantsReflection = document.getElementById("wantsReflection") && document.getElementById("wantsReflection").checked;
  if (!content) return;
  setLoading("saveEntryBtn", true);
  const res = await api.saveEntry(content, wantsReflection && state.user && state.user.plan !== "free", api.getToken());
  setLoading("saveEntryBtn", false);
  if (res.ok) { hideNewEntry(); await loadJournal(); }
  else alert(res.data.error || "Could not save entry.");
}

// ── Insights ──────────────────────────────────────────────────────
async function loadInsights() {
  const res = await api.getMoodHistory(api.getToken());
  if (res.ok) state.moodHistory = res.data;
  renderInsights();
}

function renderInsights() {
  const c = document.getElementById("insightsContent");
  if (!c) return;
  const summary = (state.moodHistory && state.moodHistory.summary) || {};
  const total = Object.values(summary).reduce(function(a, b) { return a + b; }, 0);
  const moodColors = { good: "#1D9E75", okay: "#818cf8", low: "#f59e0b", distressed: "#f43f5e" };
  const moodLabels = { good: "Good", okay: "Okay", low: "Low", distressed: "Distressed" };
  var bars = "";
  if (total === 0) {
    bars = '<p style="font-size:13px;text-align:center;padding:1rem 0;color:var(--text3)">No mood data yet. Select your mood in the chat tab.</p>';
  } else {
    ["good","okay","low","distressed"].forEach(function(m) {
      var count = summary[m] || 0;
      var pct = total ? Math.round(count / total * 100) : 0;
      bars += '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px"><span style="color:var(--text2)">' + moodLabels[m] + '</span><span style="color:var(--text3)">' + count + " (" + pct + '%)</span></div><div style="background:var(--surface2);border-radius:4px;height:8px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + moodColors[m] + ';border-radius:4px"></div></div></div>';
    });
  }
  c.innerHTML = '<div class="stats-grid" style="margin-bottom:1.25rem"><div class="stat-card"><div class="stat-num">' + total + '</div><div class="stat-label">Mood logs</div></div><div class="stat-card"><div class="stat-num">' + state.journalEntries.length + '</div><div class="stat-label">Journal entries</div></div><div class="stat-card"><div class="stat-num">' + (state.user && state.user.plan === "free" ? "10" : "500") + '</div><div class="stat-label">Daily limit</div></div></div><div class="glass" style="padding:1.25rem;margin-bottom:1rem"><h3 style="margin-bottom:1rem">Mood history</h3>' + bars + "</div>";
}

// ── Settings ──────────────────────────────────────────────────────
function loadSettings() {
  const u = state.user;
  if (!u) return;
  // Inject currency selector
  var currWrap = document.getElementById("currencySelectorWrap");
  if (currWrap && typeof CurrencySystem !== "undefined") {
    currWrap.innerHTML = '<select class="currency-select" onchange="CurrencySystem.setManual(this.value)">' +
      CurrencySystem.buildSelector() + "</select>";
  }
  const emailEl = document.getElementById("settingsEmail");
  const planEl = document.getElementById("settingsPlan");
  const upgradeBtn = document.getElementById("upgradeBtn");
  const manageBtn = document.getElementById("manageBtn");
  if (emailEl) emailEl.textContent = u.email;
  if (planEl) {
    var cls = u.plan === "free" ? "plan-free" : u.plan === "annual" ? "plan-annual" : "plan-pro";
    var lbl = u.plan === "free" ? "Free" : u.plan === "annual" ? "Pro Annual" : "Pro Monthly";
    planEl.innerHTML = '<span class="plan-badge ' + cls + '">' + lbl + "</span>";
  }
  if (upgradeBtn) upgradeBtn.style.display = u.plan === "free" ? "block" : "none";
  if (manageBtn) manageBtn.style.display = u.plan !== "free" ? "block" : "none";
}

async function showPlans() {
  document.getElementById("plansModal").style.display = "flex";
  const res = await api.getPlans();
  if (!res.ok) return;
  const list = document.getElementById("plansList");
  list.innerHTML = res.data.plans.filter(function(p) { return p.id !== "free"; }).map(function(plan) {
    return '<div class="pricing-card ' + (plan.popular ? "popular" : "") + '">' +
      (plan.popular ? '<div class="pricing-popular-badge">Most popular</div>' : "") +
      '<h3 style="margin-bottom:6px">' + plan.name + "</h3>" +
      '<div style="margin-bottom:12px"><span class="pricing-price">' + plan.price + '</span><span class="pricing-interval"> ' + plan.interval + "</span></div>" +
      (plan.trial ? '<div style="font-size:12px;color:var(--accent2);margin-bottom:10px">✓ ' + plan.trial + "</div>" : "") +
      '<ul class="feature-list">' + plan.features.map(function(f) { return "<li>" + f + "</li>"; }).join("") + "</ul>" +
      '<button class="btn btn-primary" style="margin-top:14px" onclick="startCheckout(\'' + (plan.stripePriceId || "") + '\')">Start 7-day free trial</button></div>';
  }).join("");
}

function hidePlans() { document.getElementById("plansModal").style.display = "none"; }

async function startCheckout(planId, mode) {
  // Use new modular payment system — no Stripe
  const token = api.getToken();
  if (!token) { alert("Please log in first."); return; }

  // Show payment method selection
  showPaymentMethodModal(planId);
}

async function initiatePayment(planId, method) {
  hidePaymentMethodModal();
  const token = api.getToken();

  // Get user country from browser
  var country = "ZM"; // default Zambia
  try {
    var lang = navigator.language || "";
    var region = lang.split("-")[1];
    if (region) country = region.toUpperCase();
  } catch(e) {}

  setLoading("upgradeBtn", true);
  const res = await fetch("/api/payments/initiate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
      "X-Country": country,
    },
    body: JSON.stringify({ planId: planId, method: method }),
  });
  setLoading("upgradeBtn", false);

  const data = await res.json();
  if (res.ok && data.paymentUrl && data.paymentUrl !== "#mobile-money-sandbox") {
    window.location.href = data.paymentUrl;
  } else if (data.paymentUrl === "#mobile-money-sandbox") {
    alert("Mobile Money payment\n\nTo activate live Mobile Money payments:\n1. Sign up at developers.mtn.com (MTN MoMo) or developer.airtel.africa (Airtel Money)\n2. Add MTN_MOMO_API_KEY or AIRTEL_MONEY_API_KEY to Railway variables\n\nCurrent status: Sandbox mode");
  } else {
    alert(data.error || "Payment could not be started. Please try again.");
  }
}

function showPaymentMethodModal(planId) {
  var existing = document.getElementById("paymentMethodModal");
  if (existing) existing.remove();
  var modal = document.createElement("div");
  modal.id = "paymentMethodModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:700;display:flex;align-items:flex-end;justify-content:center;padding:1rem";

  var wrap = document.createElement("div");
  wrap.style.cssText = "background:#0d1428;border:0.5px solid rgba(255,255,255,0.15);border-radius:24px 24px 0 0;padding:2rem;width:100%;max-width:480px";

  var title = document.createElement("h3");
  title.style.cssText = "color:#f0f4ff;font-size:18px;margin-bottom:8px;text-align:center";
  title.textContent = "Choose payment method";
  wrap.appendChild(title);

  var sub = document.createElement("p");
  sub.style.cssText = "color:#8b9dc3;font-size:13px;text-align:center;margin-bottom:1.5rem";
  sub.textContent = "Select how you want to pay";
  wrap.appendChild(sub);

  function makeBtn(emoji, label, method, bg, borderColor, textColor) {
    var btn = document.createElement("button");
    btn.style.cssText = "width:100%;padding:14px;background:" + bg + ";border:0.5px solid " + borderColor + ";border-radius:12px;color:" + textColor + ";font-size:15px;font-weight:500;cursor:pointer;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:10px";
    btn.textContent = emoji + " " + label;
    btn.onclick = function() { initiatePayment(planId, method); };
    return btn;
  }

  wrap.appendChild(makeBtn("💳", "Card Payment (Visa / Mastercard)", "dpo",        "rgba(99,102,241,0.15)",  "rgba(99,102,241,0.3)",  "#a5b4fc"));
  wrap.appendChild(makeBtn("🅿️", "PayPal",                           "paypal",      "rgba(0,112,243,0.1)",    "rgba(0,112,243,0.3)",   "#60a5fa"));
  wrap.appendChild(makeBtn("📱", "Mobile Money (MTN / Airtel)",      "mobilemoney", "rgba(255,196,0,0.1)",    "rgba(255,196,0,0.3)",   "#fbbf24"));

  var cancel = document.createElement("button");
  cancel.style.cssText = "width:100%;padding:12px;background:transparent;border:0.5px solid rgba(255,255,255,0.1);border-radius:12px;color:#8b9dc3;font-size:14px;cursor:pointer;margin-top:6px";
  cancel.textContent = "Cancel";
  cancel.onclick = hidePaymentMethodModal;
  wrap.appendChild(cancel);

  modal.appendChild(wrap);
  document.body.appendChild(modal);
}

function hidePaymentMethodModal() {
  var m = document.getElementById("paymentMethodModal");
  if (m) m.remove();
}

async function openPortal() {
  const res = await api.openPortal(api.getToken());
  if (res.ok) window.location.href = res.data.portalUrl;
  else alert(res.data.error || "Could not open billing portal.");
}

async function confirmDeleteAccount() {
  if (!confirm("This permanently deletes your account and all data. Cannot be undone.")) return;
  const res = await api.deleteAccount(api.getToken());
  if (res.ok) { api.clearToken(); location.reload(); }
}

// ── Helpers ───────────────────────────────────────────────────────
function showAlert(el, msg, type) {
  if (!el) return;
  el.className = "alert alert-" + (type || "error") + " show";
  el.textContent = msg;
  setTimeout(function() { el.classList.remove("show"); }, 4000);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) { btn.setAttribute("data-original", btn.innerHTML); btn.innerHTML = '<span class="loader"></span>'; }
  else { const o = btn.getAttribute("data-original"); if (o) btn.innerHTML = o; }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}
