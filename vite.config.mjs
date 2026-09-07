import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { storyPlugin } from './tools/story-plugin.mjs';

export default defineConfig(({ mode }) => {
  // Load .env into process.env for the SERVER side.
  //
  // Vite only exposes VITE_-prefixed vars to client code, and it does not put
  // anything into process.env for plugins at all - so the story middleware
  // cannot see ANTHROPIC_API_KEY without this. The '' prefix loads every var;
  // that is safe precisely because these never reach the bundle (the key is
  // read in tools/story-plugin.mjs, which runs in Node, never in the browser).
  //
  // The parent directory is checked first and the project directory second, so
  // a project-local .env wins - but a key kept one level up still works.
  for (const dir of [path.resolve(process.cwd(), '..'), process.cwd()]) {
    Object.assign(process.env, loadEnv(mode, dir, ''));
  }
  return { plugins: [storyPlugin()] };
});
