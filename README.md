# tweet-shots 📸

Generate beautiful tweet/X screenshots from the command line. No browser automation, no API keys required.

![Example output](https://raw.githubusercontent.com/wistfulvariable/tweet-shots/main/examples/dark.png)

## How it works

1. Fetches tweet data from Twitter's syndication API (the same endpoint that powers embedded tweets)
2. Renders pixel-perfect HTML using [Satori](https://github.com/vercel/satori) (JSX → SVG)
3. Converts to PNG using [Resvg](https://github.com/RazrFalcon/resvg)

**No Puppeteer. No Selenium. No browser.**

## Installation

```bash
# Clone the repo
git clone https://github.com/wistfulvariable/tweet-shots.git
cd tweet-shots

# Install dependencies
npm install

# Optional: link globally
npm link
```

## Usage

```bash
# Basic usage - pass a tweet URL or ID
./tweet-shots.mjs https://x.com/karpathy/status/1617979122625712128
./tweet-shots.mjs 1617979122625712128

# Specify theme
./tweet-shots.mjs <url> -t light

# Custom output path
./tweet-shots.mjs <url> -o my-screenshot.png

# Output SVG instead of PNG
./tweet-shots.mjs <url> --svg

# Hide engagement metrics
./tweet-shots.mjs <url> --no-metrics

# Get raw JSON data
./tweet-shots.mjs <url> -j
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | `tweet-<id>.png` |
| `-t, --theme <theme>` | Theme: `light`, `dark`, `dim`, `black` | `dark` |
| `-w, --width <px>` | Width in pixels | `550` |
| `--no-metrics` | Hide engagement metrics | `false` |
| `--svg` | Output SVG instead of PNG | `false` |
| `-j, --json` | Output tweet JSON data only | `false` |

## Themes

| Theme | Background |
|-------|------------|
| `dark` | Twitter dark blue (#15202b) |
| `light` | White (#ffffff) |
| `dim` | Softer dark (#1e2732) |
| `black` | Pure black (#000000) |

## Features

- ✅ Profile pictures
- ✅ Verified/blue check badges
- ✅ Embedded photos
- ✅ @mentions (highlighted in blue)
- ✅ #hashtags (highlighted in blue)
- ✅ Links (highlighted in blue)
- ✅ Engagement metrics (replies, retweets, likes, views)
- ✅ Timestamps
- ✅ Multiple themes

## Limitations

- Some tweets may not be available via the syndication API (private accounts, deleted tweets, etc.)
- Videos are rendered as static thumbnail images
- ✅ Quote tweets (rendered inline)
- Polls are not yet supported

## Rate Limiting

The syndication API is designed for embed widgets and is quite permissive. For personal use, you're unlikely to hit any limits. If building a service:

- Cache tweet data (tweets rarely change)
- Add delays between batch requests
- Consider using a proxy pool for high volume

## Dependencies

- [satori](https://github.com/vercel/satori) - HTML/CSS to SVG
- [@resvg/resvg-js](https://github.com/nickshanks/resvg-js) - SVG to PNG
- [satori-html](https://github.com/natemoo-re/satori-html) - HTML string to Satori-compatible VDOM

## License

MIT

## Credits

Inspired by [TwitterShots](https://twittershots.com/). Built with [Satori](https://github.com/vercel/satori) by Vercel.
