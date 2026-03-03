/**
 * Tweet data fetching — extract IDs from URLs, fetch tweet data from
 * Twitter's syndication API, and walk threads.
 */

import { AppError } from './src/errors.mjs';

// ============================================================================
// TWEET ID EXTRACTION
// ============================================================================

/**
 * Extract a numeric tweet ID from a URL or raw ID string.
 * @param {string} input - Tweet URL (twitter.com or x.com) or numeric ID
 * @returns {string} The numeric tweet ID
 * @throws {AppError} If the input doesn't contain a valid tweet ID
 */
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

/**
 * Fetch tweet data from Twitter's syndication API.
 * @param {string} tweetId - Numeric tweet ID
 * @returns {Promise<object>} Tweet data object with text, user, entities, etc.
 * @throws {AppError} 404 if not found, 429 if rate limited, 502 for other upstream errors
 */
export async function fetchTweet(tweetId) {
  const token = Math.floor(Math.random() * 1000000);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;

  const response = await fetch(url);

  if (!response.ok) {
    // Map upstream status to appropriate client-facing status:
    // 404 → tweet not found, 429 → rate limited, anything else → bad gateway
    const status = response.status === 404 ? 404 : response.status === 429 ? 429 : 502;
    throw new AppError(`Failed to fetch tweet: ${response.status} ${response.statusText}`, status);
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

/**
 * Fetch a thread (conversation) starting from a tweet.
 * Walks parent chain to find earlier tweets by the same author.
 * @param {string} tweetId - Numeric tweet ID
 * @returns {Promise<object[]>} Array of tweet data objects, oldest first
 * @throws {AppError} If the initial tweet cannot be fetched
 */
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
      } catch (err) {
        // 404 = parent deleted/unavailable — silently end chain
        // Other errors (429, 502) = transient — log so truncation is visible
        if (!(err instanceof AppError && err.statusCode === 404)) {
          console.warn(`Thread walking halted: ${err.message || err}`);
        }
        break;
      }
    }
    tweets.push(...parents);
  }

  tweets.push(initialTweet);

  // Note: Syndication API doesn't expose thread continuation (tweets after this one)
  return tweets;
}
