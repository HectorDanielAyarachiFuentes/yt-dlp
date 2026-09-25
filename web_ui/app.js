/**
 * YT-DLP STUDIO DECK // PRO-2026
 * Controlador de Interfaz de 3 Paneles
 */

document.addEventListener("DOMContentLoaded", () => {
  // Elementos DOM
  const videoUrlInput = document.getElementById("videoUrl");
  const btnPaste = document.getElementById("btnPaste");
  const btnAnalyze = document.getElementById("btnAnalyze");
  const btnText = btnAnalyze.querySelector(".btn-text");
  const spinner = btnAnalyze.querySelector(".spinner");

  // Panel Derecho (Inspector / Player)
  const visPlaceholder = document.getElementById("visPlaceholder");
  const visThumbWrap = document.getElementById("visThumbWrap");
  const visThumbImg = document.getElementById("visThumbImg");
  const visDuration = document.getElementById("visDuration");

  const lcdChannel = document.getElementById("lcdChannel");
  const lcdViews = document.getElementById("lcdViews");
  const lcdTitle = document.getElementById("lcdTitle");
  const lcdFmt = document.getElementById("lcdFmt");

  const modeButtons = document.querySelectorAll(".mode-btn");
  const qualitySelect = document.getElementById("qualitySelect");
  const audioBitrateSelect = document.getElementById("audioBitrateSelect");
  const btnStartDownload = document.getElementById("btnStartDownload");
  const downloadBtnText = document.getElementById("downloadBtnText");

  // Panel Central (Cola de Descargas)
  const activeQueueItem = document.getElementById("activeQueueItem");
  const activeCardBadge = document.getElementById("activeCardBadge");
  const activeCardTitle = document.getElementById("activeCardTitle");
  const activeCardSize = document.getElementById("activeCardSize");
  const activeCardStatus = document.getElementById("activeCardStatus");
  const activeProgressFill = document.getElementById("activeProgressFill");
  const historyItemsContainer = document.getElementById("historyItemsContainer");

  // Barra Superior y Otros
  const systemLedDot = document.getElementById("systemLedDot");
  const systemLedLabel = document.getElementById("systemLedLabel");
  const btnOpenDownloads = document.getElementById("btnOpenDownloads");
  const toastContainer = document.getElementById("toastContainer");
  const treeItems = document.querySelectorAll(".tree-item");

  // Estado
  let currentVideoInfo = null;
  let activeFormatType = "video"; // 'video' | 'audio'
  let progressPollingInterval = null;
  let isDownloading = false;
  let historyItems = [];
  let currentFilter = "all";

  // 1. Estado inicial del sistema
  async function checkServerStatus() {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        systemLedDot.className = "led-dot blue";
        systemLedLabel.textContent = "READY // IDLE";
      }
    } catch (e) {
      systemLedDot.className = "led-dot";
      systemLedLabel.textContent = "OFFLINE";
    }
  }

  // 2. Pegar portapapeles y auto-análisis
  btnPaste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        videoUrlInput.value = text.trim();
        videoUrlInput.focus();
        showToast("Enlace pegado", "info");
        checkAndAnalyze(text.trim());
      }
    } catch (err) {
      showToast("Pega con Ctrl+V directamente", "info");
    }
  });

  videoUrlInput.addEventListener("paste", () => {
    setTimeout(() => {
      const val = videoUrlInput.value.trim();
      if (val) checkAndAnalyze(val);
    }, 50);
  });

  btnAnalyze.addEventListener("click", () => {
    const val = videoUrlInput.value.trim();
    if (val) analyzeUrl(val);
  });

  videoUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = videoUrlInput.value.trim();
      if (val) analyzeUrl(val);
    }
  });

  function checkAndAnalyze(url) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      analyzeUrl(url);
    }
  }

  // 3. Extracción de Metadatos
  async function analyzeUrl(url) {
    setLoadingState(true);
    systemLedDot.className = "led-dot blue";
    systemLedLabel.textContent = "TUNING...";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo leer el stream");
      }

      currentVideoInfo = data;
      renderRightPanel(data);
      showToast("Señal cargada en el Right Panel", "success");
      systemLedLabel.textContent = "SYNCED";
    } catch (err) {
      if (err.message.includes("Sign in to confirm you're not a bot") || err.message.includes("bot")) {
        showToast("YouTube requiere cookies de autenticación (Anti-Bot)", "error");
        openSettingsModal();
      } else {
        showToast(err.message, "error");
      }
      systemLedLabel.textContent = "READY // IDLE";
    } finally {
      setLoadingState(false);
    }
  }

  function setLoadingState(loading) {
    if (loading) {
      btnText.textContent = "...";
      spinner.classList.remove("hidden");
      btnAnalyze.disabled = true;
    } else {
      btnText.textContent = "CARGAR";
      spinner.classList.add("hidden");
      btnAnalyze.disabled = false;
    }
  }

  // 4. Renderizar datos en el Right Panel
  function renderRightPanel(info) {
    if (info.thumbnail) {
      visThumbImg.src = info.thumbnail;
      visPlaceholder.classList.add("hidden");
      visThumbWrap.classList.remove("hidden");
    }

    visDuration.textContent = info.duration_string || "00:00";
    lcdChannel.textContent = (info.uploader || "DESCONOCIDO").toUpperCase();
    
    const views = info.view_count ? Number(info.view_count).toLocaleString("es-ES") : "0";
    lcdViews.textContent = `${views} VISTAS`;
    lcdTitle.textContent = info.title || "Video sin título";

    // Opciones de resolución
    qualitySelect.innerHTML = `<option value="best" selected>★ Mejor Resolución (H.264)</option>`;
    if (info.available_resolutions && info.available_resolutions.length > 0) {
      info.available_resolutions.forEach(r => {
        const opt = document.createElement("option");
        opt.value = String(r);
        opt.textContent = `${r}p ${r >= 1080 ? 'Full HD' : (r >= 720 ? 'HD' : '')}`;
        qualitySelect.appendChild(opt);
      });
      lcdFmt.textContent = `H.264 // ${info.available_resolutions[0]}P`;
    } else {
      lcdFmt.textContent = `H.264 // MP4`;
    }

    btnStartDownload.disabled = false;
    btnStartDownload.classList.remove("disabled");
  }

  // 5. Selector de Modo (Video MP4 vs Audio MP3)
  modeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      modeButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFormatType = btn.dataset.type;

      if (activeFormatType === "video") {
        qualitySelect.classList.remove("hidden");
        audioBitrateSelect.classList.add("hidden");
        lcdFmt.textContent = qualitySelect.value === 'best'
          ? (currentVideoInfo && currentVideoInfo.available_resolutions ? `H.264 // ${currentVideoInfo.available_resolutions[0]}P` : "H.264 // AUTO")
          : `H.264 // ${qualitySelect.value}P`;
      } else {
        qualitySelect.classList.add("hidden");
        audioBitrateSelect.classList.remove("hidden");
        lcdFmt.textContent = `MP3 // ${audioBitrateSelect.value} KBPS`;
      }
    });
  });

  audioBitrateSelect.addEventListener("change", () => {
    lcdFmt.textContent = `MP3 // ${audioBitrateSelect.value} KBPS`;
  });

  qualitySelect.addEventListener("change", () => {
    lcdFmt.textContent = qualitySelect.value === 'best' 
      ? 'H.264 // AUTO' 
      : `H.264 // ${qualitySelect.value}P`;
  });

  // 6. Iniciar Descarga (Grabar en Disco)
  btnStartDownload.addEventListener("click", async () => {
    if (!currentVideoInfo || isDownloading) return;

    const quality = activeFormatType === "video"
      ? qualitySelect.value
      : audioBitrateSelect.value;

    const payload = {
      url: videoUrlInput.value.trim(),
      format_type: activeFormatType,
      quality: quality,
      title: currentVideoInfo.title,
      thumbnail: currentVideoInfo.thumbnail
    };

    try {
      btnStartDownload.disabled = true;
      downloadBtnText.textContent = "GRABANDO...";
      systemLedDot.className = "led-dot red";
      systemLedLabel.textContent = "RECORDING";

      // Mostrar tarjeta activa en la cola
      activeCardBadge.textContent = activeFormatType === "video" ? "MP4" : "MP3";
      activeCardTitle.textContent = currentVideoInfo.title;
      activeCardSize.textContent = "Calculando...";
      activeCardStatus.textContent = "Iniciando descarga...";
      activeProgressFill.style.width = "0%";
      activeQueueItem.classList.remove("hidden");

      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error al iniciar descarga");

      showToast("Descarga añadida a la cola", "info");
      startProgressPolling();
    } catch (err) {
      showToast(err.message, "error");
      btnStartDownload.disabled = false;
      downloadBtnText.textContent = "GRABAR EN DISCO";
      systemLedDot.className = "led-dot blue";
      systemLedLabel.textContent = "READY // IDLE";
      activeQueueItem.classList.add("hidden");
    }
  });

  // 7. Polling de Progreso en Vivo
  function startProgressPolling() {
    isDownloading = true;
    if (progressPollingInterval) clearInterval(progressPollingInterval);

    progressPollingInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/progress");
        if (!res.ok) return;
        const data = await res.json();

        const percent = Math.min(Math.max(data.percent || 0, 0), 100);
        activeProgressFill.style.width = `${percent}%`;

        if (data.status === "downloading") {
          activeCardSize.textContent = data.downloaded_str || "0 MB";
          activeCardStatus.textContent = `Descargando ${percent.toFixed(0)}% @ ${data.speed || '0 MB/s'}`;
        } else if (data.status === "processing") {
          if (data.downloaded_str || data.total_str) {
            activeCardSize.textContent = data.total_str || data.downloaded_str;
          }
          const isAudio = activeFormatType === "audio" || (data.filename && data.filename.endsWith(".mp3"));
          activeCardStatus.textContent = isAudio 
            ? "Convirtiendo audio a MP3 (Multi-core)..." 
            : "Empaquetando video MP4...";
        } else if (data.status === "finished") {
          clearInterval(progressPollingInterval);
          isDownloading = false;
          btnStartDownload.disabled = false;
          downloadBtnText.textContent = "GRABAR EN DISCO";
          systemLedDot.className = "led-dot blue";
          systemLedLabel.textContent = "READY // IDLE";
          activeQueueItem.classList.add("hidden");
          showToast("¡Descarga completada y guardada en disco!", "success");
          loadHistory();
        } else if (data.status === "error") {
          clearInterval(progressPollingInterval);
          isDownloading = false;
          btnStartDownload.disabled = false;
          downloadBtnText.textContent = "REINTENTAR";
          systemLedDot.className = "led-dot";
          systemLedLabel.textContent = "ERROR";
          const errMsg = data.error_message || 'Desconocido';
          if (errMsg.includes("Sign in to confirm you're not a bot") || errMsg.includes("bot")) {
            showToast("YouTube requiere cookies de autenticación (Anti-Bot)", "error");
            openSettingsModal();
          } else {
            showToast(`Error: ${errMsg}`, "error");
          }
          activeQueueItem.classList.add("hidden");
        }
      } catch (err) {
        console.warn("Progress poll error:", err);
      }
    }, 400);
  }

  // 8. Utilidades de reproducción y previsualización

  function cleanTitle(raw) {
    if (!raw) return "Sin título";
    let t = raw.replace(/\.[a-zA-Z0-9]{3,4}$/, '');
    t = t.replace(/\s*\[[a-zA-Z0-9_-]{8,15}\]$/, '');
    return t;
  }

  let activeAudioElement = null;
  let activeVideoElement = null;

  function stopAllPreviews() {
    if (activeAudioElement) {
      activeAudioElement.pause();
      activeAudioElement = null;
    }
    if (activeVideoElement) {
      activeVideoElement.pause();
      activeVideoElement = null;
    }
    const visAudio = document.getElementById("visAudioPlayer");
    const visVideo = document.getElementById("visVideoPlayer");
    if (visAudio) { visAudio.pause(); visAudio.currentTime = 0; }
    if (visVideo) { visVideo.pause(); visVideo.currentTime = 0; }
    document.querySelectorAll(".card-preview-drawer").forEach(d => d.classList.add("hidden"));
    document.querySelectorAll(".queue-card").forEach(c => c.classList.remove("selected-card"));
    document.querySelectorAll(".btn-play-card").forEach(b => {
      b.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    });
  }

  function selectAndPreviewMedia(item, card, autoPlay = true) {
    const isAudio = item.format_type === "audio" || (item.filename && item.filename.endsWith(".mp3"));
    const streamUrl = `/api/stream?path=${encodeURIComponent(item.output_path || '')}&file=${encodeURIComponent(item.filename || '')}`;
    const displayTitle = cleanTitle(item.title || item.filename);

    const wasSelected = card.classList.contains("selected-card");
    const drawer = card.querySelector(".card-preview-drawer");
    const playBtn = card.querySelector(".btn-play-card");
    const inlineMedia = isAudio ? drawer.querySelector("audio") : drawer.querySelector("video");

    if (wasSelected && inlineMedia && !inlineMedia.paused) {
      inlineMedia.pause();
      playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      return;
    }

    stopAllPreviews();

    card.classList.add("selected-card");
    drawer.classList.remove("hidden");

    // Lado izquierdo: Reproductor inline en la tarjeta seleccionada
    if (inlineMedia) {
      if (isAudio) activeAudioElement = inlineMedia;
      else activeVideoElement = inlineMedia;

      if (autoPlay) {
        inlineMedia.play().catch(() => {});
        playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      }

      inlineMedia.onplay = () => {
        playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      };
      inlineMedia.onpause = () => {
        playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      };
    }

    // Lado derecho: Sincronizar Right Panel (Inspector)
    lcdTitle.textContent = displayTitle;
    lcdChannel.textContent = "ARCHIVO LOCAL // PREVIEW";
    lcdViews.textContent = item.downloaded_str || (isAudio ? "MP3 AUDIO" : "MP4 VIDEO");
    lcdFmt.textContent = isAudio ? "MP3 // AUDIO ACTIVO" : "MP4 // VIDEO ACTIVO";

    const visPlaceholder = document.getElementById("visPlaceholder");
    const visThumbWrap = document.getElementById("visThumbWrap");
    const visAudioWrap = document.getElementById("visAudioWrap");
    const visVideoWrap = document.getElementById("visVideoWrap");
    const visAudioPlayer = document.getElementById("visAudioPlayer");
    const visVideoPlayer = document.getElementById("visVideoPlayer");

    if (isAudio) {
      visPlaceholder.classList.remove("hidden");
      visAudioWrap.classList.remove("hidden");
      visThumbWrap.classList.add("hidden");
      visVideoWrap.classList.add("hidden");
      if (visAudioPlayer) {
        visAudioPlayer.src = streamUrl;
      }
    } else {
      visPlaceholder.classList.add("hidden");
      visAudioWrap.classList.add("hidden");
      visThumbWrap.classList.add("hidden");
      visVideoWrap.classList.remove("hidden");
      if (visVideoPlayer) {
        visVideoPlayer.src = streamUrl;
      }
    }
  }

  // 8. Cargar y renderizar historial
  async function loadHistory() {
    try {
      const res = await fetch("/api/history");
      if (!res.ok) return;
      const data = await res.json();
      historyItems = data.history || [];
      renderQueueList();
    } catch (e) {
      console.warn("History fetch error:", e);
    }
  }

  function renderQueueList() {
    const finishedItems = historyItems.filter(item => item.status === "finished");
    
    // Filtrar según selección de biblioteca
    const filtered = finishedItems.filter(item => {
      if (currentFilter === "mp3") return item.format_type === "audio";
      if (currentFilter === "mp4") return item.format_type === "video";
      return true;
    });

    historyItemsContainer.innerHTML = "";

    filtered.slice().reverse().forEach(item => {
      const isAudio = item.format_type === "audio" || (item.filename && item.filename.endsWith(".mp3"));
      const card = document.createElement("div");
      card.className = "queue-card";
      const displayTitle = cleanTitle(item.title || item.filename);
      const sizeStr = item.downloaded_str || (isAudio ? "MP3" : "MP4");

      card.innerHTML = `
        <div class="card-main-row">
          <div class="card-badge">${isAudio ? 'MP3' : 'MP4'}</div>
          <div class="card-info">
            <div class="card-title" title="${item.filename || item.title}">${displayTitle}</div>
            <div class="card-meta">
              <span>${sizeStr}</span> • <span class="status-ok">Completado</span>
            </div>
          </div>
          <div class="card-controls">
            <button class="btn-icon-ctl btn-play-card" title="Previsualizar / Reproducir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
            <button class="btn-icon-ctl btn-open-dir" title="Abrir en carpeta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="card-preview-drawer hidden">
          <div class="inline-player-row ${isAudio ? '' : 'video'}">
            <span class="preview-tag">${isAudio ? 'AUDIO LOCAL' : 'VIDEO LOCAL'}</span>
            ${isAudio ? `
              <audio controls class="inline-audio" preload="metadata" src="/api/stream?path=${encodeURIComponent(item.output_path || '')}&file=${encodeURIComponent(item.filename || '')}"></audio>
            ` : `
              <video controls playsinline class="inline-video" preload="metadata" src="/api/stream?path=${encodeURIComponent(item.output_path || '')}&file=${encodeURIComponent(item.filename || '')}"></video>
            `}
          </div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (e.target.closest(".btn-open-dir") || e.target.closest("audio") || e.target.closest("video")) {
          return;
        }
        selectAndPreviewMedia(item, card, true);
      });

      card.querySelector(".btn-play-card").addEventListener("click", (e) => {
        e.stopPropagation();
        selectAndPreviewMedia(item, card, true);
      });

      card.querySelector(".btn-open-dir").addEventListener("click", (e) => {
        e.stopPropagation();
        openPath(item.output_path);
      });

      historyItemsContainer.appendChild(card);
    });
  }

  // 9. Filtrado en Sidebar
  treeItems.forEach(item => {
    item.addEventListener("click", () => {
      treeItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      currentFilter = item.dataset.filter || "all";
      renderQueueList();
    });
  });

  // 10. Abrir en Explorador de Windows
  async function openPath(pathStr) {
    try {
      await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathStr || "" })
      });
      showToast("Abriendo en Explorador...", "info");
    } catch (e) {
      showToast("No se pudo abrir la ruta", "error");
    }
  }

  btnOpenDownloads.addEventListener("click", () => openPath(""));

  // 11. Toasts
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast-item ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.2s ease";
      setTimeout(() => toast.remove(), 200);
    }, 3500);
  }

  // 12. Colapso y Despliegue de Paneles (Flechas Interactivas)
  const studioWorkspace = document.querySelector(".studio-workspace");
  const btnCollapseLeft = document.getElementById("btnCollapseLeft");
  const btnExpandLeft = document.getElementById("btnExpandLeft");
  const btnCollapseRightFromCenter = document.getElementById("btnCollapseRightFromCenter");
  const btnCollapseRight = document.getElementById("btnCollapseRight");
  const btnToggleBiblioteca = document.getElementById("btnToggleBiblioteca");
  const treeBiblioteca = document.getElementById("treeBiblioteca");
  const treeChevron = document.getElementById("treeChevron");

  let isLeftCollapsed = localStorage.getItem("studio_left_collapsed") === "true";
  let isRightCollapsed = localStorage.getItem("studio_right_collapsed") === "true";
  let isTreeCollapsed = localStorage.getItem("studio_tree_collapsed") === "true";

  function applyLeftCollapse(collapsed) {
    isLeftCollapsed = collapsed;
    localStorage.setItem("studio_left_collapsed", String(collapsed));
    if (collapsed) {
      studioWorkspace.classList.add("left-collapsed");
      btnExpandLeft.classList.remove("hidden");
    } else {
      studioWorkspace.classList.remove("left-collapsed");
      btnExpandLeft.classList.add("hidden");
    }
  }

  function applyRightCollapse(collapsed) {
    isRightCollapsed = collapsed;
    localStorage.setItem("studio_right_collapsed", String(collapsed));
    if (collapsed) {
      studioWorkspace.classList.add("right-collapsed");
      if (btnCollapseRightFromCenter) {
        btnCollapseRightFromCenter.classList.add("active-highlight");
        btnCollapseRightFromCenter.setAttribute("title", "Desplegar panel derecho (Inspector)");
        btnCollapseRightFromCenter.innerHTML = "&raquo;";
      }
    } else {
      studioWorkspace.classList.remove("right-collapsed");
      if (btnCollapseRightFromCenter) {
        btnCollapseRightFromCenter.classList.remove("active-highlight");
        btnCollapseRightFromCenter.setAttribute("title", "Replegar panel derecho");
        btnCollapseRightFromCenter.innerHTML = "&laquo;";
      }
    }
  }

  function applyTreeCollapse(collapsed) {
    isTreeCollapsed = collapsed;
    localStorage.setItem("studio_tree_collapsed", String(collapsed));
    if (collapsed) {
      treeBiblioteca?.classList.add("tree-collapsed");
      treeChevron?.classList.add("collapsed");
    } else {
      treeBiblioteca?.classList.remove("tree-collapsed");
      treeChevron?.classList.remove("collapsed");
    }
  }

  // Restaurar estados guardados
  if (isLeftCollapsed) applyLeftCollapse(true);
  if (isRightCollapsed) applyRightCollapse(true);
  if (isTreeCollapsed) applyTreeCollapse(true);

  // Listeners de flechas y cabeceras
  btnCollapseLeft?.addEventListener("click", (e) => {
    e.stopPropagation();
    applyLeftCollapse(true);
    showToast("Panel izquierdo replegado", "info");
  });

  btnExpandLeft?.addEventListener("click", (e) => {
    e.stopPropagation();
    applyLeftCollapse(false);
    showToast("Panel izquierdo desplegado", "info");
  });

  btnCollapseRightFromCenter?.addEventListener("click", (e) => {
    e.stopPropagation();
    const nextState = !isRightCollapsed;
    applyRightCollapse(nextState);
    showToast(nextState ? "Panel derecho replegado" : "Panel derecho desplegado", "info");
  });

  btnCollapseRight?.addEventListener("click", (e) => {
    e.stopPropagation();
    applyRightCollapse(true);
    showToast("Panel derecho replegado", "info");
  });

  btnToggleBiblioteca?.addEventListener("click", (e) => {
    e.stopPropagation();
    const nextState = !isTreeCollapsed;
    applyTreeCollapse(nextState);
  });

  // 13. Modal de Ajustes / Cookies Anti-Bot
  const settingsModal = document.getElementById("settingsModal");
  const btnSettings = document.getElementById("btnSettings");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const cookieStatusLed = document.getElementById("cookieStatusLed");
  const cookieStatusText = document.getElementById("cookieStatusText");
  const btnSelectCookieFile = document.getElementById("btnSelectCookieFile");
  const cookieFileInput = document.getElementById("cookieFileInput");
  const btnClearCookies = document.getElementById("btnClearCookies");

  function openSettingsModal() {
    settingsModal?.classList.remove("hidden");
    refreshCookieStatus();
  }

  function closeSettingsModal() {
    settingsModal?.classList.add("hidden");
  }

  async function refreshCookieStatus() {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const data = await res.json();
      if (data.cookies_loaded) {
        cookieStatusLed.className = "cookie-led active";
        cookieStatusText.textContent = `Estado: Cookies activas (${data.cookie_file || 'cookies.txt'})`;
        btnClearCookies?.classList.remove("hidden");
      } else {
        cookieStatusLed.className = "cookie-led";
        cookieStatusText.textContent = "Estado: Sin archivo cookies.txt";
        btnClearCookies?.classList.add("hidden");
      }
    } catch (e) {
      console.warn("Cookie status check failed:", e);
    }
  }

  btnSettings?.addEventListener("click", openSettingsModal);
  btnCloseSettings?.addEventListener("click", closeSettingsModal);
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  btnSelectCookieFile?.addEventListener("click", () => {
    cookieFileInput?.click();
  });

  cookieFileInput?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await fetch("/api/upload-cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies: text })
      });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        showToast("¡Cookies guardadas correctamente! Ahora puedes descargar.", "success");
        refreshCookieStatus();
      } else {
        throw new Error(data.error || "Error al subir cookies");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      cookieFileInput.value = "";
    }
  });

  btnClearCookies?.addEventListener("click", async () => {
    try {
      await fetch("/api/clear-cookies", { method: "POST" });
      showToast("Cookies eliminadas", "info");
      refreshCookieStatus();
    } catch (e) {
      showToast("Error al eliminar cookies", "error");
    }
  });

  // Inicio
  checkServerStatus();
  loadHistory();
});
