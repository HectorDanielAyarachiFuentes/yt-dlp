/**
 * yt-dlp Studio - Frontend Logic
 */

document.addEventListener("DOMContentLoaded", () => {
  // Elementos DOM
  const urlForm = document.getElementById("urlForm");
  const videoUrlInput = document.getElementById("videoUrl");
  const btnPaste = document.getElementById("btnPaste");
  const btnAnalyze = document.getElementById("btnAnalyze");
  const btnLabel = btnAnalyze.querySelector(".btn-label");
  const btnLoader = btnAnalyze.querySelector(".btn-loader");
  const btnIcon = btnAnalyze.querySelector(".btn-icon");

  const previewCard = document.getElementById("previewCard");
  const videoThumb = document.getElementById("videoThumb");
  const videoDuration = document.getElementById("videoDuration");
  const videoTitle = document.getElementById("videoTitle");
  const videoAuthor = document.getElementById("videoAuthor");
  const videoViews = document.getElementById("videoViews");

  const tabButtons = document.querySelectorAll(".tab-btn");
  const videoQualityOptions = document.getElementById("videoQualityOptions");
  const audioQualityOptions = document.getElementById("audioQualityOptions");
  const qualitySelect = document.getElementById("qualitySelect");
  const audioBitrateSelect = document.getElementById("audioBitrateSelect");
  const btnStartDownload = document.getElementById("btnStartDownload");
  const downloadBtnText = document.getElementById("downloadBtnText");

  const progressCard = document.getElementById("progressCard");
  const downloadBadge = document.getElementById("downloadBadge");
  const progressFileName = document.getElementById("progressFileName");
  const progressPercent = document.getElementById("progressPercent");
  const progressBar = document.getElementById("progressBar");
  const metricSpeed = document.getElementById("metricSpeed");
  const metricDownloaded = document.getElementById("metricDownloaded");
  const metricEta = document.getElementById("metricEta");

  const historyList = document.getElementById("historyList");
  const historyCount = document.getElementById("historyCount");
  const btnOpenDownloads = document.getElementById("btnOpenDownloads");
  const engineVersion = document.getElementById("engineVersion");
  const toastContainer = document.getElementById("toastContainer");

  // Estado local
  let currentVideoInfo = null;
  let activeFormatType = "video"; // 'video' | 'audio'
  let progressPollingInterval = null;
  let isDownloading = false;
  let historyItems = [];

  // 1. Comprobar estado del motor yt-dlp al cargar
  async function checkServerStatus() {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        engineVersion.textContent = `yt-dlp v${data.version}`;
        if (data.ffmpeg_available) {
          engineVersion.title = `Motor listo. FFmpeg activo en: ${data.ffmpeg_path}`;
        } else {
          engineVersion.title = "Motor listo (FFmpeg no encontrado)";
        }
      }
    } catch (e) {
      engineVersion.textContent = "Servidor desconectado";
      console.warn("No se pudo conectar al backend:", e);
    }
  }

  // 2. Botón Pegar Portapapeles
  btnPaste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        videoUrlInput.value = text.trim();
        videoUrlInput.focus();
        showToast("Enlace pegado desde el portapapeles", "info");
        // Si parece una URL válida, disparar análisis automáticamente
        if (text.startsWith("http://") || text.startsWith("https://")) {
          analyzeUrl(text.trim());
        }
      }
    } catch (err) {
      showToast("No se pudo acceder al portapapeles directamente. Pega con Ctrl+V.", "info");
    }
  });

  // 3. Manejo de formulario de búsqueda
  urlForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = videoUrlInput.value.trim();
    if (url) {
      analyzeUrl(url);
    }
  });

  async function analyzeUrl(url) {
    setAnalyzeLoading(true);
    previewCard.classList.add("hidden");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo obtener información del video");
      }

      currentVideoInfo = data;
      renderPreview(data);
      showToast("¡Información del video cargada con éxito!", "success");
    } catch (err) {
      if (err.name === "AbortError") {
        showToast("La búsqueda tardó más de lo esperado. Reintenta o comprueba tu conexión.", "error");
      } else {
        showToast(`Error: ${err.message}`, "error");
      }
    } finally {
      setAnalyzeLoading(false);
    }
  }

  function setAnalyzeLoading(loading) {
    if (loading) {
      btnLabel.textContent = "Buscando...";
      btnLoader.classList.remove("hidden");
      btnIcon.classList.add("hidden");
      btnAnalyze.disabled = true;
    } else {
      btnLabel.textContent = "Buscar";
      btnLoader.classList.add("hidden");
      btnIcon.classList.remove("hidden");
      btnAnalyze.disabled = false;
    }
  }

  // 4. Renderizar Tarjeta de Previsualización
  function renderPreview(info) {
    videoThumb.src = info.thumbnail || "";
    videoDuration.textContent = info.duration_string || "00:00";
    videoTitle.textContent = info.title || "Video sin título";
    videoAuthor.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      ${info.uploader || "Desconocido"}
    `;
    
    const views = info.view_count ? Number(info.view_count).toLocaleString("es-ES") : "0";
    videoViews.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      ${views} vistas
    `;

    // Cargar resoluciones detectadas en el selector
    if (info.available_resolutions && info.available_resolutions.length > 0) {
      qualitySelect.innerHTML = `<option value="best" selected>✨ Mejor Calidad Disponible</option>`;
      info.available_resolutions.forEach(res => {
        const opt = document.createElement("option");
        opt.value = String(res);
        opt.textContent = `${res}p ${res >= 1080 ? 'Full HD' : (res >= 720 ? 'HD' : '')}`;
        qualitySelect.appendChild(opt);
      });
    }

    previewCard.classList.remove("hidden");
    previewCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // 5. Cambio de pestañas (Video vs Audio)
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFormatType = btn.dataset.type;

      if (activeFormatType === "video") {
        videoQualityOptions.classList.remove("hidden");
        audioQualityOptions.classList.add("hidden");
        downloadBtnText.textContent = "Descargar Video MP4";
      } else {
        videoQualityOptions.classList.add("hidden");
        audioQualityOptions.classList.remove("hidden");
        downloadBtnText.textContent = "Descargar Audio MP3";
      }
    });
  });

  // 6. Iniciar Descarga
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
      downloadBtnText.textContent = "Iniciando descarga...";

      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo iniciar la descarga");
      }

      showToast("Descarga iniciada", "info");
      startProgressPolling();
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
      btnStartDownload.disabled = false;
      downloadBtnText.textContent = activeFormatType === "video" ? "Descargar Video MP4" : "Descargar Audio MP3";
    }
  });

  // 7. Polling de Progreso en Vivo
  function startProgressPolling() {
    isDownloading = true;
    progressCard.classList.remove("hidden");
    progressCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

    if (progressPollingInterval) clearInterval(progressPollingInterval);

    progressPollingInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/progress");
        if (!res.ok) return;
        const data = await res.json();

        updateProgressUI(data);

        if (data.status === "finished") {
          clearInterval(progressPollingInterval);
          isDownloading = false;
          btnStartDownload.disabled = false;
          downloadBtnText.textContent = activeFormatType === "video" ? "Descargar Video MP4" : "Descargar Audio MP3";
          showToast(`¡Descarga completada! ${data.filename || ''}`, "success");
          loadHistory();
        } else if (data.status === "error") {
          clearInterval(progressPollingInterval);
          isDownloading = false;
          btnStartDownload.disabled = false;
          downloadBtnText.textContent = "Reintentar Descarga";
          showToast(`Error en la descarga: ${data.error_message || 'Desconocido'}`, "error");
          downloadBadge.textContent = "Error";
          downloadBadge.style.color = "var(--accent-rose)";
        }
      } catch (err) {
        console.warn("Error en sondeo de progreso:", err);
      }
    }, 400);
  }

  function updateProgressUI(data) {
    const percent = Math.min(Math.max(data.percent || 0, 0), 100);
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent.toFixed(0)}%`;

    if (data.filename) {
      progressFileName.textContent = data.filename;
    } else if (currentVideoInfo) {
      progressFileName.textContent = currentVideoInfo.title;
    }

    if (data.status === "downloading") {
      downloadBadge.textContent = "Descargando";
      downloadBadge.style.color = "var(--accent-cyan)";
      metricSpeed.textContent = data.speed || "Calculando...";
      metricDownloaded.textContent = `${data.downloaded_str || '0 MB'} / ${data.total_str || '0 MB'}`;
      metricEta.textContent = data.eta || "--:--";
    } else if (data.status === "processing") {
      downloadBadge.textContent = "Procesando FFmpeg";
      downloadBadge.style.color = "var(--accent-purple)";
      metricSpeed.textContent = data.speed || "Extrayendo/Uniendo pistas...";
      metricEta.textContent = "Un momento...";
    } else if (data.status === "finished") {
      downloadBadge.textContent = "Completado ✓";
      downloadBadge.style.color = "var(--accent-emerald)";
      metricSpeed.textContent = "Finalizado";
      metricEta.textContent = "00:00";
    }
  }

  // 8. Cargar y renderizar historial de descargas
  async function loadHistory() {
    try {
      const res = await fetch("/api/history");
      if (!res.ok) return;
      const data = await res.json();
      historyItems = data.history || [];
      renderHistory();
    } catch (e) {
      console.warn("No se pudo cargar historial:", e);
    }
  }

  function renderHistory() {
    const finishedItems = historyItems.filter(item => item.status === "finished");
    historyCount.textContent = `${finishedItems.length} archivo${finishedItems.length === 1 ? '' : 's'}`;

    if (finishedItems.length === 0) {
      historyList.innerHTML = `
        <div class="history-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <p>Tus descargas completadas aparecerán aquí.</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = "";
    finishedItems.slice().reverse().forEach(item => {
      const itemEl = document.createElement("div");
      itemEl.className = "history-item";

      const isAudio = item.format_type === "audio";
      const iconSvg = isAudio
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;

      itemEl.innerHTML = `
        <div class="history-info">
          <div class="history-icon ${isAudio ? 'audio' : ''}">
            ${iconSvg}
          </div>
          <div class="history-text">
            <div class="history-name" title="${item.filename || item.title}">${item.filename || item.title}</div>
            <div class="history-sub">${isAudio ? 'Audio MP3' : 'Video MP4'} • Guardado</div>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn-icon-action btn-open-file" title="Mostrar en carpeta">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
        </div>
      `;

      itemEl.querySelector(".btn-open-file").addEventListener("click", () => {
        openInFolder(item.output_path);
      });

      historyList.appendChild(itemEl);
    });
  }

  // 9. Abrir carpeta en explorador de archivos
  async function openInFolder(filePath) {
    try {
      await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath || "" })
      });
      showToast("Abriendo Explorador de Windows...", "info");
    } catch (e) {
      showToast("No se pudo abrir la carpeta", "error");
    }
  }

  btnOpenDownloads.addEventListener("click", () => openInFolder(""));

  // 10. Sistema de Notificaciones Toast
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let iconSvg = "";
    if (type === "success") {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === "error") {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(40px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Inicializar
  checkServerStatus();
  loadHistory();
});
