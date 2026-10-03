/**
 * wa-cdp-v5.js — Versión simplificada y robusta
 * Abre el chat por búsqueda, espera más, descarga incremental
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
  console.log('  WhatsApp Web — v5 (robusto)');
  console.log('═'.repeat(60) + '\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  
  // Find or create WhatsApp tab
  let page = context.pages().find(p => p.url().includes('web.whatsapp.com'));
  if (!page) {
    page = await context.newPage();
    await page.goto('https://web.whatsapp.com');
    await page.waitForTimeout(15000);
  }

  console.log(`📱 Tab: ${page.url()}`);
  
  // Bring to front
  await page.bringToFront().catch(() => {});
  
  // Wait for chat list
  console.log('⏳ Esperando chat list...');
  try {
    await page.waitForSelector('[data-testid="chat-list"]', { timeout: 30000 });
    console.log('✅ Chat list visible');
  } catch {
    console.log('⚠️ Chat list no visible, continuando anyway...');
  }

  // Set up downloads
  const client = await context.newCDPSession(page);
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  }).catch(() => {});

  // Search for chat — try multiple approaches
  console.log(`\n🔍 Buscando chat: ${PHONE}...`);
  
  // Approach 1: Find search input by placeholder (works in any language)
  const searchInput = await page.$('input[placeholder*="earch"], input[placeholder*="uscar"], input[aria-label*="earch"], input[aria-label*="uscar"]')
    .catch(() => null);

  if (searchInput) {
    console.log('  ✅ Search input encontrado');
    await searchInput.click();
    await page.waitForTimeout(500);
    await searchInput.fill('');
    await page.waitForTimeout(300);
    await searchInput.fill(PHONE);
    await page.waitForTimeout(3000);
    
    const result = await page.$('[data-testid="cell-frame-container"]').catch(() => null);
    if (result) {
      const name = await result.evaluate(el => el.textContent?.slice(0, 60)).catch(() => '?');
      console.log(`  Chat: ${name}`);
      await result.click();
      await page.waitForTimeout(3000);
    } else {
      console.log('  ❌ Sin resultados');
    }
  } else {
    // Approach 2: Maybe chat is already open, check if we see messages
    console.log('  ⚠️ No search input, verificando si el chat ya está abierto...');
    
    // Try clicking on "new chat" button first
    const newChatBtn = await page.$('[data-testid="new-chat"], div[role="button"][aria-label*="ew chat" i], div[role="button"][aria-label*="uevo chat" i]')
      .catch(() => null);
    if (newChatBtn) {
      console.log('  Click en new chat...');
      await newChatBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
      
      // Now search
      const search2 = await page.$('input[placeholder*="earch"], input[placeholder*="uscar"]')
        .catch(() => null);
      if (search2) {
        await search2.click();
        await search2.fill(PHONE);
        await page.waitForTimeout(3000);
        const result2 = await page.$('[data-testid="cell-frame-container"]').catch(() => null);
        if (result2) {
          await result2.click();
          console.log('  ✅ Chat abierto via new chat');
          await page.waitForTimeout(3000);
        }
      }
    }
  }

  // Verify chat is open
  const msgPanel = await page.$('[data-testid="conversation-panel-messages"]');
  if (!msgPanel) {
    console.log('❌ No se pudo abrir el chat');
    console.log('   Intenta abrirlo manualmente en Chrome y re-ejecuta');
    await browser.close();
    return;
  }

  console.log('✅ Chat abierto!\n');

  // Get chat name
  const chatTitle = await page.$('[data-testid="conversation-info-header"] [title]')
    .then(el => el?.evaluate(e => e.textContent).catch(() => '?'))
    .catch(() => '?');
  console.log(`  Título: ${chatTitle}\n`);

  // Track files
  const initialFiles = new Set(fs.readdirSync(downloadDir));
  const seenMedia = new Set();
  let totalDownloaded = 0;
  let scrollCount = 0;
  let noNewMediaCount = 0;

  // Scroll to bottom
  await msgPanel.evaluate(el => el.scrollTop = el.scrollHeight).catch(() => {});
  await page.waitForTimeout(2000);

  console.log('📜 Iniciando scroll incremental...\n');

  while (scrollCount < MAX_SCROLLS) {
    // Find documents
    const docs = await page.$$('[data-testid="document-thumb"]').catch(() => []);
    
    // Find images
    const imgs = await page.$$('[data-testid="image-thumb"] img, div[class*="image-thumb"] img').catch(() => []);

    if (docs.length > 0 || imgs.length > 0) {
      noNewMediaCount = 0;
    }

    // Process documents
    for (const doc of docs) {
      try {
        const box = await doc.boundingBox().catch(() => null);
        if (!box) continue;
        const key = `d${Math.round(box.y)}`;
        if (seenMedia.has(key)) continue;
        seenMedia.add(key);

        const name = await doc.evaluate(el => {
          const c = el.closest('div[class*="message"]') || el.parentElement;
          return c?.textContent?.slice(0, 70) || 'doc';
        }).catch(() => 'doc');

        console.log(`  📄 [s${scrollCount}] ${name.slice(0, 55)}`);

        await doc.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
        await doc.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(3000);

        // Find download button
        let dlBtn = null;
        for (const sel of [
          '[data-testid="media-viewer-download"]',
          '[aria-label="Download"]',
          '[aria-label="Descargar"]',
          'span[data-testid="download-clip-icon"]',
          '[role="button"][aria-label*="ownload" i]',
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

    // Process images
    for (const img of imgs) {
      try {
        const box = await img.boundingBox().catch(() => null);
        if (!box) continue;
        const key = `i${Math.round(box.y)}`;
        if (seenMedia.has(key)) continue;
        seenMedia.add(key);

        console.log(`  🖼️ [s${scrollCount}] y=${Math.round(box.y)}`);

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

    // Scroll up
    const prev = await msgPanel.evaluate(el => el.scrollTop).catch(() => 0);
    await msgPanel.evaluate(el => el.scrollTop -= 600).catch(() => {});
    await page.waitForTimeout(700);
    const next = await msgPanel.evaluate(el => el.scrollTop).catch(() => 0);

    if (next <= 0 || next === prev) {
      noNewMediaCount++;
      if (noNewMediaCount >= 10) {
        console.log(`\n  🏁 Inicio alcanzado (scroll ${scrollCount})`);
        break;
      }
    }

    scrollCount++;
    if (scrollCount % 25 === 0) {
      console.log(`  📜 Scroll ${scrollCount}/${MAX_SCROLLS} (descargados: ${totalDownloaded})`);
    }
  }

  // Wait for downloads
  console.log('\n⏳ Esperando descargas (15s)...');
  await page.waitForTimeout(15000);

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
  console.log(`  Scrolls: ${scrollCount} | Media: ${totalDownloaded} | Nuevos: ${newFiles.length}`);
  console.log(`\n  📁 Por carpeta:`);
  for (const [type, dir] of Object.entries(dirs)) {
    const count = fs.readdirSync(dir).filter(f => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile()).length;
    console.log(`    ${type}: ${count}`);
  }
  console.log('═'.repeat(60));

  await browser.close();
})();
