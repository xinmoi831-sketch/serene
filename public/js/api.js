// Serene — API Client
var API_URL = window.location.origin;
var TOKEN_KEY = "serene_token";

var api = {
  getToken: function() { return localStorage.getItem(TOKEN_KEY); },
  setToken: function(t) { localStorage.setItem(TOKEN_KEY, t); },
  clearToken: function() { localStorage.removeItem(TOKEN_KEY); },

  request: async function(method, path, body, token) {
    var headers = { "Content-Type": "application/json" };
    var t = token || this.getToken();
    if (t) headers["Authorization"] = "Bearer " + t;
    try {
      var res = await fetch(API_URL + path, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      var data = await res.json();
      return { ok: res.ok, status: res.status, data: data };
    } catch (err) {
      return { ok: false, status: 0, data: { error: "Network error. Make sure your server is running." } };
    }
  },

  get:  function(path, token) { return this.request("GET", path, null, token); },
  post: function(path, body, token) { return this.request("POST", path, body, token); },
  del:  function(path, token) { return this.request("DELETE", path, null, token); },

  register:       function(email, password, name) { return this.post("/api/auth/register", { email: email, password: password, name: name }); },
  login:          function(email, password) { return this.post("/api/auth/login", { email: email, password: password }); },
  me:             function(token) { return this.get("/api/auth/me", token); },
  deleteAccount:  function(token) { return this.del("/api/auth/account", token); },

  sendMessage:    function(message, mood, token) { return this.post("/api/chat/message", { message: message, mood: mood }, token); },
  getChatHistory: function(token) { return this.get("/api/chat/history", token); },
  clearHistory:   function(token) { return this.del("/api/chat/history", token); },

  saveEntry:      function(content, generateReflection, token) { return this.post("/api/journal/entry", { content: content, generateReflection: generateReflection }, token); },
  getEntries:     function(token) { return this.get("/api/journal/entries", token); },
  deleteEntry:    function(id, token) { return this.del("/api/journal/entry/" + id, token); },
  logMood:        function(mood, note, token) { return this.post("/api/journal/mood", { mood: mood, note: note }, token); },
  getMoodHistory: function(token) { return this.get("/api/journal/mood/history", token); },

  getPlans:        function() { return this.get("/api/subscription/plans"); },
  checkout:        function(priceId, mode, token) { return this.post("/api/subscription/checkout", { priceId: priceId, mode: mode || "subscription" }, token); },
  openPortal:      function(token) { return this.post("/api/subscription/portal", {}, token); },

  saveOnboarding:  function(data, token) { return this.post("/api/user/onboarding", data, token); },
  getProfile:      function(token) { return this.get("/api/user/profile", token); },
};
