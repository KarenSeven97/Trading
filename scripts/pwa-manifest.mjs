/** Manifest IDs resolve against the origin, unlike icon/start URLs.
 * Bind every build to its deployment path so /Trading/ is its own app. */
export function createPwaManifest(template, basePath = '/') {
  if (!basePath.startsWith('/') || basePath.startsWith('//') || /[?#\\\s]/.test(basePath)) {
    throw new Error('PWA base path must be a same-origin absolute pathname');
  }
  const base = basePath.endsWith('/') ? basePath : basePath + '/';
  if (new URL(base, 'https://pwa.invalid').pathname !== base) throw new Error('PWA base path must not contain traversal');
  return {
    ...template,
    id: base,
    start_url: base,
    scope: base,
    prefer_related_applications: false,
    icons: template.icons.map(icon => ({ ...icon, src: base + icon.src.replace(/^\/+/, '') })),
  };
}
