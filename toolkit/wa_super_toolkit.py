#!/usr/bin/env python3
"""
wa_super_toolkit.py — Supertoolkit de WhatsApp
Consolida TODAS las capacidades de interacción con WhatsApp en un solo CLI.

Arquitectura:
  ┌──────────────┐    REST API (:8080)    ┌──────────────────┐
  │ wa_super_    │ ◄────────────────────► │ whatsapp-bridge  │◄──► WhatsApp
  │ toolkit.py   │    /api/send           │ (Go/whatsmeow)   │    Servers
  │              │    /api/download       │                  │
  │              │    /api/media/retry    │ store/   │
  │              │    /api/chats/list     │   messages.db    │
  │              │    /api/group/info     │   whatsapp.db    │
  │              │    /api/history/sync   │                  │
  └──────────────┘                        └──────────────────┘
         │
         ▼
  ┌──────────────┐
  │ msgstore_    │ ← Backup DB (SQLite, 155 chats, 100K+ mensajes)
  │ user.db   │
  └──────────────┘
         │
         ▼
  ┌──────────────┐
  │ ADB (phone)  │ ← Extracción directa del teléfono
  └──────────────┘
"""

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════

SCRIPT_DIR = Path(__file__).parent
BRIDGE_DIR = SCRIPT_DIR.parent / "whatsapp-bridge"
BRIDGE_URL = os.environ.get("WA_BRIDGE_URL", "http://localhost:8080/api")
STORE_DIR = os.environ.get("WA_STORE_DIR", "store")
MESSAGES_DB = BRIDGE_DIR / STORE_DIR / "messages.db"
BACKUP_DB = Path("~/Documents/ricpersonal/01_PERSONAL_RICARDO/configuraciones/mcp-servers/whatsapp-backup-tools/backups/msgstore.db")
ADB = os.environ.get("ADB", os.path.expanduser("~/Library/Android/sdk/platform-tools/adb"))
DEFAULT_OUTPUT = SCRIPT_DIR / "exports"


# ═══════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _post(endpoint: str, payload: dict) -> dict:
    url = f"{BRIDGE_URL}/{endpoint}"
    try:
        resp = requests.post(url, json=payload, timeout=60)
        return resp.json()
    except requests.ConnectionError:
        print(f"❌ Bridge no conectado en {BRIDGE_URL}")
        print("   Ejecuta: ./start_bridge.sh")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


def _normalize_jid(chat: str) -> str:
    chat = chat.strip().replace("+", "").replace(" ", "").replace("-", "")
    if "@" not in chat:
        return f"{chat}@s.whatsapp.net"
    return chat


def _get_bridge_db() -> sqlite3.Connection:
    if not MESSAGES_DB.exists():
        print(f"❌ No existe {MESSAGES_DB}")
        sys.exit(1)
    conn = sqlite3.connect(str(MESSAGES_DB))
    conn.row_factory = sqlite3.Row
    return conn


def _get_backup_db() -> sqlite3.Connection:
    if not BACKUP_DB.exists():
        print(f"❌ No existe {BACKUP_DB}")
        sys.exit(1)
    conn = sqlite3.connect(str(BACKUP_DB))
    conn.row_factory = sqlite3.Row
    return conn


def _find_chat_id_by_jid(conn: sqlite3.Connection, jid: str) -> Optional[int]:
    """Encuentra chat_row_id en msgstore.db."""
    row = conn.execute(
        "SELECT c._id FROM chat c JOIN jid j ON c.jid_row_id=j._id WHERE j.raw_string=?",
        (jid,)
    ).fetchone()
    return row[0] if row else None


def _format_size(size: int) -> str:
    if size == 0:
        return "—"
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / 1024 / 1024:.1f} MB"


def _check_url_expiry(url: str) -> Tuple[bool, str]:
    """Verifica si un URL de WhatsApp está expirado parseando el parámetro oe."""
    if not url:
        return True, "sin URL"
    try:
        for part in url.split("&"):
            if part.startswith("oe="):
                oe_hex = part.split("=")[1]
                oe_epoch = int(oe_hex, 16)
                now = int(datetime.now().timestamp())
                if oe_epoch > now:
                    days = (oe_epoch - now) / 86400
                    return False, f"válido por {days:.1f} días"
                else:
                    days = (now - oe_epoch) / 86400
                    return True, f"expirado hace {days:.1f} días"
    except (ValueError, IndexError):
        pass
    return True, "no se pudo verificar"


# ═══════════════════════════════════════════════════════════════════════════
# COMANDOS DE LECTURA
# ═══════════════════════════════════════════════════════════════════════════

def cmd_chats(args):
    """Listar chats."""
    conn = _get_bridge_db()
    query = "SELECT * FROM chats"
    params = []
    if args.query:
        query += " WHERE jid LIKE ? OR name LIKE ?"
        params = [f"%{args.query}%", f"%{args.query}%"]
    query += " ORDER BY last_message_time DESC"
    if args.limit:
        query += f" LIMIT {args.limit}"

    rows = conn.execute(query, params).fetchall()
    print(f"Chats: {len(rows)}\n")
    for r in rows:
        name = r["name"] or "(sin nombre)"
        ts = str(r["last_message_time"] or "")[:16]
        print(f"  {name:<40} {r['jid']:<45} {ts}")
    conn.close()


def cmd_messages(args):
    """Ver mensajes de un chat."""
    conn = _get_bridge_db()
    jid = _normalize_jid(args.chat)

    query = "SELECT * FROM messages WHERE chat_jid = ?"
    params = [jid]

    if args.after:
        query += " AND timestamp > ?"
        params.append(args.after)
    if args.before:
        query += " AND timestamp < ?"
        params.append(args.before)
    if args.query:
        query += " AND content LIKE ?"
        params.append(f"%{args.query}%")
    if args.media_only:
        query += " AND media_type IS NOT NULL AND media_type != ''"
    if args.from_me:
        query += " AND is_from_me = 1"
    if args.from_them:
        query += " AND is_from_me = 0"

    query += " ORDER BY timestamp DESC"
    if args.limit:
        query += f" LIMIT {args.limit}"

    rows = conn.execute(query, params).fetchall()
    print(f"Mensajes: {len(rows)} | Chat: {jid}\n")

    for r in reversed(rows):
        ts = str(r["timestamp"] or "")[:16]
        sender = "YO" if r["is_from_me"] else "OTRO"
        content = r["content"] or ""
        media = r["media_type"] or ""
        fname = r["filename"] or ""

        if media:
            content = f"[{media.upper()}] {fname} {content}".strip()
        if not content:
            continue
        print(f"  [{ts}] {sender}: {content[:250]}")
    conn.close()


def cmd_search(args):
    """Buscar en mensajes."""
    conn = _get_bridge_db()
    rows = conn.execute(
        "SELECT m.*, c.name as chat_name FROM messages m LEFT JOIN chats c ON m.chat_jid = c.jid WHERE m.content LIKE ? ORDER BY m.timestamp DESC LIMIT ?",
        (f"%{args.query}%", args.limit)
    ).fetchall()
    print(f"Resultados: {len(rows)} para '{args.query}'\n")
    for r in rows:
        ts = str(r["timestamp"] or "")[:16]
        sender = "YO" if r["is_from_me"] else "OTRO"
        chat = r["chat_name"] or r["chat_jid"]
        print(f"  [{ts}] {sender} en {chat}: {r['content'][:200]}")
    conn.close()


def cmd_media(args):
    """Listar media de un chat (con estado de URL)."""
    conn = _get_bridge_db()
    jid = _normalize_jid(args.chat)

    query = "SELECT * FROM messages WHERE chat_jid = ? AND media_type IS NOT NULL AND media_type != ''"
    params = [jid]
    if args.from_them:
        query += " AND is_from_me = 0"
    if args.media_type:
        query += " AND media_type = ?"
        params.append(args.media_type)
    query += " ORDER BY timestamp DESC"

    rows = conn.execute(query, params).fetchall()
    print(f"Media: {len(rows)} archivos | Chat: {jid}\n")

    for r in rows:
        ts = str(r["timestamp"] or "")[:16]
        media = r["media_type"] or ""
        fname = r["filename"] or f"{r['id']}_{media}"
        size = _format_size(r["file_length"] or 0)
        url = r["url"] or ""
        expired, expiry_info = _check_url_expiry(url)
        status = "🔴" if expired else "🟢"
        from_me = "→" if r["is_from_me"] else "←"
        print(f"  {status} [{ts}] {from_me} {fname:<50} {media:<10} {size:<10} {expiry_info}")
    conn.close()


# ═══════════════════════════════════════════════════════════════════════════
# COMANDOS DE BACKUP DB (msgstore.db)
# ═══════════════════════════════════════════════════════════════════════════

def cmd_backup_media(args):
    """Listar media del backup DB (msgstore.db)."""
    conn = _get_backup_db()
    jid = _normalize_jid(args.chat)
    chat_id = _find_chat_id_by_jid(conn, jid)

    if not chat_id:
        print(f"❌ Chat no encontrado: {jid}")
        conn.close()
        return

    query = """
        SELECT 
          datetime(m.timestamp/1000, 'unixepoch', 'localtime') as fecha,
          mm.mime_type,
          mm.media_name,
          mm.file_size,
          mm.file_path,
          mm.media_caption,
          m.from_me
        FROM message_media mm
        JOIN message m ON mm.message_row_id = m._id
        WHERE mm.chat_row_id = ?
          AND mm.mime_type IS NOT NULL AND mm.mime_type != ''
    """
    params = [chat_id]

    if args.from_them:
        query += " AND m.from_me = 0"
    if args.docs_only:
        query += " AND mm.mime_type LIKE 'application/%'"
    if args.after:
        ts = int(datetime.strptime(args.after, "%Y-%m-%d").timestamp() * 1000)
        query += " AND m.timestamp > ?"
        params.append(ts)

    query += " ORDER BY m.timestamp DESC"

    rows = conn.execute(query, params).fetchall()
    print(f"Media en backup: {len(rows)} archivos | Chat: {jid}\n")

    for r in rows:
        ts = str(r["fecha"] or "")[:16]
        mime = r["mime_type"] or ""
        fname = r["media_name"] or ""
        size = _format_size(r["file_size"] or 0)
        caption = (r["media_caption"] or "")[:50]
        from_me = "→" if r["from_me"] else "←"

        # Tipo simplificado
        if "pdf" in mime:
            tipo = "PDF"
        elif "wordprocessing" in mime:
            tipo = "Word"
        elif "spreadsheet" in mime:
            tipo = "Excel"
        elif "presentation" in mime:
            tipo = "PPT"
        elif "zip" in mime:
            tipo = "ZIP"
        elif "jpeg" in mime:
            tipo = "IMG"
        elif "webp" in mime:
            tipo = "STK"
        elif "mp4" in mime:
            tipo = "VID"
        elif "ogg" in mime:
            tipo = "VNZ"
        else:
            tipo = mime.split("/")[-1][:4]

        print(f"  [{ts}] {from_me} {tipo:<5} {fname:<55} {size:<10} {caption}")
    conn.close()


def cmd_backup_export(args):
    """Exportar media del backup a CSV."""
    conn = _get_backup_db()
    jid = _normalize_jid(args.chat)
    chat_id = _find_chat_id_by_jid(conn, jid)

    if not chat_id:
        print(f"❌ Chat no encontrado: {jid}")
        conn.close()
        return

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    rows = conn.execute("""
        SELECT 
          datetime(m.timestamp/1000, 'unixepoch', 'localtime') as fecha,
          mm.mime_type,
          mm.media_name,
          mm.file_size,
          mm.file_path,
          mm.media_caption,
          m.from_me,
          mm.media_key,
          mm.file_hash,
          mm.enc_file_hash
        FROM message_media mm
        JOIN message m ON mm.message_row_id = m._id
        WHERE mm.chat_row_id = ?
          AND mm.mime_type IS NOT NULL AND mm.mime_type != ''
        ORDER BY m.timestamp
    """, (chat_id,)).fetchall()

    csv_file = output / "media_export.csv"
    with open(csv_file, "w", encoding="utf-8") as f:
        f.write("fecha,tipo,nombre,tamano,caption,from_me,file_path,media_key_hex,file_hash_hex,enc_file_hash_hex\n")
        for r in rows:
            mime = r["mime_type"] or ""
            if "pdf" in mime:
                tipo = "PDF"
            elif "wordprocessing" in mime:
                tipo = "Word"
            elif "spreadsheet" in mime:
                tipo = "Excel"
            elif "presentation" in mime:
                tipo = "PPT"
            elif "zip" in mime:
                tipo = "ZIP"
            elif "jpeg" in mime:
                tipo = "IMG"
            elif "webp" in mime:
                tipo = "STK"
            elif "mp4" in mime:
                tipo = "VID"
            elif "ogg" in mime:
                tipo = "VNZ"
            else:
                tipo = mime.split("/")[-1][:4]

            media_key_hex = r["media_key"].hex() if r["media_key"] else ""
            file_hash_hex = r["file_hash"].hex() if r["file_hash"] else ""
            enc_hash_hex = r["enc_file_hash"].hex() if r["enc_file_hash"] else ""

            f.write(f'"{r["fecha"]}","{tipo}","{r["media_name"] or ""}",{r["file_size"] or 0},"{r["media_caption"] or ""}",{r["from_me"]},"{r["file_path"] or ""}","{media_key_hex}","{file_hash_hex}","{enc_hash_hex}"\n')

    print(f"Exportado: {csv_file} ({len(rows)} registros)")
    conn.close()


# ═══════════════════════════════════════════════════════════════════════════
# COMANDOS DE ACCIÓN
# ═══════════════════════════════════════════════════════════════════════════

def cmd_send(args):
    """Enviar mensaje."""
    recipient = _normalize_jid(args.to)
    result = _post("send", {"recipient": recipient, "message": args.msg})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_send_file(args):
    """Enviar archivo."""
    recipient = _normalize_jid(args.to)
    path = os.path.abspath(args.path)
    if not os.path.exists(path):
        print(f"❌ No existe: {path}")
        sys.exit(1)
    result = _post("send", {"recipient": recipient, "media_path": path})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_download(args):
    """Descargar media (con retry automático)."""
    result = _post("media/retry", {
        "message_id": args.msg_id,
        "chat_jid": _normalize_jid(args.chat)
    })
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_download_all(args):
    """Descargar toda la media de un chat (con retry)."""
    conn = _get_bridge_db()
    jid = _normalize_jid(args.chat)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    rows = conn.execute(
        "SELECT * FROM messages WHERE chat_jid = ? AND media_type IS NOT NULL AND media_type != '' ORDER BY timestamp",
        (jid,)
    ).fetchall()

    print(f"Media a descargar: {len(rows)} archivos\n")

    success = 0
    failed = 0
    for i, r in enumerate(rows, 1):
        msg_id = r["id"]
        media_type = r["media_type"] or ""
        fname = r["filename"] or f"{msg_id}_{media_type}"
        url = r["url"] or ""
        expired, expiry_info = _check_url_expiry(url)

        print(f"  [{i}/{len(rows)}] {fname} ({media_type}) [{expiry_info}]", end=" ")

        result = _post("media/retry", {"message_id": msg_id, "chat_jid": jid})
        if result.get("success"):
            src = result.get("path", "")
            if src and os.path.exists(src):
                ext = Path(fname).suffix or Path(src).suffix
                safe = fname if fname else f"{msg_id}{ext}"
                dst = output / safe
                counter = 1
                while dst.exists():
                    dst = output / f"{Path(safe).stem}_{counter}{ext}"
                    counter += 1
                shutil.copy2(src, dst)
                print(f"✅ → {dst.name}")
                success += 1
            else:
                print(f"✅")
                success += 1
        else:
            print(f"❌ {result.get('message', '')[:80]}")
            failed += 1

    print(f"\nResultados: {success} ✅, {failed} ❌ de {len(rows)}")
    conn.close()


def cmd_history_sync(args):
    """Sincronizar historial."""
    result = _post("history/sync", {"chunk_size": args.chunk_size})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_group_info(args):
    """Info de grupo."""
    result = _post("group/info", {"group_jid": args.jid})
    print(json.dumps(result, indent=2, ensure_ascii=False))


# ═══════════════════════════════════════════════════════════════════════════
# COMANDOS ADB
# ═══════════════════════════════════════════════════════════════════════════

def cmd_adb_check(args):
    """Verificar conexión ADB."""
    if not os.path.exists(ADB):
        print(f"❌ ADB no encontrado en: {ADB}")
        return

    result = subprocess.run([ADB, "devices"], capture_output=True, text=True)
    print(result.stdout)
    lines = [l for l in result.stdout.strip().split("\n")[1:] if l.strip()]
    if any("device" in l and "unauthorized" not in l for l in lines):
        print("✅ Dispositivo conectado y autorizado")
    elif any("unauthorized" in l for l in lines):
        print("⚠️  Dispositivo conectado pero NO autorizado")
        print("   Autoriza la conexión en el teléfono")
    else:
        print("❌ No hay dispositivo conectado")
        print("   Conecta tu teléfono por USB y activa Depuración USB")


def cmd_adb_pull(args):
    """Extraer media del teléfono via ADB."""
    if not os.path.exists(ADB):
        print(f"❌ ADB no encontrado")
        return

    conn = _get_backup_db()
    jid = _normalize_jid(args.chat)
    chat_id = _find_chat_id_by_jid(conn, jid)
    if not chat_id:
        print(f"❌ Chat no encontrado: {jid}")
        conn.close()
        return

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    query = """
        SELECT DISTINCT mm.file_path, mm.media_name, mm.mime_type
        FROM message_media mm
        JOIN message m ON mm.message_row_id = m._id
        WHERE mm.chat_row_id = ?
          AND m.from_me = 0
          AND mm.file_path IS NOT NULL AND mm.file_path != ''
          AND mm.mime_type LIKE 'application/%'
        ORDER BY m.timestamp
    """
    rows = conn.execute(query, (chat_id,)).fetchall()

    print(f"Archivos a buscar: {len(rows)}\n")

    # Buscar carpeta de WhatsApp en el teléfono
    for wa_path in [
        "/sdcard/WhatsApp Business/Media",
        "/sdcard/WhatsApp/Media",
        "/storage/emulated/0/WhatsApp Business/Media",
        "/storage/emulated/0/WhatsApp/Media",
    ]:
        result = subprocess.run(
            [ADB, "shell", f"test -d '{wa_path}' && echo EXISTS"],
            capture_output=True, text=True
        )
        if "EXISTS" in result.stdout:
            print(f"✅ Carpeta de media: {wa_path}")
            break
    else:
        print("❌ No se encontró la carpeta de media de WhatsApp")
        conn.close()
        return

    success = 0
    failed = 0
    for i, r in enumerate(rows, 1):
        file_path = r["file_path"] or ""
        media_name = r["media_name"] or os.path.basename(file_path)
        # Mapear "Media/WhatsApp Documents/..." a ruta del teléfono
        phone_path = file_path.replace("Media/", f"{wa_path}/../")
        # También probar con "WhatsApp Business"
        phone_path_alt = phone_path.replace("WhatsApp Documents", "WhatsApp Business Documents")
        phone_path_alt = phone_path_alt.replace("WhatsApp Images", "WhatsApp Business Images")
        phone_path_alt = phone_path_alt.replace("WhatsApp Video", "WhatsApp Business Video")

        print(f"  [{i}/{len(rows)}] {media_name}", end=" ")

        found = False
        for pp in [phone_path_alt, phone_path]:
            result = subprocess.run(
                [ADB, "shell", f"test -f \"{pp}\" && echo EXISTS"],
                capture_output=True, text=True
            )
            if "EXISTS" in result.stdout:
                dst = output / media_name
                subprocess.run([ADB, "pull", pp, str(dst)], capture_output=True)
                print(f"✅")
                success += 1
                found = True
                break

        if not found:
            # Buscar por nombre
            basename = os.path.basename(file_path)
            result = subprocess.run(
                [ADB, "shell", f"find '{wa_path}' -name '{basename}' 2>/dev/null"],
                capture_output=True, text=True
            )
            if result.stdout.strip():
                found_path = result.stdout.strip().split("\n")[0]
                dst = output / media_name
                subprocess.run([ADB, "pull", found_path, str(dst)], capture_output=True)
                print(f"✅ (encontrado en {found_path})")
                success += 1
            else:
                print(f"❌")
                failed += 1

    print(f"\nResultados: {success} ✅, {failed} ❌ de {len(rows)}")
    conn.close()


# ═══════════════════════════════════════════════════════════════════════════
# STATS
# ═══════════════════════════════════════════════════════════════════════════

def cmd_stats(args):
    """Estadísticas completas."""
    # Bridge DB
    conn = _get_bridge_db()
    total_chats = conn.execute("SELECT COUNT(*) FROM chats").fetchone()[0]
    total_msgs = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    total_media = conn.execute("SELECT COUNT(*) FROM messages WHERE media_type IS NOT NULL AND media_type != ''").fetchone()[0]
    conn.close()

    # Backup DB
    conn2 = _get_backup_db()
    backup_chats = conn2.execute("SELECT COUNT(*) FROM chat").fetchone()[0]
    backup_msgs = conn2.execute("SELECT COUNT(*) FROM message").fetchone()[0]
    backup_media = conn2.execute("SELECT COUNT(*) FROM message_media").fetchone()[0]
    conn2.close()

    print("═" * 60)
    print("  WHATSAPP SUPER TOOLKIT — Estadísticas")
    print("═" * 60)
    print()
    print(f"  Bridge (store):")
    print(f"    Chats:     {total_chats}")
    print(f"    Mensajes:  {total_msgs}")
    print(f"    Media:     {total_media}")
    print()
    print(f"  Backup (msgstore.db):")
    print(f"    Chats:     {backup_chats}")
    print(f"    Mensajes:  {backup_msgs}")
    print(f"    Media:     {backup_media}")
    print()
    print(f"  Bridge URL:  {BRIDGE_URL}")
    print(f"  ADB:         {ADB}")


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="WhatsApp Super Toolkit — Todas las capacidades en un solo CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # ── Lectura ──
    p = sub.add_parser("chats", help="Listar chats")
    p.add_argument("--query", "-q")
    p.add_argument("--limit", "-l", type=int)

    p = sub.add_parser("messages", help="Ver mensajes")
    p.add_argument("--chat", "-c", required=True)
    p.add_argument("--limit", "-l", type=int, default=50)
    p.add_argument("--after")
    p.add_argument("--before")
    p.add_argument("--query", "-q")
    p.add_argument("--media-only", action="store_true")
    p.add_argument("--from-me", action="store_true")
    p.add_argument("--from-them", action="store_true")

    p = sub.add_parser("search", help="Buscar en mensajes")
    p.add_argument("--query", "-q", required=True)
    p.add_argument("--limit", "-l", type=int, default=20)

    p = sub.add_parser("media", help="Listar media de un chat")
    p.add_argument("--chat", "-c", required=True)
    p.add_argument("--from-them", action="store_true")
    p.add_argument("--media-type")

    # ── Backup DB ──
    p = sub.add_parser("backup-media", help="Media del backup DB")
    p.add_argument("--chat", "-c", required=True)
    p.add_argument("--from-them", action="store_true")
    p.add_argument("--docs-only", action="store_true")
    p.add_argument("--after", help="Fecha YYYY-MM-DD")

    p = sub.add_parser("backup-export", help="Exportar media del backup a CSV")
    p.add_argument("--chat", "-c", required=True)
    p.add_argument("--output", "-o", required=True)

    # ── Acción ──
    p = sub.add_parser("send", help="Enviar mensaje")
    p.add_argument("--to", "-t", required=True)
    p.add_argument("--msg", "-m", required=True)

    p = sub.add_parser("send-file", help="Enviar archivo")
    p.add_argument("--to", "-t", required=True)
    p.add_argument("--path", "-p", required=True)

    p = sub.add_parser("download", help="Descargar media (con retry)")
    p.add_argument("--msg-id", required=True)
    p.add_argument("--chat", "-c", required=True)

    p = sub.add_parser("download-all", help="Descargar toda la media de un chat")
    p.add_argument("--chat", "-c", required=True)
    p.add_argument("--output", "-o", required=True)

    p = sub.add_parser("history-sync", help="Sincronizar historial")
    p.add_argument("--chunk-size", type=int, default=500)

    p = sub.add_parser("group-info", help="Info de grupo")
    p.add_argument("--jid", required=True)

    # ── ADB ──
    sub.add_parser("adb-check", help="Verificar conexión ADB")

    p = sub.add_parser("adb-pull", help="Extraer media del teléfono via ADB")
    p.add_argument("--chat", "-c", required=True)
    p.add_argument("--output", "-o", required=True)

    # ── Stats ──
    sub.add_parser("stats", help="Estadísticas completas")

    args = parser.parse_args()

    commands = {
        "chats": cmd_chats,
        "messages": cmd_messages,
        "search": cmd_search,
        "media": cmd_media,
        "backup-media": cmd_backup_media,
        "backup-export": cmd_backup_export,
        "send": cmd_send,
        "send-file": cmd_send_file,
        "download": cmd_download,
        "download-all": cmd_download_all,
        "history-sync": cmd_history_sync,
        "group-info": cmd_group_info,
        "adb-check": cmd_adb_check,
        "adb-pull": cmd_adb_pull,
        "stats": cmd_stats,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
