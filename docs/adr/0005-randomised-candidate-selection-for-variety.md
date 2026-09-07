# 0005. Model enumerates candidates, we pick the index

**Status:** Superseded by [0004](0004-authored-premise-not-invented-backstory.md).

## Context

With no premise, the opening beat collapsed onto a single answer across runs (see
[0004](0004-authored-premise-not-invented-backstory.md) for the measurements).
Prompt-level prohibition only moved the mode. The problem is that a single sample
from a fixed prompt has low entropy, and no wording fixes that.

## Decision

Put the entropy in the *input* without reintroducing a content pool: ask the
model, in one completion, for six genuinely different answers to "who is this boy,
what is he carrying, why is he underground", then tell it to commit to number *N*
— where the server picks *N* at random per run.

The model invents every candidate; the only thing supplied is which of its own
ideas it has to live with.

## Consequences

This worked. Twelve runs produced eight distinct objects and reasons differing in
kind — a sealed jar, a stolen contract, a summons, a tin soldier, a collar with
orders attached — where the previous version produced twelve identical ones.

It was nonetheless superseded: the project decided the story should not invent a
backstory at all, but grow from the cave. The technique is recorded because the
underlying finding generalises — **enumeration in one completion spreads a
distribution that repeated sampling cannot** — and it is the right tool if
per-run variety is ever needed again.
