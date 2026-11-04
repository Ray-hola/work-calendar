"""Credential handling shared by assistant transport and retained records."""
import json
import re
import urllib.parse

REDACTED = '[已隐藏]'
PRIVATE_KEYS = {'password', 'currentpassword', 'newpassword', 'apikey', 'authorization', 'token', 'secret', 'credential'}


def private_key(key):
    return re.sub(r'[^a-z]', '', str(key).lower()) in PRIVATE_KEYS


def scrub(value):
    if isinstance(value, dict):
        return {k: REDACTED if private_key(k) else scrub(v) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    if isinstance(value, str):
        def envelope(match):
            try:
                return '<' + match[1] + '>' + json.dumps(scrub(json.loads(match[2])), ensure_ascii=False, separators=(',', ':')) + '</' + match[1] + '>'
            except (ValueError, TypeError):
                return match[0]
        value = re.sub(r'<(action|plan|tool)>([\s\S]*?)</\1>', envelope, value, flags=re.I)
        # Also cover legacy pretty-printed JSON and labelled user input.
        value = re.sub(r'(?i)("(?:(?:current|new)?password|api[_ -]?key|authorization|token|secret)"\s*:\s*)"(?:\\.|[^"\\])*"', lambda m: m[1] + json.dumps(REDACTED), value)
        value = re.sub(r'(?i)((?:密码(?:是|为)?|password(?: is)?|api[_ -]?key)\s*[:：=]\s*)[^\s,，;；]+', lambda m: m[1] + REDACTED, value)
        value = re.sub(r'(?i)((?:密码是|密码为|password is)\s*)[^\s,，;；]+', lambda m: m[1] + REDACTED, value)
    return value


def connection_id(base):
    """Full API root identity; changing host, port or root never inherits a key."""
    base = str(base or '').strip().rstrip('/')
    for suffix in ('/chat/completions', '/audio/transcriptions'):
        if base.endswith(suffix):
            base = base[:-len(suffix)]
    parsed = urllib.parse.urlsplit(base)
    return (parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip('/'))


def connection_key(saved, data, base):
    if data.get('clearApiKey') is True:
        return ''
    supplied = str(data.get('apiKey') or '').strip()
    if supplied:
        return supplied
    return str(saved.get('apiKey') or '') if connection_id(base) == connection_id(saved.get('baseUrl')) else ''
