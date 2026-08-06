"""App-only (client-credentials) auth against Microsoft Graph via MSAL.

The MSAL app is built lazily, on first use - constructing it eagerly at
import time would perform a network call (OIDC authority discovery) and
raise immediately if Graph credentials aren't configured or reachable yet,
which would take down the whole backend process on startup since this
module is imported transitively by main.py.
"""

import msal

from . import config

GRAPH_SCOPE = ["https://graph.microsoft.com/.default"]

_msal_app: msal.ConfidentialClientApplication | None = None


def _get_msal_app() -> msal.ConfidentialClientApplication:
    global _msal_app
    if _msal_app is None:
        missing = [
            name
            for name, value in (
                ("GRAPH_TENANT_ID", config.GRAPH_TENANT_ID),
                ("GRAPH_CLIENT_ID", config.GRAPH_CLIENT_ID),
                ("GRAPH_CLIENT_SECRET", config.GRAPH_CLIENT_SECRET),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing required environment variable(s): {', '.join(missing)}")

        _msal_app = msal.ConfidentialClientApplication(
            client_id=config.GRAPH_CLIENT_ID,
            authority=f"https://login.microsoftonline.com/{config.GRAPH_TENANT_ID}",
            client_credential=config.GRAPH_CLIENT_SECRET,
            # Skip authority validation's own network round-trip; the token
            # request itself will fail clearly if the tenant is wrong.
            validate_authority=False,
        )
    return _msal_app


def get_app_token() -> str:
    """Return a cached-or-fresh app-only bearer token for Microsoft Graph.

    MSAL keeps its own in-memory token cache, so repeated calls within the
    token's lifetime are cheap and don't re-authenticate.
    """
    app = _get_msal_app()
    result = app.acquire_token_silent(GRAPH_SCOPE, account=None)
    if not result:
        result = app.acquire_token_for_client(scopes=GRAPH_SCOPE)

    if "access_token" not in result:
        raise RuntimeError(
            f"Failed to acquire Graph token: {result.get('error')} - {result.get('error_description')}"
        )
    return result["access_token"]
