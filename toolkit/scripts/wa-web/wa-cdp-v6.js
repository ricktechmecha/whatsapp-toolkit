/**
 * wa-cdp-v6.js — Versión con interceptación de descargas via CDP
 * 
 * Mejoras:
 * - Espera más tiempo entre scrolls para que carguen mensajes
 * - Intercepta descargas via CDP (no depende de botones)
 * - Hover antes de click para revelar botones
 * - Busca el botón de download dentro del mensaje (no en viewer)
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
const MAX_SCROLLS = parseInt(getArg('scroll') || '500', 10);

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
  console.log('  WhatsApp Web — v6 (CDP intercept + hover)');
  console.log('═'.repeat(60) + '\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('web.whatsapp.com'));
  if (!page) {
    page = await context.newPage();
    await page.goto('https://web.whatsapp.com');
    await page.waitForTimeout(15000);
  }

  await page.bringToFront().catch(() => {});

  // Set up CDP download interception
  const client = await context.newCDPSession(page);
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  }).catch(() => {});

  // Also use Browser level
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  }).catch(() => {});

  // Search for chat
  console.log(`🔍 Buscando: ${PHONE}...`);
  const searchInput = await page.$('input[placeholder*="earch"], input[placeholder*="uscar"], input[aria-label*="earch"], input[aria-label*="uscar"]')
    .catch(() => null);

  if (searchInput) {
    await searchInput.click();
    await searchInput.fill('');
    await page.waitForTimeout(300);
    await searchInput.fill(PHONE);
    await page.waitForTimeout(3000);
    const result = await page.$('[data-testid="cell-frame-container"]').catch(() => null);
    if (result) {
      const name = await result.evaluate(el => el.textContent?.slice(0, 60)).catch(() => '?');
      console.log(`  Chat: ${name}`);
      await result.click();
      await page.waitForTimeout(5000); // Wait longer for chat to load
    }
  }

  const msgPanel = await page.$('[data-testid="conversation-panel-messages"]');
  if (!msgPanel) {
    console.log('❌ No message panel');
    await browser.close();
    return;
  }
  console.log('✅ Chat abierto\n');

  // Wait for messages to load
  console.log('⏳ Esperando carga de mensajes (20s)...');
  await page.waitForTimeout(20000);

  const initialFiles = new Set(fs.readdirSync(downloadDir));
  const seenMedia = new Set();
  let totalDownloaded = 0;
  let scrollCount = 0;
  let noNewMediaCount = 0;
  let totalDocsFound = 0;
  let totalImgsFound = 0;

  // Scroll to bottom first
  await msgPanel.evaluate(el => el.scrollTop = el.scrollHeight).catch(() => {});
  await page.waitForTimeout(3000);

  console.log('📜 Iniciando scroll...\n');

  while (scrollCount < MAX_SCROLLS) {
    const docs = await page.$$('[data-testid="document-thumb"]').catch(() => []);
    const imgs = await page.$$('[data-testid="image-thumb"] img, div[class*="image-thumb"] img').catch(() => []);

    if (docs.length > 0 || imgs.length > 0) noNewMediaCount = 0;

    // Process documents
    for (const doc of docs) {
      try {
        const box = await doc.boundingBox().catch(() => null);
        if (!box) continue;
        const key = `d${Math.round(box.y / 10)}`;
        if (seenMedia.has(key)) continue;
        seenMedia.add(key);
        totalDocsFound++;

        const name = await doc.evaluate(el => {
          const c = el.closest('div[class*="message"]') || el.parentElement;
          return c?.textContent?.slice(0, 70) || 'doc';
        }).catch(() => 'doc');

        console.log(`  📄 [s${scrollCount}] ${name.slice(0, 55)}`);

        // Scroll into view and hover
        await doc.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(800);
        
        // Hover to reveal download button
        await doc.hover().catch(() => {});
        await page.waitForTimeout(1000);

        // Try to find download button WITHIN the message (not in viewer)
        let dlBtn = null;
        for (const sel of [
          '[data-testid="download-clip-icon"]',
          '[aria-label="Download"]',
          '[aria-label="Descargar"]',
          'span[data-testid="download-clip-icon"]',
          'div[role="button"][aria-label*="ownload" i]',
        ]) {
          dlBtn = await page.$(sel).catch(() => null);
          if (dlBtn) {
            console.log(`    Botón: ${sel}`);
            break;
          }
        }

        if (dlBtn) {
          await dlBtn.click({ timeout: 5000 }).catch(() => {});
          console.log(`    ✅ Download click`);
          await page.waitForTimeout(5000);
          totalDownloaded++;
        } else {
          // Try clicking the document itself (might trigger download for some types)
          await doc.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(3000);
          
          // Look for download in viewer
          for (const sel of [
            '[data-testid="media-viewer-download"]',
            '[aria-label="Download"]',
            '[aria-label="Descargar"]',
            'div[role="button"][aria-label*="ownload" i]',
          ]) {
            dlBtn = await page.$(sel).catch(() => null);
            if (dlBtn) {
              await dlBtn.click({ timeout: 5000 }).catch(() => {});
              console.log(`    ✅ Download (viewer)`);
              await page.waitForTimeout(5000);
              totalDownloaded++;
              break;
            }
          }
          
          if (!dlBtn) {
            console.log(`    ⚠️ Sin botón download`);
          }
        }

        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(1000);
      } catch {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    // Process images
    for (const img of imgs) {
      try {
        const box = await img.boundingBox().catch(() => null);
        if (!box) continue;
        const key = `i${Math.round(box.y / 10)}`;
        if (seenMedia.has(key)) continue;
        seenMedia.add(key);
        totalImgsFound++;

        console.log(`  🖼️ [s${scrollCount}] y=${Math.round(box.y)}`);

        await img.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
        await img.hover().catch(() => {});
        await page.waitForTimeout(800);
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

    // Scroll up with smaller increment
    const prev = await msgPanel.evaluate(el => el.scrollTop).catch(() => 0);
    await msgPanel.evaluate(el => el.scrollTop -= 400).catch(() => {});
    await page.waitForTimeout(1200); // Wait longer for messages to load
    
    const next = await msgPanel.evaluate(el => el.scrollTop).catch(() => 0);

    if (next <= 0 || next === prev) {
      noNewMediaCount++;
      if (noNewMediaCount >= 15) {
        console.log(`\n  🏁 Inicio (scroll ${scrollCount})`);
        break;
      }
    }

    scrollCount++;
    if (scrollCount % 20 === 0) {
      console.log(`  📜 Scroll ${scrollCount}/${MAX_SCROLLS} (docs:${totalDocsFound} imgs:${totalImgsFound} dl:${totalDownloaded})`);
    }
  }

  console.log('\n⏳ Esperando descargas (20s)...');
  await page.waitForTimeout(20000);

  // Organize
  console.log('\n📁 Organizando...');
  const newFiles = fs.readdirSync(downloadDir).filter(f => !initialFiles.has(f));

  for (const f of newFiles) {
    const src = path.join(downloadDir, f);
    const stat = fs.statSync(src);
    const ext = path.extname(f).toLowerCase().slice(1);
    
    let destDir = dirs.document;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) destDir = dirs.image;
    else if (['mp4', 'mov', 'avi', '3gp'].includes(ext)) destDir = dirs.video;
    else if (['mp3', 'opus', 'm4a', 'aac', 'ogg'].includes(ext)) destDir = dirs.audio;
    
    const dest = path.join(destDir, f);
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    console.log(`  ✅ ${f} (${(stat.size / 1024).toFixed(0)} KB) → ${path.basename(destDir)}/`);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Scrolls: ${scrollCount}`);
  console.log(`  Docs encontrados: ${totalDocsFound}`);
  console.log(`  Imgs encontradas: ${totalImgsFound}`);
  console.log(`  Descargas click: ${totalDownloaded}`);
  console.log(`  Archivos nuevos: ${newFiles.length}`);
  console.log(`\n  📁 Por carpeta:`);
  for (const [type, dir] of Object.entries(dirs)) {
    const count = fs.readdirSync(dir).filter(f => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile()).length;
    console.log(`    ${type}: ${count}`);
  }
  console.log('═'.repeat(60));

  await browser.close();
})();
