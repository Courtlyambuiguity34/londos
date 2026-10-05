ALTER TABLE operator_grants DROP CONSTRAINT operator_grants_permission_check;
ALTER TABLE operator_grants ADD CONSTRAINT operator_grants_permission_check CHECK(permission IN ('support','review','finance','moderation','recovery','jobs','operations','analytics'));
CREATE TABLE pilot_receipts (
 id text PRIMARY KEY CHECK(length(id)=64), fingerprint text NOT NULL CHECK(length(fingerprint)=64), expires_at timestamptz NOT NULL
);
CREATE INDEX pilot_receipt_expiry ON pilot_receipts(expires_at);
CREATE TABLE pilot_metrics (
 day date NOT NULL, shop_id uuid, merchant_id uuid,
 event text NOT NULL CHECK(event IN ('mall_visit','search_submitted','search_results_viewed','shop_result_clicked','shop_viewed','department_viewed','product_viewed','contact_action_clicked','direct_link_entry')),
 source text NOT NULL CHECK(source IN ('none','direct','discovery','unattributed')),
 detail text NOT NULL CHECK(detail IN ('none','empty','few','many','call','whatsapp','enquiry','website')),
 count bigint NOT NULL CHECK(count>0),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id),
 CHECK((shop_id IS NULL)=(merchant_id IS NULL)),
 CHECK((shop_id IS NULL)=(event IN ('mall_visit','search_submitted','search_results_viewed'))),
 CHECK((source='none')=(shop_id IS NULL)),
 CHECK((detail IN ('empty','few','many'))=(event='search_results_viewed')),
 CHECK((detail IN ('call','whatsapp','enquiry','website'))=(event='contact_action_clicked')),
 UNIQUE NULLS NOT DISTINCT(day,shop_id,event,source,detail)
);
CREATE INDEX pilot_shop_window ON pilot_metrics(shop_id,day);
CREATE INDEX pilot_metric_retention ON pilot_metrics(day);
CREATE INDEX pilot_canonical_activity ON audit_events(created_at,action) WHERE action IN ('shop.design.published','catalogue.product.saved','catalogue.department.saved');
