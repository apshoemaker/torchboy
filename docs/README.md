# Documentation

The agent-facing table of contents is [`AGENTS.md`](../AGENTS.md) at the repo
root (`CLAUDE.md` is a symlink to it). This directory is what it points at.

## Start here

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — bird's eye view, code map,
  architecture invariants, cross-cutting concerns. Read this before any change
  that spans more than one file.

## Working in the repo

- **[SETUP.md](SETUP.md)** — toolchain, optional credentials, Blender, and what
  to do when something does not start.
- **[WORKFLOWS.md](WORKFLOWS.md)** — how to make a change and how to know it
  worked. Includes the browser-driven verification pattern and the two ways a
  measurement can lie to you.
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — the container: what is in the image, why
  it is a Node server rather than nginx, and the dependency rule it enforces.

## Systems

Deep dives, each owning one area end to end:

- **[systems/STORY.md](systems/STORY.md)** — the story Claude writes while you
  play: the fixed premise, the continuity rules, and why prohibitions did not
  work.
- **[systems/AUDIO.md](systems/AUDIO.md)** — the generated score and the
  physically-modelled choir, with the measurements that define "correct".
- **[systems/RENDERING.md](systems/RENDERING.md)** — a carried light and an
  orthographic camera, and everything that follows from those two facts.
- **[systems/ASSETS.md](systems/ASSETS.md)** — the Blender pipeline, the bmesh
  rule that matters most, and what is deliberately no longer built.

## How this was built

- **[HOW-THIS-WAS-BUILT.md](HOW-THIS-WAS-BUILT.md)** — the whole thing was built
  in a conversation with Claude Code. Which tools did which work, when, why, and
  the four lessons that cost the most.
- **[transcript/](transcript/)** — the full session, one chapter per prompt.

## Decisions

- **[adr/](adr/)** — why the load-bearing choices were made. Check here before
  reversing something that looks arbitrary.

## Media

`media/` holds the hero image and the clips used by the README. See
[WORKFLOWS.md](WORKFLOWS.md#recording-media-for-the-readme) if you re-record
them.
