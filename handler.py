import os
import base64

import torch
from diffusers import AutoencoderKLWan, WanPipeline
from diffusers.utils import export_to_video

import runpod
from runpod.serverless.utils import rp_cleanup
from runpod.serverless.utils.rp_validator import validate

from schemas import INPUT_SCHEMA

MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"

# Weights live on the endpoint's network volume, not baked into the image -
# a ~38GB baked image was too slow/unreliable to pull on serverless cold
# starts. First cold start on a fresh volume downloads once; every worker
# after that reuses the same cached copy.
MODEL_DIR = "/runpod-volume/wan-1.3b"

torch.cuda.empty_cache()


def _ensure_weights():
    marker = os.path.join(MODEL_DIR, ".complete")
    if os.path.exists(marker):
        return
    from huggingface_hub import snapshot_download

    os.makedirs(MODEL_DIR, exist_ok=True)
    snapshot_download(repo_id=MODEL_ID, local_dir=MODEL_DIR)
    with open(marker, "w") as f:
        f.write("ok")


class ModelHandler:
    def __init__(self):
        self.pipe = None
        self.load_models()

    def load_models(self):
        _ensure_weights()
        # Load VAE from the volume
        vae = AutoencoderKLWan.from_pretrained(
            MODEL_DIR,
            subfolder="vae",
            torch_dtype=torch.float32,
            local_files_only=True,
        )
        # Load Wan text-to-video pipeline from the volume
        pipe = WanPipeline.from_pretrained(
            MODEL_DIR,
            vae=vae,
            torch_dtype=torch.bfloat16,
            local_files_only=True,
        )

        # Text encoder (UMT5-XXL) is large relative to the 1.3B transformer -
        # cpu offload keeps this fitting on the same 24GB-class GPU pool as
        # the SDXL worker instead of requiring an 80GB card.
        pipe.enable_model_cpu_offload()

        self.pipe = pipe
        return pipe


MODELS = ModelHandler()


def _upload_to_bucket(video_path, job_id):
    import boto3

    bucket = os.environ["BUCKET_NAME"]
    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ.get("BUCKET_ENDPOINT_URL"),
        aws_access_key_id=os.environ.get("BUCKET_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("BUCKET_SECRET_ACCESS_KEY"),
    )
    key = f"{job_id}/0.mp4"
    s3.upload_file(video_path, bucket, key)

    public_base = os.environ.get("BUCKET_PUBLIC_URL_BASE")
    if public_base:
        return f"{public_base.rstrip('/')}/{key}"
    return s3.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=3600
    )


def _save_and_upload_video(video_frames, job_id, fps):
    os.makedirs(f"/{job_id}", exist_ok=True)
    video_path = os.path.join(f"/{job_id}", "0.mp4")
    export_to_video(video_frames, video_path, fps=fps)

    if os.environ.get("BUCKET_ENDPOINT_URL", False):
        video_url = _upload_to_bucket(video_path, job_id)
    else:
        with open(video_path, "rb") as video_file:
            video_data = base64.b64encode(video_file.read()).decode("utf-8")
        video_url = f"data:video/mp4;base64,{video_data}"

    rp_cleanup.clean([f"/{job_id}"])
    return video_url


@torch.inference_mode()
def generate_video(job):
    """
    Generate a video from text using Wan2.1
    """
    job_input = job["input"]

    # Input validation
    validated_input = validate(job_input, INPUT_SCHEMA)
    if "errors" in validated_input:
        return {"error": validated_input["errors"]}
    job_input = validated_input["validated_input"]

    if job_input["seed"] is None:
        job_input["seed"] = int.from_bytes(os.urandom(2), "big")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    generator = torch.Generator(device).manual_seed(job_input["seed"])

    try:
        with torch.inference_mode():
            frames = MODELS.pipe(
                prompt=job_input["prompt"],
                negative_prompt=job_input["negative_prompt"],
                height=job_input["height"],
                width=job_input["width"],
                num_frames=job_input["num_frames"],
                num_inference_steps=job_input["num_inference_steps"],
                guidance_scale=job_input["guidance_scale"],
                generator=generator,
            ).frames[0]
    except RuntimeError as err:
        print(f"[ERROR] RuntimeError in generation pipeline: {err}", flush=True)
        return {
            "error": f"RuntimeError: {err}",
            "refresh_worker": True,
        }
    except Exception as err:
        print(f"[ERROR] Unexpected error in generation pipeline: {err}", flush=True)
        return {
            "error": f"Unexpected error: {err}",
            "refresh_worker": True,
        }

    video_url = _save_and_upload_video(frames, job["id"], job_input["fps"])

    return {
        "video_url": video_url,
        "seed": job_input["seed"],
    }


runpod.serverless.start({"handler": generate_video})
