# WhatsApp Toolkit — Documentación Completa

## Arquitectura

```
┌─────────────────┐     REST API (:8080)     ┌──────────────────┐
│  wa_cli.py      │ ◄──────────────────────► │  whatsapp-bridge │ ◄──► WhatsApp
│  backup_wa.py   │     /api/send             │  (Go binary)     │     Servers
│  MCP Server     │     /api/download         │                  │
│  (Python)       │     /api/chats/list       │  store/  │
│                 │     /api/group/info       │   messages.db    │
└─────────────────┘     /api/history/sync     │   whatsapp.db    │
                                              └──────────────────┘
```

**Componentes:**
1. **whatsapp-bridge** (Go) — Se conecta a WhatsApp via whatsmeow (multidevice API). Mantiene sesión en `store-*/whatsapp.db` y mensajes en `store-*/messages.db`. Expone REST API en puerto 8080.
2. **wa_cli.py** (Python) — CLI reutilizable para todos los comandos. Lee directamente del SQLite y usa el REST API para enviar/descargar.
3. **backup_whatsapp.py** (Python) — Script de backup automático con timestamp.
4. **whatsapp-mcp-server** (Python) — MCP server para integrar con Claude/Cursor/Devin.

---

## 🚀 Inicio rápido

### 1. Escanear QR (primera vez o re-login)

```bash
cd ~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp

# Opción A: QR code en terminal
./start_bridge.sh store 8080

# Opción B: Pairing code de 8 dígitos (sin QR)
PAIR_PHONE=521XXXXXXXXXX ./start_bridge.sh store 8080
```

**Pasos del teléfono:**
- WhatsApp → Settings → Linked devices → Link a device
- Escanear el QR que aparece en terminal, O ingresar el código de 8 dígitos

### 2. Verificar conexión

```bash
python3 wa_cli.py stats
```

### 3. Listar chats

```bash
python3 wa_cli.py chats
python3 wa_cli.py chats --query contact-name
```

---

## 📋 Comandos del CLI (wa_cli.py)

### Lectura

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `stats` | Estadísticas del store | `python3 wa_cli.py stats` |
| `chats` | Listar todos los chats | `python3 wa_cli.py chats` |
| `chats -q` | Buscar chats por nombre | `python3 wa_cli.py chats -q contact-name` |
| `messages -c` | Ver mensajes de un chat | `python3 wa_cli.py messages -c 521XXXXXXXXXX` |
| `messages -c -l` | Limitar cantidad | `python3 wa_cli.py messages -c 521XXXXXXXXXX -l 100` |
| `messages -c --after` | Mensajes después de fecha | `python3 wa_cli.py messages -c 521XXXXXXXXXX --after 2026-07-01` |
| `search -q` | Buscar en contenido | `python3 wa_cli.py search -q "expediente"` |
| `contacts -q` | Buscar contactos | `python3 wa_cli.py contacts -q contact-name` |

### Envío

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `send -t -m` | Enviar texto | `python3 wa_cli.py send -t 521XXXXXXXXXX -m "Hola"` |
| `send-file -t -p` | Enviar archivo | `python3 wa_cli.py send-file -t 521XXXXXXXXXX -p /ruta/doc.pdf` |
| `send-audio -t -p` | Enviar nota de voz | `python3 wa_cli.py send-audio -t 521XXXXXXXXXX -p /ruta/audio.mp3` |

### Media

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `download --msg-id --chat` | Descargar un archivo | `python3 wa_cli.py download --msg-id ABC123 --chat 521XXXXXXXXXX` |
| `download-chat-media -c -o` | Descargar toda la media de un chat | `python3 wa_cli.py download-chat-media -c 521XXXXXXXXXX -o ./media_contact-name` |

### Grupos e Historial

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `group-info --jid` | Info de grupo (participantes) | `python3 wa_cli.py group-info --jid 521XXXXXXXXXX-1610476474@g.us` |
| `history-sync` | Sincronizar historial completo | `python3 wa_cli.py history-sync` |

### Backup

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `backup -o` | Backup completo a carpeta | `python3 wa_cli.py backup -o ~/backup_wa` |

---

## 🔄 Backup automático

```bash
# Backup completo (chats + mensajes en TXT y JSON)
python3 backup_whatsapp.py

# Backup en ruta específica
python3 backup_whatsapp.py --output /ruta/destino

# Backup + descargar toda la media via bridge
python3 backup_whatsapp.py --download-media

# Backup de un chat específico + su media
python3 backup_whatsapp.py --download-media --chat 521XXXXXXXXXX

# Backup de otro store
python3 backup_whatsapp.py --store store-lety
```

**Estructura del backup:**
```
backup_20260827_012000/
├── BACKUP_INFO.json        ← Metadata del backup
├── INDICE_CHATS.csv        ← Índice de todos los chats
├── mensajes_completos.json ← Todos los mensajes en JSON
├── mapeo_nombres.json      ← Teléfono → Nombre
├── chats/                  ← Un .txt por chat
│   ├── 521XXXXXXXXXX_at_s.whatsapp.net.txt
│   └── ...
└── media/                  ← Media descargada (si --download-media)
```

---

## 🔌 REST API del Bridge

### POST /api/send
```json
{"recipient": "521XXXXXXXXXX@s.whatsapp.net", "message": "Hola"}
{"recipient": "521XXXXXXXXXX@s.whatsapp.net", "media_path": "/ruta/archivo.pdf"}
```

### POST /api/download
```json
{"message_id": "ABC123", "chat_jid": "521XXXXXXXXXX@s.whatsapp.net"}
```

### POST /api/group/info
```json
{"group_jid": "521XXXXXXXXXX-1610476474@g.us"}
```

### POST /api/history/sync
```json
{"chunk_size": 500}
```

### GET /api/chats/list
Lista todos los chats con último mensaje.

---

## 🤖 MCP Server (para Claude/Cursor/Devin)

El MCP server expone estas tools:

| Tool | Descripción |
|------|-------------|
| `search_contacts` | Buscar contactos por nombre o teléfono |
| `list_messages` | Listar mensajes con filtros (fecha, chat, contenido, paginación) |
| `list_chats` | Listar chats con filtros y ordenamiento |
| `get_chat` | Metadata de un chat por JID |
| `get_direct_chat_by_contact` | Chat por número de teléfono |
| `get_contact_chats` | Todos los chats de un contacto |
| `get_last_interaction` | Último mensaje con un contacto |
| `get_message_context` | Contexto alrededor de un mensaje |
| `send_message` | Enviar mensaje de texto |
| `send_file` | Enviar archivo (imagen, video, documento) |
| `send_audio_message` | Enviar audio como nota de voz |
| `download_media` | Descargar media de un mensaje |

### Configurar MCP en Cursor / Claude Desktop

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "uv",
      "args": ["--directory", "~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/whatsapp-mcp-server", "run", "main.py"]
    }
  }
}
```

---

## 📁 Estructura de archivos

```
whatsapp-mcp/
├── start_bridge.sh              ← Script de inicio del bridge
├── wa_cli.py                    ← CLI reutilizable
├── backup_whatsapp.py           ← Script de backup
├── WHATSAPP_TOOLKIT.md          ← Esta documentación
├── whatsapp-bridge/             ← Bridge en Go
│   ├── main.go                  ← Código fuente
│   ├── whatsapp-bridge          ← Binario compilado
│   ├── store/           ← Store principal (sesión + mensajes)
│   │   ├── whatsapp.db          ← Sesión de WhatsApp (claves, device)
│   │   └── messages.db          ← Mensajes sincronizados
│   ├── store-lety/              ← Store de Lety
│   └── store/                   ← Store por defecto
└── whatsapp-mcp-server/         ← MCP Server en Python
    ├── main.py                  ← Entry point del MCP
    ├── whatsapp.py              ← Lógica de WhatsApp
    ├── audio.py                 ← Conversión de audio
    └── pyproject.toml           ← Dependencias
```

---

## 🔧 Stores disponibles

| Store | Teléfono | Estado | Notas |
|-------|----------|--------|-------|
| `store` | 521XXXXXXXXXX | **Sesión expirada** | Necesita re-escanear QR |
| `store-lety` | 521XXXXXXXXXX | Activa | Sesión de Lety |
| `store` | 521XXXXXXXXXX | Activa | Mismo que lety |

---

## ⚠️ Notas importantes

1. **Sesión expira cada ~20 días** — Hay que re-escanear el QR periódicamente.
2. **El bridge debe estar corriendo** para enviar mensajes y descargar media.
3. **El CLI puede leer mensajes** directamente del SQLite sin el bridge, pero no puede enviar ni descargar.
4. **Para descargar media** se necesita el bridge activo + conexión a WhatsApp.
5. **History sync** descarga historial completo desde los servidores de WhatsApp (puede tardar).
6. **Multi-store** — Puedes tener varias cuentas corriendo en puertos diferentes:
   ```bash
   ./start_bridge.sh store 8080
   ./start_bridge.sh store-lety 8081
   ```

---

## 📝 Flujo de trabajo recomendado

### Diario
1. Iniciar bridge: `./start_bridge.sh`
2. Verificar: `python3 wa_cli.py stats`
3. Trabajar con mensajes: `python3 wa_cli.py messages -c <numero>`

### Semanal
1. Backup: `python3 backup_whatsapp.py`
2. Backup con media: `python3 backup_whatsapp.py --download-media`

### Para descargar archivos de un contacto
1. Iniciar bridge
2. `python3 wa_cli.py download-chat-media -c 521XXXXXXXXXX -o ./media_contact-name`

### Para enviar un documento
1. Iniciar bridge
2. `python3 wa_cli.py send-file -t 521XXXXXXXXXX -p /ruta/archivo.pdf`
