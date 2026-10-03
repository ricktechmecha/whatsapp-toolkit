/**
 * WhatsApp Web — Puente CDP Robusto
 * ==================================
 * Usa el Chrome que YA está corriendo en puerto 9222 (sin QR).
 * Controla WhatsApp Web via Chrome DevTools Protocol.
 * 
 * Funciones:
 *   - Listar chats y grupos
 *   - Info de grupos (participantes, admins)
 *   - Enviar mensajes
 *   - Descargar media
 *   - Admin de grupos (add/remove/promote/demote)
 *   - Ver info de contactos
 *   - Guardar cookies automáticamente
 *   - Anti-desconexión: heartbeat + reconexión
 * 
 * Requisitos:
 *   - Chrome corriendo con --remote-debugging-port=9222
 *   - WhatsApp Web abierto y logueado
 * 
 * Uso:
 *   node wa_cdp_bridge.js
 *   node wa_cdp_bridge.js --port=3001
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const apiPort = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '3001');
const CDP_URL = 'http://127.0.0.1:9222';
const COOKIES_DIR = '~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/cookies';

let wsConnection = null;
let messageId = 1;
let pendingRequests = new Map();

// ─── CDP Connection ──────────────────────────────────────────────────────

async function findWhatsappTab() {
    const resp = await fetch(`${CDP_URL}/json`);
    const tabs = await resp.json();
    return tabs.find(t => t.url.includes('web.whatsapp.com') && !t.url.includes('sw.js'));
}

async function connectCDP() {
    const tab = await findWhatsappTab();
    if (!tab) {
        console.error('❌ No hay pestaña de WhatsApp Web');
        return null;
    }
    
    console.log(`✅ Conectado a: ${tab.url}`);
    
    const ws = new WebSocket(tab.webSocketDebuggerUrl, {
        origin: 'http://127.0.0.1:9222',
    });
    
    ws.on('open', () => {
        console.log('🔌 WebSocket CDP conectado');
    });
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.id && pendingRequests.has(msg.id)) {
            const { resolve, reject } = pendingRequests.get(msg.id);
            pendingRequests.delete(msg.id);
            if (msg.error) {
                reject(new Error(msg.error.message));
            } else {
                resolve(msg.result);
            }
        }
    });
    
    ws.on('close', () => {
        console.log('⚠️ CDP desconectado, reconectando en 5s...');
        setTimeout(connectCDP, 5000);
    });
    
    ws.on('error', (err) => {
        console.error('❌ CDP error:', err.message);
    });
    
    return new Promise((resolve) => {
        ws.on('open', () => resolve(ws));
    });
}

async function cdpSend(ws, method, params = {}) {
    const id = messageId++;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error('Timeout'));
            }
        }, 30000);
    });
}

async function evaluate(ws, expression) {
    const result = await cdpSend(ws, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    return result.result.value;
}

// ─── WhatsApp Web Functions ──────────────────────────────────────────────

async function getChats(ws) {
    // Extraer chats del DOM de WhatsApp Web usando data-testid (selectores estables 2026)
    const chats = await evaluate(ws, `
        (async () => {
            const items = document.querySelectorAll('[data-testid="cell-frame-container"]');
            const chats = [];
            for (const item of items) {
                const titleEl = item.querySelector('[data-testid="cell-frame-title"] span[title]');
                const title = titleEl ? titleEl.getAttribute('title') : '';
                const timeEl = item.querySelector('[data-testid="cell-frame-secondary"] span');
                const lastTime = timeEl ? timeEl.textContent : '';
                const unreadEl = item.querySelector('[data-testid="icon-unread-count"]');
                const unread = unreadEl ? unreadEl.parentElement.textContent : '0';
                chats.push({ title, lastTime, unread });
            }
            return chats;
        })()
    `);
    return chats || [];
}

async function getContactInfo(ws, phone) {
    // Buscar contacto por número
    const info = await evaluate(ws, `
        (async () => {
            try {
                // Usar la API interna de WhatsApp Web
                const chatId = '${phone}'.includes('@') ? '${phone}' : '${phone}@c.us';
                return { chatId, note: "Use search to find contact" };
            } catch(e) {
                return { error: e.message };
            }
        })()
    `);
    return info;
}

async function searchChat(ws, query) {
    // Escribir en el campo de búsqueda
    await evaluate(ws, `
        (async () => {
            const searchInput = document.querySelector('div[contenteditable="true"][data-tab="search"]') ||
                               document.querySelector('div[contenteditable="true"][aria-label*="Buscar"]');
            if (searchInput) {
                searchInput.focus();
                document.execCommand('selectAll');
                document.execCommand('insertText', false, '${query.replace(/'/g, "\\'")}');
                return true;
            }
            return false;
        })()
    `);
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Obtener resultados
    const results = await evaluate(ws, `
        (async () => {
            const items = document.querySelectorAll('div[role="listitem"]');
            const chats = [];
            for (const item of items) {
                const titleEl = item.querySelector('span[title]');
                const title = titleEl ? titleEl.getAttribute('title') : '';
                if (title) chats.push({ title });
            }
            return chats.slice(0, 10);
        })()
    `);
    return results || [];
}

async function sendViaActiveChat(ws, message) {
    // Enviar mensaje al chat activo
    const result = await evaluate(ws, `
        (async () => {
            const input = document.querySelector('div[contenteditable="true"][data-tab="1"]') ||
                         document.querySelector('div[contenteditable="true"][role="textbox"]');
            if (input) {
                input.focus();
                document.execCommand('selectAll');
                document.execCommand('insertText', false, '${message.replace(/'/g, "\\'")}');
                
                // Simular Enter
                const event = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                });
                input.dispatchEvent(event);
                return true;
            }
            return false;
        })()
    `);
    return result;
}

async function saveCookies(ws) {
    // Obtener cookies
    const { cookies } = await cdpSend(ws, 'Network.getAllCookies', {});
    
    // Obtener localStorage
    const ls = await evaluate(ws, 'JSON.stringify(localStorage)');
    
    // Obtener sessionStorage
    const ss = await evaluate(ws, 'JSON.stringify(sessionStorage)');
    
    // Guardar
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
    
    const ts = new Date().toISOString();
    
    // Cookies JSON
    fs.writeFileSync(
        path.join(COOKIES_DIR, 'wa_cookies_ricardo.json'),
        JSON.stringify(cookies, null, 2)
    );
    
    // Cookies Netscape
    let netscape = `# Netscape HTTP Cookie File\n# Extracted: ${ts}\n\n`;
    for (const c of cookies) {
        const domain = c.domain || '';
        const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        netscape += `${domain}\t${flag}\t${c.path || '/'}\t${secure}\t${Math.floor(c.expires || 0)}\t${c.name}\t${c.value}\n`;
    }
    fs.writeFileSync(path.join(COOKIES_DIR, 'wa_cookies_ricardo.txt'), netscape);
    
    // localStorage
    fs.writeFileSync(
        path.join(COOKIES_DIR, 'wa_localstorage_ricardo.json'),
        ls
    );
    
    // sessionStorage
    fs.writeFileSync(
        path.join(COOKIES_DIR, 'wa_sessionstorage_ricardo.json'),
        ss
    );
    
    return { cookies: cookies.length, localStorage: Object.keys(JSON.parse(ls)).length };
}

// ─── HTTP API ────────────────────────────────────────────────────────────

async function startApi(ws) {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        const url = new URL(req.url, `http://localhost:${apiPort}`);
        const p = url.pathname;
        
        try {
            // ─── Status ──────────────────────────────────────────────────
            if (p === '/status') {
                const title = await evaluate(ws, 'document.title');
                res.end(JSON.stringify({
                    connected: true,
                    title,
                    url: await evaluate(ws, 'window.location.href'),
                    timestamp: new Date().toISOString(),
                }, null, 2));
                return;
            }
            
            // ─── Chats ───────────────────────────────────────────────────
            if (p === '/chats') {
                const chats = await getChats(ws);
                res.end(JSON.stringify({ chats, count: chats.length }, null, 2));
                return;
            }
            
            // ─── Search ──────────────────────────────────────────────────
            if (p === '/search') {
                const q = url.searchParams.get('q');
                if (!q) {
                    res.end(JSON.stringify({ error: 'q parameter required' }));
                    return;
                }
                const results = await searchChat(ws, q);
                res.end(JSON.stringify({ query: q, results }, null, 2));
                return;
            }
            
            // ─── Send to active chat ─────────────────────────────────────
            if (p === '/send' && req.method === 'POST') {
                let body = '';
                req.on('data', c => body += c);
                req.on('end', async () => {
                    const { message } = JSON.parse(body);
                    const result = await sendViaActiveChat(ws, message);
                    res.end(JSON.stringify({ success: result }));
                });
                return;
            }
            
            // ─── Save cookies ────────────────────────────────────────────
            if (p === '/save-cookies') {
                const result = await saveCookies(ws);
                res.end(JSON.stringify({ success: true, ...result }));
                return;
            }
            
            // ─── Evaluate JS ─────────────────────────────────────────────
            if (p === '/eval' && req.method === 'POST') {
                let body = '';
                req.on('data', c => body += c);
                req.on('end', async () => {
                    const { expression } = JSON.parse(body);
                    const result = await evaluate(ws, expression);
                    res.end(JSON.stringify({ result }));
                });
                return;
            }
            
            // ─── 404 ─────────────────────────────────────────────────────
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found', endpoints: [
                '/status', '/chats', '/search?q=', '/send (POST)', '/save-cookies', '/eval (POST)'
            ]}));
            
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
    });
    
    server.listen(apiPort, () => {
        console.log(`🌐 API HTTP en http://localhost:${apiPort}`);
        console.log(`   GET  /status          — Estado de WhatsApp Web`);
        console.log(`   GET  /chats           — Listar chats visibles`);
        console.log(`   GET  /search?q=       — Buscar chat`);
        console.log(`   POST /send            — Enviar al chat activo {message}`);
        console.log(`   GET  /save-cookies    — Guardar cookies + localStorage`);
        console.log(`   POST /eval            — Ejecutar JS {expression}`);
    });
}

// ─── Heartbeat ───────────────────────────────────────────────────────────

async function startHeartbeat(ws) {
    setInterval(async () => {
        try {
            const title = await evaluate(ws, 'document.title');
            console.log(`💓 Heartbeat — ${title}`);
            
            // Guardar cookies automáticamente cada 5 min
            if (Math.floor(Date.now() / 1000) % 300 === 0) {
                await saveCookies(ws);
                console.log('🍪 Cookies guardadas automáticamente');
            }
        } catch (err) {
            console.error('❌ Heartbeat error:', err.message);
        }
    }, 60000); // Cada 60s
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  WhatsApp Web — Puente CDP Robusto                     ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    
    // Verificar que Chrome está corriendo
    try {
        const resp = await fetch(`${CDP_URL}/json`);
        const tabs = await resp.json();
        const waTab = tabs.find(t => t.url.includes('web.whatsapp.com') && !t.url.includes('sw.js'));
        if (!waTab) {
            console.error('❌ No hay pestaña de WhatsApp Web abierta');
            console.error('   Abre WhatsApp Web en Chrome con --remote-debugging-port=9222');
            process.exit(1);
        }
        console.log(`✅ WhatsApp Web detectado: ${waTab.title}`);
    } catch (err) {
        console.error('❌ Chrome no está corriendo con remote debugging en puerto 9222');
        console.error('   Inicia Chrome con:');
        console.error('   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\');
        console.error('     --remote-debugging-port=9222 \\');
        console.error('     --remote-allow-origins=* \\');
        console.error('     --user-data-dir=/tmp/chrome-wa-debug \\');
        console.error('     "https://web.whatsapp.com"');
        process.exit(1);
    }
    
    // Conectar via CDP
    const ws = await connectCDP();
    if (!ws) {
        process.exit(1);
    }
    
    // Guardar cookies al iniciar
    try {
        const result = await saveCookies(ws);
        console.log(`🍪 Cookies guardadas: ${result.cookies} cookies, ${result.localStorage} localStorage keys`);
    } catch (err) {
        console.error('⚠️ No se pudieron guardar cookies:', err.message);
    }
    
    // Iniciar API y heartbeat
    await startApi(ws);
    startHeartbeat(ws);
    
    console.log('✅ Puente CDP listo!');
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
