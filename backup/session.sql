create table if not exists backup_vaults (
  user_id integer primary key,
  nonce text not null unique,
  repo_id integer unique
);
create table if not exists github_sessions (
  id text primary key,
  user_id integer not null,
  access text not null,
  refresh text not null,
  renew integer not null,
  expires integer not null
);
