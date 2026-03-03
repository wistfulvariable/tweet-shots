/**
 * Tweet data fetching — extract IDs from URLs, fetch tweet data from
 * Twitter's syndication API, and walk threads.
 */

import { AppError } from './src/errors.mjs';

// ============================================================================
// TWEET ID EXTRACTION
// ============================================================================

export function extractTweetId(input) {
  // Handle direct ID
  if (/^\d+$/.test(input)) {
    return input;
  }

  // Handle URLs like:
  // https://twitter.com/user/status/123456789
  // https://x.com/user/status/123456789
  const match = input.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  if (match) {
    return match[1];
  }

  throw new AppError(`Could not extract tweet ID from: ${input}`);
}

// ============================================================================
// TWEET DATA FETCHING
// ============================================================================

export async function fetchTweet(tweetId) {
  const token = Math.floor(Math.random() * 1000000);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new AppError(`Failed to fetch tweet: ${response.status} ${response.statusText}`, 404);
  }

  const data = await response.json();

  if (!data.text) {
    throw new AppError('Tweet not found or unavailable', 404);
  }

  return data;
}

// ============================================================================
// THREAD WALKING
// ============================================================================

// Fetch a thread (conversation) starting from a tweet
export async function fetchThread(tweetId) {
  const tweets = [];

  // First, get the initial tweet
  const initialTweet = await fetchTweet(tweetId);

  // Check if this tweet is part of a thread (has parent)
  if (initialTweet.parent) {
    // Walk up to find the thread start
    const parents = [];
    let parentTweet = initialTweet;
    while (parentTweet.parent) {
      try {
        const parent = await fetchTweet(parentTweet.parent.id_str);
        // Only include if same author (thread vs reply)
        if (parent.user?.screen_name === initialTweet.user?.screen_name) {
          parents.unshift(parent);
          parentTweet = parent;
        } else {
          break;
        }
      } catch {
        break;
      }
    }
    tweets.push(...parents);
  }

  tweets.push(initialTweet);

  // Note: Syndication API doesn't expose thread continuation (tweets after this one)
  return tweets;
}
