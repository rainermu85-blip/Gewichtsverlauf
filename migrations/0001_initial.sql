CREATE TABLE entries (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  weight_tenths INTEGER NOT NULL CHECK(weight_tenths BETWEEN 100 AND 5000),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);
