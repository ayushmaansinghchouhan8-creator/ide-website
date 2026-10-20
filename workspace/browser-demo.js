const heading = document.createElement("h2");
heading.textContent = "Runs in the browser, not Node";
document.body.appendChild(heading);

const info = document.createElement("p");
info.textContent = "Viewport: " + window.innerWidth + " x " + window.innerHeight
  + "  |  " + navigator.userAgent.split(") ")[0] + ")";
document.body.appendChild(info);

let clicks = 0;
const button = document.createElement("button");
button.textContent = "Click me";
button.addEventListener("click", () => {
  clicks += 1;
  const line = document.createElement("p");
  line.textContent = "Clicked " + clicks + " time" + (clicks === 1 ? "" : "s");
  document.body.appendChild(line);
  console.log("button clicked", clicks);
});
document.body.appendChild(button);

console.log("document.title is", JSON.stringify(document.title));
console.log("window has localStorage:", typeof window.localStorage !== "undefined");
console.warn("browser-only APIs like document/window/navigator work here");
