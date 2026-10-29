/**
 * Settings that differ per environment. They are NOT compiled in: the app reads /config.json before it starts,
 * so the same build runs in dev, staging and production.
 *
 *  - apiUrl          Where the API lives, e.g. https://api.talab.pk. Empty = same site as the app (behind one proxy).
 *  - googleClientId  Google OAuth Web client ID (Google Cloud Console → Credentials). Add your site under
 *                    "Authorized JavaScript origins". Empty = dev-only email sign-in in dev builds.
 *  - tileUrl         Map tiles. Use a provider or your own tile server in production. The default is the public
 *                    OpenStreetMap server, whose usage policy forbids heavy or commercial use.
 *  - tileAttribution Credit line the tile provider requires (HTML allowed).
 *  - tileMaxZoom     Highest zoom the provider serves.
 */
export interface AppConfig {
  apiUrl: string;
  googleClientId: string;
  tileUrl: string;
  tileAttribution: string;
  tileMaxZoom: number;
}

export const CONFIG: AppConfig = {
  apiUrl: '',
  googleClientId: '',
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  tileMaxZoom: 19,
};

/** Called once before the app starts. Missing or broken config.json just leaves the defaults. */
export async function loadConfig(): Promise<void> {
  try {
    const r = await fetch('/config.json', { cache: 'no-store' });
    if (r.ok) Object.assign(CONFIG, await r.json());
    CONFIG.apiUrl = (CONFIG.apiUrl ?? '').replace(/\/+$/, ''); // no trailing slash
  } catch { /* keep defaults */ }
  if (CONFIG.tileUrl.includes('tile.openstreetmap.org') && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1')
    console.warn('Talab: using the public OpenStreetMap tile server. Set tileUrl in config.json to a provider or your own server before real traffic.');
}
