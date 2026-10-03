/**
 * wa-cdp-v4.js — Navega directamente al chat por URL
 * https://web.whatsapp.com/send?phone=XXXXXXXXXXX
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
const MAX_SCROLLS = parseInt(getArg('scroll') || '300', 10);

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
  console.log('  WhatsApp Web — CDP v4 (URL directa)');
  console.log('═'.repeat(60));
  console.log(`  Phone:  ${PHONE}`);
  console.log(`  Output: ${OUTPUT}`);
  console.log('═'.repeat(60) + '\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('web.whatsapp.com'));

  if (!page) {
    page = await context.newPage();
    await page.goto('https://web.whatsapp.com');
  }

  // Navigate directly to the chat
  console.log(`🔗 Navegando al chat: https://web.whatsapp.com/send?phone=${PHONE}`);
  await page.goto(`https://web.whatsapp.com/send?phone=${PHONE}`, { waitUntil: 'domcontentloaded' });
  
  console.log('⏳ Esperando que cargue el chat...');
  await page.waitForTimeout(10000);

  // Check if chat loaded
  const msgPanel = await page.$('[data-testid="conversation-panel-messages"]');
  if (!msgPanel) {
    console.log('❌ Chat no cargó. Esperando más...');
    await page.waitForTimeout(15000);
  }

  const msgPanel2 = await page.$('[data-testid="conversation-panel-messages"]');
  if (!msgPanel2) {
    console.log('❌ No se pudo abrir el chat');
    await browser.close();
    return;
  }

  console.log('✅ Chat abierto\n');

  // Set up CDP for downloads
  const client = await context.newCDPSession(page);
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  }).catch(() => {});

  // Track files
  const initialFiles = new Set(fs.readdirSync(downloadDir));
  const seenMedia = new Set();
  let totalDownloaded = 0;
  let scrollCount = 0;
  let noNewMediaCount = 0;

  // Scroll to bottom first
  await msgPanel2.evaluate(el => el.scrollTop = el.scrollHeight).catch(() => {});
  await page.waitForTimeout(2000);

  console.log('📜 Iniciando scroll y descarga...\n');

  while (scrollCount < MAX_SCROLLS) {
    // Find media at current position
    const docs = await page.$$('[data-testid="document-thumb"]').catch(() => []);
    
    // Also find images — try multiple selectors
    const allImages = await page.$$eval(`
      [data-testid="image-thumb"] img,
      div[class*="image-thumb"] img,
      img[class*="media-view"],
      [data-testid="media-msg"] img
    `, els => els.map(el => ({
      src: el.src?.slice(0, 50),
      alt: el.alt,
    }))).catch(() => []);

    // Find audio messages
    const audioBtns = await page.$$('[data-testid="audio-play"], [data-testid="audio-msg"]').catch(() => []);

    if (docs.length > 0) {
      for (const doc of docs) {
        try {
          const box = await doc.boundingBox().catch(() => null);
          if (!box) continue;
          const posKey = `doc_${Math.round(box.y)}`;
          if (seenMedia.has(posKey)) continue;
          seenMedia.add(posKey);

          // Get filename
          const filename = await doc.evaluate(el => {
            const parent = el.closest('div[class*="message"]') || el.parentElement?.parentElement;
            return parent?.textContent?.slice(0, 80) || 'doc';
          }).catch(() => 'doc');

          console.log(`  📄 [s${scrollCount}] ${filename.slice(0, 60)}`);

          await doc.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(500);
          await doc.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(3000);

          // Find download button — try multiple selectors
          let dlBtn = null;
          for (const sel of [
            '[data-testid="media-viewer-download"]',
            '[aria-label="Download"]',
            '[aria-label="Descargar"]',
            'span[data-testid="download-clip-icon"]',
            'div[role="button"][aria-label*="ownload" i]',
            'button[aria-label*="ownload" i]',
          ]) {
            dlBtn = await page.$(sel).catch(() => null);
            if (dlBtn) break;
          }

          if (dlBtn) {
            await dlBtn.click({ timeout: 5000 }).catch(() => {});
            console.log(`    ✅ Descargando...`);
            await page.waitForTimeout(5000);
            totalDownloaded++;
          } else {
            console.log(`    ⚠️ Sin botón download`);
          }

          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(1000);
        } catch {
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(500);
        }
      }
      noNewMediaCount = 0;
    }

    // Handle images
    if (allImages.length > 0) {
      const imgElements = await page.$$('[data-testid="image-thumb"] img, div[class*="image-thumb"] img, img[class*="media-view"]');
      for (const img of imgElements) {
        try {
          const box = await img.boundingBox().catch(() => null);
          if (!box) continue;
          const posKey = `img_${Math.round(box.y)}`;
          if (seenMedia.has(posKey)) continue;
          seenMedia.add(posKey);

          console.log(`  🖼️ [s${scrollCount}] imagen y=${Math.round(box.y)}`);

          await img.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(300);
          await img.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(3000);

          let dlBtn = null;
          for (const sel of [
            '[data-testid="media-viewer-download"]',
            '[aria-label="Download"]',
            '[aria-label="Descargar"]',
          ]) {
            dlBtn = await page.$(sel).catch(() => null);
            if (dlBtn) break;
          }

          if (dlBtn) {
            await dlBtn.click({ timeout: 5000 }).catch(() => {});
            console.log(`    ✅ Descargando...`);
            await page.waitForTimeout(4000);
            totalDownloaded++;
          }

          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(1000);
        } catch {
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(500);
        }
      }
      noNewMediaCount = 0;
    }

    if (docs.length === 0 && allImages.length === 0 && audioBtns.length === 0) {
      noNewMediaCount++;
    }

    // Scroll up
    const prevScroll = await msgPanel2.evaluate(el => el.scrollTop).catch(() => 0);
    await msgPanel2.evaluate(el => el.scrollTop -= 600).catch(() => {});
    await page.waitForTimeout(700);
    
    const newScroll = await msgPanel2.evaluate(el => el.scrollTop).catch(() => 0);
    
    if (newScroll <= 0 || newScroll === prevScroll) {
      noNewMediaCount++;
      if (noNewMediaCount >= 8) {
        console.log(`  🏁 Inicio del chat alcanzado (scroll ${scrollCount})`);
        break;
      }
    }

    scrollCount++;
    if (scrollCount % 20 === 0) {
      console.log(`  📜 Scroll ${scrollCount}/${MAX_SCROLLS} (descargados: ${totalDownloaded})`);
    }
  }

  // Wait for downloads
  console.log('\n⏳ Esperando descargas (15s)...');
  await page.waitForTimeout(15000);

  // Organize files
  console.log('\n📁 Organizando...');
  const allFiles = fs.readdirSync(downloadDir);
  const newFiles = allFiles.filter(f => !initialFiles.has(f));

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

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Scrolls: ${scrollCount}`);
  console.log(`  Media click-descargada: ${totalDownloaded}`);
  console.log(`  Archivos nuevos: ${newFiles.length}`);
  console.log(`\n  📁 Por carpeta:`);
  for (const [type, dir] of Object.entries(dirs)) {
    const count = fs.readdirSync(dir).filter(f => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile()).length;
    console.log(`    ${type}: ${count}`);
  }
  console.log('═'.repeat(60) + '\n');

  await browser.close();
})();
