// ============================================================
// Watch Party — BroadcastChannel chat + iframe stream embed
// sessionStorage = auto-clears when tab closes ("session ends")
// ============================================================

const WatchParty = (() => {
  let nickname = "", teamFlag = "⚽", channel = null, joined = false;

  function init() {
    channel = new BroadcastChannel("wc2026-watchparty");
    channel.onmessage = e => handleIncoming(e.data);

    // Restore session if page reloaded mid-session
    const savedNick = sessionStorage.getItem("wp_nick");
    const savedTeam = sessionStorage.getItem("wp_team");
    if (savedNick) {
      nickname = savedNick;
      teamFlag = savedTeam || "⚽";
      joined   = true;
      renderMessages();
      showChat();
    }

    bindUI();
  }

  function bindUI() {
    document.getElementById("stream-url-input")?.addEventListener("keydown", e => {
      if (e.key === "Enter") launchStream();
    });
    document.getElementById("stream-go-btn")?.addEventListener("click", launchStream);

    document.querySelectorAll(".preset-stream").forEach(btn => {
      btn.addEventListener("click", () => {
        const url = btn.dataset.url;
        const input = document.getElementById("stream-url-input");
        if (input) { input.value = url; localStorage.setItem(STREAM_KEY, url); }
        launchStream(url);
      });
    });

    document.getElementById("wp-join-btn")?.addEventListener("click", joinSession);
    document.getElementById("wp-send-btn")?.addEventListener("click", sendMessage);
    document.getElementById("wp-message-input")?.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById("wp-end-btn")?.addEventListener("click", endSession);
    document.getElementById("wp-save-btn")?.addEventListener("click", saveTranscript);
    document.getElementById("wp-expand-btn")?.addEventListener("click", toggleExpand);
  }

  function launchStream(urlOverride) {
    const input = document.getElementById("stream-url-input");
    const url   = urlOverride || (input?.value?.trim());
    if (!url) { showAlert("Paste a stream URL first."); return; }

    localStorage.setItem(STREAM_KEY, url);

    const placeholder = document.getElementById("stream-placeholder");
    const iframeWrap  = document.getElementById("stream-iframe-wrap");
    const iframe      = document.getElementById("stream-iframe");
    const watchSection = document.getElementById("watch-party-section");

    // Try iframe embed
    iframe.src = url;
    placeholder?.classList.add("hidden");
    iframeWrap?.classList.remove("hidden");

    // Detect if iframe was blocked (can't do cross-origin onerror, use load timeout)
    iframe.onload = () => {
      document.getElementById("iframe-blocked-msg")?.classList.add("hidden");
    };

    setTimeout(() => {
      try {
        // If same origin or allowed, contentDocument won't throw
        const _ = iframe.contentDocument;
      } catch {
        document.getElementById("iframe-blocked-msg")?.classList.remove("hidden");
      }
    }, 3000);

    watchSection?.scrollIntoView({ behavior: "smooth" });

    // Broadcast stream event so other tabs know
    broadcast({ type: "stream_started", url, user: nickname || "Anonymous" });
  }

  function joinSession() {
    const nickInput = document.getElementById("wp-nickname");
    const teamSel   = document.getElementById("wp-team-select");
    nickname = nickInput?.value?.trim() || "Fan";
    teamFlag = teamSel?.value || "⚽";

    sessionStorage.setItem("wp_nick", nickname);
    sessionStorage.setItem("wp_team", teamFlag);
    joined = true;

    broadcast({ type: "join", user: nickname, team: teamFlag, time: Date.now() });
    renderMessages();
    showChat();
  }

  function sendMessage() {
    if (!joined) { document.getElementById("wp-setup")?.scrollIntoView(); return; }
    const input = document.getElementById("wp-message-input");
    const text  = input?.value?.trim();
    if (!text) return;
    if (input) input.value = "";

    const msg = { type: "msg", user: nickname, team: teamFlag, text, time: Date.now() };
    appendMessage(msg);
    saveMsg(msg);
    broadcast(msg);
  }

  function handleIncoming(data) {
    if (data.type === "msg") {
      appendMessage(data, true);
      saveMsg(data);
    } else if (data.type === "join") {
      const sysMsg = { type: "sys", text: `${data.team} ${data.user} joined the session` };
      appendSysMsg(sysMsg.text);
    } else if (data.type === "session_end") {
      appendSysMsg("The host ended the session.");
    } else if (data.type === "stream_started") {
      appendSysMsg(`${data.user} started streaming.`);
    }
  }

  function appendMessage(msg, fromOther = false) {
    const container = document.getElementById("wp-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = `wp-msg ${fromOther ? "wp-msg-other" : "wp-msg-self"}`;
    div.innerHTML = `
      <span class="wp-msg-team">${msg.team}</span>
      <span class="wp-msg-user">${escHtml(msg.user)}</span>
      <span class="wp-msg-text">${escHtml(msg.text)}</span>
      <time class="wp-msg-time">${new Date(msg.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function appendSysMsg(text) {
    const container = document.getElementById("wp-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "wp-sys-msg";
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function renderMessages() {
    const msgs = getStoredMsgs();
    msgs.forEach(m => appendMessage(m));
  }

  function saveMsg(msg) {
    const msgs = getStoredMsgs();
    msgs.push(msg);
    sessionStorage.setItem("wp_msgs", JSON.stringify(msgs.slice(-500)));
  }

  function getStoredMsgs() {
    try { return JSON.parse(sessionStorage.getItem("wp_msgs") || "[]"); } catch { return []; }
  }

  function broadcast(data) { channel?.postMessage(data); }

  function showChat() {
    document.getElementById("wp-setup")?.classList.add("hidden");
    document.getElementById("wp-chat")?.classList.remove("hidden");
    document.getElementById("wp-live-badge")?.classList.remove("hidden");
    const cnt = document.getElementById("wp-participant-name");
    if (cnt) cnt.textContent = `${teamFlag} ${nickname}`;
  }

  function endSession() {
    broadcast({ type: "session_end", user: nickname });
    sessionStorage.removeItem("wp_msgs");
    sessionStorage.removeItem("wp_nick");
    sessionStorage.removeItem("wp_team");
    document.getElementById("wp-messages").innerHTML = "";
    document.getElementById("wp-chat")?.classList.add("hidden");
    document.getElementById("wp-setup")?.classList.remove("hidden");
    document.getElementById("wp-live-badge")?.classList.add("hidden");
    joined = false; nickname = ""; teamFlag = "⚽";
    appendSysMsg("Session ended. Chat cleared.");
    document.getElementById("wp-chat")?.classList.remove("hidden");
  }

  function saveTranscript() {
    const msgs = getStoredMsgs();
    if (!msgs.length) { showAlert("No messages to save."); return; }
    const lines = msgs.map(m => `[${new Date(m.time).toLocaleString()}] ${m.team} ${m.user}: ${m.text}`);
    const blob  = new Blob([lines.join("\n")], { type: "text/plain" });
    const a     = document.createElement("a");
    a.href      = URL.createObjectURL(blob);
    a.download  = `wc2026-watchparty-${Date.now()}.txt`;
    a.click();
  }

  function toggleExpand() {
    const layout = document.getElementById("watch-party-layout");
    layout?.classList.toggle("wp-expanded");
    const btn = document.getElementById("wp-expand-btn");
    if (btn) btn.textContent = layout?.classList.contains("wp-expanded") ? "⤡ Shrink" : "⤢ Expand";
  }

  function showAlert(msg) {
    const el = document.getElementById("stream-alert");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 3000);
  }

  function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  return { init, launchStream };
})();
