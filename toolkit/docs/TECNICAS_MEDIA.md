# Técnicas de Recuperación de Media Expirada de WhatsApp

## Resumen ejecutivo

Los URLs de media de WhatsApp expiran después de ~30 días. Cuando expiran, hay 5 técnicas para recuperar los archivos. Este documento detalla cada una.

---

## Técnica 1: Descarga directa CDN (más simple)

### Cuándo funciona
- El `oe` (expiry timestamp) en el `directPath` aún no ha expirado
- El parámetro `oe` es un Unix timestamp en hexadecimal

### Cómo funciona
```
URL: https://mmg.whatsapp.net/o1/v/t24/f2/m231/XXXX?ccb=9-4&oh=01_XXXX&oe=6A89CD4E&_nc_sid=e6ed6c&mms3=true
                                                                                    ^^^^^^^^^
                                                                                    Expiry (hex)
```

El `directPath` incluye query params que autentican la descarga. **Nunca quitar los query params.**

### Implementación
```bash
# Extraer directPath de la base de datos
sqlite3 messages.db "SELECT url FROM messages WHERE id='MSG_ID';"

# Descargar directamente (sin headers de auth)
curl -o archivo.pdf "https://mmg.whatsapp.net/v/t62.7119-24/XXXX.enc?ccb=11-4&oh=01_XXXX&oe=XXXX&_nc_sid=XXXX&mms3=true"
```

### Verificar expiración
```python
oe_hex = "6A89CD4E"
oe_epoch = int(oe_hex, 16)
from datetime import datetime
expiry = datetime.fromtimestamp(oe_epoch)
print(f"Expira: {expiry}")  # Si es pasado, está expirado
```

---

## Técnica 2: Media Retry (SendMediaRetryReceipt)

### Cuándo funciona
- El teléfono está online y conectado a WhatsApp
- El teléfono aún tiene la media en caché
- El bridge tiene el `media_key` almacenado

### Cómo funciona
1. El bridge envía un `receipt` stanza con `type="server-error"` al propio JID
2. El teléfono recibe el recibo y re-sube la media a los servidores de WhatsApp
3. WhatsApp responde con un `MediaRetry` evento que contiene un nuevo `DirectPath`
4. Se descarga usando el nuevo `DirectPath`

### Implementación (ya en el bridge)
```bash
# Endpoint del bridge
curl -X POST http://localhost:8080/api/media/retry \
  -H "Content-Type: application/json" \
  -d '{"message_id": "MSG_ID", "chat_jid": "JID"}'
```

### Códigos de error
| Código | Significado |
|--------|-------------|
| 1 | SUCCESS — nueva ruta disponible |
| 2 | Media no disponible en el teléfono |
| Otros | Error desconocido |

### Limitación
Si el teléfono limpió la caché de WhatsApp (automático después de ~30 días), retorna error code 2.

---

## Técnica 3: ADB (Extracción directa del teléfono)

### Cuándo funciona
- El teléfono tiene WhatsApp Business instalado
- Los archivos están en el almacenamiento (no solo en caché)
- USB + depuración USB activada

### Cómo funciona
WhatsApp guarda los archivos en `/sdcard/WhatsApp Business/Media/` incluso después de que la caché se limpia. Los archivos persisten en el almacenamiento hasta que el usuario los borre manualmente.

### Estructura del teléfono
```
/sdcard/WhatsApp Business/Media/
├── WhatsApp Business Documents/     ← PDFs, Word, Excel, etc.
│   ├── Brochure_Empresarial_IMMEX.pdf
│   └── ...
├── WhatsApp Business Images/        ← Imágenes recibidas
│   ├── IMG-20250705-WA0004.jpg
│   └── ...
│   └── Sent/                        ← Imágenes enviadas
├── WhatsApp Business Video/         ← Videos
├── WhatsApp Business Voice Notes/   ← Notas de voz
│   └── 202541/                      ← Por semana del año
│       └── PTT-20251007-WA0021.opus
├── WhatsApp Business Audio/         ← Audios
├── WhatsApp Business Stickers/      ← Stickers
└── WhatsApp Business Animated Gifs/ ← GIFs
```

### Implementación
```bash
# Script listo
cd ~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp
./pull_contact-name_media.sh

# O manual
adb pull "/sdcard/WhatsApp Business/Media/WhatsApp Business Documents/Brochure_Empresarial_IMMEX.pdf" ./archivos_contact-name/
```

### Mapeo de rutas
La base de datos tiene rutas como `Media/WhatsApp Documents/...` pero el teléfono usa `Media/WhatsApp Business Documents/...` (con "Business"). El script maneja ambas variantes.

---

## Técnica 4: Google Drive Backup

### Cuándo funciona
- Hay un backup reciente en Google Drive
- Se tiene la clave de cifrado de 64 dígitos o el archivo key

### Cómo funciona
1. `wabdd download` — Descarga el backup cifrado de Google Drive
2. `wadecrypt.py` — Descifra el backup (.crypt15)
3. Copiar la carpeta `Media/` del backup descifrado

### Requisitos
- OAuth token de Google
- Clave de cifrado de WhatsApp (64 dígitos hex)
- O archivo `encrypted_backup.key` del teléfono

### Implementación
```bash
cd /01_PERSONAL_RICARDO/configuraciones/mcp-servers/whatsapp-backup-tools/whatsapp-backup-downloader-decryptor
# Seguir instrucciones del README
```

---

## Técnica 5: WhatsApp Chat Exporter + Media

### Cuándo funciona
- Se tiene la base de datos descifrada (msgstore.db)
- Se tiene la carpeta Media del teléfono

### Cómo funciona
```bash
# 1. Copiar msgstore.db y carpeta Media del teléfono
adb pull /sdcard/WhatsApp\ Business/Databases/msgstore.db ./
adb pull /sdcard/WhatsApp\ Business/Media ./Media

# 2. Exportar con media
cd /01_PERSONAL_RICARDO/configuraciones/mcp-servers/whatsapp-backup-tools/WhatsApp-Chat-Exporter
python3 -m Whatsapp_Chat_Exporter -a --media ./Media
```

---

## Comparación de técnicas

| Técnica | Ventaja | Desventaja | Cuándo usar |
|---------|---------|------------|-------------|
| **CDN directo** | Instantáneo, sin teléfono | URLs expiran en ~30 días | Media reciente (< 30 días) |
| **Media retry** | Automático, remoto | Requiere teléfono online + caché | Media expirada pero en caché |
| **ADB** | Funciona siempre | Requiere acceso físico al teléfono | Media antigua, teléfono disponible |
| **Google Drive** | No requiere teléfono | Necesita clave de cifrado | Backup disponible |
| **Chat Exporter** | Exportación completa | Requiere base de datos + media | Análisis forense |

---

## Estado actual de los archivos de contact-name

| Archivo | Fecha | Expiración URL | Media retry | ADB |
|---------|-------|----------------|-------------|-----|
| Propuesta de Servicios Constitutición | 2026-07-22 | ❌ Expirado | ❌ Code 2 | ✅ Disponible |
| 20260310856.pdf (acuse) | 2026-07-14 | ❌ Expirado | ❌ Code 2 | ✅ Disponible |
| COMENTARIOS 7 DE JULIO | 2026-07-08 | ❌ Expirado | ❌ Code 2 | ✅ Disponible |
| COMENTARIOS 6 DE JULIO | 2026-07-06 | ❌ Expirado | ❌ Code 2 | ✅ Disponible |
| Confirmación VivaRICARDO | 2026-07-01 | ❌ Expirado | ❌ Code 2 | ✅ Disponible |
| Todos los demás (39 docs) | < 2026-07 | ❌ Expirado | ❌ Code 2 | ✅ Disponible |

**Conclusión:** La única técnica viable actualmente es **ADB (Técnica 3)** — conectar el teléfono por USB y extraer los archivos del almacenamiento.
