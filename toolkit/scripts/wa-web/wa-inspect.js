/**
 * wa-inspect.js — Inspecciona el DOM de WhatsApp Web para encontrar selectores
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('web.whatsapp.com'));
  
  if (!page) {
    console.log('❌ No WhatsApp Web tab');
    await browser.close();
    return;
  }

  console.log('🔍 Inspeccionando DOM...\n');

  // Get all interactive elements
  const elements = await page.evaluate(() => {
    const results = [];
    
    // Find all inputs
    document.querySelectorAll('input').forEach(el => {
      results.push({
        tag: 'input',
        type: el.type,
        title: el.title,
        placeholder: el.placeholder,
        ariaLabel: el.getAttribute('aria-label'),
        dataTestId: el.getAttribute('data-testid'),
        id: el.id,
        className: el.className?.slice(0, 50),
      });
    });
    
    // Find all contenteditable divs
    document.querySelectorAll('div[contenteditable="true"]').forEach(el => {
      results.push({
        tag: 'div[contenteditable]',
        title: el.title,
        ariaLabel: el.getAttribute('aria-label'),
        dataTestId: el.getAttribute('data-testid'),
        dataTab: el.getAttribute('data-tab'),
        className: el.className?.slice(0, 50),
      });
    });
    
    // Find elements with data-testid containing "search"
    document.querySelectorAll('[data-testid*="search"], [data-testid*="Search"]').forEach(el => {
      results.push({
        tag: el.tagName,
        dataTestId: el.getAttribute('data-testid'),
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        className: el.className?.slice(0, 50),
      });
    });
    
    // Find buttons
    document.querySelectorAll('button').forEach(el => {
      if (el.getAttribute('aria-label')?.includes('earch') || 
          el.getAttribute('data-testid')?.includes('earch')) {
        results.push({
          tag: 'button',
          ariaLabel: el.getAttribute('aria-label'),
          dataTestId: el.getAttribute('data-testid'),
        });
      }
    });
    
    return results;
  });

  console.log(`Elementos encontrados: ${elements.length}\n`);
  elements.forEach((el, i) => {
    console.log(`${i + 1}. ${el.tag}`);
    if (el.type) console.log(`   type: ${el.type}`);
    if (el.title) console.log(`   title: ${el.title}`);
    if (el.placeholder) console.log(`   placeholder: ${el.placeholder}`);
    if (el.ariaLabel) console.log(`   aria-label: ${el.ariaLabel}`);
    if (el.dataTestId) console.log(`   data-testid: ${el.dataTestId}`);
    if (el.dataTab) console.log(`   data-tab: ${el.dataTab}`);
    if (el.role) console.log(`   role: ${el.role}`);
    if (el.className) console.log(`   class: ${el.className}`);
    console.log('');
  });

  // Also check if chat list has any items
  const chatItems = await page.evaluate(() => {
    const items = document.querySelectorAll('[data-testid="cell-frame-container"], div[role="listitem"]');
    return {
      count: items.length,
      firstItem: items[0]?.getAttribute('data-testid'),
      firstItemText: items[0]?.textContent?.slice(0, 100),
    };
  });
  
  console.log(`\nChat items: ${chatItems.count}`);
  if (chatItems.firstItemText) {
    console.log(`  First: ${chatItems.firstItemText}`);
  }

  // Check for QR (might not be logged in)
  const qr = await page.$('[data-testid="qr-code"]').catch(() => null);
  console.log(`QR visible: ${qr ? 'SÍ (no logueado)' : 'NO (logueado)'}`);

  // Take screenshot
  await page.screenshot({ path: '/tmp/wa-web-screenshot.png', fullPage: false });
  console.log('\n📸 Screenshot: /tmp/wa-web-screenshot.png');

  await browser.close();
})();
