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
      showToast(err.message, "error");
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
          showToast(`Error: ${data.error_message || 'Desconocido'}`, "error");
          activeQueueItem.classList.add("hidden");
        }
      } catch (err) {
        console.warn("Progress poll error:", err);
      }
    }, 400);
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

  function cleanTitle(raw) {
    if (!raw) return "Sin título";
    let t = raw.replace(/\.[a-zA-Z0-9]{3,4}$/, '');
    t = t.replace(/\s*\[[a-zA-Z0-9_-]{8,15}\]$/, '');
    return t;
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
      const isAudio = item.format_type === "audio";
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
            <button class="btn-icon-ctl btn-open-media" title="Reproducir archivo">
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
      `;

      card.querySelector(".btn-open-media").addEventListener("click", () => {
        openPath(item.output_path);
      });

      card.querySelector(".btn-open-dir").addEventListener("click", () => {
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

  // Inicio
  checkServerStatus();
  loadHistory();
});
