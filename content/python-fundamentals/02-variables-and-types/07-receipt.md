---
title: "Practice: a shopping receipt"
type: exercise
minutes: 10
---
Time to use everything from this module in one program. A small shop needs a receipt printed for each customer, and the program has to work out every number itself, from variables.

Why bother, when you could just type the numbers in? Because next time the prices or the quantities change, a program built on variables needs only the top lines changed, and every number on the receipt updates itself. Typed-in numbers would all have to be found and fixed by hand.

Some tips:

- Use commas in `print()` to put values next to text: `print("Total:", total)`.
- Store each result in a variable with a good name, like `notebooks_cost`, before printing it.
- A `total` that starts at `0` and grows with `+=` keeps the adding simple.
- The dashed line is a string repeated with `*`.
