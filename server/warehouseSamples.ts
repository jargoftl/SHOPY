import type { Database } from './database.ts'

const photos = {
  food: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=900&q=85',
  fashion: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=85',
  bag: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85',
  tech: 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=85',
  home: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85',
  jewelry: 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85',
}

const samples: Array<[string, string, number, string]> = [
  ['House Tea', 'Food & Beverage / Tea', 12, photos.food],
  ['Classic Shirt', "Men's Clothing / Men's Shirts", 28, photos.fashion],
  ['Everyday Top', "Women's Clothing / Women's Top", 26, photos.fashion],
  ['Mixed Nuts', 'Snack Dessert / Nut', 9, photos.food],
  ['Fishing Kit', 'Recreational Fishing Gear / Fishing Box', 32, photos.bag],
  ['Phone Charging Cable', 'Phones & Accessories / Charger & Charging Cable', 14, photos.tech],
  ['Disposable Masks', 'Epidemic Prevention Supplies / Medical Masks', 10, photos.home],
  ['Desk Notebook', 'Office Stationery / Paper & Notebook', 11, photos.home],
  ['Wireless Mouse', 'Computer Peripherals / Keyboard & Mouse', 24, photos.tech],
  ['Wireless Earbuds', 'Digital Products / Headphones & Headphones', 39, photos.tech],
  ['Outdoor Daypack', 'Sports & Outdoors / Travel Goods', 42, photos.bag],
  ['Table Fan', 'Home Appliances / Fans & Air Conditioning Equipment', 35, photos.home],
  ['Hand Care Set', 'Health Beauty & Hair / Skin Care', 18, photos.home],
  ['Baby Outfit', 'Kids & Babies / Baby Clothes', 22, photos.fashion],
  ['Pendant Necklace', 'Jewelry & Watches / Necklaces & Pendants', 30, photos.jewelry],
  ['Plush Toy', 'Kids Toys / Plush Toy', 19, photos.home],
  ['Evening Bag', 'Luxury / Bags', 75, photos.bag],
  ['Holiday Decoration', 'Holiday decoration / Christmas Decorations', 16, photos.home],
  ['Kids Jacket', "Children's clothing / Boy's Jacket", 29, photos.fashion],
  ['Everyday Backpack', "Men's Bag / Men's Backpack", 38, photos.bag],
  ['Shoulder Bag', 'Ladies Bag / Ladies Shoulder Bag', 40, photos.bag],
]

export async function seedWarehouseSamples(db: Database) {
  if ((await db.prepare("SELECT 1 FROM schema_migrations WHERE name='warehouse_samples_v1'").get())) return
  await db.transaction(async () => {
    const insert = db.prepare('INSERT INTO warehouse_products (product_json) VALUES (?)')
    for (const [name, category, price, imageUrl] of samples) {
      await insert.run(JSON.stringify({
        name: `Sample: ${name}`, category, price, imageUrl,
        description: 'Sample product for testing. Image is illustrative and may not depict the item.',
        compareAtPrice: null, imageUrls: [imageUrl], colors: [], sizes: [], rating: 0,
        isPublished: true, isStorePublished: true,
      }))
    }
    await db.prepare("INSERT INTO schema_migrations (name) VALUES ('warehouse_samples_v1')").run()
  })()
}
