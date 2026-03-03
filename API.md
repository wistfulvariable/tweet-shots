# tweet-shots API

A production-ready REST API for generating beautiful tweet screenshots.

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or with auto-reload for development
npm run dev
```

Server runs at `http://localhost:3000` by default.

## Authentication

All API requests require an API key. Include it in one of:
- Header: `X-API-KEY: your-api-key`
- Query param: `?apiKey=your-api-key`

A test key `ts_free_test123` is created automatically on first run.

## Endpoints

### Generate Screenshot

**GET** `/screenshot/:tweetId`

Returns the screenshot as an image (PNG by default).

```bash
curl -H "X-API-KEY: ts_free_test123" \
  "http://localhost:3000/screenshot/1617979122625712128?theme=dark" \
  -o tweet.png
```

Query Parameters:
| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| theme | light, dark, dim, black | dark | Color theme |
| dimension | auto, instagramFeed, instagramStory, tiktok, linkedin, twitter, facebook, youtube | auto | Size preset |
| format | png, svg | png | Output format |
| scale | 1, 2, 3 | 1 | Resolution scale (2x for retina) |
| gradient | sunset, ocean, forest, fire, midnight, sky, candy, peach | - | Background gradient |
| bgColor | Hex color | - | Background color |
| textColor | Hex color | - | Text color |
| linkColor | Hex color | - | Link/mention color |
| hideMetrics | true/false | false | Hide engagement stats |
| hideMedia | true/false | false | Hide images/videos |
| hideDate | true/false | false | Hide timestamp |
| hideVerified | true/false | false | Hide verified badge |
| hideShadow | true/false | false | Hide drop shadow |
| padding | number | 20 | Padding in pixels |
| radius | number | 16 | Border radius |

### Generate Screenshot (POST)

**POST** `/screenshot`

More control with JSON body. Supports different response types.

```bash
# Return base64
curl -X POST -H "X-API-KEY: ts_free_test123" \
  -H "Content-Type: application/json" \
  -d '{
    "tweetId": "1617979122625712128",
    "theme": "dark",
    "gradient": "ocean",
    "response": "base64"
  }' \
  http://localhost:3000/screenshot

# Response:
{
  "success": true,
  "tweetId": "1617979122625712128",
  "author": "karpathy",
  "format": "png",
  "data": "iVBORw0KGgo..."
}
```

Response Types:
- `image` (default) - Returns binary image
- `base64` - Returns JSON with base64-encoded image
- `url` - Returns JSON with URL to saved image (requires PUBLIC_URL config)

### Get Tweet Data

**GET** `/tweet/:tweetId`

Returns raw tweet data as JSON.

```bash
curl -H "X-API-KEY: ts_free_test123" \
  http://localhost:3000/tweet/1617979122625712128
```

## Rate Limits

| Tier | Requests/min |
|------|--------------|
| free | 10 |
| pro | 100 |
| business | 1000 |

## Admin Endpoints

Requires `X-Admin-Key` header (set via `ADMIN_KEY` env var).

### Create API Key

```bash
curl -X POST -H "X-Admin-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "tier": "pro"}' \
  http://localhost:3000/admin/keys
```

### List API Keys

```bash
curl -H "X-Admin-Key: your-admin-key" \
  http://localhost:3000/admin/keys
```

### Revoke API Key

```bash
curl -X DELETE -H "X-Admin-Key: your-admin-key" \
  http://localhost:3000/admin/keys/ts_pro_abc123
```

### Usage Statistics

```bash
curl -H "X-Admin-Key: your-admin-key" \
  http://localhost:3000/admin/usage
```

## Deployment

### Using systemd

```bash
# Copy files
sudo cp -r . /opt/tweet-shots
sudo cp tweet-shots-api.service /etc/systemd/system/

# Edit the service file to set ADMIN_KEY
sudo nano /etc/systemd/system/tweet-shots-api.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable tweet-shots-api
sudo systemctl start tweet-shots-api

# Check status
sudo systemctl status tweet-shots-api
```

### Using Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "api-server.mjs"]
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| HOST | 0.0.0.0 | Bind address |
| ADMIN_KEY | admin-secret-key | Admin authentication key |
| PUBLIC_URL | - | Base URL for image hosting (enables URL response) |
| OUTPUT_DIR | ./output | Directory for saved images |
| API_KEYS_FILE | ./api-keys.json | API keys storage |
| USAGE_FILE | ./usage.json | Usage tracking storage |

## Pricing Ideas

Based on competitor analysis:

| Plan | Price | Credits/mo | Features |
|------|-------|------------|----------|
| Free | $0 | 50 | Basic themes, PNG only |
| Pro | $9/mo | 1,000 | All themes, SVG, gradients |
| Business | $49/mo | 10,000 | Priority support, custom branding |
| Enterprise | Custom | Unlimited | SLA, dedicated support |

## Integration Examples

### JavaScript/Node.js

```javascript
const response = await fetch('https://api.example.com/screenshot', {
  method: 'POST',
  headers: {
    'X-API-KEY': 'your-api-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tweetId: '1617979122625712128',
    theme: 'dark',
    dimension: 'instagramFeed',
    response: 'base64',
  }),
});

const { data } = await response.json();
const imageBuffer = Buffer.from(data, 'base64');
```

### Python

```python
import requests
import base64

response = requests.post(
    'https://api.example.com/screenshot',
    headers={'X-API-KEY': 'your-api-key'},
    json={
        'tweetId': '1617979122625712128',
        'theme': 'dark',
        'response': 'base64',
    }
)

data = response.json()
image_bytes = base64.b64decode(data['data'])
```

### cURL

```bash
curl -X POST \
  -H "X-API-KEY: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"tweetId":"1617979122625712128","theme":"dark"}' \
  https://api.example.com/screenshot \
  -o tweet.png
```
