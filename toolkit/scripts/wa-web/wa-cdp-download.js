/**
 * wa-cdp-download.js — Conecta a Chrome YA ABIERTO con WhatsApp Web
 * 
 * Requisito: Chrome ya abierto con --remote-debugging-port=9222
 * Comando: open -a "Google Chrome" --args --remote-debugging-port=9222 "https://web.whatsapp.com"
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const PHONE = getArg('phone') || '521XXXXXXXXXX';
const OUTPUT = getArg('output') || './downloads';
const CDP_URL = getArg('cdp') || 'http://localhost:9222';

const dirs = {
  document: path.join(OUTPUT, '01_DOCUMENTS'),
  image: path.join(OUTPUT, '02_IMAGES'),
  video: path.join(OUTPUT, '03_VIDEOS'),
  audio: path.join(OUTPUT, '04_VOICE_NOTES'),
  sticker: path.join(OUTPUT, '05_STICKERS'),
};
Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));

(async () => {
  console.log('═'.repeat(60));
  console.log('  WhatsApp Web — CDP Downloader');
  console.log('═'.repeat(60));
  console.log(`  Phone:  ${PHONE}`);
  console.log(`  Output: ${OUTPUT}`);
  console.log(`  CDP:    ${CDP_URL}`);
  console.log('═'.repeat(60) + '\n');

  // Connect to existing Chrome
  console.log('🔌 Conectando a Chrome...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  
  // Get the WhatsApp Web page
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  
  let page = pages.find(p => p.url().includes('web.whatsapp.com'));
  if (!page) {
    console.log('❌ No se encontró tab de WhatsApp Web');
    console.log('   Tabs abiertos:');
    pages.forEach(p => console.log(`     ${p.url()}`));
    await browser.close();
    return;
  }

  console.log(`✅ WhatsApp Web encontrado: ${page.url()}\n`);

  // Wait for chat list
  console.log('⏳ Esperando chat list...');
  try {
    await page.waitForSelector('[data-testid="chat-list"]', { timeout: 60000 });
    console.log('✅ Chat list visible\n');
  } catch {
    console.log('⚠️ Chat list no visible, esperando más...');
    await page.waitForTimeout(10000);
  }

  // Search for chat
  console.log(`🔍 Buscando: ${PHONE}...`);
  
  // Try different search selectors
  let searchInput = null;
  const searchSelectors = [
    'input[aria-label="Search or start a new chat"]',
    'input[placeholder="Search or start a new chat"]',
    '[data-testid="search"] input',
    'div[contenteditable][data-tab="3"]',
    'input[title="Search input"]',
  ];
  
  for (const sel of searchSelectors) {
    searchInput = await page.$(sel).catch(() => null);
    if (searchInput) {
      console.log(`  Campo de búsqueda: ${sel}`);
      break;
    }
  }

  if (!searchInput) {
    console.log('❌ No se encontró campo de búsqueda');
    console.log('   Probando click en icono de búsqueda...');
    const searchIcon = await page.$('[data-testid="search"]').catch(() => null);
    if (searchIcon) {
      await searchIcon.click();
      await page.waitForTimeout(1000);
      searchInput = await page.$('input').catch(() => null);
    }
  }

  if (!searchInput) {
    console.log('❌ No se pudo encontrar el campo de búsqueda');
    await browser.close();
    return;
  }

  await searchInput.click();
  await searchInput.fill('');
  await page.waitForTimeout(500);
  await searchInput.fill(PHONE);
  await page.waitForTimeout(3000);

  // Click first result
  const resultSelectors = [
    '[data-testid="cell-frame-container"]',
    'div[role="listitem"]',
    'div[class*="chat"]',
  ];
  
  let chatResult = null;
  for (const sel of resultSelectors) {
    chatResult = await page.$(sel).catch(() => null);
    if (chatResult) {
      console.log(`  Resultado: ${sel}`);
      break;
    }
  }

  if (!chatResult) {
    console.log('❌ No se encontró el chat en resultados');
    await browser.close();
    return;
  }

  await chatResult.click();
  console.log('✅ Chat abierto\n');
  await page.waitForTimeout(3000);

  // Set up download handler
  let success = 0;
  let failed = 0;
  const downloadedFiles = [];

  context.on('page', async (newPage) => {
    console.log('  Nueva página abierta (descarga?)');
  });

  // Configure downloads to save to our directory
  // Note: CDP doesn't support acceptDownloads the same way
  // We'll use a different approach - intercept network requests

  // Scroll up to load more messages
  console.log('📜 Cargando mensajes históricos (scroll up)...');
  const messagePanel = await page.$('[data-testid="conversation-panel-messages"]')
    .catch(() => page.$('div[class*="message-list"]'))
    .catch(() => page.$('div[class*="messages"]'));

  if (messagePanel) {
    for (let i = 0; i < 30; i++) {
      await messagePanel.evaluate(el => el.scrollTop = 0).catch(() => {});
      await page.waitForTimeout(800);
    }
  }
  console.log('  Scroll completado\n');

  // Find all download buttons
  console.log('🔎 Buscando archivos descargables...');
  
  // WhatsApp Web uses different selectors for different media types
  const downloadSelectors = [
    '[data-testid="download-clip-icon"]',
    'span[data-testid="download-clip-icon"]',
    'div[aria-label="Download"]',
    'button[aria-label="Download"]',
    'span[aria-label="Download"]',
  ];

  let allButtons = [];
  for (const sel of downloadSelectors) {
    const btns = await page.$$(sel).catch(() => []);
    if (btns.length > 0) {
      console.log(`  ${sel}: ${btns.length} botones`);
      allButtons = allButtons.concat(btns);
    }
  }

  // Also look for document messages (PDF, DOCX, etc)
  const docMsgs = await page.$$('[data-testid="document-msg"]').catch(() => []);
  console.log(`  Mensajes de documento: ${docMsgs.length}`);

  // Look for any element with download capability
  const allMedia = await page.$$eval('*', els => {
    return els
      .filter(el => {
        const testid = el.getAttribute('data-testid') || '';
        return testid.includes('download') || testid.includes('document') || testid.includes('media');
      })
      .map(el => ({
        tag: el.tagName,
        testid: el.getAttribute('data-testid'),
        aria: el.getAttribute('aria-label'),
      }));
  }).catch(() => []);

  console.log(`  Elementos media totales: ${allMedia.length}\n`);
  if (allMedia.length > 0) {
    allMedia.slice(0, 10).forEach(m => 
      console.log(`    ${m.tag} testid=${m.testid} aria=${m.aria}`)
    );
  }

  // Strategy: Use CDP to intercept downloads
  const client = await page.context().newCDPSession(page);
  
  // Set download behavior
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: path.resolve(OUTPUT, '_browser_downloads'),
  }).catch(() => {});

  // Click each download button
  console.log(`\n📥 Descargando ${allButtons.length} archivos...\n`);

  for (let i = 0; i < allButtons.length; i++) {
    try {
      console.log(`  [${i + 1}/${allButtons.length}] Click...`);
      
      // Scroll into view
      await allButtons[i].scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
      
      // Click
      await allButtons[i].click({ timeout: 10000 });
      await page.waitForTimeout(3000);
      
      success++;
    } catch (err) {
      console.log(`    ❌ ${err.message}`);
      failed++;
    }
  }

  // Check what was downloaded
  const dlDir = path.join(OUTPUT, '_browser_downloads');
  if (fs.existsSync(dlDir)) {
    const files = fs.readdirSync(dlDir);
    console.log(`\n📁 Archivos en ${dlDir}: ${files.length}`);
    files.forEach(f => {
      const stat = fs.statSync(path.join(dlDir, f));
      console.log(`  ${f} (${(stat.size / 1024).toFixed(0)} KB)`);
    });
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ✅ Clicks exitosos: ${success}`);
  console.log(`  ❌ Fallidos:        ${failed}`);
  console.log(`  Destino:            ${OUTPUT}`);
  console.log(`${'═'.repeat(60)}`);

  // Don't close - let user see
  console.log('\n🌐 Browser sigue abierto. Ctrl+C para terminar.');
  await page.waitForTimeout(30000);
  
  // Disconnect (don't close browser)
  await browser.close();
})();
