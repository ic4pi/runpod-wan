# Wan2.1 RunPod Serverless Worker

Run [Wan2.1](https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B-Diffusers) (1.3B text-to-video)
as a RunPod Serverless endpoint. Sibling to [runpod-sdxl](https://github.com/ic4pi/runpod-sdxl) —
kept as its own repo/endpoint so it can use its own GPU pool and scale
independently instead of forcing every SDXL image request onto
video-sized hardware.

Deploys the same way as `runpod-sdxl`: connect this repo on the
[RunPod Hub](https://www.runpod.io/console/hub), which reads
`.runpod/hub.json` (deploy config) and `.runpod/tests.json` (CI test) to
build and validate the image automatically on push.

## Model

Defaults to `Wan-AI/Wan2.1-T2V-1.3B-Diffusers` — the small Wan2.1 variant.
Deliberately not the 14B model: 14B needs ~35GB+ VRAM and 80GB-class cards,
which are far more prone to the supply/capacity errors already hit while
getting `runpod-sdxl` deployed. The 1.3B model runs in ~8-13GB VRAM (via
`enable_model_cpu_offload()` in `handler.py`), so it fits the same
`ADA_24,AMPERE_24,AMPERE_48,ADA_48_PRO` GPU pool that's already working for
SDXL.

## Usage

| Parameter              | Type    | Default | Required | Description                                              |
| :---------------------- | :------ | :------ | :------- | :--------------------------------------------------------- |
| `prompt`                | `str`   | —       | **Yes**  | Text description of the video                              |
| `negative_prompt`       | `str`   | `None`  | No       | Concepts to avoid                                           |
| `height`                | `int`   | `480`   | No       | Video height in pixels                                      |
| `width`                 | `int`   | `832`   | No       | Video width in pixels                                       |
| `num_frames`            | `int`   | `81`    | No       | Frame count (8-161)                                         |
| `num_inference_steps`   | `int`   | `40`    | No       | Denoising steps                                              |
| `guidance_scale`        | `float` | `5.0`   | No       | Classifier-free guidance scale                               |
| `fps`                   | `int`   | `16`    | No       | Frames per second for the exported mp4                       |
| `seed`                  | `int`   | `None`  | No       | Random seed. If `None`, a random seed is generated            |

### Example Request

```json
{
  "input": {
    "prompt": "a golden retriever running through a field of sunflowers, cinematic lighting",
    "negative_prompt": "blurry, low quality, static, overexposed, watermark",
    "height": 480,
    "width": 832,
    "num_frames": 81,
    "num_inference_steps": 40,
    "guidance_scale": 5.0,
    "fps": 16,
    "seed": 1337
  }
}
```

### Example Response

```json
{
  "delayTime": 8213,
  "executionTime": 187400,
  "id": "...",
  "output": {
    "video_url": "data:video/mp4;base64,AAAAIGZ0eXBpc29t...",
    "seed": 1337
  },
  "status": "COMPLETED"
}
```

By default the mp4 comes back as a base64 data URL. mp4s can be tens of MB,
which is heavy for a JSON payload — set `BUCKET_ENDPOINT_URL`, `BUCKET_NAME`,
`BUCKET_ACCESS_KEY_ID`, and `BUCKET_SECRET_ACCESS_KEY` as endpoint env vars
(any S3-compatible storage) to have the worker upload the video and return a
`video_url` link instead. Optionally set `BUCKET_PUBLIC_URL_BASE` if the
bucket is served from a CDN/custom domain.

Expect generation to take **2-5 minutes** per video on a 24GB card — this is
inherently much slower than SDXL's few seconds, so call `/run` (async) and
poll `/status/{id}` from your site's backend rather than `/runsync`.
