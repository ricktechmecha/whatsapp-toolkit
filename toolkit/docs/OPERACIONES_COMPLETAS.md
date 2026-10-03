# WhatsApp — 20 Operaciones Completas (Guía de Referencia)

## 📊 Resumen de compatibilidad

| # | Operación | whatsapp-web.js | Baileys | whatsmeow (Go) | Chrome DOM |
|---|-----------|:---:|:---:|:---:|:---:|
| 1 | Admin grupos | ✅ | ✅ | ✅ | ✅ |
| 2 | Read receipts | ⚠️ | ✅ | ✅ | ❌ |
| 3 | Privacy settings | ❌ | ✅ | ✅ | ❌ |
| 4 | Disconnect/logout | ✅ | ✅ | ✅ | ✅ |
| 5 | Account settings | ✅ | ✅ | ✅ | ✅ |
| 6 | Block/unblock | ✅ | ✅ | ✅ | ✅ |
| 7 | Mute/unmute | ✅ | ✅ | ✅ | ✅ |
| 8 | Pin/unpin | ✅ | ✅ | ✅ | ✅ |
| 9 | Archive/unarchive | ✅ | ✅ | ✅ | ✅ |
| 10 | Star messages | ✅ | ✅ | ✅ | ⚠️ |
| 11 | Delete messages | ✅ | ✅ | ✅ | ✅ |
| 12 | Forward messages | ✅ | ✅ | ✅ | ✅ |
| 13 | React (emoji) | ✅ | ✅ | ✅ | ✅ |
| 14 | Reply to message | ✅ | ✅ | ✅ | ✅ |
| 15 | Send location | ✅ | ✅ | ✅ | ✅ |
| 16 | Send contact (vCard) | ✅ | ✅ | ✅ | ✅ |
| 17 | Send polls | ✅ | ✅ | ✅ | ✅ |
| 18 | Change profile pic | ✅ | ✅ | ✅ | ✅ |
| 19 | Set status/about | ✅ | ✅ | ✅ | ✅ |
| 20 | Typing indicator | ✅ | ✅ | ✅ | ✅ |

**Recomendación:** Baileys tiene la API más completa. whatsmeow es la mejor en Go. whatsapp-web.js es la más fácil pero sin privacy settings.

---

## 1. Administración de grupos

### Crear grupo
```javascript
// whatsapp-web.js
const group = await client.createGroup("Nombre", ["1234567890@c.us"], {
  autoSendInviteV4: true,
});
```
```typescript
// Baileys
const group = await sock.groupCreate('Nombre', ['1234567890@s.whatsapp.net']);
```
```go
// whatsmeow
group, err := client.CreateGroup(ctx, whatsmeow.ReqCreateGroup{
    Name: "Nombre",
    Participants: []types.JID{participantJID},
})
```

### Add/Remove/Promote/Demote
```javascript
// whatsapp-web.js
await groupChat.addParticipants(['123@c.us']);
await groupChat.removeParticipants(['123@c.us']);
await groupChat.promoteParticipants(['123@c.us']);
await groupChat.demoteParticipants(['123@c.us']);
```
```typescript
// Baileys — un solo método para todo
await sock.groupParticipantsUpdate(jid, ['123@s.whatsapp.net'], 'add'); // 'remove', 'promote', 'demote'
```
```go
// whatsmeow
err = client.UpdateGroupParticipants(ctx, groupJID, participants, "add")
```

### Cambiar nombre/descripción
```javascript
await groupChat.setSubject("Nuevo nombre");
await groupChat.setDescription("Nueva descripción");
```

### Salir del grupo / Invitar
```javascript
await groupChat.leave();
const inviteCode = await groupChat.getInviteCode();
```

---

## 2. Read receipts (ticks azules)

### Marcar como leído/no leído
```javascript
// whatsapp-web.js
await chat.sendSeen();          // Marcar como leído
await chat.markUnread();        // Marcar como no leído
```

### Desactivar read receipts (privacy)
```typescript
// Baileys — puede desactivar read receipts
await sock.updateReadReceiptsPrivacy('none');  // 'all' para activar
```
```go
// whatsmeow
err := client.SetPrivacySetting("readreceipts", "none")
```

**⚠️ whatsapp-web.js NO puede cambiar privacy settings.**

---

## 3. Privacy settings

```typescript
// Baileys — completo
await sock.updateLastSeenPrivacy('contacts');      // 'all', 'contacts', 'none'
await sock.updateProfilePicturePrivacy('contacts');
await sock.updateStatusPrivacy('contacts');
await sock.updateOnlinePrivacy('match_last_seen');
await sock.updateGroupsAddPrivacy('contacts');
await sock.updateReadReceiptsPrivacy('none');
```
```go
// whatsmeow — completo
err = client.SetPrivacySetting("last", "contacts")
err = client.SetPrivacySetting("profile", "contacts")
err = client.SetPrivacySetting("status", "contacts")
err = client.SetPrivacySetting("groupadd", "contacts")
err = client.SetPrivacySetting("online", "none")
```

**❌ whatsapp-web.js no soporta privacy settings.**

---

## 4. Disconnect / Logout

```javascript
// whatsapp-web.js
await client.logout();    // Logout completo
await client.destroy();   // Cerrar cliente
```
```typescript
// Baileys
await sock.logout();
sock.end();
```
```go
// whatsmeow
err := client.Logout()
client.Close()
```

---

## 5. Account settings (about, profile photo, status)

```javascript
// whatsapp-web.js
await client.setStatus("Mi estado");
await client.setProfilePicture(media);
await client.deleteProfilePicture();
const about = await contact.getAbout();
const picUrl = await client.getProfilePicUrl(jid);
```
```typescript
// Baileys
await sock.updateProfileStatus('Hey there!');
await sock.updateProfilePicture(sock.user.id, { url: './photo.jpg' });
const ppUrl = await sock.profilePictureUrl(jid, 'image');
```
```go
// whatsmeow
err := client.SetStatusMessage("Mi estado")
err = client.SetProfilePicture(jid, imagePath)
picUrl, err := client.GetProfilePictureInfo(jid)
```

---

## 6. Block / Unblock

```javascript
// whatsapp-web.js
await contact.block();
await contact.unblock();
const blocked = await client.getBlockedContacts();
```
```typescript
// Baileys
await sock.updateBlockStatus(jid, 'block');
await sock.updateBlockStatus(jid, 'unblock');
const blocklist = await sock.fetchBlocklist();
```
```go
// whatsmeow
err := client.UpdateBlocklist(jid, "block")
blocklist, err := client.GetBlocklist()
```

---

## 7. Mute / Unmute

```javascript
// whatsapp-web.js
await chat.mute();                              // Para siempre
await chat.mute(new Date(Date.now() + 8*3600000)); // 8 horas
await chat.unmute();
```
```typescript
// Baileys
await sock.chatModify({ mute: 8 * 60 * 60 * 1000 }, jid); // 8h
await sock.chatModify({ mute: -1 }, jid);                   // siempre
await sock.chatModify({ mute: null }, jid);                 // unmute
```
```go
// whatsmeow
patch := appstate.BuildMute(jid, true, 8*time.Hour)
err := client.SendAppState(patch)
```

---

## 8. Pin / Unpin

```javascript
// whatsapp-web.js
await chat.pin();
await chat.unpin();
```
```typescript
// Baileys
await sock.chatModify({ pin: true }, jid);
await sock.chatModify({ pin: false }, jid);
```
```go
// whatsmeow
patch := appstate.BuildPin(jid, true)
err := client.SendAppState(patch)
```

---

## 9. Archive / Unarchive

```javascript
// whatsapp-web.js
await chat.archive();
await chat.unarchive();
```
```typescript
// Baileys
await sock.chatModify({ archive: true, lastMessages: [lastMsg] }, jid);
```
```go
// whatsmeow
patch := appstate.BuildArchive(jid, true, ts, key)
err := client.SendAppState(patch)
```

---

## 10. Star / Unstar messages

```javascript
// whatsapp-web.js
await message.star();
await message.unstar();
```
```typescript
// Baileys
await sock.chatModify({
  star: { messages: [{ id: msgId, fromMe: true }], star: true }
}, jid);
```

---

## 11. Delete messages

```javascript
// whatsapp-web.js
await message.delete(true);   // Delete for everyone
await message.delete(false);  // Delete for me only
```
```typescript
// Baileys
await sock.sendMessage(jid, { delete: msg.key });
```
```go
// whatsmeow
err := client.RevokeMessage(chatJID, senderJID, messageID)  // for everyone
```

---

## 12. Forward messages

```javascript
// whatsapp-web.js
await message.forward(targetChatId);
```
```typescript
// Baileys
await sock.sendMessage(jid, { forward: msg });
```
```go
// whatsmeow — set ContextInfo with IsForwarded=true
msg := &waProto.Message{
    ExtendedTextMessage: &waProto.ExtendedTextMessage{
        ContextInfo: &waProto.ContextInfo{
            IsForwarded: proto.Bool(true),
        },
    },
}
```

---

## 13. React (emoji)

```javascript
// whatsapp-web.js
await message.react('👍');
await message.react('');  // Remove reaction
```
```typescript
// Baileys
await sock.sendMessage(jid, { react: { text: '❤️', key: msg.key } });
```
```go
// whatsmeow
err := client.SendReaction(chatJID, senderJID, messageID, "👍")
```

---

## 14. Reply to message

```javascript
// whatsapp-web.js
await message.reply('Mi respuesta', chatId);
```
```typescript
// Baileys
await sock.sendMessage(jid, { text: 'Respuesta' }, { quoted: originalMsg });
```
```go
// whatsmeow — set ContextInfo with StanzaId and Participant
```

---

## 15. Send location

```javascript
// whatsapp-web.js
const loc = new Location(37.7749, -122.4194, { name: 'San Francisco' });
await client.sendMessage(chatId, loc);
```
```typescript
// Baileys
await sock.sendMessage(jid, {
  location: { degreesLatitude: 24.12, degreesLongitude: 55.11 }
});
```

---

## 16. Send contact (vCard)

```typescript
// Baileys
const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Jeff\nTEL;type=CELL:+911234567890\nEND:VCARD';
await sock.sendMessage(jid, {
  contacts: { displayName: 'Jeff', contacts: [{ vcard }] }
});
```

---

## 17. Send polls

```javascript
// whatsapp-web.js
const poll = new Poll('¿Color favorito?', [
  { name: 'Rojo', localId: 0 },
  { name: 'Azul', localId: 1 },
], { allowMultipleAnswers: false });
await client.sendMessage(chatId, poll);
```
```typescript
// Baileys
await sock.sendMessage(jid, {
  poll: { name: '¿Color?', values: ['Rojo', 'Azul'], selectableCount: 1 }
});
```

---

## 18. Change profile picture

```javascript
// whatsapp-web.js
const media = MessageMedia.fromFilePath('./profile.jpg');
await client.setProfilePicture(media);
```
```typescript
// Baileys
await sock.updateProfilePicture(sock.user.id, { url: './photo.jpg' });
```

---

## 19. Set status / about

```javascript
// whatsapp-web.js
await client.setStatus('Available for work');
```
```typescript
// Baileys
await sock.updateProfileStatus('Hey there!');
```
```go
// whatsmeow
err := client.SetStatusMessage("Mi status")
```

---

## 20. Typing indicator

```javascript
// whatsapp-web.js
await chat.sendStateTyping();     // Mostrar "escribiendo..."
await chat.sendStateRecording();  // Mostrar "grabando audio..."
```
```typescript
// Baileys
await sock.sendPresenceUpdate('composing', jid);   // typing
await sock.sendPresenceUpdate('recording', jid);   // recording
await sock.sendPresenceUpdate('paused', jid);      // stop
await sock.sendPresenceUpdate('available');        // online
await sock.sendPresenceUpdate('unavailable');      // offline
```
```go
// whatsmeow
err := client.SendChatPresence(chatJID, "composing")
err = client.SendChatPresence(chatJID, "composing", "audio") // recording
err = client.SendPresence("available")
```

---

## 🛡️ Anti-ban best practices

```javascript
const SAFEGUARDS = {
  minDelay: 3000,        // 3s entre mensajes
  maxPerMinute: 20,
  maxPerHour: 200,
  maxPerDay: 1000,
  typingIndicator: true,
  randomizeDelays: true,
};

// Simular typing antes de enviar
await chat.sendStateTyping();
const delay = message.length * 50; // 50ms por carácter
await new Promise(r => setTimeout(r, delay));
await chat.sendMessage(message);

// Pausa cada 25 mensajes
if (count % 25 === 0) {
  await new Promise(r => setTimeout(r, 120000)); // 2 min
}
```

---

## 🔧 Funciones compuestas (combinando varias operaciones)

### Auto-responder con typing + reply + react
```javascript
client.on('message', async (msg) => {
  if (msg.body === '!hola') {
    const chat = await msg.getChat();
    await chat.sendStateTyping();
    await new Promise(r => setTimeout(r, 2000));
    await msg.react('👋');
    await msg.reply('¡Hola! ¿Cómo estás?');
  }
});
```

### Backup diario + media + stats
```python
# Usando wa_super_toolkit.py
subprocess.run(['python3', 'wa_super_toolkit.py', 'backup'])
subprocess.run(['python3', 'wa_super_toolkit.py', 'download-all', '-c', number, '-o', './media'])
subprocess.run(['python3', 'wa_super_toolkit.py', 'stats'])
```

### Group management automation
```javascript
// Crear grupo, añadir participantes, configurar
const group = await client.createGroup("Equipo", participants);
await group.setDescription("Reglas: ...");
await group.setSubject("Equipo de Trabajo");
const inviteLink = await group.getInviteCode();
console.log(`Link: https://chat.whatsapp.com/${inviteLink}`);
```
