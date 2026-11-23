# Bridge Crossings tracker

One page that shows every participant's progress through the steps of their work (filming reels, editing, and so on).

- One colored bar per person. A full bar is one finished cycle (a reel, an edit...). It then restarts and the counter above it goes up.
- Left: rank and name. Middle: finished cycles and the bar. Right: the next action and its own deadline.
- People are grouped in categories (Filming, Editing...). Each category has its own steps, cycle name and ranking.
- Ranking inside a category: most finished cycles first, then the current bar, then whoever got there first.
- A search box finds a name. When there is more than one category, buttons above the list show one category at a time.
- Everyone with the link sees the same page. Only the admin can change anything.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page (look, admin tools, saving) |
| `logic.js` | Ranking, bar and deadline rules, search, sorting, and every kind of change |
| `data.json` | The saved data: categories, settings, people |
| `test.js` | Tests for the rules. Run `node --test` |

## Look at it without saving anything

- `index.html?demo=1` shows sample people in two categories.
- `index.html?demo=1&admin=1` also lets you try the admin buttons. Nothing is saved.

## Admin

The admin edits on the page itself. Saving writes `data.json` to this repository, so only people who can write to the repository can edit.

1. Open the page, tap **Admin** at the bottom.
2. Create a GitHub token at https://github.com/settings/personal-access-tokens/new. Choose **Only select repositories** and pick this repository. Under **Repository permissions**, set **Contents** to **Read and write**.
3. Paste the token. It stays in that browser only.

What the admin can do:

- **Add person**: name, category, colour and deadline. **Edit** changes them later, moves them to another category (their bar then restarts) or removes them.
- **Mark the next step done** and **Undo**, on each row.
- **Deadline**: every row has its own date field, so each person has their own deadline. Clear the field to remove it. If a category has "days to give for each next step", marking a step done sets the next deadline by itself. With 0 you always set it by hand.
- **Categories**: add, rename, reorder or delete a category, set its steps in order, what a finished cycle is called, and the days per step. A category can be deleted only when nobody is in it, and one category always stays.
- **Settings**: the title, the small line above it and the about text.
- **Sort by** (under the search box, admin only): Rank, Closest deadline, Next step, Name or Waiting longest. Closest deadline puts late ones first and people with no deadline last. Next step groups people who are at the same step. Waiting longest puts people with no progress first, then whoever marked a step the longest time ago. The rank number on each row is always the true rank. The choice is remembered on that device. Everyone else always sees the ranking.
- **Rows stay put while you work**: when you mark a step, rows do not move, even if someone passes someone else. An **Update order** button appears when the real order has changed. Tap it to sort the rows again.

Someone you add as a collaborator on the repository can make their own token and edit too.

A change shows for the admin straight away, and for everyone else after GitHub republishes the page, usually within a minute.

## Data

`data.json` keeps a list of `categories` (each with `steps`, `cycleName`, `cyclePlural`, `defaultDays`) and a list of `people`. Each person has a `categoryId`, finished cycles (`cycles`), the steps done in the current one (`done`) and their own `deadline`.

A file saved by the first version (one list of steps for everyone) opens as a single category called Filming. Nothing is lost, and the next save writes the new format.

Names are shown as plain text.

## Privacy

The repository must be public for GitHub Pages on a free account, so `data.json` is public. Use first names only.
