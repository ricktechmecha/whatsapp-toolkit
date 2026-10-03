/**
 * wa-web-download.js — Descarga TODA la media de un chat via WhatsApp Web
 * 
 * Usa whatsapp-web.js (Puppeteer) para:
 * 1. Abrir WhatsApp Web en Chrome
 * 2. Escanear QR (una sola vez, sesión persistente)
 * 3. Buscar un chat por nombre o número
 * 4. Descargar todos los archivos (documentos, imágenes, videos, audios, stickers)
 * 
 * Uso:
 *   node wa-web-download.js --chat "contact-name" --output ./media_contact-name
 *   node wa-web-download.js --chat "521XXXXXXXXXX" --output ./media_contact-name --docs-only
 *   node wa-web-download.js --chat "contact-name" --output ./media_contact-name --after 2026-07-01
 *   node wa-web-download.js --list-chats  # Solo listar chats
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ─── Parse args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const CHAT = getArg('chat') || 'contact-name';
const OUTPUT = getArg('output') || './downloads';
const DOCS_ONLY = args.includes('--docs-only');
const LIST_CHATS = args.includes('--list-chats');
const AFTER = getArg('after'); // YYYY-MM-DD
const LIMIT = parseInt(getArg('limit') || '0', 10);

// ─── Setup output dirs ─────────────────────────────────────────────────────
const dirs = {
  document: path.join(OUTPUT, '01_DOCUMENTS'),
  image: path.join(OUTPUT, '02_IMAGES'),
  video: path.join(OUTPUT, '03_VIDEOS'),
  audio: path.join(OUTPUT, '04_VOICE_NOTES'),
  sticker: path.join(OUTPUT, '05_STICKERS'),
  ptt: path.join(OUTPUT, '04_VOICE_NOTES'),
};
Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── WhatsApp Client ───────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'default',
    dataPath: './session',
  }),
  puppeteer: {
    headless: false,  // Visible para que escanees el QR
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

// ─── QR Code ───────────────────────────────────────────────────────────────
client.on('qr', (qr) => {
  console.log('\n📱 Escanea este QR con WhatsApp en tu teléfono:');
  console.log('   WhatsApp → Settings → Linked devices → Link a device\n');
  qrcode.generate(qr, { small: true });
});

// ─── Auth ──────────────────────────────────────────────────────────────────
client.on('authenticated', () => {
  console.log('✅ Autenticado');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Fallo de autenticación:', msg);
});

// ─── Ready ─────────────────────────────────────────────────────────────────
client.on('ready', async () => {
  console.log('\n✅ WhatsApp Web conectado!\n');

  if (LIST_CHATS) {
    await listChats();
    return;
  }

  await downloadChatMedia();
});

// ─── List all chats ────────────────────────────────────────────────────────
async function listChats() {
  console.log('📋 Listando chats...\n');
  const chats = await client.getChats();
  chats
    .filter(c => !c.isGroup)
    .sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0))
    .slice(0, 50)
    .forEach(c => {
      const date = c.lastMessage ? new Date(c.lastMessage.timestamp * 1000).toISOString().slice(0, 10) : '—';
      const name = (c.name || c.id._serialized).slice(0, 40);
      console.log(`  ${name.padEnd(40)} ${date}`);
    });
  console.log(`\nTotal: ${chats.length} chats`);
  await client.destroy();
}

// ─── Download media from chat ──────────────────────────────────────────────
async function downloadChatMedia() {
  console.log(`🔍 Buscando chat: "${CHAT}"...`);

  const chats = await client.getChats();
  let chat = chats.find(c => 
    c.name?.toLowerCase().includes(CHAT.toLowerCase()) ||
    c.id._serialized.includes(CHAT)
  );

  if (!chat) {
    console.error(`❌ Chat no encontrado: ${CHAT}`);
    console.log('\nChats disponibles (primeros 20):');
    chats.slice(0, 20).forEach(c => console.log(`  ${c.name || c.id._serialized}`));
    await client.destroy();
    return;
  }

  console.log(`✅ Chat encontrado: ${chat.name || chat.id._serialized}`);
  console.log(`   Mensajes: ${chat.msgs?.length || 'cargando...'}\n`);

  // Fetch all messages (paginate)
  let allMessages = [];
  let messages = await chat.fetchMessages({ limit: 100 });
  allMessages = allMessages.concat(messages);

  // Keep fetching until no more or limit reached
  while (messages.length === 100 && (LIMIT === 0 || allMessages.length < LIMIT)) {
    console.log(`   Cargando mensajes... (${allMessages.length})`);
    messages = await chat.fetchMessages({ limit: 100, fromMe: false });
    if (messages.length === 0) break;
    allMessages = allMessages.concat(messages);
    if (messages.length < 100) break;
  }

  console.log(`   Total mensajes cargados: ${allMessages.length}\n`);

  // Filter messages with media
  let mediaMessages = allMessages.filter(m => m.hasMedia && !m.fromMe);
  
  // Filter by date if --after
  if (AFTER) {
    const afterTs = new Date(AFTER).getTime() / 1000;
    mediaMessages = mediaMessages.filter(m => m.timestamp >= afterTs);
  }

  // Filter docs only
  if (DOCS_ONLY) {
    mediaMessages = mediaMessages.filter(m => {
      const type = m.type || '';
      return type === 'document' || (m.hasMedia && m.type === 'document');
    });
  }

  console.log(`📦 Mensajes con media: ${mediaMessages.length}\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < mediaMessages.length; i++) {
    const msg = mediaMessages[i];
    const date = new Date(msg.timestamp * 1000).toISOString().slice(0, 10);
    
    try {
      // Get media type
      const type = msg.type || 'unknown';
      const dir = dirs[type] || dirs.document;
      
      // Download media
      console.log(`  [${i + 1}/${mediaMessages.length}] Descargando (${type}) ${date}...`, );

      const media = await Promise.race([
        msg.downloadMedia(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout 60s')), 60000)),
      ]);

      if (!media || !media.data) {
        console.log(`    ⚠️ Sin media disponible (puede estar expirada)`);
        skipped++;
        continue;
      }

      // Determine filename
      const ext = media.mimetype?.split('/')[1]?.split(';')[0] || 'bin';
      const filename = media.filename || `${date}_${msg.id._serialized.slice(0, 12)}.${ext}`;
      
      // Sanitize filename
      const safeFilename = filename.replace(/[/\\:*?"<>|]/g, '_');
      const filepath = path.join(dir, safeFilename);

      // Avoid duplicates
      if (fs.existsSync(filepath)) {
        const counter = 1;
        const stem = path.parse(safeFilename).name;
        const ext2 = path.parse(safeFilename).ext;
        let newPath = path.join(dir, `${stem}_${counter}${ext2}`);
        while (fs.existsSync(newPath)) {
          newPath = path.join(dir, `${stem}_${++counter}${ext2}`);
        }
        fs.writeFileSync(newPath, Buffer.from(media.data, 'base64'));
        console.log(`    ✅ ${path.basename(newPath)} (duplicado renombrado)`);
      } else {
        fs.writeFileSync(filepath, Buffer.from(media.data, 'base64'));
        console.log(`    ✅ ${safeFilename}`);
      }
      success++;
    } catch (err) {
      console.log(`    ❌ ${err.message}`);
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Resultados:`);
  console.log(`  ✅ Descargados: ${success}`);
  console.log(`  ❌ Fallidos:    ${failed}`);
  console.log(`  ⚠️ Sin media:   ${skipped}`);
  console.log(`  Total:          ${mediaMessages.length}`);
  console.log(`  Destino:        ${OUTPUT}`);
  console.log(`${'═'.repeat(60)}`);

  await client.destroy();
}

// ─── Disconnected ──────────────────────────────────────────────────────────
client.on('disconnected', (reason) => {
  console.log('⚠️ Desconectado:', reason);
});

// ─── Start ─────────────────────────────────────────────────────────────────
console.log('═'.repeat(60));
console.log('  WhatsApp Web Media Downloader');
console.log('═'.repeat(60));
console.log(`  Chat:   ${CHAT}`);
console.log(`  Output: ${OUTPUT}`);
if (DOCS_ONLY) console.log('  Modo:   Solo documentos');
if (AFTER) console.log(`  Desde:  ${AFTER}`);
if (LIST_CHATS) console.log('  Modo:   Listar chats');
console.log('═'.repeat(60));
console.log('\nIniciando cliente...\n');

client.initialize();
