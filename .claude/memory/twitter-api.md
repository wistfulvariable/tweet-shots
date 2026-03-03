# Twitter Syndication API

## Endpoint

```
GET https://cdn.syndication.twimg.com/tweet-result?id=<tweetId>&token=<random>
```

- `token` is a random integer 0–999999, required in the URL but not validated by Twitter
- No API key or auth required
- Designed for Twitter embed widgets, not official public API

## Response Shape (key fields used)

```json
{
  "text": "Tweet text with t.co URLs",
  "created_at": "ISO timestamp",
  "user": {
    "name": "Display Name",
    "screen_name": "handle",
    "profile_image_url_https": "https://pbs.twimg.com/.../photo_normal.jpg",
    "is_blue_verified": true,
    "verified": false
  },
  "entities": {
    "urls": [{ "url": "https://t.co/xxx", "display_url": "example.com/...", "expanded_url": "..." }],
    "user_mentions": [{ "screen_name": "username" }],
    "hashtags": [{ "text": "hashtag" }],
    "media": [{ "url": "https://t.co/xxx" }]
  },
  "mediaDetails": [{ "media_url_https": "https://pbs.twimg.com/.../photo.jpg", "type": "photo|video" }],
  "photos": [{ "url": "https://pbs.twimg.com/..." }],
  "conversation_count": 12,
  "retweet_count": 34,
  "favorite_count": 567,
  "views_count": 89012,
  "ext_views": { "count": 89012 },
  "quoted_tweet": { /* nested tweet object */ },
  "parent": { "id_str": "1234567890" }
}
```

## Field Notes

- `text` contains raw t.co short URLs for all links and media — strip media URLs before rendering
- Profile image URL ends in `_normal` for 48x48; replace with `_400x400` for higher quality
- `is_blue_verified` = Twitter Blue subscriber checkmark; `verified` = legacy checkmark
- `mediaDetails` is the primary media source; `photos` is a fallback array format
- Videos appear in `mediaDetails` with `type: "video"` but only thumbnail URL is available
- `views_count` may be absent; `ext_views.count` is the fallback
- `parent` field exists when a tweet is a reply; used for thread walking

## Known Limitations

- Private accounts → 404 or empty response
- Deleted tweets → 404 or `{ text: null }`
- Some older tweets (pre-2010) may not be available
- Polls: response has no renderable poll structure
- Thread continuation: `parent.id_str` exists but no forward links
- Rate limits: permissive for embed widget use; unofficial limits unclear

## Error Handling in Code

```js
// tweet-shots.mjs:96-107
const response = await fetch(url);
if (!response.ok) {
  throw new Error(`Failed to fetch tweet: ${response.status} ${response.statusText}`);
}
const data = await response.json();
if (!data.text) {
  throw new Error('Tweet not found or unavailable');
}
```

Both CLI and API server use identical fetch logic with `!data.text` as the availability check.
