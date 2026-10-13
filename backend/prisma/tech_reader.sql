-- Read-only database login for the gyftr.com tech team.
--
-- Run by the application at start-up (src/techAccess.ts), never by hand. Safe to run again: once
-- the login exists as described here, running it changes nothing and needs no special right.
--
-- What the login may do is decided by its grants: SELECT on "Occasion" and "PagePublication", and
-- on the two linking columns of "Page". Nothing else can be read and nothing can be written.
-- The session settings (read-only transactions, timeouts) are guards against accidents, not
-- security: a session can change them. The connection limit is enforced by the server.
--
-- The application hands over two values as transaction settings:
--   occasion.tech_reader_login     the login name
--   occasion.tech_reader_verifier  the password as a SCRAM-SHA-256 verifier (never the plain password),
--                                  only when the login has to be created or its password changed
--
-- Messages raised as WARNING and starting with "tech_reader:" are shown on GET /healthz.

DO $$
DECLARE
    login      text := nullif(current_setting('occasion.tech_reader_login', true), '');
    verifier   text := nullif(current_setting('occasion.tech_reader_verifier', true), '');
    conn_limit constant int    := 20;
    wanted     constant text[] := ARRAY[
        'default_transaction_read_only=on',
        'statement_timeout=15s',
        'lock_timeout=5s',
        'idle_in_transaction_session_timeout=60s'];
    r          pg_roles%ROWTYPE;
    present    boolean;
    applied    text[];
    missing    text[] := '{}';
    setting    text;
BEGIN
    IF login IS NULL THEN
        RAISE EXCEPTION 'occasion.tech_reader_login is not set';
    END IF;

    -- Several containers start at the same time: one sets the login up, the others wait.
    PERFORM pg_advisory_xact_lock(hashtext('occasion-tech-reader'));

    SELECT * INTO r FROM pg_roles WHERE rolname = login;
    present := FOUND;

    -- Only ever touch a plain login: never the user running this, never a privileged role.
    IF login IN (current_user, session_user)
       OR (present AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)) THEN
        RAISE EXCEPTION 'refusing to manage "%": it is not a plain read-only login', login;
    END IF;

    IF verifier IS NOT NULL THEN
        IF NOT present THEN
            -- The one statement that needs the CREATEROLE right ("permission denied to create role" without it).
            EXECUTE format(
                'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT %s',
                login, verifier, conn_limit);
            SELECT * INTO r FROM pg_roles WHERE rolname = login;
            present := true;
        ELSE
            BEGIN
                EXECUTE format('ALTER ROLE %I LOGIN PASSWORD %L', login, verifier);
            EXCEPTION WHEN insufficient_privilege THEN
                RAISE WARNING 'tech_reader: the password of login "%" is not the configured one, and this database user may not change it', login;
            END;
        END IF;
    END IF;

    IF NOT present THEN
        RETURN; -- no password configured and no login: nothing to do
    END IF;

    -- Limits, applied only where they differ from what is wanted.
    IF r.rolconnlimit IS DISTINCT FROM conn_limit THEN
        BEGIN
            EXECUTE format('ALTER ROLE %I CONNECTION LIMIT %s', login, conn_limit);
        EXCEPTION WHEN insufficient_privilege THEN
            missing := missing || format('connection limit %s', conn_limit);
        END;
    END IF;

    SELECT setconfig INTO applied FROM pg_db_role_setting WHERE setrole = r.oid AND setdatabase = 0;
    FOREACH setting IN ARRAY wanted LOOP
        IF applied IS NULL OR NOT (setting = ANY (lower(applied::text)::text[])) THEN
            BEGIN
                EXECUTE format('ALTER ROLE %I SET %s TO %L', login, split_part(setting, '=', 1), split_part(setting, '=', 2));
            EXCEPTION WHEN insufficient_privilege THEN
                missing := missing || setting;
            END;
        END IF;
    END LOOP;
    IF cardinality(missing) > 0 THEN
        RAISE WARNING 'tech_reader: login "%" is missing these limits, and this database user may not set them: %', login, array_to_string(missing, ', ');
    END IF;

    -- Rights: exactly these, whatever was granted before.
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', login);
    EXECUTE format('GRANT SELECT ON public."Occasion", public."PagePublication" TO %I', login);
    EXECUTE format('GRANT SELECT ("id", "occasionId") ON public."Page" TO %I', login);

    IF NOT has_schema_privilege(login, 'public', 'USAGE') THEN
        RAISE WARNING 'tech_reader: login "%" may not use schema public; the schema owner must run: GRANT USAGE ON SCHEMA public TO %', login, quote_ident(login);
    END IF;
END $$;
