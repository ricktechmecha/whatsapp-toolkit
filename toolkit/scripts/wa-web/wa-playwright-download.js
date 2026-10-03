/**
 * wa-playwright-download.js — WhatsApp Web con Playwright (más estable)
 * 
 * Usa Playwright con Chrome real para:
 * 1. Abrir WhatsApp Web
 * 2. Esperar a que el usuario escanee QR (o usar sesión existente)
 * 3. Buscar un chat por número
 * 4. Descargar todos los archivos del chat
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const PHONE = getArg('phone') || '521XXXXXXXXXX';
const OUTPUT = getArg('output') || './downloads';
const SESSION_DIR = getArg('session') || './session-pw';
const AFTER = getArg('after');
const DOCS_ONLY = args.includes('--docs-only');

// ─── Setup dirs ────────────────────────────────────────────────────────────
const dirs = {
  document: path.join(OUTPUT, '01_DOCUMENTS'),
  image: path.join(OUTPUT, '02_IMAGES'),
  video: path.join(OUTPUT, '03_VIDEOS'),
  audio: path.join(OUTPUT, '04_VOICE_NOTES'),
  sticker: path.join(OUTPUT, '05_STICKERS'),
};
Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── Download dir for browser ──────────────────────────────────────────────
const BROWSER_DOWNLOAD_DIR = path.resolve(OUTPUT, '_browser_downloads');
fs.mkdirSync(BROWSER_DOWNLOAD_DIR, { recursive: true });

(async () => {
  console.log('═'.repeat(60));
  console.log('  WhatsApp Web — Playwright Downloader');
  console.log('═'.repeat(60));
  console.log(`  Phone:   ${PHONE}`);
  console.log(`  Output:  ${OUTPUT}`);
  console.log(`  Session: ${SESSION_DIR}`);
  if (AFTER) console.log(`  After:   ${AFTER}`);
  console.log('═'.repeat(60) + '\n');

  // Launch browser with persistent session
  const browser = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    channel: 'chrome',  // Use real Chrome
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,900',
    ],
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  
  // Set download behavior
  page.setDefaultTimeout(120000);

  console.log('🌐 Abriendo WhatsApp Web...');
  await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded' });

  // Wait for QR or chat list
  console.log('⏳ Esperando login...');
  console.log('   Si ves un QR, escanéalo con tu teléfono.');
  console.log('   Si ya estás logueado, esperará automáticamente.\n');

  // Wait for either QR or chat list (max 120s)
  try {
    await Promise.race([
      page.waitForSelector('[data-testid="qr-code"]', { timeout: 5000 })
        .then(() => { console.log('📱 QR detectado — escanéalo!'); }),
      page.waitForSelector('[data-testid="chat-list"]', { timeout: 5000 })
        .then(() => { console.log('✅ Ya logueado!'); }),
    ]);
  } catch {
    // Keep waiting
  }

  // Wait for chat list to appear (user scanned QR or already logged in)
  console.log('⏳ Esperando chat list (hasta 180s)...');
  try {
    await page.waitForSelector('[data-testid="chat-list"]', { timeout: 180000 });
    console.log('✅ WhatsApp Web listo!\n');
  } catch {
    console.log('❌ Timeout esperando chat list');
    await browser.close();
    return;
  }

  // Wait a bit for sync
  console.log('⏳ Sincronizando (15s)...');
  await page.waitForTimeout(15000);

  // Search for chat by phone number
  console.log(`🔍 Buscando chat: ${PHONE}...`);
  
  // Click search
  const searchInput = await page.waitForSelector('[data-testid="search"] input', { timeout: 10000 })
    .catch(() => page.waitForSelector('div[contenteditable][data-tab="3"]', { timeout: 10000 }))
    .catch(() => page.waitForSelector('input[title="Search input"]', { timeout: 10000 }));
  
  if (!searchInput) {
    console.log('❌ No se encontró el campo de búsqueda');
    await browser.close();
    return;
  }

  await searchInput.click();
  await searchInput.fill(PHONE);
  await page.waitForTimeout(2000);

  // Click on the chat result
  const chatResult = await page.waitForSelector('[data-testid="cell-frame-container"]', { timeout: 10000 })
    .catch(() => page.waitForSelector('div[role="listitem"]', { timeout: 10000 }));
  
  if (!chatResult) {
    console.log('❌ No se encontró el chat en los resultados');
    await browser.close();
    return;
  }

  await chatResult.click();
  console.log('✅ Chat abierto\n');
  await page.waitForTimeout(3000);

  // Now scroll up to load older messages
  console.log('📜 Cargando mensajes históricos...');
  const messagesPanel = await page.waitForSelector('[data-testid="conversation-panel-messages"]', { timeout: 10000 })
    .catch(() => page.waitForSelector('div[class*="message"]', { timeout: 10000 }));

  // Scroll up to load more messages
  for (let i = 0; i < 20; i++) {
    if (messagesPanel) {
      await messagesPanel.evaluate(el => el.scrollTop = 0).catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

  console.log('📥 Buscando archivos para descargar...\n');

  // Find all media messages (documents, images, videos, audio)
  // WhatsApp Web shows download buttons for documents
  const downloadButtons = await page.$$('[data-testid="download-clip-icon"]')
    .catch(() => page.$$('div[aria-label="Download"]')
    .catch(() => page.$$('span[data-testid="download-clip-icon"]')));

  console.log(`📎 Botones de descarga encontrados: ${downloadButtons.length}\n`);

  // Also look for document messages specifically
  const docMessages = await page.$$('[data-testid="document-msg"]')
    .catch(() => page.$$('div[class*="document"]'));

  console.log(`📄 Mensajes de documento: ${docMessages.length}\n`);

  // Strategy: Click each download button and save the file
  let success = 0;
  let failed = 0;

  // Get all media containers
  const mediaElements = await page.$$eval('*', els => 
    els.filter(el => el.getAttribute('data-testid') === 'download-clip-icon')
       .map(el => ({ tag: el.tagName, testid: el.getAttribute('data-testid') }))
  ).catch(() => []);

  console.log(`Media elements via eval: ${mediaElements.length}\n`);

  // Alternative approach: use Playwright's download handler
  page.on('download', async (download) => {
    const filename = download.suggestedFilename();
    console.log(`  📥 Descargando: ${filename}`);
    
    // Determine type by extension
    const ext = path.extname(filename).toLowerCase().slice(1);
    let dir = dirs.document;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) dir = dirs.image;
    else if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) dir = dirs.video;
    else if (['mp3', 'opus', 'm4a', 'aac', 'ogg'].includes(ext)) dir = dirs.audio;
    
    const filepath = path.join(dir, filename);
    
    try {
      await download.saveAs(filepath);
      const stats = fs.statSync(filepath);
      console.log(`  ✅ ${filename} (${(stats.size / 1024).toFixed(0)} KB)`);
      success++;
    } catch (err) {
      console.log(`  ❌ ${filename}: ${err.message}`);
      failed++;
    }
  });

  // Click all download buttons
  const allDownloadBtns = await page.$$('[data-testid="download-clip-icon"]');
  console.log(`Haciendo clic en ${allDownloadBtns.length} botones de descarga...\n`);

  for (let i = 0; i < allDownloadBtns.length; i++) {
    try {
      console.log(`  [${i + 1}/${allDownloadBtns.length}] Click descarga...`);
      await allDownloadBtns[i].click({ timeout: 10000 });
      await page.waitForTimeout(3000); // Wait for download to start/complete
    } catch (err) {
      console.log(`    ❌ ${err.message}`);
      failed++;
    }
  }

  // Wait for all downloads to complete
  console.log('\n⏳ Esperando descargas (15s)...');
  await page.waitForTimeout(15000);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ✅ Descargados: ${success}`);
  console.log(`  ❌ Fallidos:    ${failed}`);
  console.log(`  Destino:        ${OUTPUT}`);
  console.log(`${'═'.repeat(60)}`);

  // Keep browser open for user to see
  console.log('\n🌐 Browser abierto. Presiona Ctrl+C para cerrar.');
  await page.waitForTimeout(60000);
  
  await browser.close();
})();
