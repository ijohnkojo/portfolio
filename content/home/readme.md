# Getting around

This filesystem is real. The shell reads it, the web pages are built from it,
and both come from the same files on disk.

## Where things are

| Path | What |
| --- | --- |
| `/home` | this file, and a short bio in `about.md` |
| `/projects` | things built |
| `/papers` | written research |
| `/presentations` | talks and posters |
| `/apps` | the applications you can `open` |

## Worth trying

```sh
tree /              # the whole shape at once
grep -i redis /     # search every writeup
tags                # what subjects are here
stat /papers/hq/index.mdx
open /apps/viewer
```

Each writeup carries its own metadata — `stat` shows the title, date, and tags
that the web pages are built from.

> Drafts are visible here but not on the web. If `ls /papers` shows something
> you cannot find a URL for, that is why.

Type `help` for every command, or `man <command>` for the long form.
