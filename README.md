# The Network Tools — Domain Security & SSL CI Action

[![Official Website](https://img.shields.io/badge/Website-thenetworktools.com-286FEC?style=flat-square)](https://thenetworktools.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

Zero-dependency GitHub Action to validate **TLS/SSL certificate expiration**, **DNS records (`A`, `AAAA`, `MX`)**, and **email authentication (`SPF`, `DMARC`)** in CI/CD pipelines—with live audit reports and SVG status badges powered by [The Network Tools](https://thenetworktools.com).

## Quick Usage (No API Key Required)

```yaml
name: Domain Security & SSL Check
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Check domain health
        uses: theankitraj-cmd/thenetworktools-action@v1
        with:
          domain: 'example.com'
          min_ssl_days: '14'
          require: 'A,MX,SPF,DMARC'
```

## Pro CI Gate Mode (`api_key`)

To use the full server-side [CI Gate API](https://thenetworktools.com/docs/api) (`/api/v1/ci` HTTP `200`/`422`), pass your `NTW_API_KEY` secret:

```yaml
      - uses: theankitraj-cmd/thenetworktools-action@v1
        with:
          domain: 'example.com'
          min_ssl_days: '14'
          require: 'A,MX'
          api_key: ${{ secrets.NTW_API_KEY }}
```

## Live Outputs

- `passed` — `'true'` or `'false'`
- `report_url` — `https://thenetworktools.com/report/<domain>`
- `badge_url` — `https://thenetworktools.com/badge/<domain>.svg`

## Related Links

- **Web Diagnostic Suite:** [thenetworktools.com](https://thenetworktools.com)
- **Live SVG Security Badges:** [thenetworktools.com/badge](https://thenetworktools.com/badge)
- **MCP Server for Coding Agents:** [github.com/theankitraj-cmd/thenetworktools-mcp](https://github.com/theankitraj-cmd/thenetworktools-mcp)
