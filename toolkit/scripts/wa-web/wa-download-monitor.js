/**
 * wa-download-monitor.js — Monitors downloads from WhatsApp Web
 * 
 * ESTE SCRIPT ES SEMI-MANUAL:
 * 1. Abre WhatsApp Web en Chrome (ya abierto)
 * 2. Tú buscas el chat de contact-name manualmente
 * 3. Tú haces scroll y clic en los botones de descarga
 * 4. Este script intercepta y organiza TODOS los archivos descargados
 * 
 * Uso:
 *   node wa-download-monitor.js --output ./archivos_contact-name
 *   (luego haz clic en descargas en WhatsApp Web manualmente)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const OUTPUT = getArg('output') || './downloads';
const CDP_URL = getArg('cdp') || 'http://127.0.0.1:9222';

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
  console.log('  WhatsApp Web — Download Monitor');
  console.log('═'.repeat(60));
  console.log(`  Output: ${OUTPUT}`);
  console.log('═'.repeat(60));
  console.log('\n📋 INSTRUCCIONES:');
  console.log('  1. Chrome ya tiene WhatsApp Web abierto');
  console.log('  2. Busca el chat de contact-name');
  console.log('  3. Haz scroll por el chat');
  console.log('  4. Haz clic en los botones de descarga (↓)');
  console.log('  5. Este script guarda todo automáticamente');
  console.log('  6. Presiona Ctrl+C para terminar\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('web.whatsapp.com'));
  if (!page) {
    page = await context.newPage();
    await page.goto('https://web.whatsapp.com');
    await page.waitForTimeout(15000);
  }
  await page.bringToFront();

  // Set up CDP download interception
  const client = await context.newCDPSession(page);
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  }).catch(() => {});

  // Track initial files
  const initialFiles = new Set(fs.readdirSync(downloadDir));
  let downloadCount = 0;

  // Monitor the download directory for new files
  console.log('👁️ Monitoreando descargas... (Ctrl+C para parar)\n');
  
  let lastCount = 0;
  const checkInterval = setInterval(() => {
    try {
      const currentFiles = fs.readdirSync(downloadDir);
      const newFiles = currentFiles.filter(f => !initialFiles.has(f) && f !== '.DS_Store');
      
      // Check for completely new files
      for (const f of newFiles) {
        const filepath = path.join(downloadDir, f);
        try {
          const stat = fs.statSync(filepath);
          // Only process if file is not being written (size stable)
          if (stat.size > 0) {
            const ext = path.extname(f).toLowerCase().slice(1);
            let destDir = dirs.document;
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) destDir = dirs.image;
            else if (['mp4', 'mov', 'avi', '3gp', 'mkv'].includes(ext)) destDir = dirs.video;
            else if (['mp3', 'opus', 'm4a', 'aac', 'ogg'].includes(ext)) destDir = dirs.audio;
            
            const dest = path.join(destDir, f);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(filepath, dest);
              downloadCount++;
              console.log(`  ✅ [#${downloadCount}] ${f} (${(stat.size / 1024).toFixed(0)} KB) → ${path.basename(destDir)}/`);
            }
          }
        } catch {}
      }
      
      // Show count periodically
      if (newFiles.length > lastCount) {
        lastCount = newFiles.length;
      }
    } catch {}
  }, 2000);

  // Also try to auto-click download buttons that appear
  // This helps with documents that have visible download icons
  const autoClickInterval = setInterval(async () => {
    try {
      // Look for download buttons in the current view
      const dlBtns = await page.$$('[data-testid="download-clip-icon"]').catch(() => []);
      
      for (const btn of dlBtns) {
        try {
          const isVisible = await btn.isVisible().catch(() => false);
          if (isVisible) {
            const box = await btn.boundingBox().catch(() => null);
            if (box && box.width > 0) {
              console.log(`  🤖 Auto-click download button encontrado...`);
              await btn.click({ timeout: 3000 }).catch(() => {});
              await page.waitForTimeout(2000);
            }
          }
        } catch {}
      }
    } catch {}
  }, 5000);

  // Keep running until user presses Ctrl+C
  console.log('📊 Esperando descargas... (presiona Ctrl+C para terminar)\n');
  
  process.on('SIGINT', async () => {
    clearInterval(checkInterval);
    clearInterval(autoClickInterval);
    
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log(`  📊 RESUMEN FINAL`);
    console.log(`  Descargas interceptadas: ${downloadCount}`);
    console.log(`\n  📁 Por carpeta:`);
    for (const [type, dir] of Object.entries(dirs)) {
      const count = fs.readdirSync(dir).filter(f => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile()).length;
      console.log(`    ${type}: ${count}`);
    }
    console.log('═'.repeat(60));
    
    await browser.close();
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
})();
