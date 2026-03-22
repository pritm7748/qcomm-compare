/**
 * Normalizes product data from different platforms into a common schema.
 */

export function normalizeProduct(raw, platform) {
  return {
    id: raw.id || `${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    platform,
    name: (raw.name || raw.productName || raw.title || '').trim(),
    brand: (raw.brand || raw.brandName || '').trim(),
    image: raw.image || raw.imageUrl || raw.thumbnail || '',
    price: parseFloat(raw.price || raw.sellingPrice || raw.sp || 0),
    mrp: parseFloat(raw.mrp || raw.originalPrice || raw.maximumRetailPrice || raw.price || 0),
    discount: 0,
    discountPercent: 0,
    quantity: (raw.quantity || raw.packSize || raw.weight || raw.unit_str || '').toString().trim(),
    unit: (raw.unit || '').trim(),
    available: raw.available !== undefined ? raw.available : (raw.inStock !== undefined ? raw.inStock : true),
    deliveryEta: raw.deliveryEta || raw.eta || '',
    category: (raw.category || '').trim(),
    offer: (raw.offer || raw.promoLabel || '').trim(),
  };
}

export function calculateDiscount(product) {
  if (product.mrp > product.price && product.price > 0) {
    product.discount = Math.round((product.mrp - product.price) * 100) / 100;
    product.discountPercent = Math.round(((product.mrp - product.price) / product.mrp) * 100);
  }
  return product;
}

export function normalizeAndEnrich(raw, platform) {
  const product = normalizeProduct(raw, platform);
  return calculateDiscount(product);
}

/**
 * Groups products across platforms by similarity (name matching).
 */
export function groupProducts(products) {
  const groups = [];

  for (const product of products) {
    const normalizedName = product.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let matched = false;
    for (const group of groups) {
      const groupName = group.normalizedName;
      if (
        normalizedName === groupName ||
        normalizedName.includes(groupName) ||
        groupName.includes(normalizedName) ||
        levenshteinSimilarity(normalizedName, groupName) > 0.7
      ) {
        group.products.push(product);
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.push({
        normalizedName,
        displayName: product.name,
        products: [product],
      });
    }
  }

  return groups;
}

function levenshteinSimilarity(a, b) {
  if (a.length === 0) return b.length === 0 ? 1 : 0;
  if (b.length === 0) return 0;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const maxLen = Math.max(a.length, b.length);
  return 1 - matrix[b.length][a.length] / maxLen;
}
