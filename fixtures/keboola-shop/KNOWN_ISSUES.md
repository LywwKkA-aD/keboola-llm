# Known issues (answer key)

Planted on purpose so the agents have something real to find. Not documented anywhere in Keboola (no
descriptions, no SQL comments). Do not put this file into `/knowledge/`.

## 1. Revenue double-counts the shipping fee (correctness)

`Shop 02 - lake to DWH`, statement building `fct_orders`:

```sql
SUM(o.shipping_fee) AS shipping_fee,
SUM(i.quantity * i.unit_price) + SUM(o.shipping_fee) AS revenue
FROM lake_orders o
LEFT JOIN lake_order_items i ON i.order_id = o.order_id
GROUP BY ...
```

The join fans each order out to one row per item, so the order-level `shipping_fee` is summed once per item.
`fct_orders.shipping_fee` and `fct_orders.revenue` are overstated for every order with more than one item and a
non-zero fee: 595 of 1000 orders, 121,636 CZK in total (computed from the generated CSVs).

Fix: aggregate items per order first (CTE or subquery), then join that to `lake_orders` and add the fee once
(`ANY_VALUE(o.shipping_fee)` would also work, but pre-aggregating is cleaner).

Also arguable: `revenue` includes cancelled and refunded orders; a reviewer should at least ask.

## 2. `dim_product`: SELECT * and a needless cross join (performance / style)

```sql
SELECT p.* EXCEPT (_timestamp), c.category AS category_name
FROM lake_products p
CROSS JOIN (SELECT DISTINCT category FROM lake_products) c
WHERE c.category = p.category;
```

- The cross join with a `DISTINCT` subquery filtered back to equality is just `p.category`: an extra scan and a
  join that adds nothing; on a real product table it multiplies work before the filter.
- `p.*` ties the insert to the column order of the lake table; `EXCEPT (_timestamp)` is a patch for Keboola's
  system column leaking through, which an explicit column list avoids. Any new lake column breaks or silently
  shifts the insert.

Fix: `SELECT product_id, name, category, price_czk, is_active, category AS category_name FROM lake_products`
(and question whether `category_name` is needed at all).

## Data quality traps (in the data, not in the SQL)

- 29 `order_items` rows point to product ids `P090`-`P099` that do not exist in `products`
  (`fct_order_items` keeps them; a join to `dim_product` drops them).
- 7 orders reference customer ids `C09xx` that do not exist in `customers`.
- 15 raw customer rows are re-imported duplicates (same `customer_id`, newer `updated_at`); the lake keeps the
  newest one, so 200 raw rows become 185.
- Raw `price` comes in three formats (`1299.00`, `CZK 1299.00`, `1 299,00 Kč`), `unit_price` sometimes uses a
  decimal comma, `status` mixes casing and `canceled`/`cancelled`, timestamps use two formats.
