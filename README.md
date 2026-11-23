# Bridge Crossings tracker

One page that shows every participant's progress through the steps of a reel.

- One colored bar per person. A full bar is one finished cycle (a reel). It then restarts and the counter above it goes up.
- Left: rank and name. Middle: finished reels and the bar. Right: the next action and its deadline.
- Ranking: most finished reels first, then the current bar, then whoever got there first.
- Everyone with the link sees the same page. Only the admin can change anything.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page (look, admin tools, saving) |
| `logic.js` | Ranking, bar and deadline rules, and every kind of change |
| `data.json` | The saved data: steps, settings, people |
| `test.js` | Tests for the rules. Run `node --test` |

## Look at it without saving anything

- `index.html?demo=1` shows sample people.
- `index.html?demo=1&admin=1` also lets you try the admin buttons. Nothing is saved.

## Admin

The admin edits on the page itself. Saving writes `data.json` to this repository, so only people who can write to the repository can edit.

1. Open the page, tap **Admin** at the bottom.
2. Create a GitHub token at https://github.com/settings/personal-access-tokens/new. Choose **Only select repositories** and pick this repository. Under **Repository permissions**, set **Contents** to **Read and write**.
3. Paste the token. It stays in that browser only.

What the admin can do: add and remove people, change colors, mark the next step done, undo, set deadlines, change the steps, the name of a finished cycle (reel, video...), the title and the about text.

Someone you add as a collaborator on the repository can make their own token and edit too.

A change shows for the admin straight away, and for everyone else after GitHub republishes the page, usually within a minute.

## Data

`data.json` keeps `steps` (in order), and for each person the finished cycles (`cycles`) and the steps done in the current one (`done`). Names are shown as plain text.

## Privacy

The repository must be public for GitHub Pages on a free account, so `data.json` is public. Use first names only.
