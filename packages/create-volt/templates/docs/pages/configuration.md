---
title: Configuration
description: Everything is environment variables.
---
# Configuration

Volt is configured entirely with environment variables (no config-in-database):

- `SITE_NAME` — shown in the sidebar.
- `VOLT_ADDONS` — which features are on (here: `pages`).
- `THEME` — a published `volt-theme-*`, or use the local `pages/_theme.js`.

In dev these live in `.env`; in production set them as platform env vars.
