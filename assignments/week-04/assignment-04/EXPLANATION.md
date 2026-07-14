# Assignment 04 — Explanation

> **What this file is:** a plain-English walkthrough of what was built and _why_ —
> written so that someone with no programming background can follow it.
>
> **How it differs from [`README.md`](README.md):** the README tells you how to run the
> thing and what the output looks like. This file explains what a scraper actually is,
> why so much of the code is about _restraint_ rather than speed, the bugs I hit, and
> how I proved it works.

---

## 1. What the task was

Write a program that visits an online bookshop, reads all the book pages, and turns
them into a clean spreadsheet-like file of book data.

The site is [books.toscrape.com](https://books.toscrape.com) — a fake bookshop that
exists specifically so people can practise this. But the instruction was to treat it
like a real website with real rules, and that instruction is the entire assignment.

---

## 2. What a web scraper is

When you open a web page, your browser asks a computer somewhere for that page, and
that computer sends back a document. The document isn't the neat page you see — it's
raw text full of formatting instructions. Something like this:

```html
<h1>A Light in the Attic</h1>
<p class="price_color">£51.77</p>
<p class="star-rating Three">…</p>
```

Your browser reads that and draws a nice page. A **scraper** skips the drawing part.
It asks for the same document, digs through it for the bits it cares about — the
title, the price, the rating — and writes them down in an organised way.

That's it. A scraper is a program that reads web pages the way a very fast, very
literal-minded person with a clipboard would.

**Why bother?** Because 1,000 book pages read by hand is a week of tedium. Read by a
program, it's three minutes. And once the data is organised, you can do things with
it — which is exactly what the next assignment does.

---

## 3. The actual hard part: not being a nuisance

Here's the thing nobody tells you about scrapers. Writing one that _works_ takes about
an hour. Writing one that a website owner wouldn't want to block takes considerably
longer, and that's most of the code in this folder.

**The problem is asymmetry.** Every page you request costs the website a little bit of
money and a little bit of computing power. For a human clicking around, that's
nothing — you can maybe open a page every few seconds. But a program can ask for
pages _thousands of times faster than a human can_. A scraper written carelessly, left
running, is genuinely indistinguishable from an attack. Not metaphorically — the
website falls over in exactly the same way, and the site owner's only defence is to
block you.

So the scraper follows a set of rules that amount to: **behave like a considerate
guest.** Here is each one, in plain English.

### Rule 1: Read the house rules first (`robots.txt`)

Websites can publish a file called `robots.txt` — a plain-text notice pinned to the
front door that says which parts of the site automated programs may and may not visit.
It's the web's honour system. Nothing forces you to obey it. Everybody reputable does.

So the **very first thing** this scraper does, before it looks at a single book, is ask
for that file and read it.

> **The twist:** `books.toscrape.com` doesn't have one. Asking for `robots.txt` comes
> back with "404 — not found".
>
> The convention is that no rules means no restrictions, so the scraper proceeds. But I
> made it **announce that out loud** in its final report, rather than silently assuming
> it had permission. There's a real difference between "I checked, and there are no
> rules" and "I didn't check."
>
> And there's a third case I handled separately: if asking for the rules **fails** — the
> site is broken, or times out — the scraper **refuses to crawl at all**. A missing
> rulebook means "go ahead". An _unreadable_ rulebook means "you don't know what you're
> allowed to do", and the right response to that is to stop.

### Rule 2: Wear a name badge (the User-Agent)

Every request a program makes can carry a short label saying who's asking. This one
says:

```
TadScraperBot/1.0 (+contact: marepalt@tcd.ie; practice project)
```

If the site owner looks at their logs and wonders who's been visiting, they can see
exactly what this is and email the person responsible. An anonymous bot is an
unaccountable bot — and unaccountable bots are the ones that get blocked on sight.

### Rule 3: Go slowly, on purpose

The scraper waits **1.5 seconds between every single request**. It could go a thousand
times faster. It deliberately doesn't.

There's a subtlety here worth pointing out. On top of the 1.5 seconds, it adds a small
random extra wait — up to 0.4 more seconds. This is called **jitter**, and the reason
is oddly human: a perfectly regular _tick… tick… tick…_ every 1.5 seconds is an
obvious machine signature, and if several copies of a program ever failed at the same
moment, they'd all come back at the _same_ moment too — a second stampede on top of
the first. The randomness spreads them out.

Crucially, the random extra is always **added**, never subtracted. So 1.5 seconds is a
floor, not an average. Politeness that averages out isn't politeness.

### Rule 4: One at a time

The program could open many connections at once and fetch twenty books simultaneously.
It doesn't. It does one thing, finishes it, then does the next. The option to use more
exists, and it's capped at three, and the default is one.

Consider the arithmetic: the entire site is 1,000 books. At 1.5 seconds each, that's 25
minutes. **Nobody is waiting on this.** There is no reason to rush that's worth being
rude for.

### Rule 5: Know the difference between kinds of failure

When a request fails, most programs just try again. But _why_ it failed matters enormously:

| What went wrong                        | What this scraper does                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"404 — that page doesn't exist"**    | **Gives up immediately.** The page isn't there. Asking three more times won't conjure it into existence — it just wastes the site's effort and clutters their error logs.                                                                                                       |
| **"429 — you're going too fast"**      | **Backs off three times harder than usual.** The site is explicitly asking for space; the correct response is to give it _more_ than you think you need. And if it says exactly how long to wait, that instruction overrides anything the scraper would have chosen for itself. |
| **"503 — I'm overloaded"**             | Same. The site is struggling. Hammering a struggling server is how you turn a slow site into a dead one.                                                                                                                                                                        |
| **"500 — something broke"** / timeouts | Waits 1 second, tries again. Then 2 seconds. Then 4. (This doubling is called **exponential backoff**.) Gives up after 3 tries.                                                                                                                                                 |

That first row is the one people get wrong. Retrying a 404 is the scraper equivalent of
knocking on a door that has no house behind it, repeatedly, harder.

### Rule 6: Never ask twice for the same thing (the cache)

Every page the scraper fetches, it also saves to disk. If it's ever asked for that page
again, it reads its own saved copy instead of bothering the website.

This one isn't just theoretical politeness — it's the reason this assignment was
possible to _build_. I ran this program dozens of times while developing it. Without the
cache, that would have been dozens of rounds of traffic at a website that owes me
nothing. With it, the first run cost them 101 requests and every run after that cost
them **zero**.

You can see this in the run summary: `Served from cache: 4 (cost the site nothing)`.

---

## 4. How the program is organised

The work happens in four steps, and each step lives in its own file. The order is:

```
   fetch    →    parse    →    clean    →    structure
 get the       find the      tidy the      write the
   page          bits          bits          file
```

| File        | Its one job                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `fetch.py`  | Get pages off the internet. **The only file allowed to touch the network.** |
| `parse.py`  | Dig through the raw page and find the interesting bits. Changes nothing.    |
| `clean.py`  | Tidy those bits up and check they make sense. Never touches the internet.   |
| `models.py` | Describes the _shape_ of a book record. The contract everything else obeys. |
| `main.py`   | The boss. Calls the others in order and reports on what happened.           |
| `config.py` | Every adjustable setting, in one place, so you never go hunting.            |

### Why `parse` and `clean` are separate files

This looks like unnecessary bureaucracy. It isn't, and here's the reason.

`parse.py` pulls the string `"£51.77"` off the page. `clean.py` turns that into the
number `51.77`.

Those are two genuinely different jobs, and — this is the point — they **break for two
genuinely different reasons**:

- If the bookshop **redesigns its website**, `parse.py` breaks. It's looking in the
  wrong place.
- If the bookshop's **data goes weird** (a price of "Free!", a rating of "Eleven"),
  `clean.py` breaks. It found the thing; the thing made no sense.

If those lived in one file, every bug would leave you asking "is this a _finding_
problem or an _understanding_ problem?" Split apart, the failure tells you which.

There's a practical bonus too. Because `clean.py` never touches the internet — it just
takes text in and gives values out — it can be tested exhaustively, instantly, offline.
And cleaning is where the messiest logic lives. That's not a coincidence; I split them
that way _so that_ the messiest logic would be the easiest to test.

### "Drop it, don't guess"

One rule runs through all of this: **a record is either clean, or it's thrown away with
a stated reason.** There's no such thing as a half-parsed book.

If a book has no title, or no price, it gets dropped and the reason is recorded. It does
**not** get saved with a price of `0`, or a title of `"Unknown"`. Those inventions look
like data, and they will fool everyone downstream, including future me.

But this is applied with judgement, not dogma. If a book is missing its _rating_, that's
a gap — not a broken record — so it's kept and the rating is marked as "unrated".
Throwing away an entire good book over a missing star would be worse than the gap.

---

## 5. The output, and why it's deliberately boring

The result is `data/books.jsonl`: one book per line, like this.

```json
{ "upc": "a897fe39b1053632", "title": "A Light in the Attic", "price": 51.77, "star_rating": 3, … }
```

Every line has **exactly the same fields, in exactly the same order, with exactly the
same types.** The price is always a number. `in_stock` is always true-or-false. That
consistency is the entire product.

Here's why I was fussy about it. The next assignment feeds this file into a **RAG
system** — a setup that lets an AI answer questions about these books by looking them
up. That system has to trust the file. If `price` is sometimes the number `51.77` and
sometimes the text `"£51.77"`, everything built on top of it inherits the mess, and
the bug surfaces weeks later somewhere that has nothing to do with scraping.

**This is also why I broke one rule in the brief on purpose.** The brief said the
availability field should be "a count if there is one, otherwise a yes/no". I split it
into two fields instead: `in_stock` (always yes/no) and `availability_count` (a number,
or empty). Same information — but a field that's sometimes a number and sometimes a
yes/no is precisely the landmine I just described. It's documented in the README so the
deviation is visible rather than sneaky.

There's also a `books.csv`, which is the same data in spreadsheet form. That one is
purely so a human can glance at it. The JSONL is the real deliverable.

---

## 6. "Everything is built on top of each other"

This was the other half of the brief, and it changed the shape of the assignment.

The workspace already had a folder called `shared/` — a place for code that more than
one assignment needs, so it gets written once instead of copy-pasted. But `shared/` is
written in **TypeScript** (the language of assignments 1–3), and this assignment is in
**Python**. A Python program cannot use TypeScript code. They simply don't speak.

So I added `shared-py/` — the same idea, in Python. And I moved two things into it:

- **the rate limiter** (the "wait 1.5 seconds" logic), and
- **the retry-with-backoff logic** (the "wait 1s, then 2s, then 4s" logic).

Why those two specifically? Because the next Python assignment will call an AI service
over the internet — and calling an AI service needs _exactly_ the same two behaviours:
don't go too fast, and back off politely when you're told to. Writing them twice would
mean fixing every bug twice.

Note what I did **not** move: price parsing, star-rating conversion, robots.txt
handling. Those stayed in the scraper, because only a scraper has books and only a
scraper crawls. The workspace's own rule is _promote code once a second thing needs it,
not in anticipation_ — and shared code that only one thing uses is just code in the
wrong folder.

---

## 7. The bugs I hit

### The big one: every description was in the file twice

This is the bug I'm most glad I caught, because it would have survived all the way into
the next assignment and quietly poisoned it.

After the first successful run, I opened the output and read a record properly instead
of just checking it existed. The description said:

> _"…sans soubresauts, sans vraie révolution, s Dans une France assez proche de la
> nôtre, un homme s'engage…"_

Read that again. It cuts off mid-word — `"révolution, s"` — and then **starts over from
the beginning**.

Here's what was happening. The bookshop's pages have a "read more" link on long
descriptions. To make that work, the page contains the description **twice**: a short
preview, then the full text. Your browser runs a little code that hides one of them, so
you only ever see one.

**A scraper doesn't run that code.** It sees the raw document, where both copies are
sitting there in plain sight, and dutifully copies down both.

So every long description in my file had its opening paragraph duplicated, plus a stray
`...more` stuck on the end. It _looked_ like text. It would have loaded fine. And then
the AI system built on top of it would have been quietly embedding, chunking, and
retrieving the same paragraph twice — returning one passage as if it were two different
sources — and I'd have spent days blaming the AI.

**The fix** reads the _structure_ of the mistake rather than guessing at lengths: the
preview is always the opening of the full text, so the real description begins at the
**second** appearance of the description's opening words. Find that, keep everything
from there, discard the rest. Then I saved a copy of that exact page into
[`tests/fixtures/book_detail_readmore.html`](tests/fixtures/book_detail_readmore.html)
with a test asserting the duplication is gone — so if it ever comes back, a test fails
instead of a corpus rotting.

**The lesson:** the output existed, it had 100 records, none were dropped, and every
type was correct. All the automated checks were green. It was still wrong, and the only
way I found out was by _reading it_.

### The one I wrote myself: a bug in the whitespace cleaner

Scraped text arrives full of ragged spacing, and it's also full of _invisible_
characters — zero-width spaces, control codes — that break comparisons later. My
cleaning function stripped the invisible characters, then squashed the leftover spacing.

Except newlines _are_ control characters. So I was deleting them **before** the squashing
step, which meant:

```
"line one\nline two"   →   "line oneline two"     ✗ words fused together
```

Two sentences would silently weld into one. I caught this while writing the tests — the
fix was to keep real whitespace and only strip the _invisible_ stuff — and then wrote a
test that pins the behaviour down so it can't come back.

### The false alarm: the encoding scare

I checked the output and found French book descriptions littered with `�` — the symbol
you get when text has been mangled. `n�tre` instead of `nôtre`. My heart sank; character
encoding bugs are miserable.

I inspected the actual stored characters rather than trusting what I saw on screen — and
the data was **perfect**. `nôtre` was stored correctly all along. The problem was my
_terminal_: Windows terminals still default to an old character set that can't display
`ô` or `£` or `—`, so it prints `�` instead. The file was fine; the window was lying.

I fixed the terminal (one line telling it to use modern text encoding) and moved on.

**The lesson:** when something looks broken, check whether the thing is broken or
whether the _thing you're looking through_ is broken. I nearly "fixed" data that was
already correct, which would have genuinely broken it.

---

## 8. How I verified it

**74 automated tests**, none of which touch the internet.

The parser tests run against **saved copies of real pages**, stored in
`tests/fixtures/`. That way the tests check the parser against the site's _actual_
messy markup — including the "read more" trap — without asking the website to prove it
every time anyone runs the test suite. Tests that need a network connection aren't
tests; they're a second scraper.

The timing logic is tested too, which surprised me. You'd think testing "waits 1.5
seconds" means a test that takes 1.5 seconds. It doesn't: the rate limiter is handed its
clock and its sleep function from outside, so a test can hand it a **fake clock**, tell
it the time is now 0.5 seconds later, and assert it decided to wait exactly 1.0 seconds
more. The whole test suite runs in **under a second** and never actually sleeps.

Then I ran it for real against the live site and checked the output properly:

```
Records
  Extracted             100
  Duplicates skipped    0  (deduped by UPC)
  Dropped               0
```

And then interrogated the actual file, because a summary that only reports its own
successes is a summary that's lying to you:

- 100 records, **100 unique** book codes — the de-duplication holds
- every field the **same type** in every record — the schema is consistent
- **zero** duplicated descriptions, zero stray `...more` — the big bug is genuinely gone
- prices £10.16–£58.11, ratings spread across 1–5, 29 categories — the data is _plausible_,
  not just well-formed

That last check matters. Data can be perfectly structured and still be nonsense. If
every book had come back with a rating of 3 and a price of £0.00, every automated check
above would still have passed.

---

## 9. What I'd do differently, and what's next

**The cache never expires.** A page fetched today is served from disk forever. For a
practice sandbox whose prices never move, that's correct. For a real shop, it's a bug in
waiting — you'd want to refetch anything older than a day.

**The scraper only understands this one bookshop.** Point it at any other site and it
finds nothing. That's the assignment, not an oversight — but it's worth being honest
that "a web scraper" and "a scraper for one specific website" are very different amounts
of work.

**Next:** `books.jsonl` becomes a RAG corpus — a searchable knowledge base an AI can
answer questions about. Which is exactly why I spent so much of this assignment being
fussy about the schema, and why finding that duplicated-description bug _here_ was worth
more than anything else in the file.
