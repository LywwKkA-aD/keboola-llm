# Keboola shop fixture

A tiny e-shop pipeline that mirrors the analyst's real work: messy raw exports, SQL transformations into a
data lake layer, then a star-schema DWH. Agents are tested on it for search, lineage, job debugging, SQL
review and optimization. What they are expected to find is in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) - keep that
file out of the agents' knowledge base.

| Layer | Bucket | Tables (rows) |
|---|---|---|
| Raw (strings, as exported) | `in.c-shop_raw` | customers (200), products (40), orders (1000), order_items (2501) |
| Data lake (typed, cleaned, deduplicated) | `out.c-shop_lake` | customers (185), products (40), orders (1000), order_items (2501) |
| DWH (star schema) | `out.c-shop_dwh` | dim_customer (185), dim_product (40), dim_date (271), fct_orders (1000), fct_order_items (2501) |

Objects in the test project (6487, `connection.us-east4.gcp.keboola.com`, BigQuery backend):

| Object | Id |
|---|---|
| Transformation "Shop 01 - raw to lake" (`keboola.google-bigquery-transformation`) | `01m5ndt8s4stwess6fn86ksarc` |
| Transformation "Shop 02 - lake to DWH" (`keboola.google-bigquery-transformation`) | `01m5ne18awcvbsznntean4k7q4` |
| Flow "Shop pipeline" (`keboola.flow`, phases: 01 then 02) | `01m5nek3cmc3edeqagven316m5` |

## Files

- `generate.mjs` - deterministic generator (fixed seed) of `data/*.csv`; rerunning it reproduces the same bytes.
- `sql/01_raw_to_lake.sql`, `sql/02_lake_to_dwh.sql` - exactly the code stored in the two transformations.
- `storage/*.json` - input/output mappings of the two transformations.
- `flow.json` - the flow definition (task config ids are project-specific).

## Recreate on another project

Replace `PROJECT` with the kbagent alias (`kbagent project list`). Every write below was previewed with
`--dry-run` first where the command supports it.

```sh
node fixtures/keboola-shop/generate.mjs

# Raw layer: bucket + string tables (customers has duplicates, so no primary key) + uploads
kbagent --json storage create-bucket --project PROJECT --stage in --name shop_raw \
  --description "Shop test fixture: raw e-shop exports, untyped and messy"
kbagent --json storage create-table --project PROJECT --bucket-id in.c-shop_raw --name customers \
  --column customer_id:STRING --column email:STRING --column first_name:STRING --column last_name:STRING \
  --column country:STRING --column signup_date:STRING --column updated_at:STRING
kbagent --json storage create-table --project PROJECT --bucket-id in.c-shop_raw --name products \
  --column product_id:STRING --column name:STRING --column category:STRING --column price:STRING \
  --column is_active:STRING --primary-key product_id
kbagent --json storage create-table --project PROJECT --bucket-id in.c-shop_raw --name orders \
  --column order_id:STRING --column customer_id:STRING --column order_ts:STRING --column status:STRING \
  --column currency:STRING --column shipping_fee:STRING --primary-key order_id
kbagent --json storage create-table --project PROJECT --bucket-id in.c-shop_raw --name order_items \
  --column order_item_id:STRING --column order_id:STRING --column product_id:STRING --column quantity:STRING \
  --column unit_price:STRING --primary-key order_item_id
for t in customers products orders order_items; do
  kbagent --json storage upload-table --project PROJECT --table-id "in.c-shop_raw.$t" \
    --file "fixtures/keboola-shop/data/$t.csv" --no-auto-create
done

# Transformations: create with the SQL, then set the full storage mapping (create only knows outputs)
kbagent --json transformation create --project PROJECT --name "Shop 01 - raw to lake" \
  --sql-file fixtures/keboola-shop/sql/01_raw_to_lake.sql --component-id keboola.google-bigquery-transformation \
  --description "Cleans, types and deduplicates the raw e-shop exports into the data lake layer."
kbagent --json transformation edit --project PROJECT --config-id <ID_01> \
  --change-description "Map raw inputs and lake outputs" --storage @fixtures/keboola-shop/storage/01_raw_to_lake.json
kbagent --json transformation create --project PROJECT --name "Shop 02 - lake to DWH" \
  --sql-file fixtures/keboola-shop/sql/02_lake_to_dwh.sql --component-id keboola.google-bigquery-transformation \
  --description "Builds the star schema (customer, product and date dimensions, order and order item facts) from the data lake layer."
kbagent --json transformation edit --project PROJECT --config-id <ID_02> \
  --change-description "Map lake inputs and DWH outputs" --storage @fixtures/keboola-shop/storage/02_lake_to_dwh.json

# Flow (put <ID_01>/<ID_02> into flow.json first), then run each transformation once
kbagent --json flow validate --project PROJECT --file @fixtures/keboola-shop/flow.json
kbagent --json flow new --project PROJECT --name "Shop pipeline" \
  --description "Runs the shop fixture end to end: raw to lake, then lake to DWH." --file @fixtures/keboola-shop/flow.json
kbagent --json job run --project PROJECT --component-id keboola.google-bigquery-transformation --config-id <ID_01> --wait
kbagent --json job run --project PROJECT --component-id keboola.google-bigquery-transformation --config-id <ID_02> --wait
```

To change the SQL later: `kbagent transformation show` (ids `b0` / `b0.c0`), then `transformation edit --op-file`
with a `set_code` op holding the whole file. Each successful run takes about 80-90 s of the free plan's minutes.

## Lessons from building it on BigQuery

- `CREATE TABLE ... AS SELECT` always produces NULLABLE columns, while Keboola stores primary-key columns as
  REQUIRED. The first run works, every rerun fails with `Key column ... cannot be modified ... REQUIRED -> NULLABLE`.
  The SQL therefore declares each output table with `NOT NULL` keys and fills it with `INSERT ... SELECT`.
- Input tables in a BigQuery workspace carry Keboola's `_timestamp` column; `SELECT *` drags it into outputs and the
  output mapping rejects names starting with `_`.
- In `QUALIFY`, BigQuery resolves a select-list alias before the input column of the same name.

## Snowflake version

- Component: `keboola.snowflake-transformation`.
- Identifiers: Snowflake workspace tables are upper-case unless quoted; quote the lower-case names
  (`"customers"`, `"customer_id"`) or the mapping will not find them.
- Functions: `TRY_TO_DATE(s, 'YYYY-MM-DD')` / `TRY_TO_DATE(s, 'DD.MM.YYYY')` instead of `SAFE.PARSE_DATE`,
  `TRY_TO_TIMESTAMP` instead of `SAFE.PARSE_TIMESTAMP`, `TRY_TO_NUMBER` instead of `SAFE_CAST(... AS NUMERIC)`,
  `REGEXP_REPLACE(s, '[^a-z]+', '_')` without the `r` prefix, `NUMBER`/`BOOLEAN` types, `DAYNAME()` for weekday,
  a date spine via `GENERATOR(ROWCOUNT => n)` instead of `GENERATE_DATE_ARRAY`.
- `QUALIFY` and `SELECT * EXCLUDE (...)` (instead of `EXCEPT`) exist in Snowflake too.
