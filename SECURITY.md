# Public laboratory security boundary

Never commit secrets, configuration from private projects, production endpoints, customer logs, real container IDs, or credential material.

No GitHub Actions workflow, Docker command, real daemon connection, VM creation, privileged execution, or network access to the owner's Windows/HML environment is authorized by the repository bootstrap.

Any future Linux test must use only synthetic data on a GitHub-hosted ephemeral runner after review and explicit approval. No deployment or HML recovery is authorized.