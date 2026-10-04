# Security & Responsible Use

This toolkit connects to a **personal WhatsApp account** and stores message data locally.
Treat it with the same care as the account itself.

## What is sensitive

- **Session credentials** under `store/` (whatsmeow session, keys). If leaked, someone can
  impersonate your account. `store/` is in `.gitignore` — never commit it.
- **SQLite message database** (`messages.db`) — contains your real chats, media references
  and contacts. Do not commit, share, or sync it.
- **Chat exports / backups** produced by the backup tooling — same rules.

## Rules

- Never commit `store/`, `*.db`, backups, exports, or `.env` files.
- If session files are ever committed, **log out the session from WhatsApp → Linked Devices**
  immediately, then scrub git history.
- Pair only with the QR/phone-code flow on machines you own.
- Automation scripts under `toolkit/` control real WhatsApp Web — use them on your own
  account only, and respect WhatsApp's terms of service (bulk messaging gets accounts banned).

## MCP / agent usage warning

Like other MCP servers connected to private data, this server is exposed to
[prompt-injection / "lethal trifecta"](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
risk: a malicious message received in WhatsApp could try to instruct an agent to exfiltrate
data. Recommended mitigations:

- Run the agent with a **read-only tool subset** unless you actively need `send_message`.
- Review outbound messages before the agent sends them.
- Do not point the server at other people's chats or groups you administer without consent.

## Reporting

Found a security issue? Open a private GitHub Security Advisory — do not file a public
issue with sensitive details.
