chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL("index.html"),
    type: "popup",
    width: 1400,
    height: 900,
  });
});

chrome.runtime.onInstalled.addListener(applyIcon);
chrome.runtime.onStartup.addListener(applyIcon);

function drawIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const r = size * 0.1875;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fillStyle = "#6366f1";
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${size * 0.7}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Q", size / 2, size / 2);

  return ctx.getImageData(0, 0, size, size);
}

async function applyIcon() {
  const imageData = {};
  for (const size of [16, 32, 48, 128]) {
    imageData[size] = drawIcon(size);
  }
  await chrome.action.setIcon({ imageData });
}
