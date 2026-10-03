/**
 * wa-cdp-v2.js — Descarga media de WhatsApp Web haciendo clic en cada archivo
 * 
 * Estrategia:
 * 1. Conecta a Chrome ya abierto con WhatsApp Web
 * 2. Busca el chat por número
 * 3. Hace scroll up para cargar mensajes históricos
 * 4. Busca todos los elementos de media (documentos, imágenes, videos)
 * 5. Para cada uno: hace clic → abre viewer → clic en download → guarda archivo
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
const CDP_URL = getArg('cdp') || 'http://127.0.0.1:9222';
const SCROLL_TIMES = parseInt(getArg('scroll') || '50', 10);

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
  console.log('  WhatsApp Web — CDP Downloader v2');
  console.log('═'.repeat(60));
  console.log(`  Phone:  ${PHONE}`);
  console.log(`  Output: ${OUTPUT}`);
  console.log(`  Scroll: ${SCROLL_TIMES} veces`);
  console.log('═'.repeat(60) + '\n');

  console.log('🔌 Conectando a Chrome...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('web.whatsapp.com'));

  if (!page) {
    console.log('❌ No WhatsApp Web tab');
    await browser.close();
    return;
  }

  console.log('✅ WhatsApp Web encontrado\n');

  // Wait for chat list
  await page.waitForSelector('[data-testid="chat-list"]', { timeout: 30000 });
  console.log('✅ Chat list visible\n');

  // Search for chat
  console.log(`🔍 Buscando: ${PHONE}...`);
  // Search input (handle both English and Spanish)
  const searchInput = await page.$('input[aria-label="Search or start a new chat"]')
    .catch(() => null) 
    || await page.$('input[aria-label="Buscar un chat o iniciar uno nuevo"]')
    .catch(() => null)
    || await page.$('input[placeholder*="Search"]')
    .catch(() => null)
    || await page.$('input[placeholder*="Buscar"]')
    .catch(() => null);
  
  if (!searchInput) {
    console.log('❌ No search input');
    await browser.close();
    return;
  }

  await searchInput.click();
  await searchInput.fill('');
  await page.waitForTimeout(500);
  await searchInput.fill(PHONE);
  await page.waitForTimeout(3000);

  // Click first result
  const chatResult = await page.$('[data-testid="cell-frame-container"]');
  if (!chatResult) {
    console.log('❌ No chat result');
    await browser.close();
    return;
  }

  await chatResult.click();
  console.log('✅ Chat abierto\n');
  await page.waitForTimeout(3000);

  // Scroll up to load history
  console.log(`📜 Cargando historial (${SCROLL_TIMES} scrolls)...`);
  const msgPanel = await page.$('[data-testid="conversation-panel-messages"]');
  if (msgPanel) {
    for (let i = 0; i < SCROLL_TIMES; i++) {
      await msgPanel.evaluate(el => el.scrollTop = 0).catch(() => {});
      await page.waitForTimeout(600);
      if (i % 10 === 0) console.log(`  Scroll ${i}/${SCROLL_TIMES}...`);
    }
  }
  console.log('  Scroll completado\n');

  // Set up CDP for downloads
  const client = await context.newCDPSession(page);
  const downloadDir = path.resolve(OUTPUT, '_browser_downloads');
  fs.mkdirSync(downloadDir, { recursive: true });

  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  }).catch(() => {});

  // Count media elements
  console.log('🔎 Buscando archivos...\n');

  // Find document thumbnails (PDF, DOCX, etc)
  const docThumbs = await page.$$('[data-testid="document-thumb"]');
  console.log(`  📄 Documentos: ${docThumbs.length}`);

  // Find images (clickable images in chat)
  const images = await page.$$eval('[data-testid="image-thumb"] img, [data-testid="media-msg"] img, div[class*="image-thumb"] img', 
    els => els.length).catch(() => 0);
  console.log(`  🖼️ Imágenes: ${images}`);

  // Find videos
  const videos = await page.$$eval('video[class*="media"], [data-testid="video-thumb"] video',
    els => els.length).catch(() => 0);
  console.log(`  🎬 Videos: ${videos}`);

  // Find audio/voice messages
  const audios = await page.$$eval('[data-testid="audio-msg"], [data-testid="audio-play"], audio[class*="audio"]',
    els => els.length).catch(() => 0);
  console.log(`  🎵 Audios: ${audios}`);

  // Find stickers
  const stickers = await page.$$eval('img[class*="sticker"], [data-testid="sticker"]',
    els => els.length).catch(() => 0);
  console.log(`  ✨ Stickers: ${stickers}`);

  console.log('');

  // ─── Strategy 1: Download documents ─────────────────────────────────────
  let success = 0, failed = 0;

  if (docThumbs.length > 0) {
    console.log('📥 Descargando documentos...\n');
    
    for (let i = 0; i < docThumbs.length; i++) {
      try {
        console.log(`  [${i + 1}/${docThumbs.length}] Abriendo documento...`);
        
        // Scroll into view
        await docThumbs[i].scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
        
        // Click on document to open viewer
        await docThumbs[i].click({ timeout: 10000 });
        await page.waitForTimeout(2000);
        
        // Look for download button in the viewer
        // WhatsApp Web shows a download button in the media viewer
        const downloadSelectors = [
          '[data-testid="media-viewer-download"]',
          '[aria-label="Download"]',
          'span[data-testid="download-clip-icon"]',
          'div[role="button"][aria-label*="Download"]',
          'button[aria-label*="Download"]',
        ];
        
        let downloadBtn = null;
        for (const sel of downloadSelectors) {
          downloadBtn = await page.$(sel).catch(() => null);
          if (downloadBtn) {
            console.log(`    Botón encontrado: ${sel}`);
            break;
          }
        }
        
        if (!downloadBtn) {
          // Try finding any clickable element with "download" in aria-label
          downloadBtn = await page.$eval('*', (el) => {
            const all = el.querySelectorAll('*');
            for (const e of all) {
              const label = e.getAttribute('aria-label') || '';
              const testid = e.getAttribute('data-testid') || '';
              if (label.toLowerCase().includes('download') || testid.includes('download')) {
                return true;
              }
            }
            return false;
          }).catch(() => false);
          
          if (downloadBtn) {
            // Find it properly
            downloadBtn = await page.$('[aria-label*="Download" i], [data-testid*="download" i]');
          }
        }
        
        if (downloadBtn) {
          await downloadBtn.click({ timeout: 10000 });
          console.log(`    ✅ Download clickeado, esperando...`);
          await page.waitForTimeout(5000);
          success++;
        } else {
          // Maybe the document downloads directly on click
          console.log(`    ⚠️ No se encontró botón de download, intentando click directo...`);
          await page.waitForTimeout(3000);
        }
        
        // Close viewer (press Escape)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        
      } catch (err) {
        console.log(`    ❌ ${err.message}`);
        failed++;
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  }

  // ─── Strategy 2: Download images by clicking and downloading ────────────
  console.log('\n📥 Descargando imágenes...\n');
  
  // Find all image elements in the chat
  const imageElements = await page.$$('[data-testid="image-thumb"] img, div[class*="image-thumb"] img, [data-testid="media-msg"] img');
  console.log(`  Imágenes encontradas: ${imageElements.length}\n`);

  for (let i = 0; i < imageElements.length; i++) {
    try {
      console.log(`  [${i + 1}/${imageElements.length}] Abriendo imagen...`);
      
      await imageElements[i].scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);
      await imageElements[i].click({ timeout: 10000 });
      await page.waitForTimeout(2000);
      
      // Find download button
      let downloadBtn = null;
      const dlSelectors = [
        '[data-testid="media-viewer-download"]',
        '[aria-label="Download"]',
        'span[data-testid="download-clip-icon"]',
        'div[role="button"][aria-label*="Download"]',
      ];
      
      for (const sel of dlSelectors) {
        downloadBtn = await page.$(sel).catch(() => null);
        if (downloadBtn) break;
      }
      
      if (downloadBtn) {
        await downloadBtn.click({ timeout: 10000 });
        console.log(`    ✅ Descargando...`);
        await page.waitForTimeout(3000);
        success++;
      } else {
        console.log(`    ⚠️ Sin botón de descarga`);
      }
      
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
      
    } catch (err) {
      console.log(`    ❌ ${err.message}`);
      failed++;
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // ─── Check downloads ────────────────────────────────────────────────────
  console.log('\n⏳ Esperando descargas (10s)...');
  await page.waitForTimeout(10000);

  // Check downloaded files
  console.log(`\n📁 Archivos descargados:`);
  if (fs.existsSync(downloadDir)) {
    const files = fs.readdirSync(downloadDir);
    files.forEach(f => {
      const stat = fs.statSync(path.join(downloadDir, f));
      const sizeKB = (stat.size / 1024).toFixed(0);
      console.log(`  ${f} (${sizeKB} KB)`);
      
      // Move to appropriate folder
      const ext = path.extname(f).toLowerCase().slice(1);
      let destDir = dirs.document;
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) destDir = dirs.image;
      else if (['mp4', 'mov', 'avi', 'mkv', '3gp'].includes(ext)) destDir = dirs.video;
      else if (['mp3', 'opus', 'm4a', 'aac', 'ogg'].includes(ext)) destDir = dirs.audio;
      
      const dest = path.join(destDir, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(downloadDir, f), dest);
        console.log(`    → movido a ${path.basename(destDir)}/`);
      }
    });
    console.log(`\n  Total: ${files.length} archivos`);
  } else {
    console.log('  No se descargó ningún archivo');
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ✅ Exitosos: ${success}`);
  console.log(`  ❌ Fallidos: ${failed}`);
  console.log(`${'═'.repeat(60)}`);

  // Count final files in each dir
  console.log('\n📁 Archivos por carpeta:');
  for (const [type, dir] of Object.entries(dirs)) {
    const count = fs.readdirSync(dir).filter(f => !f.startsWith('.')).length;
    console.log(`  ${type}: ${count}`);
  }

  await browser.close();
})();
