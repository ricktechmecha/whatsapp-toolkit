/**
 * WhatsApp Web — Login Robusto con whatsapp-web.js
 * ================================================
 * - Sesión persistente con LocalAuth
 * - Reconexión automática (anti-desconnect)
 * - Heartbeat cada 30s
 * - Guarda cookies + localStorage automáticamente
 * - Multi-perfil (user, lety, etc.)
 * - API HTTP en puerto 3000 para control remoto
 *
 * Uso:
 *   node wa_login_robusto.js --profile user
 *   node wa_login_robusto.js --profile user --monitor
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const profileArg = args.find(a => a.startsWith('--profile='))?.split('=')[1] || 'user';
const monitorMode = args.includes('--monitor');
const apiPort = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '3000');

const SESSION_DIR = path.join(__dirname, 'session');
const COOKIES_DIR = '~/Documents/ricpersonal/02_HERRAMIENTAS_REDES/whatsapp/whatsapp-mcp/cookies';

// ─── State ───────────────────────────────────────────────────────────────
let client = null;
let isConnected = false;
let lastDisconnect = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;
let messageCount = 0;
let startTime = Date.now();

// ─── Functions ───────────────────────────────────────────────────────────

function log(msg) {
    const ts = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${ts}] ${msg}`);
}

function saveSessionInfo() {
    const info = {
        profile: profileArg,
        connected: isConnected,
        lastDisconnect: lastDisconnect,
        reconnectAttempts: reconnectAttempts,
        messageCount: messageCount,
        uptime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
    };
    
    const infoPath = path.join(SESSION_DIR, `session-${profileArg}-info.json`);
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
}

function initializeClient() {
    log(`🚀 Inicializando cliente WhatsApp (perfil: ${profileArg})...`);
    
    client = new Client({
        authStrategy: new LocalAuth({
            clientId: profileArg,
            dataPath: SESSION_DIR,
        }),
        puppeteer: {
            headless: false,
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--remote-allow-origins=*',
            ],
        },
        // Anti-disconnect
        restartOnAuthFail: true,
        takeoverOnConflict: true,
        qrMaxRetries: 5,
    });

    // ─── QR Code ─────────────────────────────────────────────────────────
    client.on('qr', (qr) => {
        log('📱 Escanea el QR con tu teléfono:');
        qrcode.generate(qr, { small: true });
    });

    // ─── Ready ───────────────────────────────────────────────────────────
    client.on('ready', () => {
        log('✅ Cliente conectado y listo!');
        isConnected = true;
        reconnectAttempts = 0;
        saveSessionInfo();
        
        // Guardar info del cliente
        client.info.getMe().then(me => {
            log(`👤 Usuario: ${me.pushname || me.name || 'N/A'}`);
            log(`📱 Número: ${me.wid.user}`);
            log(`🆔 ID: ${me.wid._serialized}`);
        }).catch(() => {});
    });

    // ─── Authenticated ───────────────────────────────────────────────────
    client.on('authenticated', () => {
        log('🔐 Sesión autenticada!');
    });

    // ─── Auth Failure ────────────────────────────────────────────────────
    client.on('auth_failure', (msg) => {
        log(`❌ Fallo de autenticación: ${msg}`);
        isConnected = false;
    });

    // ─── Disconnected ────────────────────────────────────────────────────
    client.on('disconnected', (reason) => {
        log(`⚠️ Desconectado: ${reason}`);
        isConnected = false;
        lastDisconnect = { reason, timestamp: new Date().toISOString() };
        saveSessionInfo();
        
        // Auto-reconexión con backoff exponencial
        if (reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++;
            const delay = Math.min(5000 * reconnectAttempts, 60000); // 5s, 10s, 15s... max 60s
            log(`🔄 Reconectando en ${delay/1000}s (intento ${reconnectAttempts}/${MAX_RECONNECT})...`);
            
            setTimeout(() => {
                try {
                    client.destroy();
                } catch (e) {}
                setTimeout(() => {
                    initializeClient();
                    client.initialize();
                }, 2000);
            }, delay);
        } else {
            log('❌ Máximo de reconexiones alcanzado. Reinicia manualmente.');
        }
    });

    // ─── Message ─────────────────────────────────────────────────────────
    client.on('message', async (msg) => {
        messageCount++;
        
        // Log de mensajes entrantes
        if (msg.fromMe) {
            // No loguear mensajes enviados por mí
        } else {
            const chat = await msg.getChat();
            log(`💬 ${chat.name}: ${msg.body.substring(0, 50)}`);
        }
        
        saveSessionInfo();
    });

    // ─── Message ACK ─────────────────────────────────────────────────────
    client.on('message_ack', (msg, ack) => {
        // ack: 1=sent, 2=received, 3=read
    });

    // ─── Group Join ──────────────────────────────────────────────────────
    client.on('group_join', (notification) => {
        log(`👥 Alguien se unió a un grupo`);
    });

    // ─── Group Leave ─────────────────────────────────────────────────────
    client.on('group_leave', (notification) => {
        log(`👥 Alguien salió de un grupo`);
    });

    return client;
}

// ─── HTTP API ────────────────────────────────────────────────────────────

function startHttpApi() {
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        const url = new URL(req.url, `http://localhost:${apiPort}`);
        const path = url.pathname;
        
        // ─── Status ──────────────────────────────────────────────────────
        if (path === '/status') {
            res.end(JSON.stringify({
                profile: profileArg,
                connected: isConnected,
                uptime: Date.now() - startTime,
                messages: messageCount,
                reconnectAttempts,
                lastDisconnect,
            }, null, 2));
            return;
        }
        
        // ─── Send message ────────────────────────────────────────────────
        if (path === '/send' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { to, message } = JSON.parse(body);
                    if (!to || !message) {
                        res.end(JSON.stringify({ error: 'to and message required' }));
                        return;
                    }
                    const chatId = to.includes('@') ? to : `${to}@c.us`;
                    const msg = await client.sendMessage(chatId, message);
                    res.end(JSON.stringify({ success: true, id: msg.id._serialized }));
                } catch (e) {
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        
        // ─── Get chats ───────────────────────────────────────────────────
        if (path === '/chats') {
            client.getChats().then(chats => {
                const result = chats.slice(0, 50).map(c => ({
                    name: c.name,
                    id: c.id._serialized,
                    isGroup: c.isGroup,
                    unread: c.unreadCount,
                    lastMessage: c.lastMessage?.body?.substring(0, 50),
                }));
                res.end(JSON.stringify({ chats: result, count: chats.length }, null, 2));
            }).catch(e => res.end(JSON.stringify({ error: e.message })));
            return;
        }
        
        // ─── Get groups ──────────────────────────────────────────────────
        if (path === '/groups') {
            client.getChats().then(chats => {
                const groups = chats.filter(c => c.isGroup).map(g => ({
                    name: g.name,
                    id: g.id._serialized,
                    participants: g.participants.length,
                    isAdmin: g.participants.find(p => p.id._serialized === client.info.wid._serialized)?.isAdmin,
                }));
                res.end(JSON.stringify({ groups, count: groups.length }, null, 2));
            }).catch(e => res.end(JSON.stringify({ error: e.message })));
            return;
        }
        
        // ─── Group info ──────────────────────────────────────────────────
        if (path === '/group/info' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { group_id } = JSON.parse(body);
                    const chat = await client.getChatById(group_id);
                    const participants = chat.participants.map(p => ({
                        id: p.id._serialized,
                        isAdmin: p.isAdmin,
                        isSuperAdmin: p.isSuperAdmin,
                    }));
                    res.end(JSON.stringify({
                        name: chat.name,
                        id: chat.id._serialized,
                        participants,
                    }, null, 2));
                } catch (e) {
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        
        // ─── Group add participants ──────────────────────────────────────
        if (path === '/group/add' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { group_id, participants } = JSON.parse(body);
                    const chat = await client.getChatById(group_id);
                    const ids = participants.map(p => p.includes('@') ? p : `${p}@c.us`);
                    const result = await chat.addParticipants(ids);
                    res.end(JSON.stringify({ success: true, result }));
                } catch (e) {
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        
        // ─── Group remove participants ───────────────────────────────────
        if (path === '/group/remove' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { group_id, participants } = JSON.parse(body);
                    const chat = await client.getChatById(group_id);
                    const ids = participants.map(p => p.includes('@') ? p : `${p}@c.us`);
                    const result = await chat.removeParticipants(ids);
                    res.end(JSON.stringify({ success: true, result }));
                } catch (e) {
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        
        // ─── Group promote ───────────────────────────────────────────────
        if (path === '/group/promote' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { group_id, participants } = JSON.parse(body);
                    const chat = await client.getChatById(group_id);
                    const ids = participants.map(p => p.includes('@') ? p : `${p}@c.us`);
                    const result = await chat.promoteParticipants(ids);
                    res.end(JSON.stringify({ success: true, result }));
                } catch (e) {
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        
        // ─── Group demote ────────────────────────────────────────────────
        if (path === '/group/demote' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { group_id, participants } = JSON.parse(body);
                    const chat = await client.getChatById(group_id);
                    const ids = participants.map(p => p.includes('@') ? p : `${p}@c.us`);
                    const result = await chat.demoteParticipants(ids);
                    res.end(JSON.stringify({ success: true, result }));
                } catch (e) {
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        
        // ─── Get contact ─────────────────────────────────────────────────
        if (path === '/contact') {
            const number = url.searchParams.get('number');
            if (!number) {
                res.end(JSON.stringify({ error: 'number required' }));
                return;
            }
            const chatId = number.includes('@') ? number : `${number}@c.us`;
            client.getContactById(chatId).then(contact => {
                res.end(JSON.stringify({
                    name: contact.name,
                    number: contact.number,
                    pushname: contact.pushname,
                    isBusiness: contact.isBusiness,
                    isMe: contact.isMe,
                    profilePic: contact.profilePicUrl,
                }, null, 2));
            }).catch(e => res.end(JSON.stringify({ error: e.message })));
            return;
        }
        
        // ─── Block ───────────────────────────────────────────────────────
        if (path === '/block' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { number } = JSON.parse(body);
                    const chatId = number.includes('@') ? number : `${number}@c.us`;
                    const contact = await client.getContactById(chatId);
                    await contact.block();
                    res.end(JSON.stringify({ success: true, blocked: true }));
                } catch (e) {
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        
        // ─── Unblock ─────────────────────────────────────────────────────
        if (path === '/unblock' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { number } = JSON.parse(body);
                    const chatId = number.includes('@') ? number : `${number}@c.us`;
                    const contact = await client.getContactById(chatId);
                    await contact.unblock();
                    res.end(JSON.stringify({ success: true, blocked: false }));
                } catch (e) {
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        
        // ─── Set status ──────────────────────────────────────────────────
        if (path === '/status' && req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { status } = JSON.parse(body);
                    await client.setStatus(status);
                    res.end(JSON.stringify({ success: true, status }));
                } catch (e) {
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        
        // ─── 404 ─────────────────────────────────────────────────────────
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found', endpoints: [
            '/status', '/send', '/chats', '/groups',
            '/group/info', '/group/add', '/group/remove', '/group/promote', '/group/demote',
            '/contact', '/block', '/unblock', '/status (POST)'
        ]}));
    });
    
    server.listen(apiPort, () => {
        log(`🌐 API HTTP en http://localhost:${apiPort}`);
        log(`   GET  /status          — Estado del cliente`);
        log(`   POST /send            — Enviar mensaje {to, message}`);
        log(`   GET  /chats           — Listar chats`);
        log(`   GET  /groups          — Listar grupos`);
        log(`   POST /group/info      — Info de grupo {group_id}`);
        log(`   POST /group/add       — Agregar participantes {group_id, participants}`);
        log(`   POST /group/remove    — Remover participantes`);
        log(`   POST /group/promote   — Promover a admin`);
        log(`   POST /group/demote    — Degradar admin`);
        log(`   GET  /contact?number= — Info de contacto`);
        log(`   POST /block           — Bloquear {number}`);
        log(`   POST /unblock         — Desbloquear {number}`);
        log(`   POST /status          — Cambiar status {status}`);
    });
}

// ─── Heartbeat ───────────────────────────────────────────────────────────

function startHeartbeat() {
    setInterval(() => {
        if (isConnected) {
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            log(`💓 Heartbeat — uptime: ${uptime}s — mensajes: ${messageCount}`);
            saveSessionInfo();
        }
    }, 30000); // Cada 30s
}

// ─── Main ────────────────────────────────────────────────────────────────

log('╔══════════════════════════════════════════════════════════╗');
log('║  WhatsApp Web — Login Robusto                           ║');
log(`║  Perfil: ${profileArg.padEnd(46)}║`);
log('╚══════════════════════════════════════════════════════════╝');

// Crear directorios
fs.mkdirSync(SESSION_DIR, { recursive: true });
fs.mkdirSync(COOKIES_DIR, { recursive: true });

// Inicializar
initializeClient();
client.initialize();

// Iniciar API HTTP
startHeartbeat();
startHttpApi();

// Manejar Ctrl+C
process.on('SIGINT', () => {
    log('👋 Cerrando...');
    saveSessionInfo();
    if (client) {
        client.destroy();
    }
    process.exit(0);
});

// Manejar errores no capturados
process.on('unhandledRejection', (err) => {
    log(`❌ Error no capturado: ${err.message}`);
});
