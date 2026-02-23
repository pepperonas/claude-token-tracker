<p align="center">
  <img src="public/favicon.svg" alt="Claude Token Tracker" width="80" height="80">
</p>

<h1 align="center">Claude Token Tracker</h1>

<p align="center">
  Real-time dashboard for Claude Code token usage, cost analysis, and coding activity tracking.
</p>

<p align="center">
  <a href="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml"><img src="https://github.com/pepperonas/claude-token-tracker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node.js >= 18">
  <img src="https://img.shields.io/badge/version-0.0.2-orange.svg" alt="Version">
  <img src="https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Chart.js-4.x-FF6384?logo=chartdotjs&logoColor=white" alt="Chart.js">
  <img src="https://img.shields.io/badge/Tests-125%20passing-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey" alt="Platform">
  <a href="https://github.com/pepperonas/claude-token-tracker/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>

---

<p align="center">
  <a href="README_DE.md"><img src="https://img.shields.io/badge/%F0%9F%87%A9%F0%9F%87%AA_Deutsch-Dokumentation-black?style=for-the-badge" alt="Deutsch"></a>
  &nbsp;&nbsp;
  <a href="README_EN.md"><img src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7_English-Documentation-black?style=for-the-badge" alt="English"></a>
</p>

---

## Quick Start

```bash
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm install
npm start
```

Open [http://localhost:5010](http://localhost:5010)

## Highlights

- **13 interactive charts** across 8 tabs with real-time SSE updates
- **500 achievements** — gamification system across 12 categories (tokens, sessions, cost, streaks, ...) with 5 tiers
- **Demo mode** — non-logged-in visitors see sample data with a login button to switch to their own
- **Lines of Code tracking** — Write (green), Edit (yellow), Delete (red) with adaptive hourly/daily chart
- **Multi-user mode** — GitHub OAuth, personal API keys, Sync Agent with one-click install
- **Token breakdown** — Input, Output, Cache Read, Cache Create with per-type cost estimation
- **Global period filter** — Today / 7 Days / 30 Days / All Time across all tabs
- **125 automated tests** — unit, integration, and multi-user API tests

## Architecture

```
~/.claude/projects/**/*.jsonl
    -> Parser (incremental byte-offset)
    -> SQLite (WAL mode)
    -> Aggregator (in-memory pre-computed maps)
    -> HTTP Server (20+ JSON endpoints + SSE)
    -> Frontend (Chart.js, vanilla JS, i18n DE/EN)
```

## Links

- **Try it**: [tracker.celox.io](https://tracker.celox.io)
- **Author**: [Martin Pfeffer](https://celox.io) | [GitHub](https://github.com/pepperonas)
- **Donate**: [![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/donate/?business=martinpaush@gmail.com&currency_code=EUR)
- **License**: [MIT](LICENSE)
