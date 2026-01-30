# On Hold Items

Tasks to be implemented later.

---

## 1. WhatsApp Session Storage in Database

**Status:** On Hold
**Added:** 2026-01-30

**Current:** WhatsApp sessions stored in `.wwebjs_auth/` folder (plain files)

**Planned:**
- Store WhatsApp session in database (encrypted) instead of files
- Auto-reconnect on server startup (like Telegram)
- Show "Connected ✓" status in channel list

**Considerations:**
- WhatsApp session is large (5-50MB vs Telegram's 1-2KB)
- Options:
  1. Full DB storage with compression (gzip before encrypt)
  2. Hybrid: encrypted files + DB metadata
- Need to use LONGTEXT column or compression

**Files to modify:**
- `server/src/services/whatsapp.service.js` - Custom RemoteAuth store
- `server/src/routes/channels.js` - Save/load session from DB
- `server/src/index.js` - Add `autoReconnectWhatsAppChannels()`
- `client/src/components/channels/WhatsAppWebConnect.jsx` - Show connected status

---
