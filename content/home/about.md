# About

This is a mock operating system, and it is the portfolio rather than a wrapper
around one.

The kernel provides three primitives and nothing else: a virtual filesystem, a
process table, and an event bus. The window manager, the shell, and every app
are policy layered on top — none of them touch kernel state directly, they go
through a syscall boundary that checks what each app declared it needs.

Borrowed from UNIX: mechanism, not policy.
