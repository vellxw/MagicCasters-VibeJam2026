type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface DevAccessChallengePayload {
  ok: true;
  challenge: string;
  salt: string;
  iterations: number;
  keyLengthBytes: number;
  digest: 'SHA-256';
}

interface DevAccessFailurePayload {
  ok?: false;
  error?: string;
}

interface DevAccessUnlockPayload {
  ok: true;
  token: string;
  expiresAt: string;
}

export interface DevAccessClientOptions {
  fetchImpl?: FetchLike;
  requestPassword: (message?: string) => Promise<string | null>;
  resolveBaseUrl: () => string;
}

let devAccessToken: string | null = null;

export class DevAccessClient {
  private readonly fetchImpl: FetchLike;
  private readonly requestPassword: (message?: string) => Promise<string | null>;
  private readonly resolveBaseUrl: () => string;

  constructor(options: DevAccessClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.requestPassword = options.requestPassword;
    this.resolveBaseUrl = options.resolveBaseUrl;
  }

  async ensureUnlocked(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (devAccessToken) return { ok: true };

    try {
      const baseUrl = this.resolveBaseUrl().replace(/\/$/, '');
      const challengeResponse = await this.fetchImpl(`${baseUrl}/api/dev/access/challenge`, {
        method: 'GET',
        cache: 'no-store'
      });
      const challengePayload = await challengeResponse.json().catch(() => ({})) as DevAccessChallengePayload | DevAccessFailurePayload;
      if (!challengeResponse.ok || challengePayload.ok !== true) {
        const failure = challengePayload as DevAccessFailurePayload;
        return { ok: false, error: failure.error ?? `Dev access unavailable (HTTP ${challengeResponse.status})` };
      }

      const password = await this.requestPassword();
      if (!password) return { ok: false, error: 'Dev access canceled.' };

      const proof = await deriveDevAccessProof(password, challengePayload);
      const unlockResponse = await this.fetchImpl(`${baseUrl}/api/dev/access/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challenge: challengePayload.challenge,
          proof
        })
      });
      const unlockPayload = await unlockResponse.json().catch(() => ({})) as DevAccessUnlockPayload | DevAccessFailurePayload;
      if (!unlockResponse.ok || unlockPayload.ok !== true) {
        const failure = unlockPayload as DevAccessFailurePayload;
        return { ok: false, error: failure.error ?? `Dev access denied (HTTP ${unlockResponse.status})` };
      }

      devAccessToken = unlockPayload.token;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export async function deriveDevAccessProof(password: string, challenge: DevAccessChallengePayload): Promise<string> {
  const passwordMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const hmacKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(hexToBytes(challenge.salt)),
      iterations: challenge.iterations,
      hash: challenge.digest
    },
    passwordMaterial,
    {
      name: 'HMAC',
      hash: challenge.digest,
      length: challenge.keyLengthBytes * 8
    },
    false,
    ['sign']
  );
  const proof = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(challenge.challenge));
  return bytesToHex(new Uint8Array(proof));
}

export function getDevAccessToken(): string | null {
  return devAccessToken;
}

export function clearDevAccessToken(): void {
  devAccessToken = null;
}

export function getDevAccessAuthorizationHeaders(headers: Record<string, string> = {}): Record<string, string> {
  if (!devAccessToken) return { ...headers };
  return {
    ...headers,
    authorization: `Bearer ${devAccessToken}`
  };
}

export function promptForDevAccessPassword(root: HTMLElement, errorMessage?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dev-access';
    overlay.innerHTML = `
      <form class="dev-access__dialog">
        <strong>Private dev access</strong>
        <span>${escapeHtml(errorMessage ?? 'Enter the password to open this editor.')}</span>
        <input type="password" autocomplete="current-password" spellcheck="false" aria-label="Private dev access password" />
        <div class="dev-access__actions">
          <button type="button" data-dev-access-cancel>Cancel</button>
          <button type="submit">Unlock</button>
        </div>
      </form>
    `;
    root.appendChild(overlay);

    const form = overlay.querySelector<HTMLFormElement>('form')!;
    const input = overlay.querySelector<HTMLInputElement>('input')!;
    const finish = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector('[data-dev-access-cancel]')?.addEventListener('click', () => finish(null));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      finish(input.value);
    });
    window.setTimeout(() => input.focus(), 0);
  });
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error('Invalid dev access salt.');
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
