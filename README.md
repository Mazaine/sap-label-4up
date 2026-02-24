# SAP Label 4-up (Client-side Vite + React)

Converts SAP label PDFs (one label in the top-right corner of each A4 page) into a printable PDF with 4 labels per A4 page (2x2 layout).

## Features

- Runs fully in the browser (GitHub Pages compatible)
- Uses `pdfjs-dist` to render and crop labels from the top-right region only
- Uses `pdf-lib` to generate the output A4 PDF
- Orientation mode: `Auto`, `MPL (portrait)`, `GLS (landscape)`
- Print and Open actions after generation

## Setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

1. Edit `vite.config.js` and change `base` from `"/REPO_NAME/"` to your repo path (for example `"/cimke/"`).
2. Build or deploy:

```bash
npm run deploy
```

(`npm run deploy` uses `gh-pages` and publishes the `dist` folder.)
