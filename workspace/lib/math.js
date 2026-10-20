function add(a, b) {
  return a + b;
}

function factorial(n) {
  if (n < 0) throw new Error("n must be >= 0");
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

module.exports = { add, factorial };
