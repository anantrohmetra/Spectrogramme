const MIN_FREQ = 60;
const MAX_FREQ = 12000;
const FFT_BINS = 2048;
const NYQUIST = 22050;

const CMAP = [
  [0, [0, 0, 0]],
  [55, [0, 0, 120]],
  [110, [0, 110, 130]],
  [160, [0, 130, 38]],
  [200, [120, 135, 0]],
  [235, [160, 50, 0]],
  [255, [170, 155, 130]],
];

function freqBin(f) {
  return constrain(Math.round(f * FFT_BINS / NYQUIST), 0, FFT_BINS - 1);
}

function ampToRGB(amp) {
  for (let i = 0; i < CMAP.length - 1; i++) {
    let [a0, c0] = CMAP[i];
    let [a1, c1] = CMAP[i + 1];
    if (amp <= a1) {
      let t = (amp - a0) / (a1 - a0);
      return [
        c0[0] + t * (c1[0] - c0[0]), c0[1] + t * (c1[1] - c0[1]),
        c0[2] + t * (c1[2] - c0[2])
      ];
    }
  }
  return CMAP[CMAP.length - 1][1];
}

// ── Dot config
// ────────────────────────────────────────────────────────────────
const STEP = 3;
const SW = 4;
const SH = 2;
const WOBBLE = 6;
const SCROLL = 1;

let mic, fft;
let running = false;
let clicked = false;

// ── Persistent history buffer (all completed streams baked here)
let bakedBuf;

// ── Active stream
// ─────────────────────────────────────────────────────────────
let buf;
let sDir;      // 'L' | 'R' | 'U' | 'D'
let sBandW;    // thickness perpendicular to scroll
let sLen;      // length along scroll axis
let sSX, sSY;  // top-left corner of buffer on main canvas
let sLifeFrames;
let sAge;
let sBlend;  // composite op applied when baking this stream into history

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  bakedBuf = createGraphics(windowWidth, windowHeight);
  bakedBuf.pixelDensity(1);
  bakedBuf.background(0);
  newStream();
}

function newStream() {
  // Bake the finishing stream into bakedBuf with its blend mode, then free it.
  // bakedBuf is the permanent history; the main canvas is redrawn from it each
  // frame.
  if (buf) {
    bakedBuf.drawingContext.globalCompositeOperation = sBlend;
    bakedBuf.image(buf, sSX, sSY);
    bakedBuf.drawingContext.globalCompositeOperation = 'source-over';
    buf.remove();
  }

  sDir = random(['L', 'R', 'U', 'D']);
  sBlend = random(
      ['source-over', 'source-over', 'lighten', 'exclusion', 'difference']);
  sAge = 0;
  sLifeFrames = floor(random(10, 31) * 60);

  if (sDir === 'L' || sDir === 'R') {
    sBandW = floor(random(height / 6, height + 1));
    sLen = width;
    sSX = 0;
    sSY = floor(random(0, max(1, height - sBandW)));
    buf = createGraphics(sLen, sBandW);
  } else {
    sBandW = floor(random(width / 6, width + 1));
    sLen = height;
    sSX = floor(random(0, max(1, width - sBandW)));
    sSY = 0;
    buf = createGraphics(sBandW, sLen);
  }

  buf.pixelDensity(1);
  buf.clear();
  buf.drawingContext.imageSmoothingEnabled = false;
}

// ── Input
// ─────────────────────────────────────────────────────────────────────
function mousePressed() {
  if (running) return;
  clicked = true;
  userStartAudio();
  mic = new p5.AudioIn();
  mic.start();
  fft = new p5.FFT(0.75, FFT_BINS);
  fft.setInput(mic);
  running = true;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  bakedBuf.remove();
  bakedBuf = createGraphics(windowWidth, windowHeight);
  bakedBuf.pixelDensity(1);
  bakedBuf.background(0);
  newStream();
}

// ── Draw
// ──────────────────────────────────────────────────────────────────────
function draw() {
  if (!running && !clicked) {
    background(0);
    noFill();
    stroke(255, 60 + 40 * sin(frameCount * 0.05));
    strokeWeight(1.5);
    ellipse(width / 2, height / 2, 40, 40);
    return;
  }

  let spectrum = fft.analyze();
  if (frameCount % 2 === 0) updateStream(spectrum);

  // Restore clean history baseline each frame — eliminates blend-mode flicker
  image(bakedBuf, 0, 0);
  // Draw active stream with its blend mode against the stable bakedBuf baseline
  // (no flicker since bakedBuf doesn't change mid-stream)
  drawingContext.globalCompositeOperation = sBlend;
  image(buf, sSX, sSY);
  drawingContext.globalCompositeOperation = 'source-over';

  sAge++;
  if (sAge >= sLifeFrames) newStream();
}

// ── Paint dot — shadow + body + highlight for raised depth
// ──────────────────────────────────────────────────────────────
function paintDot(g, cx, cy, r, gr, b) {
  // shadow/glow use 'screen' inside the buffer — adds depth on dark areas
  // but never darkens existing colored dots underneath
  g.drawingContext.globalCompositeOperation = 'screen';

  // outer glow — halo of the dot's own color
  g.fill(r * 0.35, gr * 0.35, b * 0.35, 210);
  g.ellipse(cx + 1, cy + 1, SW * 2 + 5, SH * 2 + 4);

  // inner glow — tighter, brighter
  g.fill(r * 0.6, gr * 0.6, b * 0.6, 160);
  g.ellipse(cx + 0.5, cy + 0.5, SW * 2 + 2, SH * 2 + 2);

  // main paint body — source-over so current audio data always shows
  g.drawingContext.globalCompositeOperation = 'source-over';
  g.fill(r, gr, b);
  g.ellipse(cx, cy, SW * 2, SH * 2);

  // specular highlight — top-left, brightened
  g.fill(
      Math.min(r + 100, 255), Math.min(gr + 100, 255), Math.min(b + 100, 255),
      120);
  g.ellipse(cx - 1, cy - 0.8, SW * 0.8, SH * 0.8);

  g.drawingContext.globalCompositeOperation = 'source-over';
}

// ── Stream update
// ─────────────────────────────────────────────────────────────
function updateStream(spectrum) {
  let bw = buf.width;
  let bh = buf.height;

  if (sDir === 'L' || sDir === 'R') {
    // ── Horizontal
    // ────────────────────────────────────────────────────────────
    buf.drawingContext.drawImage(buf.elt, sDir === 'L' ? -SCROLL : SCROLL, 0);

    let cx;
    if (sDir === 'L') {
      buf.drawingContext.clearRect(bw - SCROLL, 0, SCROLL, bh);
      cx = bw - SW - 1;
    } else {
      buf.drawingContext.clearRect(0, 0, SCROLL, bh);
      cx = SW + 1;
    }

    buf.noStroke();
    for (let py = STEP / 2; py < bh; py += STEP) {
      let t = 1 - py / (bh - 1);
      let freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);
      let bin = freqBin(freq);

      let amp = spectrum[bin], n = 1;
      if (bin > 0) {
        amp += spectrum[bin - 1];
        n++;
      }
      if (bin < FFT_BINS - 1) {
        amp += spectrum[bin + 1];
        n++;
      }
      amp /= n;
      if (amp < 50) continue;

      let wobble = sin(frameCount * 0.025 + py * 0.09) * (amp / 255) * WOBBLE;
      let cy = constrain(py + wobble, SH + 1, bh - SH - 1);

      let [r, g, b] = ampToRGB(amp);
      paintDot(buf, cx, cy, r, g, b);
    }

    // Flat mask on leading edge
    if (sDir === 'L')
      buf.drawingContext.clearRect(bw - SW, 0, SW, bh);
    else
      buf.drawingContext.clearRect(0, 0, SW, bh);

  } else {
    // ── Vertical
    // ──────────────────────────────────────────────────────────────
    buf.drawingContext.drawImage(buf.elt, 0, sDir === 'U' ? -SCROLL : SCROLL);

    let cy;
    if (sDir === 'U') {
      buf.drawingContext.clearRect(0, bh - SCROLL, bw, SCROLL);
      cy = bh - SH - 1;
    } else {
      buf.drawingContext.clearRect(0, 0, bw, SCROLL);
      cy = SH + 1;
    }

    buf.noStroke();
    for (let px = STEP / 2; px < bw; px += STEP) {
      let t = 1 - px / (bw - 1);
      let freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);
      let bin = freqBin(freq);

      let amp = spectrum[bin], n = 1;
      if (bin > 0) {
        amp += spectrum[bin - 1];
        n++;
      }
      if (bin < FFT_BINS - 1) {
        amp += spectrum[bin + 1];
        n++;
      }
      amp /= n;
      if (amp < 50) continue;

      let wobble = sin(frameCount * 0.025 + px * 0.09) * (amp / 255) * WOBBLE;
      let cx = constrain(px + wobble, SW + 1, bw - SW - 1);

      let [r, g, b] = ampToRGB(amp);
      paintDot(buf, cx, cy, r, g, b);
    }

    // Flat mask on leading edge
    if (sDir === 'U')
      buf.drawingContext.clearRect(0, bh - SH, bw, SH);
    else
      buf.drawingContext.clearRect(0, 0, bw, SH);
  }
}
