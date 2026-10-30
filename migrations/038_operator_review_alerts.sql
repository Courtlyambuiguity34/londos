CREATE TABLE operator_review_alerts (
  user_id text PRIMARY KEY REFERENCES "user"(id),
  enabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
