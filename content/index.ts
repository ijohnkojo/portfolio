/**
 * The base VFS tree, built at module load and treated as read-only.
 *
 * PLACEHOLDER CONTENT — real papers and project writeups replace these files.
 * The paths are the part that matters: they're what `cd /projects/hq` walks and
 * what the future SSG routes (/projects/[slug], /papers/[slug]) will mirror, so
 * swapping the prose later doesn't move anything.
 */
import { appNode, dir, file, type DirNode } from '@/kernel'

const README_HQ = `# hq

_Placeholder._ Project writeup goes here.

Reached from the shell with:

    cd /projects/hq
    cat README.md
`

const README_TREEVIZ = `# TreeViz

_Placeholder._ Project writeup goes here.
`

const PAPER_HSCP = `# HSCP Mass Reconstruction

_Placeholder._ Paper abstract and writeup go here.
`

const ABOUT = `# About

This is a mock operating system, and it is the portfolio rather than a wrapper
around one.

The kernel provides three primitives and nothing else: a virtual filesystem, a
process table, and an event bus. The window manager, the shell, and every app
are policy layered on top — none of them touch kernel state directly, they go
through a syscall boundary that checks what each app declared it needs.

Borrowed from UNIX: mechanism, not policy.
`

export function buildContentTree(): DirNode {
  return dir('/', {
    home: dir('home', {
      'about.md': file('about.md', ABOUT),
    }),
    projects: dir('projects', {
      hq: dir('hq', {
        'README.md': file('README.md', README_HQ),
      }),
      treeviz: dir('treeviz', {
        'README.md': file('README.md', README_TREEVIZ),
      }),
    }),
    papers: dir('papers', {
      'hscp-mass-reconstruction.md': file(
        'hscp-mass-reconstruction.md',
        PAPER_HSCP
      ),
    }),
    // App nodes make launchables visible to the filesystem, so a future shell
    // gets `ls /apps` and `open /apps/about` for free.
    apps: dir('apps', {
      about: appNode('about', 'about'),
      sysinfo: appNode('sysinfo', 'sysinfo'),
    }),
  })
}
