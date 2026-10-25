// Pages' artifact uploader excludes dot-prefixed directories. Keep the local
// cache private to the checkout, but publish its selected assets at visible URLs.
export function deliveryPath(file) {
  return file.startsWith('materials/data/.generated/')
    ? `media/${file.slice('materials/data/.generated/'.length)}` : file;
}
export function publishedCatalog(value) {
  if (typeof value === 'string') return deliveryPath(value);
  if (Array.isArray(value)) return value.map(publishedCatalog);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publishedCatalog(item)]));
  return value;
}
