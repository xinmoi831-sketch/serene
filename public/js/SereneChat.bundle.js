// Serene Chat — React Island (unified sidebar architecture)
(function() {
  "use strict";

  // ── useAutoScroll ──────────────────────────────────────────────
  function useAutoScroll(messages, isWaiting) {
    var containerRef = React.useRef(null);
    var bottomRef    = React.useRef(null);
    var userScrolled = React.useRef(false);
    var lastCount    = React.useRef(0);
    var NEAR_PX      = 80;
    var jumpState    = React.useState(false);
    var showJump     = jumpState[0];
    var setShowJump  = jumpState[1];

    var isNearBottom = React.useCallback(function() {
      var c = containerRef.current;
      if (!c) return true;
      return (c.scrollHeight - c.scrollTop - c.clientHeight) <= NEAR_PX;
    }, []);

    var scrollToBottom = React.useCallback(function(behavior) {
      var b = bottomRef.current;
      if (b) b.scrollIntoView({ behavior: behavior || "smooth", block: "end" });
      setShowJump(false);
      userScrolled.current = false;
    }, [setShowJump]);

    React.useEffect(function() {
      var c = containerRef.current;
      if (!c) return;
      function onScroll() {
        if (isNearBottom()) {
          userScrolled.current = false;
          setShowJump(false);
        } else {
          userScrolled.current = true;
        }
      }
      c.addEventListener("scroll", onScroll, { passive: true });
      return function() { c.removeEventListener("scroll", onScroll); };
    }, [isNearBottom, setShowJump]);

    React.useEffect(function() {
      var count = messages.length;
      var added = count > lastCount.current;
      lastCount.current = count;
      if (!added) return;
      if (userScrolled.current) {
        setShowJump(true);
      } else {
        scrollToBottom("smooth");
      }
    }, [messages, scrollToBottom, setShowJump]);

    React.useEffect(function() {
      if (isWaiting && !userScrolled.current) scrollToBottom("smooth");
    }, [isWaiting, scrollToBottom]);

    React.useEffect(function() {
      scrollToBottom("instant");
    }, []);

    return { containerRef: containerRef, bottomRef: bottomRef, showJump: showJump, scrollToBottom: scrollToBottom };
  }

  // ── WelcomeCard ────────────────────────────────────────────────
  function WelcomeCard() {
    var firstName = (window.state && window.state.user && window.state.user.name)
      ? window.state.user.name.split(" ")[0] : null;
    var companions = [
      "How's your heart feeling today?",
      "Whatever brought you here — I'm glad you came.",
      "You don't have to carry everything alone.",
      "Take your time. I'm not going anywhere.",
      "It's okay to not have it all together.",
      "What's been on your mind lately?",
      "I'm here — whenever you're ready to talk.",
      "Some days are heavier than others. I'm here for all of them.",
    ];
    var companion = React.useState(function() { return companions[Math.floor(Math.random() * companions.length)]; })[0];
    var greetings = [
      "Hey love. Really glad you're here.",
      "Welcome back. Good to see you.",
      "Hey there. I've been thinking of you.",
      "Hello, dear. Glad you stopped by.",
    ];
    var greeting = firstName
      ? greetings[Math.floor(Math.random() * greetings.length)].replace(".", ", " + firstName + ".")
      : greetings[Math.floor(Math.random() * greetings.length)];
    var e = React.createElement;
    return e("div", { className: "welcome-card-new" },
      e("div", { className: "wcn-glow-ring" }),
      e("div", { className: "wcn-glow-ring wcn-ring2" }),
      e("video", { className: "wcn-logo", src: "/videos/serene-welcome-animation.mp4", autoPlay: true, muted: true, loop: true, playsInline: true }),
      e("div", { className: "wcn-brand" }, "Serene"),
      e("div", { className: "wcn-greeting" }, greeting),
      e("div", { className: "wcn-companion" }, companion),
      e("div", { className: "wcn-dots" }, e("span"), e("span"), e("span"))
    );
  }

  // ── ThinkingBubble ─────────────────────────────────────────────
  function ThinkingBubble() {
    var e = React.createElement;
    return e("div", { className: "msg ai" },
      e("div", { className: "msg-sender" }, "Serene"),
      e("div", { className: "thinking-bubble" },
        e("div", { className: "thinking-dot" }),
        e("div", { className: "thinking-dot" }),
        e("div", { className: "thinking-dot" })
      )
    );
  }

  // ── MessageBubble ──────────────────────────────────────────────
  function MessageBubble(props) {
    var msg    = props.msg;
    var isNew  = props.isNew;
    var msgId  = props.msgId;
    var e      = React.createElement;
    var isUser = msg.role === "user";
    var companionMoment = !isUser && !!msg.isCompanionMoment;
    var timeStr = msg.createdAt
      ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    var bubbleCls = "bubble"
      + (isNew && !isUser ? " new-reply" : "")
      + (companionMoment ? " bubble--companion" : "");
    var html = String(msg.content)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    return e("div", { className: "msg " + (isUser ? "user" : "ai"), "data-msg-id": msgId },
      e("div", { className: "msg-sender" }, isUser ? "You" : "Serene"),
      e("div", { className: bubbleCls },
        e("span", { dangerouslySetInnerHTML: { __html: html } }),
        companionMoment ? e("img", { className: "companion-moment-avatar", src: "/images/serene-avatar.png", alt: "" }) : null
      ),
      !isUser ? e("button", {
        className: "tts-play-btn",
        title: "Play audio",
        onClick: function(ev) { ev.stopPropagation(); window.TTS && window.TTS.play(msgId); }
      }, e("i", { className: "ti ti-volume" })) : null,
      e("div", { className: "msg-time" }, timeStr)
    );
  }

  // ── NewMessagesButton ──────────────────────────────────────────
  function NewMessagesButton(props) {
    return React.createElement("button", { className: "new-msgs-btn", onClick: props.onJump }, "New messages ↓");
  }

  // ── FloatingSupportButton ──────────────────────────────────────
  function FloatingSupportButton(props) {
    var riskLevel = props.riskLevel;
    var onDismiss = props.onDismiss;
    var e = React.createElement;
    var menuState   = React.useState(false);
    var showMenu    = menuState[0];
    var setShowMenu = menuState[1];

    // Close menu when clicking outside
    React.useEffect(function() {
      if (!showMenu) return;
      function handleOutside(ev) {
        var wrap = document.querySelector(".support-float-wrap");
        if (wrap && !wrap.contains(ev.target)) setShowMenu(false);
      }
      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("touchstart", handleOutside);
      return function() {
        document.removeEventListener("mousedown", handleOutside);
        document.removeEventListener("touchstart", handleOutside);
      };
    }, [showMenu]);

    if (!riskLevel || riskLevel === "green") return null;

    var label = "💜 Get Support";
    var levelKey = riskLevel === "critical" ? "red" : riskLevel;
    if (levelKey === "red")    label = "💜 Get Immediate Support";
    else if (levelKey === "orange") label = "💜 Talk to Someone";

    function toggle() { setShowMenu(function(p) { return !p; }); }

    function goTherapists() {
      setShowMenu(false);
      if (window.navigateTo) window.navigateTo("therapists");
    }

    function goHotlines() {
      setShowMenu(false);
      if (window.navigateTo) window.navigateTo("hotlines");
    }

    function handleDismiss(ev) {
      ev.stopPropagation();
      setShowMenu(false);
      if (onDismiss) onDismiss();
    }

    return e("div", { className: "support-float-wrap" },
      e("button", { className: "support-float-btn support-float-btn--" + levelKey, onClick: toggle },
        e("span", null, label),
        e("span", {
          className: "support-float-dismiss",
          onClick: handleDismiss,
          title: "Dismiss",
          role: "button",
          "aria-label": "Dismiss support button"
        }, "×")
      ),
      showMenu ? e("div", { className: "support-float-menu" },
        e("button", { className: "support-float-menu-item", onClick: goTherapists },
          e("i", { className: "ti ti-calendar-event" }),
          e("span", null, "Book Session")
        ),
        e("button", { className: "support-float-menu-item", onClick: goHotlines },
          e("i", { className: "ti ti-phone" }),
          e("span", null, "Hotlines")
        )
      ) : null
    );
  }

  // ── ChatInput ──────────────────────────────────────────────────
  function ChatInput(props) {
    var onSend   = props.onSend;
    var disabled = props.disabled;
    var focusRef = props.focusRef;
    var e        = React.createElement;
    var textState = React.useState("");
    var text      = textState[0];
    var setText   = textState[1];
    var taRef     = React.useRef(null);

    React.useEffect(function() {
      if (focusRef) focusRef.current = taRef.current;
    });

    React.useEffect(function() {
      if (!disabled && taRef.current) taRef.current.focus();
    }, [disabled]);

    function resize() {
      var el = taRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 100) + "px";
    }

    function handleKey(ev) {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); submit(); }
    }

    function submit() {
      var t = text.trim();
      if (!t || disabled) return;
      onSend(t);
      setText("");
      if (taRef.current) taRef.current.style.height = "auto";
    }

    return e("div", { className: "sc-input-area" },
      e("div", { className: "sc-tools-row" },
        e("button", {
          className: "sc-tool-btn",
          title: "Breathing exercise",
          onClick: function() { window.BreathingWidget && window.BreathingWidget.open("box"); }
        }, e("i", { className: "ti ti-wind" })),
        e("div", { style: { position: "relative" } },
          e("button", {
            className: "sc-tool-btn",
            id: "voiceModeBtn",
            title: "Voice mode",
            onClick: function() { window.handleVoiceBtnClick && window.handleVoiceBtnClick(); }
          }, e("i", { className: "ti ti-microphone" })),
          e("span", { id: "voiceBadge", className: "sc-voice-badge" }, "3")
        ),
        e("button", {
          className: "sc-tool-btn",
          title: "Summarise conversation",
          onClick: function() { window.summarizeChat && window.summarizeChat(); }
        }, e("span", null, "📋"))
      ),
      e("div", { className: "sc-input-row" },
        e("textarea", {
          ref: taRef,
          className: "sc-textarea",
          rows: 1,
          placeholder: "Share what's on your mind…",
          value: text,
          onChange: function(ev) { setText(ev.target.value); resize(); },
          onKeyDown: handleKey,
          disabled: disabled
        }),
        e("button", {
          className: "sc-send-btn",
          onClick: submit,
          disabled: disabled || !text.trim(),
          title: "Send"
        }, e("i", { className: "ti ti-arrow-up" }))
      )
    );
  }

  // ── saveConvToLocalStorage ─────────────────────────────────────
  // Snapshots the current conversation into localStorage under
  // the key "serene_conversations" (max 50 entries, newest first).
  // Server-side storage is the source of truth; this is a local cache.
  function saveConvToLocalStorage(convId, convList, msgs) {
    try {
      if (!convId || !msgs || !msgs.length) return;
      var conv = convList.find(function(c) { return c.id === convId; });
      if (!conv) return;
      var snapshot = {
        id:        conv.id,
        title:     conv.title || "New Conversation",
        createdAt: conv.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages:  msgs.map(function(m) {
          return { role: m.role, content: m.content, createdAt: m.createdAt };
        }),
      };
      var stored;
      try { stored = JSON.parse(localStorage.getItem("serene_conversations") || "[]"); }
      catch(e) { stored = []; }
      if (!Array.isArray(stored)) stored = [];
      var idx = stored.findIndex(function(s) { return s.id === convId; });
      if (idx >= 0) stored[idx] = snapshot;
      else stored.unshift(snapshot);
      localStorage.setItem("serene_conversations", JSON.stringify(stored.slice(0, 50)));
    } catch(e) {}
  }

  // ── SereneChat (root) ──────────────────────────────────────────
  function SereneChat() {
    var e = React.createElement;

    // Chat state
    var msgsState   = React.useState([]);
    var messages    = msgsState[0];
    var setMessages = msgsState[1];

    var waitState   = React.useState(false);
    var isWaiting   = waitState[0];
    var setWaiting  = waitState[1];

    // Risk level: 'green' | 'yellow' | 'orange' | 'red' | 'critical'
    var riskState    = React.useState("green");
    var riskLevel    = riskState[0];
    var setRiskLevel = riskState[1];

    // Dismiss state — tracks which risk level the user dismissed the button at.
    // Button re-appears when riskLevel changes or when risk returns to green.
    var dismissState        = React.useState(null);
    var dismissedRiskLevel  = dismissState[0];
    var setDismissedRiskLevel = dismissState[1];

    React.useEffect(function() {
      if (riskLevel === "green") setDismissedRiskLevel(null);
    }, [riskLevel]);

    var loadedState = React.useState(false);
    var loaded      = loadedState[0];
    var setLoaded   = loadedState[1];

    var idxState    = React.useState(null);
    var newMsgIdx   = idxState[0];
    var setNewIdx   = idxState[1];

    // Conversation state
    var convsState      = React.useState([]);
    var conversations   = convsState[0];
    var setConversations = convsState[1];

    var activeState     = React.useState(null);
    var activeConvId    = activeState[0];
    var setActiveConvId = activeState[1];

    var sc             = useAutoScroll(messages, isWaiting);
    var containerRef   = sc.containerRef;
    var bottomRef      = sc.bottomRef;
    var showJump       = sc.showJump;
    var scrollToBottom = sc.scrollToBottom;

    var taFocusRef = React.useRef(null);

    // ── Voice / TTS state ──────────────────────────────────────
    var voiceState      = React.useState(function() { return localStorage.getItem("serene_voice") !== "false"; });
    var voiceEnabled    = voiceState[0];
    var setVoiceEnabled = voiceState[1];
    var prevWaiting     = React.useRef(false);

    // Expose toggle to settings panel
    React.useEffect(function() {
      window.sereneSetVoice = function(enabled) {
        setVoiceEnabled(enabled);
        localStorage.setItem("serene_voice", enabled ? "true" : "false");
        var token = window.api && window.api.getToken ? window.api.getToken() : null;
        if (token) {
          fetch("/api/user/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
            body: JSON.stringify({ voiceEnabled: enabled }),
          }).catch(function() {});
        }
      };
      window.sereneVoiceEnabled = voiceEnabled;
    }, [voiceEnabled, setVoiceEnabled]);

    // Auto-play TTS when AI finishes replying
    React.useEffect(function() {
      if (prevWaiting.current && !isWaiting && voiceEnabled && messages.length > 0) {
        var last = messages[messages.length - 1];
        if (last && last.role === "assistant") {
          var msgId = "msg-" + (messages.length - 1);
          setTimeout(function() { window.TTS && window.TTS.play(msgId); }, 150);
        }
      }
      prevWaiting.current = isWaiting;
    }, [isWaiting]);

    // ── Load conversations on mount (restore last opened) ──────
    React.useEffect(function() {
      (async function() {
        var token = window.api && window.api.getToken();
        if (!token) { setLoaded(true); return; }
        try {
          var convRes = await window.api.getConversations(token);
          if (convRes.ok) {
            var convs = convRes.data.conversations || [];
            console.log("[Serene] Loaded conversations:", convs.length);
            setConversations(convs);
            var lastId = localStorage.getItem("serene_last_conv");
            var target = lastId ? convs.find(function(c) { return c.id === lastId; }) : null;
            if (!target && convs.length > 0) target = convs[0];
            if (target) {
              setActiveConvId(target.id);
              var msgRes = await window.api.getConversationMessages(target.id, token);
              if (msgRes.ok) {
                var loadedMsgs = msgRes.data.messages || [];
                setMessages(loadedMsgs);
                for (var mi = loadedMsgs.length - 1; mi >= 0; mi--) {
                  if (loadedMsgs[mi].safetyLevel) { setRiskLevel(loadedMsgs[mi].safetyLevel); break; }
                }
              }
            }
          }
        } catch(err) {}
        setLoaded(true);
      })();
    }, []);

    // ── Switch conversation ────────────────────────────────────
    var switchConversation = React.useCallback(async function(convId) {
      if (convId === activeConvId) return;
      setMessages([]);
      setNewIdx(null);
      setRiskLevel("green");
      setLoaded(false);
      setActiveConvId(convId);
      try {
        var token = window.api && window.api.getToken();
        var res = await window.api.getConversationMessages(convId, token);
        if (res.ok) {
          var switchedMsgs = res.data.messages || [];
          setMessages(switchedMsgs);
          var restoredLevel = "green";
          for (var si = switchedMsgs.length - 1; si >= 0; si--) {
            if (switchedMsgs[si].safetyLevel) { restoredLevel = switchedMsgs[si].safetyLevel; break; }
          }
          setRiskLevel(restoredLevel);
        }
      } catch(err) {}
      setLoaded(true);
    }, [activeConvId]);

    // ── Create new conversation ────────────────────────────────
    // Guard against double-clicks / concurrent invocations.
    var creatingRef = React.useRef(false);

    var createConversation = React.useCallback(async function() {
      if (creatingRef.current) return;
      creatingRef.current = true;
      try {
        var token = window.api && window.api.getToken();

        // Already on an empty conversation — don't create a duplicate empty record.
        // Just surface a fresh empty state and log.
        if (messages.length === 0 && activeConvId) {
          console.log("[Serene] New conversation created");
          creatingRef.current = false;
          return;
        }

        // Current conversation has messages — server already persisted them.
        // Cache a snapshot locally before switching away.
        if (messages.length > 0 && activeConvId) {
          saveConvToLocalStorage(activeConvId, conversations, messages);
          console.log("[Serene] Conversation saved");
        }

        // Create a fresh conversation on the server.
        var res = await window.api.createConversation(token);
        if (res.ok) {
          var newConv = res.data.conversation;
          setConversations(function(prev) { return [newConv].concat(prev); });
          setActiveConvId(newConv.id);
          setMessages([]);
          setNewIdx(null);
          setRiskLevel("green");
          setLoaded(true);
          console.log("[Serene] New conversation created");
          // Refresh from server to make sidebar authoritative
          setTimeout(async function() {
            try {
              var rRes = await window.api.getConversations(token);
              if (rRes.ok) {
                var rConvs = rRes.data.conversations || [];
                console.log("[Serene] Loaded conversations:", rConvs.length);
                setConversations(rConvs);
              }
            } catch(e) {}
          }, 300);
        }
      } catch(err) {}
      creatingRef.current = false;
    }, [messages, activeConvId, conversations]);

    // ── Rename conversation ────────────────────────────────────
    var renameConversation = React.useCallback(async function(convId, title) {
      try {
        var token = window.api && window.api.getToken();
        await window.api.renameConversation(convId, title, token);
        setConversations(function(prev) {
          return prev.map(function(c) {
            return c.id === convId ? Object.assign({}, c, { title: title }) : c;
          });
        });
      } catch(err) {}
    }, []);

    // ── Delete conversation ────────────────────────────────────
    var deleteConversation = React.useCallback(async function(convId) {
      try {
        var token = window.api && window.api.getToken();
        await window.api.deleteConversation(convId, token);
        var wasActive = convId === activeConvId;
        var remaining = conversations.filter(function(c) { return c.id !== convId; });
        setConversations(remaining);
        if (wasActive) {
          if (remaining.length > 0) {
            setActiveConvId(remaining[0].id);
            var res = await window.api.getConversationMessages(remaining[0].id, token);
            var delMsgs = res.ok ? (res.data.messages || []) : [];
            setMessages(delMsgs);
            var delLevel = "green";
            for (var di = delMsgs.length - 1; di >= 0; di--) {
              if (delMsgs[di].safetyLevel) { delLevel = delMsgs[di].safetyLevel; break; }
            }
            setRiskLevel(delLevel);
          } else {
            setActiveConvId(null);
            setMessages([]);
            setRiskLevel("green");
          }
          setNewIdx(null);
        }
      } catch(err) {}
    }, [activeConvId, conversations]);

    // ── Notify drawer of conversation state ────────────────────
    React.useEffect(function() {
      console.log("[Serene] onConversationsChanged →", conversations.length, "convs, loaded:", loaded, "active:", activeConvId);
      if (typeof window.onConversationsChanged === "function") {
        window.onConversationsChanged(conversations, activeConvId, loaded);
      }
      if (activeConvId) localStorage.setItem("serene_last_conv", activeConvId);
    }, [conversations, activeConvId, loaded]);

    // ── Expose conversation controls globally ──────────────────
    React.useEffect(function() {
      window.SereneConv = {
        switchTo:   switchConversation,
        createNew:  createConversation,
        rename:     renameConversation,
        deleteConv: deleteConversation,
      };
    }, [switchConversation, createConversation, renameConversation, deleteConversation]);

    // ── Expose summarizeChat ───────────────────────────────────
    React.useEffect(function() {
      window.summarizeChat = async function() {
        if (messages.length < 4) { alert("Have a longer conversation first before summarising."); return; }
        var res = await window.api.sendMessage(
          "Please summarise our conversation so far in 3-4 sentences.",
          (window.state && window.state.mood) || "okay",
          window.api.getToken(),
          activeConvId
        );
        if (res.ok) {
          var overlay = document.createElement("div");
          overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:500;display:flex;align-items:center;justify-content:center;padding:1.5rem";
          var safe = String(res.data.reply).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
          overlay.innerHTML = '<div style="background:#0d1428;border:0.5px solid rgba(255,255,255,0.15);border-radius:20px;padding:1.75rem;max-width:400px;width:100%"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h3 style="color:#a5b4fc;font-size:16px">Conversation Summary</h3><button onclick="this.closest(\'[style*=fixed]\').remove()" style="background:none;border:none;color:#8b9dc3;font-size:20px;cursor:pointer">&#x2715;</button></div><p style="font-size:14px;color:#f0f4ff;line-height:1.7">' + safe + "</p></div>";
          document.body.appendChild(overlay);
        }
      };
    }, [messages, activeConvId]);

    // ── sendMessage ────────────────────────────────────────────
    var sendMessage = React.useCallback(async function(text) {
      if (isWaiting) return;

      // If no active conversation, create one first
      var currentConvId = activeConvId;
      if (!currentConvId) {
        try {
          var token0 = window.api && window.api.getToken();
          var convRes = await window.api.createConversation(token0);
          if (convRes.ok) {
            var nc = convRes.data.conversation;
            currentConvId = nc.id;
            setConversations(function(prev) { return [nc].concat(prev); });
            setActiveConvId(nc.id);
          }
        } catch(e0) {}
      }

      var userMsg = { role: "user", content: text, createdAt: new Date().toISOString() };
      var currentLen = messages.length;
      setMessages(function(prev) { return prev.concat([userMsg]); });
      setNewIdx(function(prev) { return prev === null ? currentLen : prev; });
      setWaiting(true);
      if (window.state) window.state.chatMessages = (window.state.chatMessages || []).concat([userMsg]);

      var mood  = (window.state && window.state.mood) || "okay";
      var token = window.api && window.api.getToken();
      var res;
      try { res = await window.api.sendMessage(text, mood, token, currentConvId); }
      catch(err) { res = { ok: false }; }
      setWaiting(false);

      var reply = (res.ok && res.data && res.data.reply)
        ? res.data.reply
        : "I am so sorry — something went wrong on my end. Could you try sending that again?";
      var aiMsg = { role: "assistant", content: reply, createdAt: new Date().toISOString(), isCompanionMoment: !!(res.ok && res.data && res.data.isCompanionMoment) };
      setMessages(function(prev) { return prev.concat([aiMsg]); });
      if (window.state) window.state.chatMessages = (window.state.chatMessages || []).concat([aiMsg]);

      if (res.ok && res.data) {
        // Update risk level from safety level.
        // Clear dismiss state on any new elevated response so the button
        // reappears for each new crisis exchange rather than staying hidden.
        if (res.data.safetyLevel) {
          if (res.data.safetyLevel !== "green") setDismissedRiskLevel(null);
          setRiskLevel(res.data.safetyLevel);
        }
        if (window.EmotionTracker) window.EmotionTracker.track(text, reply);

        // Refresh conversations list to pick up auto-title and updated timestamps
        setTimeout(async function() {
          try {
            var refreshToken = window.api && window.api.getToken();
            var refreshRes = await window.api.getConversations(refreshToken);
            if (refreshRes.ok) setConversations(refreshRes.data.conversations || []);
          } catch(e2) {}
        }, 3500);

        if (res.data.dailyLimit && res.data.dailyUsed) {
          var remaining = res.data.dailyLimit - res.data.dailyUsed;
          if (remaining <= 2 && window.state && window.state.user && window.state.user.plan === "free") {
            setTimeout(function() {
              setMessages(function(prev) {
                return prev.concat([{ role: "assistant", content: "Just so you know — you have " + remaining + " message" + (remaining === 1 ? "" : "s") + " left today on the free plan. Upgrading to Pro gives you 500 messages a day.", createdAt: new Date().toISOString() }]);
              });
            }, 1000);
          }
        }
      }
    }, [isWaiting, messages.length, activeConvId, setMessages, setWaiting, setNewIdx, setRiskLevel, setConversations, setActiveConvId]);

    React.useEffect(function() { window._reactSendMessage = sendMessage; }, [sendMessage]);

    // Refocus textarea when AI finishes replying
    React.useEffect(function() {
      if (!isWaiting && taFocusRef.current) {
        setTimeout(function() {
          if (taFocusRef.current) taFocusRef.current.focus();
        }, 100);
      }
    }, [isWaiting]);

    var showWelcome = loaded && messages.length === 0 && !isWaiting;
    var moods       = ["good", "okay", "low", "distressed"];
    var moodLabels  = { good: "😊 Good", okay: "😐 Okay", low: "😔 Low", distressed: "😰 Distressed" };

    return e("div", { className: "sc-root" },

      // Mood pills
      e("div", { className: "mood-section" },
        e("div", { className: "mood-label" }, "How are you feeling?"),
        e("div", { className: "mood-pills" },
          moods.map(function(m) {
            var active = window.state && window.state.mood === m;
            return e("button", {
              key: m,
              className: "mood-pill" + (active ? " active" : ""),
              "data-mood": m,
              onClick: function() {
                if (window.setMood) window.setMood(m, document.querySelector('[data-mood="' + m + '"]'));
              }
            }, moodLabels[m]);
          })
        )
      ),

      // Messages
      e("div", {
        ref: containerRef,
        className: "chat-area",
        id: "chatMessages"
      },
        showWelcome ? e(WelcomeCard) : null,
        messages.map(function(msg, i) {
          return e(MessageBubble, { key: i, msg: msg, msgId: "msg-" + i, isNew: newMsgIdx !== null && i >= newMsgIdx });
        }),
        isWaiting ? e(ThinkingBubble) : null,
        e("div", { ref: bottomRef, style: { height: "1px" } })
      ),

      // New messages jump button
      showJump ? e(NewMessagesButton, { onJump: function() { scrollToBottom("smooth"); } }) : null,

      // Floating support button — hidden while user has dismissed at this risk level
      e(FloatingSupportButton, {
        riskLevel: (dismissedRiskLevel && riskLevel === dismissedRiskLevel) ? "green" : riskLevel,
        onDismiss: function() { setDismissedRiskLevel(riskLevel); },
      }),

      // Input
      e(ChatInput, { onSend: sendMessage, disabled: isWaiting, focusRef: taFocusRef })
    );
  }

  // ── Mount ──────────────────────────────────────────────────────────
  var _root = null;

  window.SereneChat = {
    mount: function() {
      var container = document.getElementById("tab-chat");
      if (!container) { console.error("SereneChat: #tab-chat not found"); return; }
      if (!_root) {
        container.innerHTML = "";
        _root = ReactDOM.createRoot(container);
      }
      _root.render(React.createElement(SereneChat));
    }
  };

})();
