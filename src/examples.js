// Built-in example programs. Each bug has a fixed twin so you can hear the difference.

export const EXAMPLES = [
  {
    id: "recursion-bug",
    title: "Countdown (bug: never stops)",
    code: `def countdown(n):
    print(n)
    countdown(n - 1)

countdown(3)
`,
  },
  {
    id: "recursion-fixed",
    title: "Countdown (fixed)",
    code: `def countdown(n):
    if n == 0:
        return
    print(n)
    countdown(n - 1)

countdown(3)
`,
  },
  {
    id: "loop-bug",
    title: "Count to 3 (bug: never stops)",
    code: `count = 1
while count <= 3:
    print(count)
`,
  },
  {
    id: "loop-fixed",
    title: "Count to 3 (fixed)",
    code: `count = 1
while count <= 3:
    print(count)
    count = count + 1
`,
  },
  {
    id: "fizzbuzz",
    title: "FizzBuzz (nested blocks to explore)",
    code: `for n in range(1, 16):
    if n % 15 == 0:
        print("FizzBuzz")
    elif n % 3 == 0:
        print("Fizz")
    elif n % 5 == 0:
        print("Buzz")
    else:
        print(n)
`,
  },
  {
    id: "factorial",
    title: "Factorial (recursion that works)",
    code: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print(factorial(5))
`,
  },
  {
    id: "typo",
    title: "Typo (bug: name error)",
    code: `total = 0
for price in [3, 5, 2]:
    total = totl + price
print(total)
`,
  },
];

export const getExample = (id) => EXAMPLES.find((e) => e.id === id) || EXAMPLES[0];
