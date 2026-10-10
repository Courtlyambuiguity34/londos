ALTER TABLE email_campaigns DROP CONSTRAINT email_campaigns_cta_path_check;
ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_cta_path_check
 CHECK(cta_path ~ '^/[A-Za-z0-9/_?=&.-]*$' AND length(cta_path)<=301);
