# Twitter Syndication API

## Endpoint

```
GET https://cdn.syndication.twimg.com/tweet-result?id=<tweetId>&token=<random>
```

- `token` is a random integer 0-999999, required but not validated by Twitter
- No API key or auth required
- Designed for Twitter embed widgets, not official public API

## Response Shape (key fields)

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
    "urls": [{ "url": "https://t.co/xxx", "display_url": "...", "expanded_url": "..." }],
    "user_mentions": [{ "screen_name": "username" }],
    "hashtags": [{ "text": "hashtag" }],
    "media": [{ "url": "https://t.co/xxx" }]
  },
  "mediaDetails": [{ "media_url_https": "https://pbs.twimg.com/...", "type": "photo|video" }],
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

- `text` contains raw t.co short URLs — strip `entities.media` URLs before rendering
- Profile image: replace `_normal` with `_400x400` for high-res
- `is_blue_verified` = Twitter Blue; `verified` = legacy checkmark
- `mediaDetails` is primary media source; `photos` is fallback
- Videos: only thumbnail URL available (`type: "video"`)
- `views_count` may be absent; `ext_views.count` is fallback
- `parent.id_str` exists on replies — used for thread walking

## Known Limitations

- Private accounts → 404 or empty response
- Deleted tweets → 404 or `{ text: null }`
- Some older tweets (pre-2010) may not be available
- Polls: no renderable structure in response
- Thread: `parent.id_str` for backward walk only, no forward links
- Rate limits: permissive but unofficial limits unclear

## Error Handling (core.mjs)

```js
if (!response.ok) throw new Error(`Failed to fetch tweet: ${response.status}`);
if (!data.text) throw new Error('Tweet not found or unavailable');
```

Both CLI and API use `fetchTweet()` from `core.mjs` with `!data.text` as availability check.
