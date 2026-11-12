---
title: Comments
type: concept
minutes: 4
---
Code is read by people as well as by computers: by you next week, or by someone helping you. A **comment** is a note for those people. Python skips it completely.

A comment starts with `#`. Everything from the `#` to the end of that line is ignored:

```python
# Greet the visitor before showing the menu.
print("Welcome!")
print("Today's special: soup")  # changes every day
```

```
Welcome!
Today's special: soup
```

A comment can take a whole line, or sit at the end of a line of code, as on line 3 above.

## Good comments say *why*

`print("Welcome!")` already says *what* it does, so a comment that repeats it adds nothing. Good comments explain things the code can't: why a line is there, what a section of the program is for, or a reminder for later.

## Switching a line off

Putting `#` at the start of a line turns that line into a comment, so it no longer runs. Programmers do this all the time to try a program without one line, while keeping the line to bring back later. It's called *commenting out*.

```python
print("This line runs.")
# print("This line doesn't.")
```

Tip: in the editor, **Ctrl+/** (Cmd+/ on a Mac) comments out the line the cursor is on, or every selected line. Press it again to switch them back on.

## A `#` inside quotes is just text

```python
print("Room #4")
```

This shows `Room #4`. The `#` is inside the quotes, so it's part of the text, not the start of a comment.

## Recap

- A comment starts with `#`, and Python ignores everything from there to the end of the line.
- Good comments explain *why*, not what the code already says.
- Putting `#` in front of a line "comments it out", so it no longer runs; a `#` inside quotes is just text.
