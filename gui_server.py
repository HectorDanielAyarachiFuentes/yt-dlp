"""
yt-dlp Modern Local Web GUI Server
Servidor local en Python con interfaz moderna para descarga de videos y audios.
"""

import sys
import os
import json
import urllib.parse
import threading
import time
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import shutil

# Agregar directorio actual al sys.path para importar yt_dlp directamente
ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

try:
    import yt_dlp
except ImportError:
    print("Error: No se pudo importar yt_dlp. Asegurate de estar en el directorio correcto.")
    sys.exit(1)

# Detectar ffmpeg mediante imageio_ffmpeg o PATH del sistema
FFMPEG_EXE = None
FFMPEG_DIR = None
try:
    import imageio_ffmpeg
    ffmpeg_candidate = imageio_ffmpeg.get_ffmpeg_exe()
    if os.path.exists(ffmpeg_candidate):
        FFMPEG_EXE = ffmpeg_candidate
        FFMPEG_DIR = os.path.dirname(ffmpeg_candidate)
        alias_exe = os.path.join(FFMPEG_DIR, "ffmpeg.exe")
        if not os.path.exists(alias_exe):
            import shutil
            shutil.copyfile(ffmpeg_candidate, alias_exe)
except Exception:
    pass

import re
import xml.etree.ElementTree as ET

def parse_bbb_url(url):
    """
    Detecta URLs de plataformas educativas BigBlueButton (BBB), habituales en UNCOMA, Moodle, etc.
    Extrae metadatos oficiales y enlaces directos de video/audio.
    """
    clean_url = url.split("?")[0].rstrip("/")
    match = re.search(r'https?://([^/]+)/playback/presentation/2\.[0-9]+/([a-zA-Z0-9_-]+)', clean_url)
    if not match:
        return None
    domain, rec_id = match.group(1), match.group(2)
    meta_url = f'https://{domain}/presentation/{rec_id}/metadata.xml'

    try:
        req = urllib.request.Request(meta_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as r:
            tree = ET.fromstring(r.read())
            meeting_name = tree.findtext('.//meetingName') or tree.findtext('.//bbb-recording-name') or 'Clase Grabada'
            context = tree.findtext('.//bbb-context') or tree.findtext('.//bbb-context-name') or ''
            duration_ms = int(tree.findtext('.//duration') or 0)
            duration_sec = duration_ms // 1000
            thumb = tree.findtext('.//images/image') or ''

            title = meeting_name
            if context and context not in meeting_name:
                title = f"{meeting_name} • {context}"

            webcams_url = f'https://{domain}/presentation/{rec_id}/video/webcams.webm'
            deskshare_url = f'https://{domain}/presentation/{rec_id}/deskshare/deskshare.webm'

            return {
                "id": rec_id,
                "title": title,
                "uploader": f"Aula Virtual ({domain})",
                "duration": duration_sec,
                "duration_string": format_eta(duration_sec),
                "thumbnail": thumb,
                "view_count": int(tree.findtext('.//participants') or 0),
                "description": f"Grabación educativa de BigBlueButton en {domain}. Participantes registrados: {tree.findtext('.//participants') or 'N/A'}",
                "available_resolutions": [720, 480],
                "is_playlist": False,
                "is_bbb": True,
                "webcams_url": webcams_url,
                "deskshare_url": deskshare_url,
                "stream_url": webcams_url
            }
    except Exception as e:
        return None

def sanitize_url(url):
    """
    Si es un video individual con parametros de lista/radio (watch?v=...&list=RD...),
    remueve el parametro &list para descargar unicamente el video solicitado.
    """
    if "youtube.com/watch" in url or "youtu.be/" in url:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        if "v" in qs:
            clean_query = urllib.parse.urlencode({"v": qs["v"][0]})
            return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', clean_query, ''))
    return url

# Carpeta de descargas predeterminada (Descargas del usuario en Windows)
DEFAULT_DOWNLOAD_DIR = Path.home() / "Downloads" / "yt-dlp"
DEFAULT_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

def format_bytes(bytes_num):
    if not bytes_num:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_num < 1024.0:
            return f"{bytes_num:.1f} {unit}"
        bytes_num /= 1024.0
    return f"{bytes_num:.1f} PB"

def format_eta(seconds):
    if not seconds or seconds < 0:
        return "--:--"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

# Estado global de descargas
class DownloadManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.downloads = {}  # id -> dict con info y progreso
        self.current_download_id = None
        self._load_existing_files()

    def _load_existing_files(self):
        try:
            if DEFAULT_DOWNLOAD_DIR.exists():
                files = sorted(DEFAULT_DOWNLOAD_DIR.iterdir(), key=lambda p: p.stat().st_mtime)
                for f in files:
                    if f.is_file() and f.suffix.lower() in ('.mp3', '.mp4', '.m4a', '.webm', '.mkv'):
                        dl_id = f"disk_{abs(hash(str(f)))}"
                        stat = f.stat()
                        is_audio = f.suffix.lower() in ('.mp3', '.m4a')
                        self.downloads[dl_id] = {
                            "id": dl_id,
                            "title": f.stem,
                            "filename": f.name,
                            "format_type": "audio" if is_audio else "video",
                            "status": "finished",
                            "percent": 100.0,
                            "downloaded_str": format_bytes(stat.st_size),
                            "total_str": format_bytes(stat.st_size),
                            "speed": "Guardado en disco",
                            "eta": "00:00",
                            "output_path": str(f.resolve()),
                            "completed_at": stat.st_mtime
                        }
        except Exception:
            pass

    def create_download(self, url, options):
        with self.lock:
            dl_id = f"dl_{int(time.time() * 1000)}"
            self.downloads[dl_id] = {
                "id": dl_id,
                "url": url,
                "status": "starting",  # starting, downloading, processing, finished, error, cancelled
                "percent": 0.0,
                "speed": "0 KB/s",
                "eta": "--:--",
                "downloaded_bytes": 0,
                "total_bytes": 0,
                "filename": "",
                "title": options.get("title", "Descargando..."),
                "thumbnail": options.get("thumbnail", ""),
                "format_type": options.get("format_type", "video"),
                "quality": options.get("quality", "best"),
                "output_path": "",
                "error_message": "",
                "started_at": time.time(),
                "completed_at": None
            }
            self.current_download_id = dl_id
            return dl_id

    def update_progress(self, dl_id, data):
        with self.lock:
            if dl_id in self.downloads:
                self.downloads[dl_id].update(data)

    def get_download(self, dl_id):
        with self.lock:
            return self.downloads.get(dl_id, {}).copy()

    def get_active(self):
        with self.lock:
            if self.current_download_id and self.current_download_id in self.downloads:
                return self.downloads[self.current_download_id].copy()
            return None

    def get_history(self):
        with self.lock:
            return list(self.downloads.values())[-20:]

manager = DownloadManager()

def get_cookie_file():
    candidates = [
        ROOT_DIR / "cookies.txt",
        DEFAULT_DOWNLOAD_DIR / "cookies.txt",
        Path.home() / "Downloads" / "cookies.txt"
    ]
    for c in candidates:
        if c.exists():
            return str(c.resolve())
    return None

def run_download_thread(dl_id, url, format_type, quality, output_dir):
    try:
        def progress_hook(d):
            status = d.get('status')
            if status == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes', 0)
                speed = d.get('speed') or 0
                eta = d.get('eta')

                percent = 0.0
                if total > 0:
                    percent = round((downloaded / total) * 100, 1)

                manager.update_progress(dl_id, {
                    "status": "downloading",
                    "percent": percent,
                    "downloaded_str": format_bytes(downloaded),
                    "total_str": format_bytes(total),
                    "speed": f"{format_bytes(speed)}/s" if speed else "Calculando...",
                    "eta": format_eta(eta),
                    "filename": os.path.basename(d.get('filename', ''))
                })
            elif status == 'finished':
                manager.update_progress(dl_id, {
                    "status": "processing",
                    "percent": 99.0,
                    "speed": "Procesando archivo...",
                    "eta": "Finalizando...",
                    "filename": os.path.basename(d.get('filename', ''))
                })

        def postprocessor_hook(d):
            if d.get('status') == 'started':
                pp_name = d.get('postprocessor', '')
                manager.update_progress(dl_id, {
                    "status": "processing",
                    "speed": f"Procesando: {pp_name}...",
                    "percent": 99.0
                })

        url = sanitize_url(url)
        bbb_data = parse_bbb_url(url)
        clean_title = None
        if bbb_data:
            actual_url = bbb_data["webcams_url"]
            clean_title = re.sub(r'[\\/*?:"<>|]', "", bbb_data["title"])
            ydl_opts = {
                'outtmpl': os.path.join(output_dir, f"{clean_title}.%(ext)s"),
                'progress_hooks': [progress_hook],
                'postprocessor_hooks': [postprocessor_hook],
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'noplaylist': True,
            }
        else:
            actual_url = url
            ydl_opts = {
                'outtmpl': os.path.join(output_dir, '%(title)s [%(id)s].%(ext)s'),
                'progress_hooks': [progress_hook],
                'postprocessor_hooks': [postprocessor_hook],
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'noplaylist': True,
                'extractor_args': {'youtube': {
                    'player_client': ['tv_embedded', 'android', 'ios', 'web'],
                    'player_skip': ['webpage'],
                }},
            }

        cookie_path = get_cookie_file()
        if cookie_path:
            ydl_opts['cookiefile'] = cookie_path

        if FFMPEG_DIR:
            ydl_opts['ffmpeg_location'] = FFMPEG_DIR
        elif FFMPEG_EXE:
            ydl_opts['ffmpeg_location'] = FFMPEG_EXE

        if format_type == 'audio':
            # Descargar y extraer audio a MP3 de forma ultra rápida con multi-hilo
            bitrate = quality if quality in ('192', '256', '320') else ('320' if quality == 'best' else '192')
            ydl_opts.update({
                'format': 'bestaudio[ext=m4a]/bestaudio/best',
                'postprocessor_args': {
                    'FFmpegExtractAudio': ['-threads', '0'],
                },
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': bitrate,
                }, {
                    'key': 'FFmpegMetadata',
                    'add_metadata': True,
                }]
            })
        else:
            # Video: Seleccionar formato H.264 (avc1) + AAC (mp4a) para compatibilidad universal con Windows Media Player, Smart TVs y moviles
            if bbb_data:
                fmt = 'best'
                ydl_opts.update({
                    'format': fmt,
                    'postprocessor_args': {
                        'FFmpegVideoConvertor': ['-threads', '0'],
                    },
                    'postprocessors': [{
                        'key': 'FFmpegVideoConvertor',
                        'preferedformat': 'mp4',
                    }]
                })
            else:
                if quality in ('2160', '1440', '1080', '720', '480'):
                    fmt = (
                        f'bestvideo[height<={quality}][vcodec^=avc1]+bestaudio[acodec^=mp4a]/'
                        f'bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/'
                        f'bestvideo[height<={quality}]+bestaudio/'
                        f'mp4[height<={quality}]/'
                        f'best[height<={quality}][ext=mp4]/'
                        f'best[height<={quality}]/best'
                    )
                else:
                    fmt = (
                        'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/'
                        'bestvideo[ext=mp4]+bestaudio[ext=m4a]/'
                        'bestvideo+bestaudio/'
                        'mp4/best[ext=mp4]/best'
                    )

                ydl_opts.update({
                    'format': fmt,
                    'merge_output_format': 'mp4',
                    'postprocessor_args': {
                        'Merger': ['-threads', '0'],
                    }
                })

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(actual_url, download=True)
            filename = ydl.prepare_filename(info)
            if format_type == 'audio':
                filename = os.path.splitext(filename)[0] + '.mp3'

            manager.update_progress(dl_id, {
                "status": "finished",
                "percent": 100.0,
                "speed": "Completado",
                "eta": "00:00",
                "filename": os.path.basename(filename),
                "output_path": filename,
                "completed_at": time.time()
            })

    except Exception as e:
        manager.update_progress(dl_id, {
            "status": "error",
            "error_message": str(e),
            "completed_at": time.time()
        })

class WebUIHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        static_dir = os.path.join(str(ROOT_DIR), "web_ui")
        super().__init__(*args, directory=static_dir, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path in ("/favicon.ico", "/favicon.svg"):
            fav_path = os.path.join(str(ROOT_DIR), "web_ui", "favicon.svg")
            if os.path.exists(fav_path):
                with open(fav_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            self.send_response(204)
            self.end_headers()
            return

        if path == "/api/status":
            cookie_path = get_cookie_file()
            self.send_json({
                "status": "ok",
                "version": yt_dlp.version.__version__,
                "ffmpeg_available": FFMPEG_EXE is not None,
                "ffmpeg_path": FFMPEG_EXE or "No encontrado",
                "download_dir": str(DEFAULT_DOWNLOAD_DIR),
                "cookies_loaded": cookie_path is not None,
                "cookie_file": os.path.basename(cookie_path) if cookie_path else None
            })
            return

        if path == "/api/info":
            url = params.get("url", [""])[0].strip()
            if not url:
                self.send_json({"error": "Parámetro 'url' requerido"}, status=400)
                return
            url = sanitize_url(url)

            # Soporte nativo para BigBlueButton (UNCOMA, Moodle, aulas virtuales)
            bbb_data = parse_bbb_url(url)
            if bbb_data:
                self.send_json(bbb_data)
                return

            def try_extract(extra_opts=None):
                opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'noplaylist': True,
                    'socket_timeout': 15,
                }
                if extra_opts:
                    opts.update(extra_opts)
                cookie_path = get_cookie_file()
                if cookie_path:
                    opts['cookiefile'] = cookie_path
                with yt_dlp.YoutubeDL(opts) as ydl:
                    # process=False: obtiene metadatos sin validar/seleccionar formatos
                    return ydl.extract_info(url, download=False, process=False)

            info = None
            last_error = None
            try:
                # Intento 1: cliente web estándar con cookies
                info = try_extract()
            except Exception as e1:
                last_error = e1
                err1 = str(e1).lower()
                if any(k in err1 for k in ('bot', 'reload', 'sign in', 'format', 'not available')):
                    try:
                        # Intento 2: cliente iOS/Android
                        info = try_extract({
                            'extractor_args': {'youtube': {'player_client': ['ios', 'android']}}
                        })
                        last_error = None
                    except Exception as e2:
                        last_error = e2

            if last_error is not None:
                self.send_json({"error": str(last_error)}, status=500)
                return

            # Extraer resoluciones de video disponibles
            formats = info.get("formats", [])
            resolutions = set()
            for f in formats:
                h = f.get("height")
                if h and isinstance(h, int) and h >= 240:
                    resolutions.add(h)
            sorted_resolutions = sorted(list(resolutions), reverse=True)

            data = {
                "id": info.get("id"),
                "title": info.get("title", "Sin título"),
                "uploader": info.get("uploader") or info.get("channel") or "Desconocido",
                "duration": info.get("duration", 0),
                "duration_string": info.get("duration_string") or format_eta(info.get("duration", 0)),
                "thumbnail": info.get("thumbnail", ""),
                "view_count": info.get("view_count", 0),
                "description": (info.get("description") or "")[:200],
                "available_resolutions": sorted_resolutions,
                "is_playlist": False
            }
            self.send_json(data)
            return

        if path == "/api/progress":
            active = manager.get_active()
            self.send_json(active or {"status": "idle"})
            return

        if path == "/api/history":
            history = manager.get_history()
            self.send_json({"history": history})
            return

        if path == "/api/stream":
            query = params
            file_path = query.get("path", [""])[0]
            if not file_path or not os.path.exists(file_path):
                filename = query.get("file", [""])[0]
                if filename:
                    candidate = DEFAULT_DOWNLOAD_DIR / filename
                    if candidate.exists():
                        file_path = str(candidate)

            if not file_path or not os.path.exists(file_path):
                self.send_error(404, "Archivo no encontrado")
                return

            ext = os.path.splitext(file_path)[1].lower()
            mime_type = "audio/mpeg" if ext == ".mp3" else ("video/mp4" if ext == ".mp4" else "application/octet-stream")

            try:
                stat = os.stat(file_path)
                file_size = stat.st_size
                range_header = self.headers.get('Range')

                if range_header and range_header.startswith("bytes="):
                    byte_range = range_header[6:]
                    parts = byte_range.split("-")
                    start = int(parts[0]) if parts[0] else 0
                    end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
                    end = min(end, file_size - 1)
                    length = end - start + 1

                    self.send_response(206)
                    self.send_header("Content-Type", mime_type)
                    self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                    self.send_header("Content-Length", str(length))
                    self.send_header("Accept-Ranges", "bytes")
                    self.end_headers()

                    with open(file_path, "rb") as f:
                        f.seek(start)
                        remaining = length
                        while remaining > 0:
                            chunk_size = min(64 * 1024, remaining)
                            chunk = f.read(chunk_size)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            remaining -= len(chunk)
                else:
                    self.send_response(200)
                    self.send_header("Content-Type", mime_type)
                    self.send_header("Content-Length", str(file_size))
                    self.send_header("Accept-Ranges", "bytes")
                    self.end_headers()
                    with open(file_path, "rb") as f:
                        shutil.copyfileobj(f, self.wfile)
            except Exception:
                pass
            return

        # Archivos estáticos normales
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        if path == "/api/download":
            url = payload.get("url", "").strip()
            if not url:
                self.send_json({"error": "La URL es requerida"}, status=400)
                return
            url = sanitize_url(url)

            format_type = payload.get("format_type", "video")  # 'video' o 'audio'
            quality = payload.get("quality", "best")  # 'best', '1080', '720', etc.
            output_dir = payload.get("output_dir", str(DEFAULT_DOWNLOAD_DIR))

            bbb_data = parse_bbb_url(url)
            title = bbb_data["title"] if bbb_data else payload.get("title", url)
            thumbnail = bbb_data["thumbnail"] if bbb_data else payload.get("thumbnail", "")

            dl_id = manager.create_download(url, {
                "title": title,
                "thumbnail": thumbnail,
                "format_type": format_type,
                "quality": quality
            })

            thread = threading.Thread(
                target=run_download_thread,
                args=(dl_id, url, format_type, quality, output_dir),
                daemon=True
            )
            thread.start()

            self.send_json({"status": "started", "download_id": dl_id})
            return

        if path == "/api/open-folder":
            folder_path = payload.get("path") or str(DEFAULT_DOWNLOAD_DIR)
            try:
                if os.name == 'nt':
                    if os.path.isfile(folder_path):
                        # Seleccionar el archivo en explorer
                        os.system(f'explorer /select,"{os.path.normpath(folder_path)}"')
                    else:
                        os.startfile(folder_path)
                else:
                    os.system(f'xdg-open "{folder_path}"')
                self.send_json({"status": "opened"})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
            return

        if path == "/api/upload-cookies":
            cookie_text = payload.get("cookies", "").strip()
            if not cookie_text:
                self.send_json({"error": "El archivo de cookies está vacío"}, status=400)
                return

            target = ROOT_DIR / "cookies.txt"
            try:
                with open(target, "w", encoding="utf-8") as f:
                    f.write(cookie_text)
                self.send_json({
                    "status": "ok", 
                    "message": "Cookies guardadas correctamente",
                    "cookie_file": "cookies.txt"
                })
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
            return

        if path == "/api/clear-cookies":
            target = ROOT_DIR / "cookies.txt"
            if target.exists():
                try:
                    target.unlink()
                except Exception:
                    pass
            self.send_json({"status": "ok", "message": "Cookies eliminadas"})
            return

        self.send_json({"error": "Ruta no encontrada"}, status=404)

    def send_json(self, data, status=200):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        try:
            msg = format % args
            if "/api/progress" in msg:
                return
            sys.stderr.write(f"{self.address_string()} - - [{self.log_date_time_string()}] {msg}\n")
        except Exception:
            pass

def start_server(port=5000, auto_open=True):
    # Probar puertos en caso de que 5000 esté ocupado
    for p in range(port, port + 10):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', p), WebUIHandler)
            url = f"http://127.0.0.1:{p}"
            print("\n" + "="*60)
            print("  🚀 Servidor Visual yt-dlp Iniciado con Éxito")
            print(f"  🌐 Dirección Web: {url}")
            print(f"  📁 Carpeta de descargas: {DEFAULT_DOWNLOAD_DIR}")
            print(f"  🎬 FFmpeg: {'Disponible (' + FFMPEG_EXE + ')' if FFMPEG_EXE else 'No detectado'}")
            print("="*60 + "\n")
            if auto_open:
                threading.Timer(1.0, lambda: webbrowser.open(url)).start()
            server.serve_forever()
            return
        except OSError:
            continue
    print(f"Error: No se pudo enlazar ningún puerto entre {port} y {port+9}.")

if __name__ == "__main__":
    auto_open = "--no-browser" not in sys.argv
    start_server(5000, auto_open=auto_open)
