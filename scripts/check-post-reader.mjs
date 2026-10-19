import assert from 'node:assert/strict';
import { parsePostUrl, readPostThread } from '../src/post-reader.js';
import { generateLocal, countText } from '../src/generator.js';

const url = process.env.TEST_POST_URL;
if (!url) throw new Error('TEST_POST_URL must be a public X post URL.');
const parsed = parsePostUrl(url);
let cors;
const result = await readPostThread(url, {
  fetcher: async (endpoint, options) => {
    const response = await fetch(endpoint, options);
    cors = response.headers.get('access-control-allow-origin');
    return response;
  },
});
assert.ok(result.posts.length > 0);
assert.ok(result.posts.some(post => post.id === parsed.id));
assert.ok(result.body.length > 0);
assert.ok(['*', 'https://kajihrt1022.github.io'].includes(cors), `CORS must allow the published app, got ${cors}`);
const drafts = generateLocal({ post: result.body, length: 'medium', directions: ['insight', 'action', 'question'] });
assert.equal(drafts.replies.length, 3);
assert.ok(drafts.replies.every(reply => reply.text && countText(reply.text) <= 200));
assert.match(drafts.replies[2].text, /？/);
const summary = `Live reader passed: target=${parsed.id}; posts=${result.posts.length}; characters=${result.body.length}; first=${result.posts[0].id}; last=${result.posts.at(-1).id}; partial=${result.partial}; author=@${result.author.handle}; CORS=${cors}; drafts=3`;
console.log(summary);
if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Reply Craft live reader::${summary}`);
