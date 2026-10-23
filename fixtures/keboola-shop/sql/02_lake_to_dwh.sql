CREATE OR REPLACE TABLE dim_customer (
  customer_key STRING NOT NULL,
  email STRING,
  full_name STRING,
  country STRING,
  signup_date DATE
);

INSERT INTO dim_customer
SELECT
  customer_id AS customer_key,
  email,
  TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS full_name,
  country,
  signup_date
FROM lake_customers;

CREATE OR REPLACE TABLE dim_product (
  product_id STRING NOT NULL,
  name STRING,
  category STRING,
  price_czk NUMERIC,
  is_active BOOL,
  category_name STRING
);

INSERT INTO dim_product
SELECT p.* EXCEPT (_timestamp), c.category AS category_name
FROM lake_products p
CROSS JOIN (SELECT DISTINCT category FROM lake_products) c
WHERE c.category = p.category;

CREATE OR REPLACE TABLE dim_date (
  date_key DATE NOT NULL,
  year INT64,
  month INT64,
  day INT64,
  weekday_name STRING,
  is_weekend BOOL
);

INSERT INTO dim_date
SELECT
  d AS date_key,
  EXTRACT(YEAR FROM d) AS year,
  EXTRACT(MONTH FROM d) AS month,
  EXTRACT(DAY FROM d) AS day,
  FORMAT_DATE('%A', d) AS weekday_name,
  EXTRACT(DAYOFWEEK FROM d) IN (1, 7) AS is_weekend
FROM UNNEST(GENERATE_DATE_ARRAY(
  (SELECT MIN(DATE(order_ts)) FROM lake_orders),
  (SELECT MAX(DATE(order_ts)) FROM lake_orders)
)) AS d;

CREATE OR REPLACE TABLE fct_order_items (
  order_item_id STRING NOT NULL,
  order_id STRING,
  customer_id STRING,
  product_id STRING,
  order_date DATE,
  quantity INT64,
  unit_price NUMERIC,
  line_amount NUMERIC
);

INSERT INTO fct_order_items
SELECT
  i.order_item_id,
  i.order_id,
  o.customer_id,
  i.product_id,
  DATE(o.order_ts) AS order_date,
  i.quantity,
  i.unit_price,
  i.quantity * i.unit_price AS line_amount
FROM lake_order_items i
JOIN lake_orders o ON o.order_id = i.order_id;

CREATE OR REPLACE TABLE fct_orders (
  order_id STRING NOT NULL,
  customer_id STRING,
  order_date DATE,
  status STRING,
  items_count INT64,
  items_amount NUMERIC,
  shipping_fee NUMERIC,
  revenue NUMERIC
);

INSERT INTO fct_orders
SELECT
  o.order_id,
  o.customer_id,
  DATE(o.order_ts) AS order_date,
  o.status,
  COUNT(i.order_item_id) AS items_count,
  SUM(i.quantity * i.unit_price) AS items_amount,
  SUM(o.shipping_fee) AS shipping_fee,
  SUM(i.quantity * i.unit_price) + SUM(o.shipping_fee) AS revenue
FROM lake_orders o
LEFT JOIN lake_order_items i ON i.order_id = o.order_id
GROUP BY o.order_id, o.customer_id, order_date, o.status;
