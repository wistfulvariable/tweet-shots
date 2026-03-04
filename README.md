# tweet-shots

Generate beautiful tweet/X screenshots from the command line. No browser automation, no API keys required.

## How it works

1. Fetches tweet data from Twitter's syndication API (the same endpoint that powers embedded tweets)
2. Renders pixel-perfect HTML using [Satori](https://github.com/vercel/satori) (HTML → SVG)
3. Converts to PNG using [Resvg](https://github.com/RazrFalcon/resvg)

**No Puppeteer. No Selenium. No browser.**

## Installation

```bash
git clone https://github.com/wistfulvariable/tweet-shots.git
cd tweet-shots
npm install

# Optional: link globally
npm link
```

## Usage

```bash
# Basic — tweet URL or ID
node tweet-shots.mjs https://x.com/karpathy/status/1617979122625712128
node tweet-shots.mjs 1617979122625712128

# Specify theme
node tweet-shots.mjs <url> -t light

# Custom output path
node tweet-shots.mjs <url> -o my-screenshot.png

# SVG output
node tweet-shots.mjs <url> --svg

# 2× retina resolution
node tweet-shots.mjs <url> --scale 2

# Hide engagement metrics
node tweet-shots.mjs <url> --no-metrics
```

## Options

### Core

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | `tweet-<id>.png` |
| `-t, --theme <theme>` | `light` `dark` `dim` `black` | `dark` |
| `-d, --dimension <preset>` | Canvas size preset (see below) | `auto` |
| `-w, --width <px>` | Width override (overrides dimension) | `550` |
| `--svg` | Output SVG instead of PNG | — |
| `--scale <n>` | Resolution multiplier: `1` `2` `3` | `2` |
| `-j, --json` | Print raw tweet JSON and exit | — |

### Visibility

| Option | Description |
|--------|-------------|
| `--no-metrics` | Hide engagement stats (likes, retweets, views) |
| `--no-media` | Hide images |
| `--no-verified` | Hide verified badge |
| `--no-date` | Hide timestamp |
| `--no-quote` | Hide quoted tweet |
| `--no-shadow` | Hide drop shadow |
| `--show-url` | Show tweet URL at bottom |

### Background

| Option | Description |
|--------|-------------|
| `--bg-color <hex>` | Solid background color (e.g., `#1a1a2e`) |
| `--bg-gradient <name>` | Named gradient: `sunset` `ocean` `forest` `fire` `midnight` `sky` `candy` `peach` |
| `--gradient-from <hex>` | Custom gradient start color (requires `--gradient-to`) |
| `--gradient-to <hex>` | Custom gradient end color |
| `--gradient-angle <deg>` | Gradient angle in degrees (default: `135`) |

### Text & Colors

| Option | Description |
|--------|-------------|
| `--text-color <hex>` | Primary text color |
| `--link-color <hex>` | Link/mention/hashtag color |
| `--padding <px>` | Card padding (default: `20`) |
| `--radius <px>` | Card border radius (default: `16`) |

### Custom Fonts

| Option | Description |
|--------|-------------|
| `--font-family <name>` | Font family name (e.g., `Roboto`) |
| `--font-url <url>` | URL to font file (.ttf, .woff, .otf) |
| `--font-bold-url <url>` | URL to bold font file |

### Watermark / Logo

| Option | Description | Default |
|--------|-------------|---------|
| `--logo <url>` | Logo/watermark image URL | — |
| `--logo-position <pos>` | `top-left` `top-right` `bottom-left` `bottom-right` | `bottom-right` |
| `--logo-size <px>` | Logo size in pixels | `40` |

### Frame

| Option | Description |
|--------|-------------|
| `--frame phone` | Wrap tweet in a phone mockup bezel |

### Thread & Batch

| Option | Description |
|--------|-------------|
| `--thread` | Capture entire thread as separate images |
| `--thread-pdf` | Export thread as a single PDF file |
| `--batch <file>` | Process multiple tweet URLs/IDs from a file (one per line) |
| `--batch-dir <dir>` | Output directory for batch results |
| `--translate <lang>` | Translate tweet text (requires `OPENAI_API_KEY`) |

## Dimension Presets

| Preset | Canvas size | Use case |
|--------|-------------|----------|
| `auto` | 550px wide, auto height | Default tweet card |
| `instagramFeed` | 1080×1080 | Instagram square post |
| `instagramStory` | 1080×1920 | Instagram/TikTok story |
| `instagramVertical` | 1080×1350 | Instagram portrait |
| `tiktok` | 1080×1920 | TikTok video cover |
| `linkedin` | 1200×627 | LinkedIn post |
| `twitter` | 1600×900 | Twitter/X card |
| `facebook` | 1200×630 | Facebook post |
| `youtube` | 1280×720 | YouTube thumbnail |

## Themes

| Theme | Card background |
|-------|----------------|
| `dark` | Twitter dark blue (`#15202b`) |
| `light` | White (`#ffffff`) |
| `dim` | Softer dark (`#1e2732`) |
| `black` | Pure black (`#000000`) |

## Examples

```bash
# Instagram post with ocean gradient
node tweet-shots.mjs <url> -d instagramFeed --bg-gradient ocean

# Phone mockup with custom purple gradient
node tweet-shots.mjs <url> --frame phone --gradient-from '#6c5ce7' --gradient-to '#a29bfe'

# Branded with logo watermark
node tweet-shots.mjs <url> --logo https://example.com/logo.png --logo-position bottom-right

# Thread saved as PDF
node tweet-shots.mjs --thread <url> --thread-pdf -o thread.pdf

# Custom gradient, no shadow, 2× scale
node tweet-shots.mjs <url> --gradient-from '#ff6b6b' --gradient-to '#4ecdc4' --no-shadow --scale 2

# Batch render with dark theme to output dir
node tweet-shots.mjs --batch urls.txt --batch-dir ./output -t dark

# Translate and screenshot
node tweet-shots.mjs <url> --translate es --logo https://example.com/logo.png
```

## Features

- Multi-image grid (1–4 photos rendered in responsive layouts)
- Thread rendering (walk parent chain, render as separate images or PDF)
- Phone mockup frame
- Custom gradient colors
- Named gradient presets
- Custom canvas dimensions for social media formats
- Logo/watermark overlay
- Custom font loading
- 4 color themes
- Multilingual text support (Arabic, Hebrew, Japanese, Korean, Chinese, Thai, and more)
- Emoji rendering via Twemoji
- Quote tweets rendered inline
- Verified badge

## Limitations

- Private and deleted tweets are unavailable via the syndication API
- Videos render as static thumbnail images
- Polls are not supported

## REST API

This project also ships a production REST API with tiered auth, rate limiting, and Stripe billing. See [API.md](API.md) for the full reference.

```bash
npm start  # http://localhost:3000
```

## Dependencies

- [satori](https://github.com/vercel/satori) — HTML/CSS to SVG
- [@resvg/resvg-js](https://github.com/nickshanks/resvg-js) — SVG to PNG
- [satori-html](https://github.com/natemoo-re/satori-html) — HTML string to Satori VDOM
- [express](https://expressjs.com/) — REST API server
- [zod](https://zod.dev/) — request validation
- [stripe](https://stripe.com/docs/api) — billing integration

## License

MIT
