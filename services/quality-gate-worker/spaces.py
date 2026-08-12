import os

import boto3


def build_spaces_client():
    """
    S3-compatible client for DigitalOcean Spaces. boto3's `s3` client works
    against Spaces unmodified given a Spaces `endpoint_url`
    (https://<region>.digitaloceanspaces.com) -- no separate SDK needed.
    Mirrors services/vosk-worker/spaces.py exactly.
    """
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("SPACES_ENDPOINT"),
        region_name=os.environ.get("SPACES_REGION", "nyc3"),
        aws_access_key_id=os.environ.get("SPACES_ACCESS_KEY"),
        aws_secret_access_key=os.environ.get("SPACES_SECRET_KEY"),
    )
