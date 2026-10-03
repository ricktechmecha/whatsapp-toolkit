/**
 * wa-cdp-v3.js — Descarga media con scroll incremental
 * 
 * WhatsApp Web usa virtual scrolling: solo renderiza mensajes visibles.
 * Esta versión hace scroll gradual y descarga media en cada posición.
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
const MAX_SCROLLS = parseInt(getArg('scroll') || '200', 10);

const dirs = {
  document: path.join(OUTPUT, '01_DOCUMENTS'),
  image: path.join(OUTPUT, '02_IMAGES'),
  video: path.join(OUTPUT, '03_VIDEOS'),
  audio: path.join(OUTPUT, '04_VOICE_NOTES'),
  sticker: path.join(OUTPUT, '05_STICKERS'),
};
Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));

const downloadDir = path.resolve(OUTPUT, '_browser_downloads');
fs.mkdirSync(downloadDir, { recursive: true });

(async () => {
  console.log('═'.repeat(60));
  console.log('  WhatsApp Web — CDP Downloader v3 (scroll incremental)');
  console.log('═'.repeat(60));
  console.log(`  Phone:  ${PHONE}`);
  console.log(`  Output: ${OUTPUT}`);
  console.log(`  Max scrolls: ${MAX_SCROLLS}`);
  console.log('═'.repeat(60) + '\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('web.whatsapp.com'));

  if (!page) { console.log('❌ No WhatsApp Web'); await browser.close(); return; }
  console.log('✅ WhatsApp Web encontrado\n');

  // Set up CDP for downloads
  const client = await context.newCDPSession(page);
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  }).catch(() => {});

  // Search for chat
  console.log(`🔍 Buscando: ${PHONE}...`);
  const searchInput = await page.$('input[aria-label*="Search"], input[aria-label*="Buscar"], input[placeholder*="Search"], input[placeholder*="Buscar"]');
  if (!searchInput) { console.log('❌ No search input'); await browser.close(); return; }

  await searchInput.click();
  await searchInput.fill('');
  await page.waitForTimeout(300);
  await searchInput.fill(PHONE);
  await page.waitForTimeout(3000);

  const chatResult = await page.$('[data-testid="cell-frame-container"]');
  if (!chatResult) { console.log('❌ No chat result'); await browser.close(); return; }
  
  // Get chat name before clicking
  const chatName = await chatResult.evaluate(el => el.textContent?.slice(0, 50)).catch(() => 'unknown');
  console.log(`  Chat encontrado: ${chatName}`);
  
  await chatResult.click();
  console.log('✅ Chat abierto\n');
  await page.waitForTimeout(3000);

  // Get message panel
  const msgPanel = await page.$('[data-testid="conversation-panel-messages"]');
  if (!msgPanel) { console.log('❌ No message panel'); await browser.close(); return; }

  // Track downloaded files
  const downloadedFiles = new Set(fs.readdirSync(downloadDir));
  const seenMedia = new Set(); // Track by position + filename

  let totalDownloaded = 0;
  let scrollCount = 0;
  let noNewMediaCount = 0;

  console.log('📜 Iniciando scroll y descarga incremental...\n');

  // First, scroll to bottom to start from most recent
  await msgPanel.evaluate(el => el.scrollTop = el.scrollHeight).catch(() => {});
  await page.waitForTimeout(2000);

  // Now scroll up gradually
  while (scrollCount < MAX_SCROLLS) {
    // Find media at current scroll position
    const docs = await page.$$('[data-testid="document-thumb"]').catch(() => []);
    const images = await page.$$('[data-testid="image-thumb"] img, div[class*="image-thumb"] img').catch(() => []);

    if (docs.length > 0 || images.length > 0) {
      // Download documents
      for (const doc of docs) {
        try {
          // Get position to track duplicates
          const box = await doc.boundingBox().catch(() => null);
          if (!box) continue;
          const posKey = `doc_${Math.round(box.y)}`;
          if (seenMedia.has(posKey)) continue;
          seenMedia.add(posKey);

          // Get filename from the document
          const filename = await doc.evaluate(el => {
            const container = el.closest('[data-testid="msg-container"], div[class*="message"]') || el.parentElement?.parentElement;
            return container?.textContent?.slice(0, 100) || 'unknown';
          }).catch(() => 'unknown');

          console.log(`  📄 [scroll ${scrollCount}] ${filename.slice(0, 60)}`);

          // Scroll into view and click
          await doc.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(300);
          await doc.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(2000);

          // Find download button
          const dlBtn = await page.$('[data-testid="media-viewer-download"], [aria-label="Download"], [aria-label="Descargar"], [data-testid="download-clip-icon"]')
            .catch(() => null);
          
          if (dlBtn) {
            await dlBtn.click({ timeout: 5000 }).catch(() => {});
            console.log(`    ✅ Descargando...`);
            await page.waitForTimeout(4000);
            totalDownloaded++;
          } else {
            console.log(`    ⚠️ Sin botón download`);
          }

          // Close viewer
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(800);
          
        } catch (err) {
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(500);
        }
      }

      // Download images
      for (const img of images) {
        try {
          const box = await img.boundingBox().catch(() => null);
          if (!box) continue;
          const posKey = `img_${Math.round(box.y)}`;
          if (seenMedia.has(posKey)) continue;
          seenMedia.add(posKey);

          console.log(`  🖼️ [scroll ${scrollCount}] imagen en y=${Math.round(box.y)}`);

          await img.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(300);
          await img.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(2000);

          const dlBtn = await page.$('[data-testid="media-viewer-download"], [aria-label="Download"], [aria-label="Descargar"]')
            .catch(() => null);
          
          if (dlBtn) {
            await dlBtn.click({ timeout: 5000 }).catch(() => {});
            console.log(`    ✅ Descargando...`);
            await page.waitForTimeout(3000);
            totalDownloaded++;
          }

          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(800);
          
        } catch (err) {
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(500);
        }
      }

      noNewMediaCount = 0;
    } else {
      noNewMediaCount++;
    }

    // Scroll up
    const prevScrollTop = await msgPanel.evaluate(el => el.scrollTop).catch(() => 0);
    await msgPanel.evaluate(el => el.scrollTop -= 500).catch(() => {});
    await page.waitForTimeout(800);
    
    const newScrollTop = await msgPanel.evaluate(el => el.scrollTop).catch(() => 0);
    
    // Check if we reached the top
    if (newScrollTop <= 0 || newScrollTop === prevScrollTop) {
      noNewMediaCount++;
      if (noNewMediaCount >= 5) {
        console.log(`  🏁 Alcanzado el inicio del chat (scroll ${scrollCount})`);
        break;
      }
    }

    scrollCount++;
    if (scrollCount % 20 === 0) {
      console.log(`  📜 Scroll ${scrollCount}/${MAX_SCROLLS}... (descargados: ${totalDownloaded})`);
    }
  }

  // Wait for downloads to finish
  console.log('\n⏳ Esperando descargas (15s)...');
  await page.waitForTimeout(15000);

  // Check and organize downloaded files
  console.log(`\n📁 Organizando archivos descargados...`);
  const newFiles = fs.readdirSync(downloadDir).filter(f => !downloadedFiles.has(f));
  
  for (const f of newFiles) {
    const src = path.join(downloadDir, f);
    const stat = fs.statSync(src);
    const ext = path.extname(f).toLowerCase().slice(1);
    
    let destDir = dirs.document;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) destDir = dirs.image;
    else if (['mp4', 'mov', 'avi', '3gp'].includes(ext)) destDir = dirs.video;
    else if (['mp3', 'opus', 'm4a', 'aac', 'ogg'].includes(ext)) destDir = dirs.audio;
    
    const dest = path.join(destDir, f);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
    console.log(`  ✅ ${f} (${(stat.size / 1024).toFixed(0)} KB) → ${path.basename(destDir)}/`);
  }

  // Final count
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📊 Resultado final:`);
  console.log(`  Scrolls: ${scrollCount}`);
  console.log(`  Media descargada: ${totalDownloaded}`);
  console.log(`  Archivos nuevos: ${newFiles.length}`);
  console.log(`\n  📁 Por carpeta:`);
  for (const [type, dir] of Object.entries(dirs)) {
    const count = fs.readdirSync(dir).filter(f => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile()).length;
    console.log(`    ${type}: ${count}`);
  }
  console.log('═'.repeat(60));

  await browser.close();
})();
