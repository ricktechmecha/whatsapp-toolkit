# WhatsApp Web Automation — Investigación Completa 2025-2026

## 🔑 Hallazgo clave

**whatsapp-web.js** es la mejor herramienta para descargar media de chats específicos. Usa Puppeteer para controlar WhatsApp Web en Chrome. Sesión persistente (escaneas QR una sola vez). Nueva función `downloadMediaStream()` para archivos grandes.

---

## 📊 Comparación de herramientas

| Herramienta | Lenguaje | Stars | Última update | Browser | Media download | Sesión persistente |
|-------------|----------|-------|---------------|---------|----------------|-------------------|
| **whatsapp-web.js** | Node.js | 22,447 | Jul 2026 | Puppeteer | ✅ downloadMedia + stream | ✅ LocalAuth |
| **Baileys** | TypeScript | 10,826 | Jul 2026 | ❌ Sin browser | ✅ buffer + stream | ✅ MultiFileAuth |
| **WhatsPlay** | Python | — | 2026 | Playwright | ✅ voice + files | ✅ LocalProfile |
| **Astra Engine** | Python | 3 | Feb 2026 | Playwright | ✅ all types | ✅ Playwright profiles |
| **whatsapp-mcp (lharries)** | Go+Python | — | 2026 | ❌ whatsmeow | ✅ via bridge | ✅ SQLite |
| **whatsapp-mcp (panghy)** | Electron | — | 2026 | Electron | ✅ get_message_media | ✅ per-account |

---

## 🛠️ Herramientas principales

### 1. whatsapp-web.js (RECOMENDADA para descarga de media)
- **GitHub:** https://github.com/wwebjs/whatsapp-web.js
- **Versión:** v1.34.7 (Jul 2026)
- **Downloads:** 114,251/semana
- **Instalación:** `npm install whatsapp-web.js`

**Descarga de media:**
```javascript
// Descarga básica (base64)
const media = await msg.downloadMedia();
fs.writeFileSync('file.pdf', Buffer.from(media.data, 'base64'));

// NUEVO 2026: Streaming para archivos grandes
const stream = await msg.downloadMediaStream({ chunkSize: 10 * 1024 * 1024 });
stream.pipe(fs.createWriteStream('large.pdf'));
```

**Sesión persistente:**
```javascript
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'default', dataPath: './session' }),
  puppeteer: { headless: false }  // Visible para QR
});
// Después de escanear QR una vez, la sesión se guarda
// No necesitas escanear de nuevo en siguientes ejecuciones
```

### 2. Baileys (sin browser, más ligero)
- **GitHub:** https://github.com/WhiskeySockets/Baileys
- **Versión:** 7.0.0-rc14
- **Downloads:** 447,763/semana

**Descarga con auto-retry de URLs expirados:**
```typescript
const buffer = await downloadMediaMessage(
  message, 'buffer', {},
  { logger, reuploadRequest: sock.updateMediaMessage }
);
// reuploadRequest automáticamente pide al teléfono re-subir si URL expiró
```

### 3. WhatsPlay (Python + Playwright)
- **GitHub:** https://github.com/markbus-ai/whatsplay
- **PyPI:** v2.3.0
- **Selectores estables:** `data-pre-plain-text`, `aria-label`, `data-testid`
- **Multi-idioma:** Español/Inglés

### 4. Astra Engine (Python + Playwright)
- **GitHub:** https://github.com/paman7647/Astra
- **Creado:** Feb 2026
- **Phone Pairing:** Login con número de teléfono (sin QR)

---

## 📡 MCP Servers para WhatsApp

| Proyecto | GitHub | Tecnología | Media |
|----------|--------|------------|-------|
| lharries/whatsapp-mcp | https://github.com/lharries/whatsapp-mcp | Go (whatsmeow) + Python | ✅ |
| fabienbutz/whatsapp-mcp | https://github.com/fabienbutz/whatsapp-mcp | whatsapp-web.js | ✅ |
| ErickXavier/mcp-whatsapp-web | https://github.com/ErickXavier/mcp-whatsapp-web | whatsapp-web.js (TS) | ✅ |
| panghy/whatsapp-mcp-server | https://github.com/panghy/whatsapp-mcp-server | Electron | ✅ get_message_media |
| pnizer/wweb-mcp | https://github.com/pnizer/wweb-mcp | whatsapp-web.js | ✅ |

---

## 🌐 Chrome Extensions

| Extensión | GitHub | Función | Media download |
|-----------|--------|---------|----------------|
| WhatsApp Automator | https://github.com/es-77/my-extension-support | Bulk messaging | ❌ (solo envío) |
| vSender | https://github.com/vyakritisoft/vSender | Bulk con colas | ❌ (solo envío) |
| WhatsApp AI Assistant | Chrome Web Store | AI replies (Gemini) | ❌ |

---

## 🛡️ Anti-ban best practices

### Rate limits recomendados
```javascript
const SAFEGUARDS = {
  minDelayBetweenMessages: 3000,  // 3 segundos mínimo
  maxMessagesPerMinute: 20,
  maxMessagesPerHour: 200,
  messagesPerDay: 1000,
  enableTypingIndicator: true,
  randomizeDelays: true,
};
```

### Human-like behavior
- **Delays aleatorios:** 3-7 segundos entre mensajes
- **Simular typing:** `chat.sendStateTyping()` antes de enviar
- **Pausas cada 25 mensajes:** 2-3 minutos de cooldown
- **Personalizar mensajes:** evitar templates idénticos
- **Responder mensajes:** no solo enviar, también interactuar
- **Residential proxies:** evitar IPs de datacenter

### Librerías de simulación humana
- **HumanTyping:** https://github.com/lax3n/humantyping — Markov Chain typing
- **human-behavior-simulation-kit:** https://github.com/jcrevoisier/human-behavior-simulation-kit
- **CamouChat:** `pip install camouchat-whatsapp`

---

## 📥 Técnicas de descarga de media

### Técnica 1: downloadMedia() (whatsapp-web.js)
```javascript
client.on('message', async (msg) => {
  if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    // media = { mimetype, data (base64), filename }
    fs.writeFileSync(media.filename, Buffer.from(media.data, 'base64'));
  }
});
```

### Técnica 2: downloadMediaStream() (NUEVO 2026)
```javascript
// Para archivos >10MB — evita cargar todo en memoria
const stream = await msg.downloadMediaStream({ chunkSize: 10 * 1024 * 1024 });
stream.pipe(fs.createWriteStream('large-file.pdf'));
```

### Técnica 3: Baileys con auto-retry
```typescript
const buffer = await downloadMediaMessage(
  message, 'buffer', {},
  { reuploadRequest: sock.updateMediaMessage }
);
// Si el URL expiró, automáticamente pide al teléfono re-subir
```

### Técnica 4: DOM scraping (Playwright/Selenium)
```python
# Click en el botón de download
await page.click('[data-testid="download"]')
# Esperar a que el archivo se descargue
await page.wait_for_download()
```

---

## ⚠️ Limitaciones

1. **Media antigua (>30 días):** Puede fallar porque WhatsApp limpia la caché
2. **downloadMedia() timeout:** Sin timeout por defecto — usar `Promise.race`
3. **Base64 memory:** `downloadMedia()` carga todo en memoria — usar stream para >10MB
4. **Chrome DevTools limit:** ~10MB para respuestas base64
5. **Session loss:** Si se borra `./session/`, hay que re-escanear QR
6. **ToS violation:** WhatsApp no permite bots — usar con precaución

---

## 🚀 Setup rápido (ya instalado)

```bash
cd ~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/toolkit/scripts/wa-web

# 1. Primera vez — escanear QR
node wa-web-download.js --list-chats

# 2. Descargar TODA la media de contact-name
node wa-web-download.js --chat "contact-name" --output ../../../archivos_contact-name

# 3. Solo documentos
node wa-web-download.js --chat "contact-name" --output ./downloads --docs-only

# 4. Solo últimos 30 días
node wa-web-download.js --chat "contact-name" --output ./downloads --after 2026-07-27

# 5. Buscar por número
node wa-web-download.js --chat "521XXXXXXXXXX" --output ./downloads
```

**Sesión persistente:** Después de escanear el QR la primera vez, la sesión se guarda en `./session/`. No necesitas escanear de nuevo en siguientes ejecuciones.

---

## 🔗 Links importantes

- whatsapp-web.js docs: https://wwebjs.dev
- Baileys docs: https://whiskey.so
- Baileys migration: https://whiskey.so/migrate-latest
- whatsmeow (Go): https://github.com/tulir/whatsmeow
