#!/usr/bin/env python3
"""
backup_whatsapp.py — Backup automático de WhatsApp con timestamp.

Crea un respaldo completo de todos los chats y mensajes del store activo,
con marca de tiempo. Pensado para ejecutarse periódicamente.

Uso:
  python3 backup_whatsapp.py                              # Backup en ~/whatsapp_backups/
  python3 backup_whatsapp.py --output /ruta/destino      # Backup en ruta específica
  python3 backup_whatsapp.py --store store       # Store específico
  python3 backup_whatsapp.py --download-media            # También descarga media via bridge
"""

import argparse
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import List

import requests

SCRIPT_DIR = Path(__file__).parent
BRIDGE_DIR = SCRIPT_DIR / "whatsapp-bridge"
BRIDGE_URL = os.environ.get("WA_BRIDGE_URL", "http://localhost:8080/api")


def find_store(store_dir: str) -> Path:
    candidates = [
        BRIDGE_DIR / store_dir / "messages.db",
        BRIDGE_DIR / "store" / "messages.db",
    ]
    for c in candidates:
        if c.exists():
            return c
    # Buscar cualquier messages.db
    for p in BRIDGE_DIR.glob("*/messages.db"):
        return p
    print(f"ERROR: No se encontró messages.db en {BRIDGE_DIR}")
    sys.exit(1)


def export_chats(db_path: Path, output: Path) -> dict:
    """Exporta todos los chats y mensajes a la carpeta output."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    chats = conn.execute("SELECT * FROM chats ORDER BY last_message_time DESC").fetchall()

    # Índice CSV
    idx_file = output / "INDICE_CHATS.csv"
    with open(idx_file, "w", encoding="utf-8") as f:
        f.write("jid,name,last_message_time\n")
        for c in chats:
            f.write(f'"{c["jid"]}","{c["name"] or ""}","{c["last_message_time"] or ""}"\n')

    # Carpeta de chats
    chats_dir = output / "chats"
    chats_dir.mkdir(exist_ok=True)

    # Mapeo de nombres
    mapeo = {}
    for c in chats:
        if c["name"]:
            jid = c["jid"]
            phone = jid.split("@")[0]
            mapeo[phone] = c["name"]

    total_msgs = 0
    all_msgs = []

    for c in chats:
        jid = c["jid"]
        safe = jid.replace("/", "_").replace("@", "_at_")
        msgs = conn.execute(
            "SELECT * FROM messages WHERE chat_jid = ? ORDER BY timestamp", (jid,)
        ).fetchall()
        if not msgs:
            continue

        # Export TXT
        txt_file = chats_dir / f"{safe}.txt"
        with open(txt_file, "w", encoding="utf-8") as f:
            for m in msgs:
                ts = m["timestamp"] or ""
                sender = "ME" if m["is_from_me"] else "OTRO"
                content = m["content"] or ""
                media = m["media_type"] or ""
                fname = m["filename"] or ""
                if media:
                    content = f"[{media.upper()}] {fname} {content}".strip()
                f.write(f"{ts}\t| {sender}\t| {content}\n")

        # JSON
        for m in msgs:
            all_msgs.append({
                "id": m["id"],
                "chat_jid": m["chat_jid"],
                "sender": m["sender"],
                "content": m["content"],
                "timestamp": str(m["timestamp"]),
                "is_from_me": bool(m["is_from_me"]),
                "media_type": m["media_type"],
                "filename": m["filename"],
            })
        total_msgs += len(msgs)

    # JSON completo
    json_file = output / "mensajes_completos.json"
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(all_msgs, f, ensure_ascii=False, indent=2)

    # Mapeo nombres
    mapeo_file = output / "mapeo_nombres.json"
    with open(mapeo_file, "w", encoding="utf-8") as f:
        json.dump(mapeo, f, ensure_ascii=False, indent=2)

    conn.close()
    return {
        "chats": len(chats),
        "messages": total_msgs,
        "with_media": sum(1 for m in all_msgs if m["media_type"]),
    }


def download_all_media(db_path: Path, output: Path, chat_jid: str = None):
    """Descarga toda la media via el bridge REST API."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    if chat_jid:
        rows = conn.execute(
            "SELECT * FROM messages WHERE chat_jid = ? AND media_type IS NOT NULL AND media_type != ''",
            (chat_jid,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM messages WHERE media_type IS NOT NULL AND media_type != ''"
        ).fetchall()

    media_dir = output / "media"
    media_dir.mkdir(exist_ok=True)

    success = 0
    failed = 0
    for i, r in enumerate(rows, 1):
        msg_id = r["id"]
        jid = r["chat_jid"]
        fname = r["filename"] or f"{msg_id}_{r['media_type']}"

        print(f"  [{i}/{len(rows)}] {fname}...", end=" ", flush=True)
        try:
            resp = requests.post(f"{BRIDGE_URL}/download", json={
                "message_id": msg_id, "chat_jid": jid
            }, timeout=60)
            result = resp.json()
            if result.get("success"):
                path = result.get("path", "")
                if path and os.path.exists(path):
                    dst = media_dir / fname
                    counter = 1
                    while dst.exists():
                        ext = Path(fname).suffix
                        dst = media_dir / f"{Path(fname).stem}_{counter}{ext}"
                        counter += 1
                    shutil.copy2(path, dst)
                    print(f"OK")
                    success += 1
                else:
                    print(f"OK (sin path)")
                    success += 1
            else:
                print(f"FAIL: {result.get('message', '')}")
                failed += 1
        except Exception as e:
            print(f"ERROR: {e}")
            failed += 1

    conn.close()
    return {"success": success, "failed": failed, "total": len(rows)}


def main():
    parser = argparse.ArgumentParser(description="Backup automático de WhatsApp")
    parser.add_argument("--output", "-o", default=None, help="Carpeta destino (default: ~/whatsapp_backups/YYYYMMDD_HHMMSS)")
    parser.add_argument("--store", "-s", default="store", help="Store a respaldar")
    parser.add_argument("--download-media", action="store_true", help="También descargar media via bridge")
    parser.add_argument("--chat", help="Solo un chat (JID o número) para media")
    args = parser.parse_args()

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    if args.output:
        output = Path(args.output)
    else:
        output = Path.home() / "whatsapp_backups" / f"backup_{ts}"

    output.mkdir(parents=True, exist_ok=True)

    db_path = find_store(args.store)
    print(f"Backup de: {db_path}")
    print(f"Destino:   {output}")
    print()

    stats = export_chats(db_path, output)
    print(f"Chats:     {stats['chats']}")
    print(f"Mensajes:  {stats['messages']}")
    print(f"Con media: {stats['with_media']}")
    print()

    if args.download_media:
        chat_jid = args.chat
        if chat_jid and "@" not in chat_jid:
            chat_jid = f"{chat_jid}@s.whatsapp.net"
        print("Descargando media via bridge...")
        media_stats = download_all_media(db_path, output, chat_jid)
        print(f"  OK: {media_stats['success']}, Fallidos: {media_stats['failed']}, Total: {media_stats['total']}")

    # Metadata del backup
    meta = {
        "timestamp": ts,
        "db_path": str(db_path),
        "store": args.store,
        "stats": stats,
    }
    with open(output / "BACKUP_INFO.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nBackup completado en: {output}")


if __name__ == "__main__":
    main()
