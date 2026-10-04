# Contributing

Fork of [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) extended with
extra REST endpoints, phone-code pairing, LID→phone resolution, a Python CLI
(`wa_cli.py`), backup tooling, and Playwright-based Web automation under `toolkit/`.

## How to contribute

1. Fork and branch (`git checkout -b feat/my-change`).
2. Keep the upstream attribution in the README — this is a fork, not a clean-room project.
3. Test the Go bridge (`whatsapp-bridge/`) and the MCP server before PRing:

   ```bash
   cd whatsapp-bridge && go build ./...
   ```

4. Open a PR describing the change and how you tested it.

## Rules

- **No personal data in commits.** Never commit `store/`, `*.db`, exports, backups, phone
  numbers, or real chat content — use placeholder numbers in examples (`+521XXXXXXXXXX`).
- **No credentials.** Session files and `.env` stay local (see `.gitignore`).
- New automation features must include a dry-run or confirm flag where they send messages.
- Keep scripts POSIX-friendly where possible; Python code targets 3.9+.

## Useful first contributions

- Tests for the CLI (`wa_cli.py`).
- Docs/examples for the REST endpoints added by this fork.
- Safer defaults for the automation scripts (rate limiting, confirm prompts).
