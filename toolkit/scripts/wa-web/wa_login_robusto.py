#!/usr/bin/env python3
"""
WhatsApp Web — Login Robusto con Playwright
============================================
- Sesión persistente (cookies + localStorage + sessionStorage)
- Anti-desconexión: heartbeat, keep-alive, reconexión automática
- Login sin QR si ya hay sesión guardada
- Exporta cookies en formato Netscape para curl/wget
- Multi-perfil: soporta múltiples cuentas

Uso:
  python3 wa_login_robusto.py                    # Login/verificar sesión
  python3 wa_login_robusto.py --profile user  # Perfil específico
  python3 wa_login_robusto.py --export-cookies   # Solo exportar cookies
  python3 wa_login_robusto.py --monitor           # Monitorear conexión
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("❌ Instalar: pip3 install playwright && playwright install chromium")
    sys.exit(1)

# ─── Config ──────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
COOKIES_DIR = Path("~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/cookies")
SESSIONS_DIR = Path("~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/toolkit/scripts/wa-web/sessions")

WA_URL = "https://web.whatsapp.com"

# Selectores actualizados 2026
SELECTORS = {
    "qr_canvas": "canvas[aria-label='Scan me!']",
    "qr_canvas_es": "canvas[aria-label='Escanea este código QR']",
    "chat_list": "div[role='list']",
    "chat_list_item": "div[role='listitem']",
    "search_input": "div[contenteditable='true'][data-tab='search']",
    "search_input_es": "div[contenteditable='true'][aria-label='Buscar un chat o iniciar uno nuevo']",
    "side_panel": "div[id='side']",
    "main_panel": "div[id='main']",
    "qr_refresh": "div[role='button'] >> text='click to reload QR code'",
    "qr_refresh_es": "div[role='button'] >> text='Volver a cargar el código QR'",
    "logged_in_indicator": "div[id='pane-side']",  # Panel de chats visible = logged in
}


def get_session_dir(profile: str = "default") -> Path:
    """Directorio de sesión para un perfil."""
    d = SESSIONS_DIR / f"session-{profile}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def is_logged_in(page) -> bool:
    """Verifica si ya estamos logueados."""
    try:
        # Si el panel de chats está visible, estamos logueados
        page.wait_for_selector(SELECTORS["logged_in_indicator"], timeout=5000)
        return True
    except PlaywrightTimeout:
        pass
    
    # Verificar si hay QR (no logueado)
    try:
        qr = page.query_selector("canvas")
        if qr:
            return False
    except:
        pass
    
    return False


def wait_for_qr_scan(page, timeout: int = 120) -> bool:
    """Espera a que el usuario escanee el QR."""
    print("⏳ Esperando escaneo de QR...")
    print("   Abre WhatsApp en tu teléfono → Configuración → Dispositivos vinculados → Escanear")
    
    start = time.time()
    while time.time() - start < timeout:
        if is_logged_in(page):
            print("✅ Sesión iniciada!")
            return True
        time.sleep(2)
        elapsed = int(time.time() - start)
        if elapsed % 10 == 0:
            print(f"   ⏱️  {elapsed}s...")
    
    print("❌ Timeout esperando QR")
    return False


def save_session(context, profile: str = "default"):
    """Guarda cookies + localStorage + sessionStorage."""
    session_dir = get_session_dir(profile)
    
    # Guardar cookies
    cookies = context.cookies()
    cookies_path = COOKIES_DIR / f"wa_cookies_{profile}.json"
    with open(cookies_path, "w") as f:
        json.dump(cookies, f, indent=2)
    
    # Formato Netscape
    netscape_path = COOKIES_DIR / f"wa_cookies_{profile}.txt"
    with open(netscape_path, "w") as f:
        f.write("# Netscape HTTP Cookie File\n")
        f.write(f"# Profile: {profile}\n")
        f.write(f"# Date: {datetime.now().isoformat()}\n\n")
        for c in cookies:
            domain = c.get("domain", "")
            flag = "TRUE" if domain.startswith(".") else "FALSE"
            path = c.get("path", "/")
            secure = "TRUE" if c.get("secure", False) else "FALSE"
            expiry = int(c.get("expires", 0))
            f.write(f"{domain}\t{flag}\t{path}\t{secure}\t{expiry}\t{c.get('name','')}\t{c.get('value','')}\n")
    
    # Guardar localStorage y sessionStorage
    page = context.pages[0] if context.pages else None
    if page:
        ls = page.evaluate("() => JSON.stringify(localStorage)")
        ss = page.evaluate("() => JSON.stringify(sessionStorage)")
        
        ls_path = session_dir / "localstorage.json"
        ss_path = session_dir / "sessionstorage.json"
        
        with open(ls_path, "w") as f:
            json.dump(json.loads(ls), f, indent=2)
        with open(ss_path, "w") as f:
            json.dump(json.loads(ss), f, indent=2)
    
    print(f"💾 Sesión guardada:")
    print(f"   Cookies: {cookies_path} ({len(cookies)} cookies)")
    print(f"   Netscape: {netscape_path}")
    if page:
        print(f"   localStorage: {session_dir / 'localstorage.json'}")
        print(f"   sessionStorage: {session_dir / 'sessionstorage.json'}")


def load_session(context, profile: str = "default") -> bool:
    """Carga cookies + localStorage + sessionStorage guardados."""
    session_dir = get_session_dir(profile)
    cookies_path = COOKIES_DIR / f"wa_cookies_{profile}.json"
    
    loaded = False
    
    # Cargar cookies
    if cookies_path.exists():
        with open(cookies_path) as f:
            cookies = json.load(f)
        context.add_cookies(cookies)
        print(f"🍪 Cookies cargadas: {len(cookies)}")
        loaded = True
    
    # Cargar localStorage (después de navegar a la página)
    ls_path = session_dir / "localstorage.json"
    if ls_path.exists():
        with open(ls_path) as f:
            ls = json.load(f)
        # Se inyecta después de cargar la página
        print(f"💾 localStorage disponible: {len(ls)} keys")
        loaded = True
    
    return loaded, ls_path if ls_path.exists() else None


def inject_localstorage(page, ls_path: Path):
    """Inyecta localStorage guardado en la página."""
    if not ls_path or not ls_path.exists():
        return
    
    with open(ls_path) as f:
        ls = json.load(f)
    
    # Inyectar cada key
    for key, value in ls.items():
        # Escapar comillas simples
        safe_value = json.dumps(value)
        safe_key = json.dumps(key)
        page.evaluate(f"localStorage.setItem({safe_key}, {safe_value})")
    
    print(f"💉 localStorage inyectado: {len(ls)} keys")


def keep_alive(page, duration: int = 300):
    """Mantiene la sesión activa con heartbeat."""
    print(f"💓 Keep-alive activo por {duration}s...")
    start = time.time()
    
    while time.time() - start < duration:
        # Verificar si seguimos logueados
        if not is_logged_in(page):
            print("⚠️ Sesión perdida! Intentando reconectar...")
            page.reload()
            time.sleep(5)
            if is_logged_in(page):
                print("✅ Reconectado!")
            else:
                print("❌ No se pudo reconectar")
                return False
        
        # Simular actividad (mover mouse ligeramente)
        try:
            page.mouse.move(100, 100)
            page.mouse.move(110, 110)
        except:
            pass
        
        time.sleep(30)  # Heartbeat cada 30s
        elapsed = int(time.time() - start)
        print(f"  💓 {elapsed}s — sesión activa")
    
    return True


def monitor_connection(page, context, profile: str):
    """Monitorea la conexión y reconecta si se pierde."""
    print("👁️ Monitor de conexión activo (Ctrl+C para salir)")
    
    reconnect_count = 0
    max_reconnects = 10
    
    while reconnect_count < max_reconnects:
        try:
            if is_logged_in(page):
                # Guardar sesión periódicamente
                save_session(context, profile)
                print(f"✅ Sesión activa — guardada (reconexiones: {reconnect_count})")
                time.sleep(60)  # Guardar cada minuto
            else:
                print(f"⚠️ Sesión perdida (intento {reconnect_count + 1}/{max_reconnects})")
                page.reload()
                time.sleep(10)
                
                if is_logged_in(page):
                    print("✅ Reconectado!")
                    save_session(context, profile)
                    reconnect_count = 0
                else:
                    reconnect_count += 1
                    if reconnect_count >= max_reconnects:
                        print("❌ Máximo de reconexiones alcanzado")
                        return False
                    time.sleep(30)  # Esperar antes de reintentar
        
        except KeyboardInterrupt:
            print("\n👋 Monitor detenido por usuario")
            save_session(context, profile)
            return True
        except Exception as e:
            print(f"❌ Error: {e}")
            time.sleep(10)
    
    return False


def main():
    parser = argparse.ArgumentParser(description="WhatsApp Web Login Robusto")
    parser.add_argument("--profile", default="user", help="Nombre del perfil")
    parser.add_argument("--export-cookies", action="store_true", help="Solo exportar cookies")
    parser.add_argument("--monitor", action="store_true", help="Monitorear conexión")
    parser.add_argument("--keep-alive", type=int, help="Mantener activo por N segundos")
    parser.add_argument("--headless", action="store_true", help="Modo headless")
    parser.add_argument("--user-data-dir", help="Directorio de datos de Chrome personalizado")
    args = parser.parse_args()
    
    session_dir = get_session_dir(args.profile)
    
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  WhatsApp Web — Login Robusto                           ║")
    print(f"║  Perfil: {args.profile:<46}║")
    print("╚══════════════════════════════════════════════════════════╝")
    
    with sync_playwright() as p:
        # Lanzar Chrome con perfil persistente
        user_data_dir = args.user_data_dir or str(session_dir)
        
        context = p.chromium.launch_persistent_context(
            user_data_dir,
            headless=args.headless,
            viewport={"width": 1280, "height": 800},
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-web-security",
                "--remote-allow-origins=*",
            ],
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        page = context.pages[0] if context.pages else context.new_page()
        
        # Cargar sesión guardada
        loaded, ls_path = load_session(context, args.profile)
        
        # Navegar a WhatsApp Web
        print(f"🌐 Navegando a {WA_URL}...")
        page.goto(WA_URL, wait_until="domcontentloaded", timeout=30000)
        
        # Inyectar localStorage antes de que WhatsApp cargue
        if ls_path:
            inject_localstorage(page, ls_path)
            # Recargar para que WhatsApp use el localStorage
            page.reload(wait_until="domcontentloaded", timeout=30000)
        
        # Esperar a que cargue
        time.sleep(5)
        
        # Verificar si estamos logueados
        if is_logged_in(page):
            print("✅ Sesión activa (sin QR necesario!)")
            save_session(context, args.profile)
            
            if args.export_cookies:
                print("🍪 Cookies exportadas!")
                context.close()
                return
            
            if args.monitor:
                monitor_connection(page, context, args.profile)
            elif args.keep_alive:
                keep_alive(page, args.keep_alive)
                save_session(context, args.profile)
            else:
                print("✅ Listo! Sesión verificada y guardada.")
                print(f"   Usa --monitor para monitorear")
                print(f"   Usa --keep-alive N para mantener activo N segundos")
        else:
            print("⚠️ No hay sesión activa. Necesitas escanear QR.")
            if not wait_for_qr_scan(page, timeout=120):
                print("❌ No se pudo iniciar sesión")
                context.close()
                return
            
            save_session(context, args.profile)
            print("✅ Sesión guardada!")
            
            if args.monitor:
                monitor_connection(page, context, args.profile)
            elif args.keep_alive:
                keep_alive(page, args.keep_alive)
        
        if not args.monitor and not args.keep_alive:
            context.close()


if __name__ == "__main__":
    main()
