/**
 * Vite middleware that writes Torchboy's story WHILE it is being played.
 *
 * One endpoint: POST /api/story/next. The client sends everything told so far
 * plus a log of what has just happened in the cave, and gets back the next
 * beat, or a knowledge/response pair for a discovery, or the ending.
 *
 * This lives server-side for one reason: an Anthropic API key must never reach
 * the browser. Anything in `src/` is shipped to the client and readable in
 * devtools, so the key stays here and the game only ever sees finished prose.
 *
 * The premise is FIXED and authored (see PREMISE below) - the boy, the cave,
 * the torch, the darkness in his heart, the light he is climbing toward. What
 * the model does NOT do is invent a backstory: no lost relatives, no keepsakes,
 * no companions. Everything past the premise has to grow out of what actually
 * happened in the cave - where he went, what he saw, what the dark told him.
 *
 * Mounted on both the dev server and `vite preview`. Without credentials it
 * returns 503 and the game falls back to written beats - the story is a
 * flourish and must never be why the game fails to start.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

// Sonnet 5 by default: short creative prose, not hard reasoning, and about a
// third of Opus per run. Override with STORY_MODEL / STORY_EFFORT in .env.
const MODEL = process.env.STORY_MODEL || 'claude-sonnet-5';
const EFFORT = process.env.STORY_EFFORT || 'low';

const BEAT_SCHEMA = z.object({ text: z.string() });
const REVELATION_SCHEMA = z.object({
  knowledge: z.string(), // what the dark knows. Not about him.
  response: z.string(), // what knowing it does to him, right now.
});

const PREMISE =
  `Torchboy finds himself in a deep dark cave. He knows that his torch can ` +
  `help find secret passages, and that there must be some way to make his ` +
  `torch work better. He has a darkness in his heart that he does not ` +
  `understand, but he knows that he has to get out of this cave and go into ` +
  `the light.`;

const SYSTEM = `You are writing TORCHBOY's story one beat at a time, while it is being played.

THE PREMISE - this is fixed, it is where every telling starts, and it is the
only thing you may treat as already true:
${PREMISE}

The world:
- A small boy carrying a torch, alone, deep underground.
- He is CLIMBING toward the surface through three caverns.
- His torch stirs and cools toward blue-white when a hidden way in the rock is
  near; it is how he finds passages that look like solid stone.
- Embers lie in the dark. Gathering them widens what the torch can feel - this
  is the way of making the torch work better that he suspects exists.
- A cavern does not let him climb until he has opened every way hidden in it.
- When he opens a sealed way, something ancient rises out of the floor and
  enters him, and he knows a thing he has no business knowing.
- Something is wrong down here, and was wrong before he came.

What you must NOT invent: a family, a person he lost, a companion, an animal, a
keepsake or trinket he carries, a job he was sent to do, a life above the
ground. He does not remember how he got here and there is nobody with him. If
you find yourself writing a name of someone he knew, or an object in his
pocket, stop and write about the cave instead.

The story is made from THREE things and nothing else:
1. The darkness in his heart - unexplained at the start, and the thing the
   whole story is slowly finding out. It should get harder to look at, not
   easier, and it should turn out to have something to do with this place.
2. What he actually does and sees down here: the walking, the dark, the cold,
   the passages, the embers, the crystal, what the old miners left.
3. The ancient knowledge that enters him, which is not his and does not care
   about him, and which he cannot un-know.

The light above is what he wants. Keep wanting it - and let the reader start to
wonder, without being told, whether the light will have him.

You will be given THE STORY SO FAR and WHAT JUST HAPPENED. Write what comes next.

Absolute rules:
- CONTINUE. Never restate, never summarise, never start over. If something has
  been established, it stays established and it recurs.
- What just happened in the cave must be visible in what you write, but obliquely
  - never narrate the mechanics. "He opened a sealed way" becomes something he
  thinks or dreads or now understands, not a report of opening a door.
- One or two sentences. Under 170 characters. Close third person, past tense.
- No dialogue, no quotation marks. Never address the player. Never use the words
  "player", "level", or "game". Do not name the caverns. Do not describe how he
  looks - the player is watching him.
- DARK: dread and wanting, not gore. The reader should arrive at the worst of it
  themselves.
- By the end this must have been ONE story with a cause and a consequence, not a
  string of moods. Every beat should make the next one more inevitable.`;

async function continueStory(client, body, res) {
  const { told = [], events = [], want = 'beat', summary = '' } = body;

  const story = told.length
    ? told.map((t, i) => `${i + 1}. [${t.kind}] ${t.text}`).join('\n')
    : '(nothing yet - this is the opening beat, and everything is open)';
  const happened = events.length
    ? events.map((e) => `- ${e}`).join('\n')
    : '- he is walking, and nothing in particular has happened';

  const wantsRevelation = want === 'revelation';
  const opening = want === 'beat' && told.length === 0;

  const ask = opening
    ? `This is the OPENING beat. Put the reader inside the premise: the dark, ` +
      `the torch he is learning to read, the way out he cannot see yet, and ` +
      `the darkness in him that he has no name for. Establish the wanting, ` +
      `not a backstory - do not explain how he got here, because he does not ` +
      `know. Leave the darkness in his heart unexplained; it is what the rest ` +
      `of the story is for.`
    : wantsRevelation
      ? `He has just opened a sealed way. Something ancient has entered him.\n\n` +
        `Write TWO things:\n` +
        `  knowledge - what he now knows. Cold and formal, older than the miners, ` +
        `never about him, never in his voice. Under 120 characters. It should ` +
        `unsettle, and it should fit what the story has already established.\n` +
        `  response - what knowing it does to him, right now. Present tense, under ` +
        `120 characters. This must MOVE his story: cost him something, or change ` +
        `what he thought he was doing down here.`
      : want === 'ending'
        ? `This is the END. He has reached the daylight and is walking into it.\n` +
          `Write the last two or three sentences of his story. Land the arc that has ` +
          `been building: what he did, what it cost, and what he is walking into. Do ` +
          `not be consoling if the story has not earned it. Under 320 characters.`
        : `Write the next beat.`;

  const t0 = Date.now();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: {
      format: zodOutputFormat(
        wantsRevelation ? REVELATION_SCHEMA : BEAT_SCHEMA,
      ),
      effort: EFFORT, // short continuations; low keeps them quick in-play
    },
    messages: [
      {
        role: 'user',
        content:
          `THE STORY SO FAR:\n${story}\n\n` +
          `WHERE HE IS: ${summary}\n\n` +
          `WHAT JUST HAPPENED:\n${happened}\n\n${ask}`,
      },
    ],
  });

  const out = response.parsed_output;
  if (!out) throw new Error('no parsed output');
  res.end(
    JSON.stringify({ ...out, ms: Date.now() - t0, usage: response.usage }),
  );
}

/**
 * The request handler on its own, so it can be mounted by something that is not
 * Vite. `vite dev` and `vite preview` get it through the plugin below; the
 * container runs it under `server.mjs`. One implementation either way - the
 * alternative was a second copy of this logic that would drift.
 *
 * Signature is connect-style `(req, res, next)`: anything that is not
 * /api/story is passed straight through.
 */
export function createStoryHandler() {
  let client = null;
  let clientError = null;
  try {
    // Zero-arg constructor: resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
    // or an `ant auth login` profile, in that order.
    //
    // An org-level key (one not scoped to a single workspace) is rejected with
    // a 400 unless the request names a workspace, so pass one through when it
    // is configured. Workspace-scoped keys need nothing here.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic(
      workspace
        ? { defaultHeaders: { 'anthropic-workspace-id': workspace } }
        : {},
    );
  } catch (e) {
    clientError = e.message;
  }

  const readBody = (req) =>
    new Promise((resolve) => {
      let d = '';
      req.on('data', (c) => {
        d += c;
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(d || '{}'));
        } catch {
          resolve({});
        }
      });
    });

  const handler = async (req, res, next) => {
    if (!req.url.startsWith('/api/story')) return next();
    res.setHeader('Content-Type', 'application/json');

    if (!client) {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          error: 'no Anthropic credentials',
          detail: clientError,
        }),
      );
      return;
    }
    if (!req.url.startsWith('/api/story/next')) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'use POST /api/story/next' }));
      return;
    }

    try {
      await continueStory(client, await readBody(req), res);
    } catch (e) {
      // Typed SDK errors, most specific first. Note the SDK resolves auth
      // lazily at call time, not in the constructor, so "no credentials
      // configured" surfaces here rather than at startup.
      let status = 502,
        label = 'generation failed';
      if (/Could not resolve authentication/i.test(e.message)) {
        status = 503;
        label =
          'no Anthropic credentials - set ANTHROPIC_API_KEY or run `ant auth login`';
      } else if (/not scoped to a workspace/i.test(e.message)) {
        status = 400;
        label =
          'org-level key needs a workspace - set ANTHROPIC_WORKSPACE_ID in .env ' +
          '(Console -> Settings -> Workspaces), or use a workspace-scoped key';
      } else if (e instanceof Anthropic.AuthenticationError) {
        status = 401;
        label = 'bad credentials';
      } else if (e instanceof Anthropic.RateLimitError) {
        status = 429;
        label = 'rate limited';
      } else if (e instanceof Anthropic.APIError) {
        label = `api error ${e.status}`;
      }
      console.warn(`[story] ${label}: ${e.message}`);
      // Not a race: `res` is this request's own object and this handler is its
      // only writer. The rule cannot see that, and flags every Node handler
      // that assigns to a response after an await.
      // eslint-disable-next-line require-atomic-updates
      res.statusCode = status;
      res.end(JSON.stringify({ error: label, detail: e.message }));
    }
  };

  return handler;
}

/** Vite plugin wrapper: same handler, mounted on dev and on preview. */
export function storyPlugin() {
  const handler = createStoryHandler();
  return {
    name: 'torchboy-story',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
