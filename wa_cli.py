#!/usr/bin/env python3
"""
wa_cli.py — CLI reutilizable para interactuar con WhatsApp via el Bridge REST API.

Requiere que el bridge esté corriendo (start_bridge.sh).

Uso:
  python3 wa_cli.py chats                                    # Listar todos los chats
  python3 wa_cli.py chats --query contact-name                    # Buscar chats
  python3 wa_cli.py messages --chat 521XXXXXXXXXX            # Mensajes de un chat
  python3 wa_cli.py messages --chat 521XXXXXXXXXX --limit 50 # Últimos 50
  python3 wa_cli.py messages --chat 521XXXXXXXXXX --after 2026-07-01
  python3 wa_cli.py search --query "expediente"              # Buscar en contenido
  python3 wa_cli.py contacts --query contact-name                 # Buscar contactos
  python3 wa_cli.py send --to 521XXXXXXXXXX --msg "Hola"     # Enviar mensaje
  python3 wa_cli.py send-file --to 521XXXXXXXXXX --path /ruta/archivo.pdf
  python3 wa_cli.py send-audio --to 521XXXXXXXXXX --path /ruta/audio.mp3
  python3 wa_cli.py download --msg-id ABC123 --chat 521XXXXXXXXXX@s.whatsapp.net
  python3 wa_cli.py group-info --jid 521XXXXXXXXXX-1610476474@g.us
  python3 wa_cli.py history-sync                             # Sincronizar historial
  python3 wa_cli.py backup --output ~/backup_wa              # Backup completo a carpeta
  python3 wa_cli.py download-chat-media --chat 521XXXXXXXXXX --output ./media_contact-name
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

# ─── Configuración ──────────────────────────────────────────────────────────
BRIDGE_URL = os.environ.get("WA_BRIDGE_URL", "http://localhost:8080/api")
STORE_DIR = os.environ.get("WA_STORE_DIR", "store")
# El DB del bridge está en whatsapp-bridge/<STORE_DIR>/messages.db
BRIDGE_DIR = Path(__file__).parent / "whatsapp-bridge"
MESSAGES_DB = BRIDGE_DIR / STORE_DIR / "messages.db"


# ─── Helpers HTTP ───────────────────────────────────────────────────────────
def _post(endpoint: str, payload: dict) -> dict:
    """POST al bridge y retorna JSON."""
    url = f"{BRIDGE_URL}/{endpoint}"
    try:
        resp = requests.post(url, json=payload, timeout=30)
        return resp.json()
    except requests.ConnectionError:
        print(f"ERROR: No se pudo conectar al bridge en {BRIDGE_URL}")
        print("Asegúrate de que el bridge esté corriendo (start_bridge.sh)")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


def _get_json(endpoint: str) -> dict:
    """GET al bridge (solo /api/chats/list usa GET implícito via POST sin body)."""
    return _post(endpoint, {})


# ─── Helpers DB ─────────────────────────────────────────────────────────────
def _db() -> sqlite3.Connection:
    if not MESSAGES_DB.exists():
        print(f"ERROR: No existe {MESSAGES_DB}")
        print("Inicia el bridge primero para que cree la base de datos.")
        sys.exit(1)
    conn = sqlite3.connect(str(MESSAGES_DB))
    conn.row_factory = sqlite3.Row
    return conn


def _normalize_jid(chat: str) -> str:
    """Convierte un número de teléfono a JID de WhatsApp."""
    chat = chat.strip()
    if "@" in chat:
        return chat
    # Remover + y espacios
    chat = chat.replace("+", "").replace(" ", "").replace("-", "")
    return f"{chat}@s.whatsapp.net"


# ═══════════════════════════════════════════════════════════════════════════
# COMANDOS
# ═══════════════════════════════════════════════════════════════════════════

def cmd_chats(args):
    """Listar chats, opcionalmente filtrados por query."""
    conn = _db()
    if args.query:
        rows = conn.execute(
            "SELECT * FROM chats WHERE jid LIKE ? OR name LIKE ? ORDER BY last_message_time DESC",
            (f"%{args.query}%", f"%{args.query}%")
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM chats ORDER BY last_message_time DESC").fetchall()

    print(f"Total de chats: {len(rows)}\n")
    for r in rows:
        name = r["name"] or "(sin nombre)"
        ts = r["last_message_time"] or ""
        print(f"  {name:<40} {r['jid']:<45} {ts}")
    conn.close()


def cmd_messages(args):
    """Ver mensajes de un chat."""
    conn = _db()
    jid = _normalize_jid(args.chat)

    query = "SELECT * FROM messages WHERE chat_jid = ?"
    params: list = [jid]

    if args.after:
        query += " AND timestamp > ?"
        params.append(args.after)
    if args.before:
        query += " AND timestamp < ?"
        params.append(args.before)
    if args.query:
        query += " AND content LIKE ?"
        params.append(f"%{args.query}%")

    query += " ORDER BY timestamp DESC"
    if args.limit:
        query += f" LIMIT {args.limit}"
    if args.offset:
        query += f" OFFSET {args.offset}"

    rows = conn.execute(query, params).fetchall()
    print(f"Mensajes: {len(rows)} | Chat: {jid}\n")

    for r in reversed(rows):
        ts = r["timestamp"] or ""
        sender = "YO" if r["is_from_me"] else "ELLA"
        content = r["content"] or ""
        media = r["media_type"] or ""
        fname = r["filename"] or ""

        if media:
            content = f"[{media.upper()}] {fname} {content}".strip()
        if not content:
            continue
        print(f"  [{ts}] {sender}: {content[:200]}")
    conn.close()


def cmd_search(args):
    """Buscar en contenido de mensajes."""
    conn = _db()
    rows = conn.execute(
        "SELECT * FROM messages WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?",
        (f"%{args.query}%", args.limit)
    ).fetchall()
    print(f"Resultados: {len(rows)} para '{args.query}'\n")
    for r in rows:
        ts = r["timestamp"] or ""
        sender = "YO" if r["is_from_me"] else "OTRO"
        print(f"  [{ts}] {sender} ({r['chat_jid']}): {r['content'][:200]}")
    conn.close()


def cmd_contacts(args):
    """Buscar contactos."""
    conn = _db()
    rows = conn.execute(
        "SELECT * FROM chats WHERE jid LIKE ? OR name LIKE ? ORDER BY last_message_time DESC",
        (f"%{args.query}%", f"%{args.query}%")
    ).fetchall()
    print(f"Contactos: {len(rows)}\n")
    for r in rows:
        name = r["name"] or "(sin nombre)"
        print(f"  {name:<40} {r['jid']}")
    conn.close()


def cmd_send(args):
    """Enviar mensaje de texto."""
    recipient = _normalize_jid(args.to)
    result = _post("send", {"recipient": recipient, "message": args.msg})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_send_file(args):
    """Enviar archivo."""
    recipient = _normalize_jid(args.to)
    path = os.path.abspath(args.path)
    if not os.path.exists(path):
        print(f"ERROR: No existe {path}")
        sys.exit(1)
    result = _post("send", {"recipient": recipient, "media_path": path})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_send_audio(args):
    """Enviar audio como nota de voz."""
    recipient = _normalize_jid(args.to)
    path = os.path.abspath(args.path)
    if not os.path.exists(path):
        print(f"ERROR: No existe {path}")
        sys.exit(1)
    result = _post("send", {"recipient": recipient, "media_path": path, "is_audio": True})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_download(args):
    """Descargar media de un mensaje específico."""
    result = _post("download", {
        "message_id": args.msg_id,
        "chat_jid": _normalize_jid(args.chat)
    })
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_group_info(args):
    """Info de un grupo."""
    result = _post("group/info", {"group_jid": args.jid})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_history_sync(args):
    """Sincronizar historial desde el servidor de WhatsApp."""
    result = _post("history/sync", {"chunk_size": args.chunk_size})
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_backup(args):
    """Backup completo: exporta todos los chats y mensajes a una carpeta."""
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    conn = _db()
    chats = conn.execute("SELECT * FROM chats ORDER BY last_message_time DESC").fetchall()

    # Exportar índice de chats
    chats_file = output / "INDICE_CHATS.csv"
    with open(chats_file, "w", encoding="utf-8") as f:
        f.write("jid,name,last_message_time\n")
        for c in chats:
            f.write(f'"{c["jid"]}","{c["name"] or ""}","{c["last_message_time"] or ""}"\n')

    # Exportar cada chat
    chats_dir = output / "chats"
    chats_dir.mkdir(exist_ok=True)

    total_msgs = 0
    for c in chats:
        jid = c["jid"]
        safe_name = jid.replace("/", "_").replace("@", "_at_")
        msgs = conn.execute(
            "SELECT * FROM messages WHERE chat_jid = ? ORDER BY timestamp", (jid,)
        ).fetchall()
        if not msgs:
            continue

        chat_file = chats_dir / f"{safe_name}.txt"
        with open(chat_file, "w", encoding="utf-8") as f:
            for m in msgs:
                ts = m["timestamp"] or ""
                sender = "ME" if m["is_from_me"] else "OTRO"
                content = m["content"] or ""
                media = m["media_type"] or ""
                fname = m["filename"] or ""
                if media:
                    content = f"[{media.upper()}] {fname} {content}".strip()
                f.write(f"{ts}\t| {sender}\t| {content}\n")
        total_msgs += len(msgs)

    # Exportar JSON completo
    json_file = output / "mensajes_completos.json"
    all_msgs = []
    for c in chats:
        jid = c["jid"]
        msgs = conn.execute(
            "SELECT * FROM messages WHERE chat_jid = ? ORDER BY timestamp", (jid,)
        ).fetchall()
        for m in msgs:
            all_msgs.append({
                "id": m["id"],
                "chat_jid": m["chat_jid"],
                "sender": m["sender"],
                "content": m["content"],
                "timestamp": m["timestamp"],
                "is_from_me": bool(m["is_from_me"]),
                "media_type": m["media_type"],
                "filename": m["filename"],
            })

    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(all_msgs, f, ensure_ascii=False, indent=2)

    print(f"Backup completo en: {output}")
    print(f"  Chats: {len(chats)}")
    print(f"  Mensajes: {total_msgs}")
    print(f"  Archivos: {chats_file.name}, {json_file.name}, chats/*.txt")


def cmd_download_chat_media(args):
    """Descargar toda la media de un chat via el bridge."""
    conn = _db()
    jid = _normalize_jid(args.chat)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    # Buscar mensajes con media
    rows = conn.execute(
        "SELECT * FROM messages WHERE chat_jid = ? AND media_type IS NOT NULL AND media_type != '' ORDER BY timestamp",
        (jid,)
    ).fetchall()

    print(f"Media encontrada: {len(rows)} archivos para {jid}")
    print(f"Destino: {output}\n")

    success = 0
    failed = 0
    for i, r in enumerate(rows, 1):
        msg_id = r["id"]
        media_type = r["media_type"] or ""
        fname = r["filename"] or f"{msg_id}_{media_type}"

        print(f"  [{i}/{len(rows)}] Descargando: {fname} ({media_type})...", end=" ")

        try:
            result = _post("download", {"message_id": msg_id, "chat_jid": jid})
            if result.get("success"):
                src_path = result.get("path", "")
                if src_path and os.path.exists(src_path):
                    # Copiar al destino con nombre legible
                    ext = Path(fname).suffix or Path(src_path).suffix
                    safe_name = fname if fname else f"{msg_id}{ext}"
                    dst = output / safe_name
                    # Evitar sobreescribir
                    counter = 1
                    while dst.exists():
                        dst = output / f"{Path(safe_name).stem}_{counter}{ext}"
                        counter += 1
                    import shutil
                    shutil.copy2(src_path, dst)
                    print(f"OK -> {dst.name}")
                    success += 1
                else:
                    print(f"OK (sin path: {result.get('message', '')})")
                    success += 1
            else:
                print(f"FAIL: {result.get('message', '')}")
                failed += 1
        except Exception as e:
            print(f"ERROR: {e}")
            failed += 1

    print(f"\nDescarga completada: {success} OK, {failed} fallidos")
    conn.close()


def cmd_stats(args):
    """Estadísticas del store actual."""
    conn = _db()
    total_chats = conn.execute("SELECT COUNT(*) FROM chats").fetchone()[0]
    total_msgs = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    total_media = conn.execute(
        "SELECT COUNT(*) FROM messages WHERE media_type IS NOT NULL AND media_type != ''"
    ).fetchone()[0]

    print(f"Store: {STORE_DIR}")
    print(f"  DB: {MESSAGES_DB}")
    print(f"  Chats: {total_chats}")
    print(f"  Mensajes: {total_msgs}")
    print(f"  Con media: {total_media}")

    # Top 10 chats por mensajes
    print("\nTop 10 chats por número de mensajes:")
    rows = conn.execute(
        """SELECT chat_jid, COUNT(*) as cnt,
                  (SELECT name FROM chats c WHERE c.jid = m.chat_jid) as name
           FROM messages m GROUP BY chat_jid ORDER BY cnt DESC LIMIT 10"""
    ).fetchall()
    for r in rows:
        print(f"  {r['cnt']:>6}  {r['name'] or '(sin nombre)':<30} {r['chat_jid']}")

    # Media por tipo
    print("\nMedia por tipo:")
    rows = conn.execute(
        "SELECT media_type, COUNT(*) as cnt FROM messages WHERE media_type IS NOT NULL AND media_type != '' GROUP BY media_type ORDER BY cnt DESC"
    ).fetchall()
    for r in rows:
        print(f"  {r['media_type']:<20} {r['cnt']}")
    conn.close()


# ═══════════════════════════════════════════════════════════════════════════
# PARSER
# ═══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="CLI de WhatsApp — interactúa con el bridge via REST API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # chats
    p = sub.add_parser("chats", help="Listar chats")
    p.add_argument("--query", "-q", help="Filtrar por nombre o JID")

    # messages
    p = sub.add_parser("messages", help="Ver mensajes de un chat")
    p.add_argument("--chat", "-c", required=True, help="JID o número de teléfono")
    p.add_argument("--limit", "-l", type=int, default=50, help="Límite (default 50)")
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--after", help="Fecha ISO después de")
    p.add_argument("--before", help="Fecha ISO antes de")
    p.add_argument("--query", "-q", help="Filtrar contenido")

    # search
    p = sub.add_parser("search", help="Buscar en contenido")
    p.add_argument("--query", "-q", required=True, help="Término de búsqueda")
    p.add_argument("--limit", "-l", type=int, default=20)

    # contacts
    p = sub.add_parser("contacts", help="Buscar contactos")
    p.add_argument("--query", "-q", required=True)

    # send
    p = sub.add_parser("send", help="Enviar mensaje de texto")
    p.add_argument("--to", "-t", required=True, help="Número o JID")
    p.add_argument("--msg", "-m", required=True, help="Mensaje")

    # send-file
    p = sub.add_parser("send-file", help="Enviar archivo")
    p.add_argument("--to", "-t", required=True)
    p.add_argument("--path", "-p", required=True, help="Ruta del archivo")

    # send-audio
    p = sub.add_parser("send-audio", help="Enviar audio como nota de voz")
    p.add_argument("--to", "-t", required=True)
    p.add_argument("--path", "-p", required=True)

    # download
    p = sub.add_parser("download", help="Descargar media de un mensaje")
    p.add_argument("--msg-id", required=True, help="ID del mensaje")
    p.add_argument("--chat", "-c", required=True, help="JID o número")

    # group-info
    p = sub.add_parser("group-info", help="Info de grupo")
    p.add_argument("--jid", required=True, help="JID del grupo")

    # history-sync
    p = sub.add_parser("history-sync", help="Sincronizar historial")
    p.add_argument("--chunk-size", type=int, default=500)

    # backup
    p = sub.add_parser("backup", help="Backup completo a carpeta")
    p.add_argument("--output", "-o", required=True, help="Carpeta destino")

    # download-chat-media
    p = sub.add_parser("download-chat-media", help="Descargar toda la media de un chat")
    p.add_argument("--chat", "-c", required=True, help="JID o número")
    p.add_argument("--output", "-o", required=True, help="Carpeta destino")

    # stats
    sub.add_parser("stats", help="Estadísticas del store")

    args = parser.parse_args()

    commands = {
        "chats": cmd_chats,
        "messages": cmd_messages,
        "search": cmd_search,
        "contacts": cmd_contacts,
        "send": cmd_send,
        "send-file": cmd_send_file,
        "send-audio": cmd_send_audio,
        "download": cmd_download,
        "group-info": cmd_group_info,
        "history-sync": cmd_history_sync,
        "backup": cmd_backup,
        "download-chat-media": cmd_download_chat_media,
        "stats": cmd_stats,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
