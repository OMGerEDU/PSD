# Image Compositor Service

A minimal HTTP service that composites bitmap layers into a template using deterministic cover/contain rules. The implementation is dependency-free and runs on any recent Node.js runtime without a build step.

## Bitmap format

The service operates on a simple JSON-based RGBA bitmap container with the extension `.img`. Each file stores:

- `width` and `height` in pixels.
- `format` hint (`"png"` or `"jpeg"`).
- Base64 encoded raw RGBA data.

Fixtures and tests generate these assets via the `Bitmap` helper in `src/core/bitmap.js`.

## API

`POST /render`

```json
{
  "templateId": "poster-v1",
  "replacements": {
    "PosterA": "file:///path/to/slot-a.img",
    "PosterB": "file:///path/to/slot-b.img"
  },
  "outputFormat": "png"
}
```

- `templateId` – key into the template registry.
- `replacements` – map of slot names to asset URLs or file paths.
- `outputFormat` – optional per-request override (`"png"` or `"jpeg"`).

The response body is an encoded bitmap buffer. The `Content-Type` header reflects the logical format (`image/png` or `image/jpeg`).

## Template registry

`template-registry.json` enumerates templates:

- `templateUrl` – file path or URL pointing to a `.img` template background.
- `map.slots[]` – slot rectangles with `left`, `top`, `width`, `height`, `fit` ("cover" or "contain"), and optional `background` for contain padding.
- `map.output` – default output format and quality hint.

## Guardrails

- `MAX_INPUT_PIXELS` and `MAX_SIDE` limit asset sizes.
- Inputs snap to integer coordinates.
- Unknown replacement keys are rejected before rendering.

## Running locally

```bash
cp .env.example .env
npm test
npm run dev
```

No package installation is required; the project only uses Node.js built-ins.

## Docker

```bash
docker build -t image-compositor .
docker run --rm -p 8080:8080 \
  -e TEMPLATE_REGISTRY=/app/template-registry.json \
  image-compositor
```

## Example template payloads

```json
{
  "templateId": "poster-v1",
  "replacements": {
    "PosterA": "./fixtures/a.img",
    "PosterB": "./fixtures/b.img"
  }
}
```

To force JPEG output for a single request:

```json
{
  "templateId": "poster-v1",
  "replacements": {
    "PosterB": "./fixtures/square.img"
  },
  "outputFormat": "jpeg"
}
```

## Development notes

- Templates and assets can be generated via `Bitmap.create(width, height, color)`.
- The compositor performs nearest-neighbour scaling and alpha blending.
- Extend the service by adding slots to the registry or new endpoints in `src/server.js`.
