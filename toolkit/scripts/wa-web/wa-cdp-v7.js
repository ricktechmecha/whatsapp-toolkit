/**
 * wa-cdp-v7.js — Busca el chat en la lista directamente (sin search input)
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
  console.log('  WhatsApp Web — v7 (direct list click)');
  console.log('═'.repeat(60) + '\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('web.whatsapp.com'));
  if (!page) {
    page = await context.newPage();
    await page.goto('https://web.whatsapp.com');
    await page.waitForTimeout(15000);
  }
  await page.bringToFront();

  // CDP downloads
  const client = await context.newCDPSession(page);
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  }).catch(() => {});

  // Wait for chat list
  await page.waitForSelector('[data-testid="chat-list"]', { timeout: 30000 });
  console.log('✅ Chat list visible\n');

  // Find Brianda in chat list by scrolling through it
  console.log(`🔍 Buscando "${PHONE}" en la lista...`);
  
  // First try: search for the phone number in chat items
  let found = false;
  
  // Try using the search input — use a broader approach
  const allInputs = await page.$$('input[type="text"]');
  for (const input of allInputs) {
    const placeholder = await input.evaluate(el => el.placeholder).catch(() => '');
    const ariaLabel = await input.evaluate(el => el.getAttribute('aria-label')).catch(() => '');
    console.log(`  Input: placeholder="${placeholder}" aria="${ariaLabel}"`);
    
    if (placeholder.includes('earch') || placeholder.includes('uscar') || 
        ariaLabel.includes('earch') || ariaLabel.includes('uscar') ||
        placeholder === '') {
      console.log('  → Usando este input');
      await input.click();
      await page.waitForTimeout(500);
      await input.fill(PHONE);
      await page.waitForTimeout(3000);
      
      const result = await page.$('[data-testid="cell-frame-container"]').catch(() => null);
      if (result) {
        const name = await result.evaluate(el => el.textContent?.slice(0, 60)).catch(() => '?');
        console.log(`  ✅ Resultado: ${name}`);
        await result.click();
        await page.waitForTimeout(5000);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    // Approach 2: Find by name in chat list
    console.log('  Buscando por nombre en la lista...');
    const chatItems = await page.$$('[data-testid="cell-frame-container"]');
    console.log(`  ${chatItems.length} chats en lista`);
    
    for (const item of chatItems) {
      const text = await item.evaluate(el => el.textContent || '').catch(() => '');
      if (text.includes('Brianda') || text.includes(PHONE)) {
        console.log(`  ✅ Encontrado: ${text.slice(0, 60)}`);
        await item.click();
        await page.waitForTimeout(5000);
        found = true;
        break;
      }
    }
    
    if (!found) {
      // Scroll the chat list to find more
      console.log('  Haciendo scroll en la lista de chats...');
      const chatList = await page.$('[data-testid="chat-list"]');
      for (let i = 0; i < 20 && !found; i++) {
        await chatList?.evaluate(el => el.scrollTop += 500).catch(() => {});
        await page.waitForTimeout(1000);
        const items = await page.$$('[data-testid="cell-frame-container"]');
        for (const item of items) {
          const text = await item.evaluate(el => el.textContent || '').catch(() => '');
          if (text.includes('Brianda') || text.includes(PHONE)) {
            console.log(`  ✅ Encontrado: ${text.slice(0, 60)}`);
            await item.click();
            await page.waitForTimeout(5000);
            found = true;
            break;
          }
        }
      }
    }
  }

  if (!found) {
    console.log('❌ No se encontró el chat');
    await browser.close();
    return;
  }

  // Verify chat is open
  const msgPanel = await page.$('[data-testid="conversation-panel-messages"]');
  if (!msgPanel) {
    console.log('❌ Chat no abrió');
    await browser.close();
    return;
  }
  console.log('✅ Chat abierto!\n');

  // Wait for messages
  console.log('⏳ Esperando mensajes (20s)...');
  await page.waitForTimeout(20000);

  const initialFiles = new Set(fs.readdirSync(downloadDir));
  const seenMedia = new Set();
  let totalDownloaded = 0;
  let scrollCount = 0;
  let noNewMediaCount = 0;
  let totalDocs = 0;
  let totalImgs = 0;

  // Scroll to bottom
  await msgPanel.evaluate(el => el.scrollTop = el.scrollHeight).catch(() => {});
  await page.waitForTimeout(3000);

  console.log('📜 Iniciando scroll...\n');

  while (scrollCount < MAX_SCROLLS) {
    const docs = await page.$$('[data-testid="document-thumb"]').catch(() => []);
    const imgs = await page.$$('[data-testid="image-thumb"] img, div[class*="image-thumb"] img').catch(() => []);

    if (docs.length > 0 || imgs.length > 0) noNewMediaCount = 0;

    for (const doc of docs) {
      try {
        const box = await doc.boundingBox().catch(() => null);
        if (!box) continue;
        const key = `d${Math.round(box.y / 10)}`;
        if (seenMedia.has(key)) continue;
        seenMedia.add(key);
        totalDocs++;

        const name = await doc.evaluate(el => {
          const c = el.closest('div[class*="message"]') || el.parentElement;
          return c?.textContent?.slice(0, 70) || 'doc';
        }).catch(() => 'doc');

        console.log(`  📄 [s${scrollCount}] ${name.slice(0, 55)}`);

        await doc.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(800);
        await doc.hover().catch(() => {});
        await page.waitForTimeout(1000);

        // Try to find download button
        let dlBtn = null;
        for (const sel of [
          '[data-testid="download-clip-icon"]',
          '[aria-label="Download"]',
          '[aria-label="Descargar"]',
          'div[role="button"][aria-label*="ownload" i]',
          'span[data-testid="download-clip-icon"]',
        ]) {
          dlBtn = await page.$(sel).catch(() => null);
          if (dlBtn) {
            console.log(`    Botón: ${sel}`);
            break;
          }
        }

        if (dlBtn) {
          await dlBtn.click({ timeout: 5000 }).catch(() => {});
          console.log(`    ✅ Download`);
          await page.waitForTimeout(5000);
          totalDownloaded++;
        } else {
          // Click document to open viewer
          await doc.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(3000);
          
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
          if (!dlBtn) console.log(`    ⚠️ Sin botón`);
        }

        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(1000);
      } catch {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    for (const img of imgs) {
      try {
        const box = await img.boundingBox().catch(() => null);
        if (!box) continue;
        const key = `i${Math.round(box.y / 10)}`;
        if (seenMedia.has(key)) continue;
        seenMedia.add(key);
        totalImgs++;

        console.log(`  🖼️ [s${scrollCount}] y=${Math.round(box.y)}`);
        await img.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
        await img.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(3000);

        let dlBtn = null;
        for (const sel of ['[data-testid="media-viewer-download"]', '[aria-label="Download"]', '[aria-label="Descargar"]']) {
          dlBtn = await page.$(sel).catch(() => null);
          if (dlBtn) break;
        }
        if (dlBtn) {
          await dlBtn.click({ timeout: 5000 }).catch(() => {});
          console.log(`    ✅ Descargando`);
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

    // Scroll up
    const prev = await msgPanel.evaluate(el => el.scrollTop).catch(() => 0);
    await msgPanel.evaluate(el => el.scrollTop -= 400).catch(() => {});
    await page.waitForTimeout(1500);
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
      console.log(`  📜 s${scrollCount}/${MAX_SCROLLS} docs:${totalDocs} imgs:${totalImgs} dl:${totalDownloaded}`);
    }
  }

  console.log('\n⏳ Esperando (20s)...');
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
  console.log(`  Scrolls:${scrollCount} Docs:${totalDocs} Imgs:${totalImgs} DL:${totalDownloaded} New:${newFiles.length}`);
  console.log(`\n  📁 Por carpeta:`);
  for (const [type, dir] of Object.entries(dirs)) {
    const count = fs.readdirSync(dir).filter(f => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile()).length;
    console.log(`    ${type}: ${count}`);
  }
  console.log('═'.repeat(60));

  await browser.close();
})();
