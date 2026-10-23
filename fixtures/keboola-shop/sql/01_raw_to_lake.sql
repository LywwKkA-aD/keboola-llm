CREATE OR REPLACE TABLE lake_customers (
  customer_id STRING NOT NULL,
  email STRING,
  first_name STRING,
  last_name STRING,
  country STRING,
  signup_date DATE,
  updated_at TIMESTAMP
);

INSERT INTO lake_customers
SELECT
  customer_id,
  LOWER(TRIM(email)) AS email,
  NULLIF(TRIM(first_name), '') AS first_name,
  NULLIF(TRIM(last_name), '') AS last_name,
  UPPER(TRIM(country)) AS country,
  COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', signup_date), SAFE.PARSE_DATE('%d.%m.%Y', signup_date)) AS signup_date,
  SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', updated_at) AS updated_at
FROM customers
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC) = 1;

CREATE OR REPLACE TABLE lake_products (
  product_id STRING NOT NULL,
  name STRING,
  category STRING,
  price_czk NUMERIC,
  is_active BOOL
);

INSERT INTO lake_products
SELECT
  product_id,
  TRIM(name) AS name,
  REGEXP_REPLACE(LOWER(TRIM(category)), r'[^a-z]+', '_') AS category,
  SAFE_CAST(REPLACE(REGEXP_REPLACE(price, r'[^0-9,.]', ''), ',', '.') AS NUMERIC) AS price_czk,
  LOWER(TRIM(is_active)) IN ('true', '1', 'yes') AS is_active
FROM products;

CREATE OR REPLACE TABLE lake_orders (
  order_id STRING NOT NULL,
  customer_id STRING,
  order_ts TIMESTAMP,
  status STRING,
  currency STRING,
  shipping_fee NUMERIC
);

INSERT INTO lake_orders
SELECT
  order_id,
  customer_id,
  COALESCE(
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', order_ts),
    SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', order_ts)
  ) AS order_ts,
  CASE LOWER(TRIM(status)) WHEN 'canceled' THEN 'cancelled' ELSE LOWER(TRIM(status)) END AS status,
  UPPER(TRIM(currency)) AS currency,
  SAFE_CAST(shipping_fee AS NUMERIC) AS shipping_fee
FROM orders;

CREATE OR REPLACE TABLE lake_order_items (
  order_item_id STRING NOT NULL,
  order_id STRING,
  product_id STRING,
  quantity INT64,
  unit_price NUMERIC
);

INSERT INTO lake_order_items
SELECT
  order_item_id,
  order_id,
  product_id,
  SAFE_CAST(quantity AS INT64) AS quantity,
  SAFE_CAST(REPLACE(unit_price, ',', '.') AS NUMERIC) AS unit_price
FROM order_items;
