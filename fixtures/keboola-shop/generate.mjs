#!/usr/bin/env node
/**
 * Deterministic generator of a small, deliberately messy e-shop dataset (raw layer).
 *   node fixtures/keboola-shop/generate.mjs   -> fixtures/keboola-shop/data/*.csv
 * Same seed, same files: the CSVs in git are reproducible.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'data');
const SEED = 20261024;

/** mulberry32: tiny seeded PRNG. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(SEED);
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (items) => items[int(0, items.length - 1)];
const chance = (p) => random() < p;
const pad = (n, width) => String(n).padStart(width, '0');

const csvCell = (value) => {
  const text = value ?? '';
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const toCsv = (header, rows) => [header.join(','), ...rows.map((row) => header.map((key) => csvCell(row[key])).join(','))].join('\n') + '\n';

const FIRST = ['Jana', 'Petr', 'Eva', 'Tomáš', 'Lucie', 'Martin', 'Anna', 'Jakub', 'Tereza', 'David', 'Klára', 'Ondřej', 'Lena', 'Max', 'Sophie', 'Lukas'];
const LAST = ['Novák', 'Svoboda', 'Dvořák', 'Černá', 'Procházka', 'Kučera', 'Veselá', 'Horák', 'Müller', 'Schmidt', 'Weber', 'Fischer'];
const COUNTRIES = ['CZ', 'cz', 'CZ ', 'SK', 'sk', 'DE', 'de', 'AT'];
const DOMAINS = ['example.com', 'mail.test', 'shop.test'];

function dateParts(start, spanDays) {
  const date = new Date(Date.UTC(start[0], start[1] - 1, start[2]) + int(0, spanDays) * 86_400_000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function customers() {
  const base = Array.from({ length: 185 }, (_, i) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    const { y, m, d } = dateParts([2024, 1, 1], 600);
    const email = `${first}.${last}${i}@${pick(DOMAINS)}`
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    return {
      customer_id: `C${pad(i + 1, 4)}`,
      email: chance(0.25) ? `  ${email.toUpperCase()} ` : chance(0.2) ? email.replace(/^./, (c) => c.toUpperCase()) : email,
      first_name: chance(0.06) ? '' : first,
      last_name: chance(0.04) ? '' : last,
      country: pick(COUNTRIES),
      signup_date: chance(0.5) ? `${y}-${pad(m, 2)}-${pad(d, 2)}` : `${pad(d, 2)}.${pad(m, 2)}.${y}`,
      updated_at: `${y}-${pad(m, 2)}-${pad(d, 2)} ${pad(int(0, 23), 2)}:${pad(int(0, 59), 2)}:00`,
    };
  });
  // Re-imported rows: same customer_id, newer updated_at, a slightly different email or name.
  const duplicates = Array.from({ length: 15 }, () => {
    const original = pick(base);
    return { ...original, email: ` ${original.email.trim().toUpperCase()}`, first_name: original.first_name || pick(FIRST), updated_at: '2025-09-30 08:00:00' };
  });
  return [...base, ...duplicates].sort(() => random() - 0.5);
}

const CATEGORIES = ['Electronics', 'electronics', ' ELECTRONICS', 'Home & Garden', 'home-garden', 'Toys', 'toys ', 'Books', 'books'];
const NOUNS = ['Lamp', 'Kettle', 'Headphones', 'Drone', 'Puzzle', 'Novel', 'Mug', 'Speaker', 'Cable', 'Planter', 'Robot', 'Atlas'];

function formatPrice(czk) {
  const fixed = czk.toFixed(2);
  return pick([fixed, `CZK ${fixed}`, `${fixed.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Kč`]);
}

function products() {
  return Array.from({ length: 40 }, (_, i) => {
    const price = int(49, 4999) + pick([0, 0.9, 0.5]);
    return {
      product_id: `P${pad(i + 1, 3)}`,
      name: `${pick(['Smart', 'Classic', 'Mini', 'Pro', 'Eco'])} ${pick(NOUNS)} ${i + 1}`,
      category: pick(CATEGORIES),
      price: formatPrice(price),
      is_active: pick(['true', '1', 'yes', 'TRUE', 'no', '0']),
      _price: price,
    };
  });
}

const STATUSES = ['paid', 'PAID', 'Paid ', 'shipped', 'Shipped', 'delivered', 'cancelled', 'CANCELED', 'refunded'];

function orders(customerIds) {
  return Array.from({ length: 1000 }, (_, i) => {
    const { y, m, d } = dateParts([2025, 1, 1], 270);
    const time = `${pad(int(0, 23), 2)}:${pad(int(0, 59), 2)}:${pad(int(0, 59), 2)}`;
    return {
      order_id: `O${pad(i + 1, 5)}`,
      customer_id: chance(0.01) ? `C${pad(int(900, 999), 4)}` : pick(customerIds),
      order_ts: chance(0.6) ? `${y}-${pad(m, 2)}-${pad(d, 2)} ${time}` : `${y}-${pad(m, 2)}-${pad(d, 2)}T${time}Z`,
      status: pick(STATUSES),
      currency: 'CZK',
      shipping_fee: pick(['0', '79', '99', '99.00', '129']),
    };
  });
}

function orderItems(orderRows, productRows) {
  let n = 0;
  return orderRows.flatMap((order) =>
    Array.from({ length: int(1, 4) }, () => {
      const product = pick(productRows);
      n += 1;
      const orphan = chance(0.01);
      return {
        order_item_id: `OI${pad(n, 6)}`,
        order_id: order.order_id,
        product_id: orphan ? `P${pad(int(90, 99), 3)}` : product.product_id,
        quantity: String(pick([1, 1, 1, 2, 2, 3, 5])),
        unit_price: chance(0.3) ? product._price.toFixed(2).replace('.', ',') : product._price.toFixed(2),
      };
    }),
  );
}

const customerRows = customers();
const productRows = products();
const orderRows = orders([...new Set(customerRows.map((row) => row.customer_id))]);
const itemRows = orderItems(orderRows, productRows);

mkdirSync(OUT, { recursive: true });
const files = {
  'customers.csv': toCsv(['customer_id', 'email', 'first_name', 'last_name', 'country', 'signup_date', 'updated_at'], customerRows),
  'products.csv': toCsv(['product_id', 'name', 'category', 'price', 'is_active'], productRows),
  'orders.csv': toCsv(['order_id', 'customer_id', 'order_ts', 'status', 'currency', 'shipping_fee'], orderRows),
  'order_items.csv': toCsv(['order_item_id', 'order_id', 'product_id', 'quantity', 'unit_price'], itemRows),
};
Object.entries(files).forEach(([name, content]) => {
  writeFileSync(join(OUT, name), content);
  console.log(`${name}: ${content.trimEnd().split('\n').length - 1} rows, ${(content.length / 1024).toFixed(1)} KB`);
});
