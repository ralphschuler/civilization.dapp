import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { connectWithRetry } from "../src/lib/database-connect.mjs";

function postgresError(code, message = "connection details must stay private") {
  const error = new Error(message);
  error.code = code;
  return error;
}

test("initial PostgreSQL connect retries only transient failures", async () => {
  let calls = 0;
  const client = { release() {} };
  const pool = {
    async connect() {
      calls += 1;
      if (calls < 3) throw postgresError("ECONNREFUSED");
      return client;
    },
  };

  assert.equal(
    await connectWithRetry(pool, {
      attempts: 3,
      retryDelayMilliseconds: 0,
      timeoutMilliseconds: 20,
    }),
    client,
  );
  assert.equal(calls, 3);
});

test("initial PostgreSQL connect retries DNS, pipe, and SQLSTATE class 08 failures", async () => {
  for (const code of ["ENOTFOUND", "EAI_AGAIN", "EPIPE", "08006"]) {
    let calls = 0;
    const client = { release() {} };
    const pool = {
      async connect() {
        calls += 1;
        if (calls === 1) throw postgresError(code);
        return client;
      },
    };

    assert.equal(
      await connectWithRetry(pool, {
        attempts: 2,
        retryDelayMilliseconds: 0,
        timeoutMilliseconds: 20,
      }),
      client,
    );
    assert.equal(calls, 2, code);
  }
});

test("initial PostgreSQL connect does not retry permanent or migration failures", async () => {
  for (const code of ["28P01", "3D000", "42501", "42P01"]) {
    let calls = 0;
    const pool = {
      async connect() {
        calls += 1;
        throw postgresError(code, "password=private");
      },
    };

    await assert.rejects(
      connectWithRetry(pool, {
        attempts: 3,
        retryDelayMilliseconds: 0,
        timeoutMilliseconds: 20,
      }),
      (error) => error?.message === "database_unavailable",
    );
    assert.equal(calls, 1, code);
  }
});

test("initial PostgreSQL connect stops at its exact transient attempt bound", async () => {
  let calls = 0;
  const pool = {
    async connect() {
      calls += 1;
      throw postgresError("ENOTFOUND", "host=private.internal");
    },
  };

  await assert.rejects(
    connectWithRetry(pool, {
      attempts: 3,
      retryDelayMilliseconds: 0,
      timeoutMilliseconds: 20,
    }),
    (error) =>
      error?.message === "database_unavailable" &&
      !error.message.includes("private.internal"),
  );
  assert.equal(calls, 3);
});

test("initial PostgreSQL connect releases a client that arrives after timeout", async () => {
  let resolveConnection;
  let releases = 0;
  const connection = new Promise((resolve) => {
    resolveConnection = resolve;
  });
  const pool = { connect: () => connection };

  await assert.rejects(
    connectWithRetry(pool, {
      attempts: 1,
      retryDelayMilliseconds: 0,
      timeoutMilliseconds: 5,
    }),
    (error) => error?.message === "database_unavailable",
  );

  resolveConnection({
    release() {
      releases += 1;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(releases, 1);
});

test("PostgreSQL container probes use TCP explicitly", async () => {
  const templates = await Promise.all(
    [
      "compose.yaml",
      "deploy/truenas.yaml",
      "deploy/truenas.dev.example.yaml",
      ".github/workflows/container.yml",
    ].map((path) => readFile(path, "utf8")),
  );
  for (const template of templates)
    assert.match(template, /pg_isready -h 127\.0\.0\.1 -p 5432/);
});

test("the Dev PostgreSQL probe uses the container's configured identity", async () => {
  const template = await readFile("deploy/truenas.dev.example.yaml", "utf8");

  assert.match(
    template,
    /pg_isready -h 127\.0\.0\.1 -p 5432 -U "\$\$POSTGRES_USER" -d "\$\$POSTGRES_DB"/,
  );
  assert.doesNotMatch(template, /-U civilization_dev -d civilization_dev/);
});
