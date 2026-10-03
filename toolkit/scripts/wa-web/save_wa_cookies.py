#!/usr/bin/env python3
"""
Guardar cookies de WhatsApp Web del Chrome activo (CDP puerto 9222)
==================================================================
Extrae cookies, localStorage y sessionStorage de la pestaña de WhatsApp Web
que está abierta en Chrome con remote debugging.

Uso:
  python3 save_wa_cookies.py
  python3 save_wa_cookies.py --profile user
"""

import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime

import requests
import websocket

CDP_URL = "http://127.0.0.1:9222"
COOKIES_DIR = Path("~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/cookies")


def find_whatsapp_tab():
    """Busca la pestaña de WhatsApp Web en Chrome."""
    try:
        resp = requests.get(f"{CDP_URL}/json", timeout=5)
        tabs = resp.json()
    except requests.exceptions.ConnectionError:
        print("❌ Chrome no está corriendo con remote debugging en puerto 9222")
        print("   Inicia Chrome con:")
        print('   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\')
        print("     --remote-debugging-port=9222 \\")
        print("     --remote-allow-origins=* \\")
        print("     --user-data-dir=/tmp/chrome-wa-debug \\")
        print('     "https://web.whatsapp.com"')
        return None
    
    for tab in tabs:
        url = tab.get("url", "")
        if "web.whatsapp.com" in url and "sw.js" not in url:
            return tab
    
    print("❌ No hay pestaña de WhatsApp Web abierta")
    print("   Pestañas abiertas:")
    for t in tabs:
        print(f"     {t.get('url', '?')}")
    return None


def extract_data(ws_url: str, profile: str):
    """Extrae cookies, localStorage y sessionStorage via CDP."""
    ws = websocket.create_connection(
        ws_url, timeout=15,
        header=["Origin: http://127.0.0.1:9222"],
        origin="http://127.0.0.1:9222"
    )
    
    # ─── Cookies ─────────────────────────────────────────────────────────
    ws.send(json.dumps({"id": 1, "method": "Network.getAllCookies", "params": {}}))
    result = json.loads(ws.recv())
    cookies = result.get("result", {}).get("cookies", [])
    
    # Guardar JSON
    json_path = COOKIES_DIR / f"wa_cookies_{profile}.json"
    with open(json_path, "w") as f:
        json.dump(cookies, f, indent=2)
    
    # Guardar Netscape
    netscape_path = COOKIES_DIR / f"wa_cookies_{profile}.txt"
    with open(netscape_path, "w") as f:
        f.write("# Netscape HTTP Cookie File\n")
        f.write(f"# Profile: {profile}\n")
        f.write(f"# Extracted: {datetime.now().isoformat()}\n")
        f.write(f"# Source: CDP {CDP_URL}\n\n")
        for c in cookies:
            domain = c.get("domain", "")
            flag = "TRUE" if domain.startswith(".") else "FALSE"
            path = c.get("path", "/")
            secure = "TRUE" if c.get("secure", False) else "FALSE"
            expiry = int(c.get("expires", 0))
            f.write(f"{domain}\t{flag}\t{path}\t{secure}\t{expiry}\t{c.get('name','')}\t{c.get('value','')}\n")
    
    # ─── localStorage ────────────────────────────────────────────────────
    ws.send(json.dumps({
        "id": 2, "method": "Runtime.evaluate",
        "params": {"expression": "JSON.stringify(localStorage)", "returnByValue": True}
    }))
    result2 = json.loads(ws.recv())
    ls = json.loads(result2.get("result", {}).get("result", {}).get("value", "{}"))
    
    ls_path = COOKIES_DIR / f"wa_localstorage_{profile}.json"
    with open(ls_path, "w") as f:
        json.dump(ls, f, indent=2)
    
    # ─── sessionStorage ──────────────────────────────────────────────────
    ws.send(json.dumps({
        "id": 3, "method": "Runtime.evaluate",
        "params": {"expression": "JSON.stringify(sessionStorage)", "returnByValue": True}
    }))
    result3 = json.loads(ws.recv())
    ss = json.loads(result3.get("result", {}).get("result", {}).get("value", "{}"))
    
    ss_path = COOKIES_DIR / f"wa_sessionstorage_{profile}.json"
    with open(ss_path, "w") as f:
        json.dump(ss, f, indent=2)
    
    ws.close()
    
    return cookies, ls, ss


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", default="user", help="Nombre del perfil")
    args = parser.parse_args()
    
    COOKIES_DIR.mkdir(parents=True, exist_ok=True)
    
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  Guardar Cookies de WhatsApp Web                        ║")
    print(f"║  Perfil: {args.profile:<46}║")
    print("╚══════════════════════════════════════════════════════════╝")
    
    # Buscar pestaña
    tab = find_whatsapp_tab()
    if not tab:
        sys.exit(1)
    
    print(f"✅ Pestaña: {tab['url']}")
    
    # Extraer datos
    try:
        cookies, ls, ss = extract_data(tab["webSocketDebuggerUrl"], args.profile)
    except Exception as e:
        print(f"❌ Error extrayendo datos: {e}")
        sys.exit(1)
    
    # Resumen
    print(f"\n📊 Resumen:")
    print(f"  🍪 Cookies: {len(cookies)}")
    print(f"  💾 localStorage: {len(ls)} keys")
    print(f"  💾 sessionStorage: {len(ss)} keys")
    print(f"\n💾 Archivos guardados en: {COOKIES_DIR}")
    print(f"  - wa_cookies_{args.profile}.json")
    print(f"  - wa_cookies_{args.profile}.txt (Netscape)")
    print(f"  - wa_localstorage_{args.profile}.json")
    print(f"  - wa_sessionstorage_{args.profile}.json")
    
    # Mostrar keys importantes
    print(f"\n🔑 localStorage keys importantes:")
    for k in sorted(ls.keys()):
        if any(x in k.lower() for x in ["secret", "token", "auth", "session", "wid", "id", "key", "last-wid"]):
            val = str(ls[k])[:60]
            print(f"  {k}: {val}...")


if __name__ == "__main__":
    main()
