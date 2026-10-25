-- Strip only the legacy suffix that exactly matches this shop's own ID.
-- Existing address history is immutable and remains the reservation authority.
-- Acquire merchant locks before the address lock, matching application writes.
DO $$
DECLARE entry record; clean text;
BEGIN
 PERFORM m.id FROM merchants m
 WHERE EXISTS(SELECT 1 FROM shops s WHERE s.merchant_id=m.id
   AND right(s.slug,37)='-'||s.id::text)
 ORDER BY m.id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('shop-address-allocation',0));
 FOR entry IN SELECT id,merchant_id,slug FROM shops
   WHERE right(slug,37)='-'||id::text ORDER BY created_at,id FOR UPDATE
 LOOP
   clean := left(entry.slug,length(entry.slug)-37);
   IF length(clean)<3 OR clean !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR clean !~ '[a-z]'
     OR clean ~ '(^|-)([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32})$'
     OR EXISTS(SELECT 1 FROM shop_addresses WHERE slug=clean AND shop_id<>entry.id)
   THEN CONTINUE; END IF;
   BEGIN
     UPDATE shops SET slug=clean,version=version+1,updated_at=now() WHERE id=entry.id;
     INSERT INTO audit_events(id,merchant_id,action,resource_id,details)
       VALUES(gen_random_uuid(),entry.merchant_id,'shop.address.cleaned',entry.id::text,
         jsonb_build_object('from',entry.slug,'to',clean,'migration','036'));
   EXCEPTION WHEN unique_violation THEN
     -- A conflicting historical reservation must never be stolen or numbered.
     CONTINUE;
   END;
 END LOOP;
END $$;
