/**
 * wa-web-download-v2.js — Versión robusta con manejo de errores
 * 
 * Mejoras:
 * - Retry en getChats()
 * - Descarga directa por número de teléfono (sin necesidad de listar)
 * - Manejo de media expirada
 * - Log detallado
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
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
const AFTER = getArg('after');
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
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

// ─── Events ────────────────────────────────────────────────────────────────
client.on('qr', (qr) => {
  console.log('\n📱 Escanea este QR con WhatsApp en tu teléfono:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('✅ Autenticado'));
client.on('auth_failure', (msg) => console.error('❌ Fallo de autenticación:', msg));

client.on('ready', async () => {
  console.log('\n✅ WhatsApp Web conectado!\n');
  
  // Esperar un poco para que se sincronice
  console.log('⏳ Esperando sincronización (10s)...');
  await new Promise(r => setTimeout(r, 10000));
  
  if (LIST_CHATS) {
    await listChatsSafe();
  } else {
    await downloadChatMediaSafe();
  }
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Desconectado:', reason);
});

// ─── List chats with retry ─────────────────────────────────────────────────
async function listChatsSafe() {
  console.log('📋 Listando chats...\n');
  
  let chats = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      chats = await client.getChats();
      break;
    } catch (err) {
      console.log(`  Intento ${attempt}/3 falló: ${err.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  if (!chats) {
    console.log('❌ No se pudieron listar chats. Probando por número directo...');
    // Intentar obtener chat por número
    try {
      const chat = await client.getChatById('521XXXXXXXXXX@s.whatsapp.net');
      console.log(`✅ Chat encontrado: ${chat.name || chat.id._serialized}`);
    } catch (e) {
      console.log('❌ También falló por número directo:', e.message);
    }
    await client.destroy();
    return;
  }
  
  console.log(`Total chats: ${chats.length}\n`);
  chats
    .filter(c => !c.isGroup)
    .sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0))
    .slice(0, 50)
    .forEach(c => {
      const date = c.lastMessage ? new Date(c.lastMessage.timestamp * 1000).toISOString().slice(0, 10) : '—';
      const name = (c.name || c.id._serialized || 'sin nombre').slice(0, 40);
      console.log(`  ${name.padEnd(40)} ${date}`);
    });
  
  await client.destroy();
}

// ─── Download media safely ─────────────────────────────────────────────────
async function downloadChatMediaSafe() {
  console.log(`🔍 Buscando chat: "${CHAT}"...`);
  
  // Intentar por número directo primero
  let chat = null;
  const isPhone = /^\d+$/.test(CHAT);
  
  if (isPhone) {
    const jid = `${CHAT}@s.whatsapp.net`;
    console.log(`  Probando JID directo: ${jid}`);
    try {
      chat = await client.getChatById(jid);
      console.log(`  ✅ Chat encontrado: ${chat.name || jid}`);
    } catch (err) {
      console.log(`  No se encontró por JID: ${err.message}`);
    }
  }
  
  if (!chat) {
    // Buscar en lista de chats
    let chats = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        chats = await client.getChats();
        break;
      } catch (err) {
        console.log(`  getChats intento ${attempt} falló: ${err.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 5000));
      }
    }
    
    if (chats) {
      chat = chats.find(c => 
        c.name?.toLowerCase().includes(CHAT.toLowerCase()) ||
        c.id._serialized.includes(CHAT)
      );
    }
  }
  
  if (!chat) {
    console.error(`❌ Chat no encontrado: ${CHAT}`);
    console.log('\n💡 Intenta con --list-chats para ver los chats disponibles');
    console.log('   O usa el número de teléfono: --chat 521XXXXXXXXXX');
    await client.destroy();
    return;
  }
  
  console.log(`✅ Chat: ${chat.name || chat.id._serialized}`);
  
  // Cargar mensajes
  console.log('📥 Cargando mensajes...');
  let allMessages = [];
  try {
    let messages = await chat.fetchMessages({ limit: 500 });
    allMessages = allMessages.concat(messages);
    console.log(`   ${allMessages.length} mensajes cargados`);
  } catch (err) {
    console.log(`   Error cargando mensajes: ${err.message}`);
  }
  
  // Filtrar por fecha
  if (AFTER) {
    const afterTs = new Date(AFTER).getTime() / 1000;
    allMessages = allMessages.filter(m => m.timestamp >= afterTs);
    console.log(`   Después de ${AFTER}: ${allMessages.length} mensajes`);
  }
  
  // Filtrar media
  let mediaMessages = allMessages.filter(m => m.hasMedia && !m.fromMe);
  console.log(`📦 Mensajes con media: ${mediaMessages.length}\n`);
  
  let success = 0, failed = 0, skipped = 0;
  
  for (let i = 0; i < mediaMessages.length; i++) {
    const msg = mediaMessages[i];
    const date = new Date(msg.timestamp * 1000).toISOString().slice(0, 10);
    const type = msg.type || 'unknown';
    
    try {
      console.log(`  [${i + 1}/${mediaMessages.length}] (${type}) ${date}...`);
      
      const media = await Promise.race([
        msg.downloadMedia(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout 90s')), 90000)),
      ]);
      
      if (!media || !media.data) {
        console.log(`    ⚠️ Sin media disponible`);
        skipped++;
        continue;
      }
      
      const ext = media.mimetype?.split('/')[1]?.split(';')[0] || 'bin';
      const filename = media.filename || `${date}_${msg.id._serialized.slice(0, 12)}.${ext}`;
      const safeFilename = filename.replace(/[/\\:*?"<>|]/g, '_');
      const dir = dirs[type] || dirs.document;
      const filepath = path.join(dir, safeFilename);
      
      // Evitar duplicados
      let finalPath = filepath;
      if (fs.existsSync(finalPath)) {
        const stem = path.parse(safeFilename).name;
        const ext2 = path.parse(safeFilename).ext;
        let counter = 1;
        finalPath = path.join(dir, `${stem}_${counter}${ext2}`);
        while (fs.existsSync(finalPath)) {
          finalPath = path.join(dir, `${stem}_${++counter}${ext2}`);
        }
      }
      
      fs.writeFileSync(finalPath, Buffer.from(media.data, 'base64'));
      console.log(`    ✅ ${path.basename(finalPath)} (${(Buffer.from(media.data, 'base64').length / 1024).toFixed(0)} KB)`);
      success++;
    } catch (err) {
      console.log(`    ❌ ${err.message}`);
      failed++;
    }
    
    await new Promise(r => setTimeout(r, 800));
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ✅ Descargados: ${success}`);
  console.log(`  ❌ Fallidos:    ${failed}`);
  console.log(`  ⚠️ Sin media:   ${skipped}`);
  console.log(`  Total:          ${mediaMessages.length}`);
  console.log(`  Destino:        ${OUTPUT}`);
  console.log(`${'═'.repeat(60)}`);
  
  await client.destroy();
}

// ─── Start ─────────────────────────────────────────────────────────────────
console.log('═'.repeat(60));
console.log('  WhatsApp Web Media Downloader v2');
console.log('═'.repeat(60));
console.log(`  Chat:   ${CHAT}`);
console.log(`  Output: ${OUTPUT}`);
if (DOCS_ONLY) console.log('  Modo:   Solo documentos');
if (AFTER) console.log(`  Desde:  ${AFTER}`);
if (LIST_CHATS) console.log('  Modo:   Listar chats');
console.log('═'.repeat(60));
console.log('\nIniciando cliente...\n');

client.initialize();
