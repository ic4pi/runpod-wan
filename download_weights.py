import torch
from diffusers import AutoencoderKLWan, WanPipeline

MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"


def fetch_pretrained_model(model_class, model_name, **kwargs):
    """
    Fetches a pretrained model from the HuggingFace model hub.
    """
    max_retries = 3
    for attempt in range(max_retries):
        try:
            return model_class.from_pretrained(model_name, **kwargs)
        except OSError as err:
            if attempt < max_retries - 1:
                print(
                    f"Error encountered: {err}. Retrying attempt {attempt + 1} of {max_retries}..."
                )
            else:
                raise


def get_wan_pipeline():
    """
    Fetches the Wan2.1 text-to-video pipeline from the HuggingFace model hub.
    """
    vae = fetch_pretrained_model(
        AutoencoderKLWan, MODEL_ID, subfolder="vae", **{"torch_dtype": torch.float32}
    )
    pipe = fetch_pretrained_model(
        WanPipeline, MODEL_ID, vae=vae, **{"torch_dtype": torch.bfloat16}
    )
    return pipe


if __name__ == "__main__":
    get_wan_pipeline()
