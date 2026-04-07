# IBKR Session Keep-Alive

Tampermonkey userscript that keeps your Interactive Brokers Client Portal session alive.

## What it does

- POSTs to `/tickle` every 55 seconds to prevent session timeout
- Validates authentication status every 5 minutes
- Shows a small badge in the bottom-right corner with status (click to force refresh)

## Install

1. Install Tampermonkey browser extension
2. Open Tampermonkey dashboard
3. Click "Create a new script"
4. Paste the contents of `ibkr-keepalive.user.js`
5. Save

## Supported domains

- interactivebrokers.ie
- interactivebrokers.com
- ndcdyn.interactivebrokers.com
- localhost:5000 (Client Portal Gateway)
