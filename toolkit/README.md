# WhatsApp Super Toolkit

> Herramienta consolidada para interactuar con WhatsApp: leer, enviar, descargar media, backup, y extraer del teléfono.

## Quick Start

```bash
cd ~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp

# Iniciar bridge
./start_bridge.sh

# Usar el supertoolkit
cd toolkit
python3 wa_super_toolkit.py stats
python3 wa_super_toolkit.py chats
python3 wa_super_toolkit.py messages -c 521XXXXXXXXXX
```

## Estructura

```
toolkit/
├── wa_super_toolkit.py      ← CLI principal (15 comandos)
├── docs/
│   ├── CAPACIDADES.md       ← Índice completo de todas las capacidades
│   └── TECNICAS_MEDIA.md    ← Técnicas de recuperación de media expirada
├── scripts/                 ← Scripts auxiliares
└── exports/                 ← Exportaciones (backups, CSVs)
```

## Comandos principales

### Lectura
```bash
python3 wa_super_toolkit.py stats                    # Estadísticas
python3 wa_super_toolkit.py chats                    # Listar chats
python3 wa_super_toolkit.py chats -q contact-name         # Buscar chat
python3 wa_super_toolkit.py messages -c 521XXXXXXXXXX  # Ver mensajes
python3 wa_super_toolkit.py search -q "expediente"   # Buscar texto
python3 wa_super_toolkit.py media -c 521XXXXXXXXXX   # Listar media
```

### Backup DB (histórico)
```bash
python3 wa_super_toolkit.py backup-media -c 521XXXXXXXXXX --docs-only
python3 wa_super_toolkit.py backup-export -c 521XXXXXXXXXX -o ./export
```

### Envío
```bash
python3 wa_super_toolkit.py send -t 521XXXXXXXXXX -m "Hola"
python3 wa_super_toolkit.py send-file -t 521XXXXXXXXXX -p ./doc.pdf
```

### Descarga
```bash
python3 wa_super_toolkit.py download --msg-id ABC123 -c 521XXXXXXXXXX
python3 wa_super_toolkit.py download-all -c 521XXXXXXXXXX -o ./media
```

### ADB (extracción del teléfono)
```bash
python3 wa_super_toolkit.py adb-check               # Verificar conexión
python3 wa_super_toolkit.py adb-pull -c 521XXXXXXXXXX -o ./archivos
```

## Fuentes de datos

1. **Bridge** (real-time) — `store/messages.db` — 3,358 msgs, 745 chats
2. **Backup** (histórico) — `msgstore.db` — 51,788 msgs, 6,421 chats, 7,674 media
3. **Teléfono** (ADB) — `/sdcard/WhatsApp Business/Media/` — archivos físicos
4. **Google Drive** — via `wabdd` — backups cifrados

## Para descargar archivos de contact-name (últimos 30 días)

Los URLs de media están expirados. La única opción es extraer del teléfono:

```bash
# 1. Conectar teléfono por USB
# 2. Activar Depuración USB
# 3. Autorizar conexión
# 4. Ejecutar:
python3 wa_super_toolkit.py adb-pull -c 521XXXXXXXXXX -o ../archivos_contact-name/01_DOCUMENTS
```

**Archivos de los últimos 60 días (5 documentos):**
1. Propuesta de Servicios Constitutición contact-name 22.07.26.pdf (313 KB)
2. 20260310856.pdf — acuse (275 KB)
3. COMENTARIOS 7 DE JULIO DE MENUS.docx (422 KB)
4. COMENTARIOS 6 DE JULIO ÚNICAMENTE MENÚS NO CONTENIDOS.docx (218 KB)
5. Confirmación _ VivaRICARDO.pdf (782 KB)

## Documentación completa

- `docs/CAPACIDADES.md` — Todas las capacidades del toolkit
- `docs/TECNICAS_MEDIA.md` — 5 técnicas para recuperar media expirada
- `../WHATSAPP_TOOLKIT.md` — Documentación del bridge y MCP

## Skill

El skill está en: `~/Documents/ricpersonal/.devin/skills/whatsapp-toolkit/SKILL.md`
