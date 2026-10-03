ccom 

# WhatsApp Super Toolkit — Índice Completo de Capacidades

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────┐
│                    WHATSAPP SUPER TOOLKIT                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ whatsapp-mcp │  │ backup-tools │  │   herramientas_      │  │
│  │              │  │              │  │   externas           │  │
│  │ • Bridge Go  │  │ • wa-crypt   │  │                      │  │
│  │ • MCP Python │  │ • Exporter   │  │ • WhatsApp-OSINT     │  │
│  │ • CLI        │  │ • whapa      │  │                      │  │
│  │ • Toolkit    │  │ • wabdd      │  │                      │  │
│  │              │  │              │  │                      │  │
│  │ store-*/     │  │ backups/     │  │                      │  │
│  │  messages.db │  │  msgstore.db │  │                      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                  │                                    │
│         ▼                  ▼                                    │
│  ┌─────────────────────────────────────┐                        │
│  │         wa_super_toolkit.py         │                        │
│  │     (CLI consolidado principal)     │                        │
│  └─────────────────────────────────────┘                        │
│                                                                 │
│  Fuentes de datos:                                              │
│  1. Bridge (real-time) — store/messages.db              │
│  2. Backup (histórico) — msgstore.db                    │
│  3. Teléfono (ADB) — /sdcard/WhatsApp Business/Media/           │
│  4. Google Drive — via wabdd                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Inventario de Proyectos

### 1. whatsapp-mcp (Tiempo real)

**Ruta:** `/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/`
**Qué hace:** Bridge Go + MCP Server Python para interacción en tiempo real con WhatsApp
**Estado:** ✅ Funcionando (bridge conectado, sesión activa)

**Componentes:**

- `whatsapp-bridge/main.go` — Bridge Go (whatsmeow), REST API en :8080
- `whatsapp-mcp-server/main.py` — MCP Server (12 tools)
- `whatsapp-mcp-server/whatsapp.py` — Lógica de WhatsApp
- `wa_cli.py` — CLI básico
- `backup_whatsapp.py` — Backup automático
- `start_bridge.sh` — Inicio del bridge
- `pull_contact-name_media.sh` — Extracción ADB
- `toolkit/wa_super_toolkit.py` — CLI consolidado

**Stores:**

- `store/` — Cuenta principal (521XXXXXXXXXX) — ✅ Activa
- `store-lety/` — Lety (521XXXXXXXXXX) — Activa
- `store/` — Default (mismo que lety)

**Base de datos:**

- `messages.db` — 3,358 mensajes, 745 chats, 577 con media
- `whatsapp.db` — Sesión, claves, dispositivo

### 2. wa-crypt-tools (Descifrado)

**Ruta:** `/01_PERSONAL_RICARDO/configuraciones/mcp-servers/whatsapp-backup-tools/wa-crypt-tools/`
**Qué hace:** Descifra .crypt12, .crypt14, .crypt15 (backups E2E de WhatsApp)

### 3. WhatsApp-Chat-Exporter

**Ruta:** `/01_PERSONAL_RICARDO/configuraciones/mcp-servers/whatsapp-backup-tools/WhatsApp-Chat-Exporter/`
**Qué hace:** Exporta chats a HTML/JSON desde bases de datos descifradas

### 4. whapa (Forense)

**Ruta:** `/01_PERSONAL_RICARDO/configuraciones/mcp-servers/whatsapp-backup-tools/whapa/`
**Qué hace:** Suite forense 5-en-1 (parser, cipher, Google Drive, merge, chat)

### 5. wabdd (Google Drive)

**Ruta:** `/01_PERSONAL_RICARDO/configuraciones/mcp-servers/whatsapp-backup-tools/whatsapp-backup-downloader-decryptor/`
**Qué hace:** Descarga backups de Google Drive y los descifra

### 6. WhatsApp-OSINT

**Ruta:** `/02_HERRAMIENTAS_REDES/herramientas_externas/WhatsApp-OSINT/`
**Qué hace:** OSINT por número de teléfono (perfil, business, privacidad)

---

## 🔑 Todas las capacidades disponibles

### A. Lectura de mensajes

| Capacidad             | Herramienta  | Comando/Método                                            | Estado |
| --------------------- | ------------ | ---------------------------------------------------------- | ------ |
| Listar chats          | Bridge CLI   | `wa_cli.py chats`                                        | ✅     |
| Listar chats (filtro) | Bridge CLI   | `wa_cli.py chats -q contact-name`                             | ✅     |
| Ver mensajes          | Bridge CLI   | `wa_cli.py messages -c <numero>`                         | ✅     |
| Buscar mensajes       | Bridge CLI   | `wa_cli.py search -q "texto"`                            | ✅     |
| Ver media de chat     | Bridge CLI   | `wa_cli.py media -c <numero>`                            | ✅     |
| Listar media backup   | SuperToolkit | `wa_super_toolkit.py backup-media -c <numero>`           | ✅     |
| Exportar media CSV    | SuperToolkit | `wa_super_toolkit.py backup-export -c <numero> -o ./out` | ✅     |
| Contexto de mensaje   | MCP Server   | `get_message_context`                                    | ✅     |
| Última interacción  | MCP Server   | `get_last_interaction`                                   | ✅     |
| Chats de contacto     | MCP Server   | `get_contact_chats`                                      | ✅     |
| Estadísticas         | SuperToolkit | `wa_super_toolkit.py stats`                              | ✅     |

### B. Envío de mensajes

| Capacidad      | Herramienta | Comando/Método                                   | Estado |
| -------------- | ----------- | ------------------------------------------------- | ------ |
| Enviar texto   | Bridge/MCP  | `send_message` / `wa_cli.py send`             | ✅     |
| Enviar archivo | Bridge/MCP  | `send_file` / `wa_cli.py send-file`           | ✅     |
| Enviar audio   | Bridge/MCP  | `send_audio_message` / `wa_cli.py send-audio` | ✅     |
| Enviar a grupo | Bridge/MCP  | `send_message` con JID de grupo                 | ✅     |

### C. Descarga de media

| Capacidad                 | Herramienta    | Comando/Método                       | Estado                             |
| ------------------------- | -------------- | ------------------------------------- | ---------------------------------- |
| Descargar 1 archivo       | Bridge         | `download --msg-id --chat`          | ⚠️ URLs expiran                  |
| Descargar con retry       | Bridge (nuevo) | `media/retry` endpoint              | ⚠️ Solo si teléfono tiene media |
| Descargar todo un chat    | SuperToolkit   | `download-all -c <numero> -o ./out` | ⚠️ URLs expiran                  |
| Extraer via ADB           | Script         | `pull_contact-name_media.sh`             | ✅ Requiere USB                    |
| Extraer via ADB (toolkit) | SuperToolkit   | `adb-pull -c <numero> -o ./out`     | ✅ Requiere USB                    |
| Extraer del backup        | wa-crypt-tools | `wadecrypt.py` + copiar media       | ✅ Necesita backup                 |

### D. Backup y exportación

| Capacidad                 | Herramienta        | Comando/Método                         | Estado            |
| ------------------------- | ------------------ | --------------------------------------- | ----------------- |
| Backup bridge             | backup_whatsapp.py | `backup_whatsapp.py`                  | ✅                |
| Backup + media            | backup_whatsapp.py | `backup_whatsapp.py --download-media` | ⚠️ URLs expiran |
| Export HTML               | Chat-Exporter      | `wtsexporter -a`                      | ✅                |
| Export JSON               | Chat-Exporter      | `wtsexporter -a --json`               | ✅                |
| Descifrar backup          | wa-crypt-tools     | `wadecrypt.py`                        | ✅                |
| Descargar de Google Drive | wabdd              | `wabdd download`                      | ✅ Necesita OAuth |
| Merge backups             | whapa              | `whamerge.py`                         | ✅                |

### E. Información y metadatos

| Capacidad        | Herramienta    | Comando/Método                | Estado              |
| ---------------- | -------------- | ------------------------------ | ------------------- |
| Info de grupo    | Bridge         | `group-info --jid`           | ✅                  |
| Info de contacto | MCP            | `get_direct_chat_by_contact` | ✅                  |
| Historial sync   | Bridge         | `history-sync`               | ✅                  |
| Info backup      | wa-crypt-tools | `wainfo.py`                  | ✅                  |
| OSINT número    | OSINT tool     | `whatsapp-osint.py`          | ✅ Necesita API key |

### F. Forense y análisis

| Capacidad              | Herramienta | Descripción                        | Estado |
| ---------------------- | ----------- | ----------------------------------- | ------ |
| Parser forense         | whapa       | Análisis completo de base de datos | ✅     |
| Análisis psicológico | Skill       | Dark Triad, red flags, sentiment    | ✅     |
| Extracción de chats   | Skill       | Extraer chats específicos          | ✅     |

---

## 🔧 Técnicas de recuperación de media expirada

### Problema

Los URLs de media de WhatsApp expiran (~30 días). El parámetro `oe` en el directPath indica cuándo.

### Técnica 1: Media Retry (whatsmeow)

**Cuándo:** El teléfono aún tiene la media en caché
**Cómo:** `SendMediaRetryReceipt` pide al teléfono re-subir la media
**Estado:** Implementado en el bridge (`/api/media/retry`)
**Limitación:** Si el teléfono ya limpió la caché, retorna error code 2

### Técnica 2: Descarga directa CDN

**Cuándo:** El `oe` (expiry) del directPath aún no expira
**Cómo:** `GET https://mmg.whatsapp.net{directPath}` — sin headers de auth
**Estado:** Disponible en whatsmeow `DownloadMediaWithPath`
**Limitación:** Expira después de ~30 días

### Técnica 3: ADB (extracción directa)

**Cuándo:** Los archivos están en el almacenamiento del teléfono
**Cómo:** `adb pull /sdcard/WhatsApp\ Business/Media/...`
**Estado:** Script listo (`pull_contact-name_media.sh`)
**Requisito:** USB + depuración USB activada
**Ventaja:** Los archivos persisten en el almacenamiento aunque la caché se limpie

### Técnica 4: Backup de Google Drive

**Cuándo:** Hay un backup reciente en Google Drive
**Cómo:** `wabdd download` → `wadecrypt.py` → copiar media
**Estado:** Herramientas instaladas
**Requisito:** OAuth token + clave de cifrado

### Técnica 5: WhatsApp Chat Exporter

**Cuándo:** Se tiene la base de datos descifrada + carpeta Media
**Cómo:** `wtsexporter -a` con la carpeta media
**Estado:** Instalado
**Requisito:** msgstore.db + media folder del teléfono

---

## 📱 Cómo extraer media del teléfono (ADB)

### Paso 1: Preparar el teléfono

1. Ajustes → Acerca del teléfono → Tocar "Número de compilación" 7 veces
2. Ajustes → Opciones de desarrollador → Activar "Depuración USB"
3. Conectar por USB a la Mac
4. Autorizar la conexión cuando aparezca el diálogo

### Paso 2: Verificar conexión

```bash
~/Library/Android/sdk/platform-tools/adb devices
```

### Paso 3: Extraer archivos de contact-name

```bash
cd ~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp
./pull_contact-name_media.sh
```

O con el supertoolkit:

```bash
cd ~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/toolkit
python3 wa_super_toolkit.py adb-pull -c 521XXXXXXXXXX -o ../archivos_contact-name/01_DOCUMENTS
```

### Paso 4: Verificar

```bash
python3 wa_super_toolkit.py adb-check
```

---

## 🗂️ Estructura de archivos

```
whatsapp-mcp/
├── toolkit/                          ← SUPERTOOLKIT
│   ├── wa_super_toolkit.py           ← CLI consolidado principal
│   ├── scripts/                      ← Scripts auxiliares
│   ├── docs/                         ← Documentación
│   │   ├── CAPACIDADES.md            ← Este archivo
│   │   └── TECNICAS_MEDIA.md         ← Técnicas de recuperación
│   └── exports/                      ← Exportaciones
├── start_bridge.sh                   ← Iniciar bridge
├── wa_cli.py                         ← CLI básico (legacy)
├── backup_whatsapp.py                ← Backup automático
├── pull_contact-name_media.sh             ← Extracción ADB
├── WHATSAPP_TOOLKIT.md               ← Docs del toolkit
├── whatsapp-bridge/                  ← Bridge Go
│   ├── main.go                       ← Código fuente (con media retry)
│   ├── whatsapp-bridge               ← Binario compilado
│   └── store/                ← Store principal
│       ├── messages.db               ← Mensajes
│       └── whatsapp.db               ← Sesión
└── whatsapp-mcp-server/              ← MCP Server Python
    ├── main.py                       ← Entry point
    ├── whatsapp.py                   ← Lógica WhatsApp
    └── audio.py                      ← Audio
```

---

## 🔗 Integración con MCP (Claude/Cursor/Devin)

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "uv",
      "args": [
        "--directory",
        "~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/whatsapp-mcp-server",
        "run", "main.py"
      ]
    }
  }
}
```

**MCP Tools disponibles:**

1. `search_contacts` — Buscar contactos
2. `list_messages` — Listar mensajes con filtros
3. `list_chats` — Listar chats
4. `get_chat` — Metadata de chat
5. `get_direct_chat_by_contact` — Chat por número
6. `get_contact_chats` — Chats de un contacto
7. `get_last_interaction` — Último mensaje
8. `get_message_context` — Contexto de mensaje
9. `send_message` — Enviar texto
10. `send_file` — Enviar archivo
11. `send_audio_message` — Enviar nota de voz
12. `download_media` — Descargar media

---

## ⚠️ Limitaciones conocidas

1. **URLs de media expiran** (~30 días) — El parámetro `oe` en el directPath
2. **Media retry requiere teléfono online** — Y que la media esté en caché
3. **Business API URLs expiran en 5 min** — No aplicable aquí (usamos whatsmeow)
4. **History sync no descarga media** — Solo metadatos
5. **Sesión expira cada ~20 días** — Re-escanear QR
6. **ADB requiere acceso físico** — Al teléfono por USB
