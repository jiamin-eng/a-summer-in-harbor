import { createRequire as harborCreateRequire } from 'node:module'; const require = harborCreateRequire(import.meta.url);

// _qa/temporary-account-server.ts
import { createServer } from "node:http";
import { createHash as createHash3, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openAsyncSqliteAuthorityStore } from "../../vendor/dynamic-runtime/packages/authority-session/async.mjs";

// src/fishing-release.ts
var FISHING_PROTOCOL = "2";
var FISHING_RELEASE = "harbor-fishing-mobile-height-20261022-v1";
var FISHING_MODE = false ? "open" : "open";
if (!["open", "stop-new"].includes(FISHING_MODE)) throw Error("INVALID_FISHING_RELEASE_MODE");
var FISHING_NEW_STARTS = FISHING_MODE === "open";
var fishingContract = () => ({ fishingProtocol: FISHING_PROTOCOL, fishingRelease: FISHING_RELEASE, mode: FISHING_MODE });
function assertFishingStartAllowed(action, newStarts = FISHING_NEW_STARTS) {
  if (!newStarts && ["fishing-kit:claim", "fishing:start", "challenge-start:fishing"].includes(action)) throw Object.assign(Error("FISHING_NEW_STARTS_CLOSED"), { status: 409, terminal: true });
}

// server/fishing-client-contract.ts
function fishingClientContract(req, res) {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/api/client-contract" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(fishingContract()));
    return true;
  }
  if (req.headers["x-harbor-fishing"] === FISHING_PROTOCOL) return false;
  res.writeHead(409, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Harbor-Client-Refresh": "required" });
  res.end(JSON.stringify({ error: "CLIENT_REFRESH_REQUIRED", terminal: false, requiredFishingProtocol: FISHING_PROTOCOL, message: { en: "Reload the game to continue safely. Any saved catch is kept.", zh: "\u8BF7\u91CD\u65B0\u8F7D\u5165\u6E38\u620F\u518D\u7EE7\u7EED\uFF1B\u5DF2\u7ECF\u4FDD\u5B58\u7684\u9493\u83B7\u4F1A\u4FDD\u7559\u3002" } }));
  return true;
}

// server/account-journeys.mjs
import { AsyncLocalStorage } from "node:async_hooks";
import { AsyncSessionAuthority } from "../../vendor/dynamic-runtime/packages/authority-session/async.mjs";
var fail = (code, status = 409) => {
  throw Object.assign(Error(code), { code, status });
};
var uuid = (x) => typeof x === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
var owner = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
function createAccountJourneyService({ enabled = false, store, runtime: runtime2, verifyActor, resolveActor = verifyActor, decorateAuthority } = {}) {
  async function actor2(request2) {
    if (!enabled) fail("ACCOUNT_SERVICE_DISABLED", 503);
    if (typeof resolveActor !== "function") fail("PLATFORM_CONTEXT_UNAVAILABLE", 401);
    const a = await resolveActor(request2);
    if (!a || a.gameId !== store.gameId || !["account", "browser"].includes(a.kind) || !owner(a.owner) || a.browserOwner !== void 0 && !owner(a.browserOwner) || typeof a.assertCurrent !== "function") fail("VERIFIED_ACTOR_REQUIRED", 401);
    const proof = Object.freeze({ ...a });
    await proof.assertCurrent();
    return proof;
  }
  async function access(repo, a, id) {
    const binding = await repo.accountBinding(id);
    if (binding) {
      if (a.kind !== "account" || binding.account !== a.owner) fail("SESSION_NOT_FOUND", 404);
      return binding.legacy;
    }
    if (!await repo.session(a.owner, id)) fail("SESSION_NOT_FOUND", 404);
    return a.owner;
  }
  const callContext = new AsyncLocalStorage();
  const guardedStore = { ...store, transaction: (work) => store.transaction(async (repo) => {
    const scope = callContext.getStore();
    if (!scope) fail("ACCOUNT_SCOPE_REQUIRED", 500);
    const { a, id, storageOwner } = scope;
    await a.assertCurrent();
    if (await access(repo, a, id) !== storageOwner) fail("SESSION_ACCESS_CHANGED");
    const result = await work(repo);
    await a.assertCurrent();
    return result;
  }) };
  const originalAuthority = new AsyncSessionAuthority(guardedStore, runtime2);
  const authority = decorateAuthority ? decorateAuthority(originalAuthority, guardedStore, runtime2) : originalAuthority;
  async function invoke(request2, id, method, ...args) {
    const a = await actor2(request2);
    if (!uuid(id)) fail("INVALID_SESSION");
    const storageOwner = await store.transaction(async (repo) => {
      await a.assertCurrent();
      return access(repo, a, id);
    });
    const result = await callContext.run({ a, id, storageOwner }, () => authority[method](storageOwner, id, ...args));
    await store.transaction(async (repo) => {
      await a.assertCurrent();
      await access(repo, a, id);
    });
    return result;
  }
  async function directoryFor(repo, a) {
    const own = await repo.list(a.owner), bindings = a.kind === "account" ? await repo.accountBindings(a.owner) : [];
    const result = [];
    for (const row of own) {
      const binding = await repo.accountBinding(row.id);
      if (!binding || a.kind === "account" && binding.account === a.owner) result.push(row);
    }
    for (const binding of bindings) {
      const row = await repo.session(binding.legacy, binding.session);
      if (!row) fail("ACCOUNT_BINDING_DANGLING", 500);
      if (!result.some((x) => x.id === row.id)) result.push(row);
    }
    return result.sort((a2, b) => b.updated - a2.updated || a2.id.localeCompare(b.id)).map((row) => {
      const h = JSON.parse(row.data);
      runtime2.assertReadable(h);
      return { id: row.id, version: h.version, cursor: row.cursor, scene: runtime2.scene(h), updated: row.updated };
    });
  }
  return Object.freeze({
    async withStorageAccess(request2, id, work) {
      const a = await actor2(request2);
      if (!uuid(id)) fail("INVALID_SESSION");
      const check = () => store.transaction(async (repo) => {
        await a.assertCurrent();
        return access(repo, a, id);
      });
      const storageOwner = await check();
      const result = await work(storageOwner, a.owner);
      await check();
      return result;
    },
    async legacyDirectory(request2) {
      const a = await actor2(request2);
      if (a.kind !== "account" || !owner(a.browserOwner) || a.browserOwner === a.owner) fail("DUAL_PROOF_REQUIRED", 401);
      return store.transaction(async (repo) => {
        await a.assertCurrent();
        const d = await directoryFor(repo, { ...a, kind: "browser", owner: a.browserOwner });
        await a.assertCurrent();
        return d;
      });
    },
    async directory(request2) {
      const a = await actor2(request2);
      return store.transaction(async (repo) => {
        await a.assertCurrent();
        const d = await directoryFor(repo, a);
        await a.assertCurrent();
        return d;
      });
    },
    async claim(request2, body) {
      const a = await actor2(request2);
      if (a.kind !== "account" || !owner(a.browserOwner) || a.browserOwner === a.owner) fail("DUAL_PROOF_REQUIRED", 401);
      if (!body || Object.keys(body).some((k) => !["journey", "requestId", "confirmed"].includes(k)) || !uuid(body.journey) || !uuid(body.requestId) || body.confirmed !== true) fail("INVALID_CLAIM", 400);
      const { journey, requestId } = body, digest2 = JSON.stringify([journey, a.browserOwner, "revoke-claimed-browser-v1"]);
      return store.transaction(async (repo) => {
        await a.assertCurrent();
        const previous = await repo.accountClaim(a.owner, requestId);
        if (previous) {
          if (previous.digest !== digest2) fail("CLAIM_ID_CONFLICT");
          await a.assertCurrent();
          return JSON.parse(previous.response);
        }
        const existing = await repo.accountBinding(journey);
        if (existing && (existing.account !== a.owner || existing.legacy !== a.browserOwner)) fail("CLAIM_CONFLICT");
        if (!await repo.session(a.browserOwner, journey)) fail("LEGACY_SESSION_NOT_FOUND", 404);
        if (!existing) {
          if ((await directoryFor(repo, a)).length >= 100) fail("SESSION_LIMIT", 429);
          await repo.addAccountBinding(journey, a.owner, a.browserOwner);
        }
        const receipt = { journey, requestId, policy: "revoke-claimed-browser-v1" };
        await repo.addAccountClaim(a.owner, requestId, digest2, receipt);
        await a.assertCurrent();
        return receipt;
      });
    },
    async create(request2, enrollment, locale) {
      const a = await actor2(request2);
      const guarded = { ...store, transaction: (work) => store.transaction(async (repo) => {
        await a.assertCurrent();
        if ((await directoryFor(repo, a)).length >= 100 && !await repo.enrollment(a.owner, enrollment)) fail("SESSION_LIMIT", 429);
        const result = await work(repo);
        if (await repo.accountBinding(result.id)) fail("ENROLLMENT_ALREADY_CLAIMED", 409);
        await a.assertCurrent();
        return result;
      }) };
      return new AsyncSessionAuthority(guarded, runtime2).create(a.owner, enrollment, locale);
    },
    async get(request2, id) {
      return invoke(request2, id, "get");
    },
    async events(request2, id, after) {
      return invoke(request2, id, "events", after);
    },
    async checkpoint(request2, id, body) {
      return invoke(request2, id, "checkpoint", body);
    },
    async action(request2, id, body) {
      return invoke(request2, id, "action", body);
    },
    ...decorateAuthority ? { async motion(request2, id, body) {
      return invoke(request2, id, "motion", body);
    }, async activePlay(request2, id, body) {
      return invoke(request2, id, "activePlay", body);
    } } : {}
  });
}

// server/temporary-identity.ts
import { createHash } from "node:crypto";
var TEMPORARY_IDENTITY_MODE = "temporary-unverified";
function validTelegramId(value) {
  return typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value);
}
var fail2 = (code, status = 400) => {
  throw Object.assign(Error(code), { code, status });
};
function temporaryActor(req, res, { mode, gameId, browserOwner }) {
  if (mode !== TEMPORARY_IDENTITY_MODE) fail2("TEMPORARY_IDENTITY_DISABLED", 503);
  if (req.headers["x-harbor-game"] !== gameId) fail2("GAME_SCOPE_MISMATCH", 403);
  const id = req.headers["x-harbor-telegram-id"];
  if (id !== void 0 && (!validTelegramId(id) || req.headers["x-harbor-identity-mode"] !== TEMPORARY_IDENTITY_MODE)) fail2("INVALID_DEMO_IDENTITY");
  if (!/^[a-f0-9]{64}$/.test(browserOwner)) fail2("BROWSER_POSSESSION_REQUIRED", 401);
  const owner2 = id === void 0 ? browserOwner : createHash("sha256").update(JSON.stringify(["harbor-owner-v1", gameId, "telegram-unverified-v1", id])).digest("hex");
  let cancelled = false;
  res.once("close", () => {
    if (!res.writableEnded) cancelled = true;
  });
  return Object.freeze({
    gameId,
    kind: id === void 0 ? "browser" : "account",
    owner: owner2,
    browserOwner,
    assurance: id === void 0 ? "browser-possession" : "unverified-client-id",
    // Only request cancellation is observable here. This is NOT platform expiry/revocation.
    assertCurrent: async () => {
      if (cancelled || req.aborted) fail2("REQUEST_IDENTITY_CANCELLED", 409);
    }
  });
}

// src/candidate/motion-errors.ts
var motionRejectionStatus = {
  AUTH_REQUIRED: 401,
  INVALID_ACTION: 400,
  INVALID_MOTION_ACTION: 400,
  ACTION_ID_CONFLICT: 409,
  SESSION_NOT_FOUND: 404,
  MIGRATION_REQUIRED: 409,
  MOTION_RECEIPT_RETIRED: 409,
  MOTION_CONFIRMATION_REQUIRED: 409,
  VERSION_CONFLICT: 409,
  MOTION_BUSINESS_PREPARED: 409,
  UNSUPPORTED_MOTION_DELTA: 409,
  CLOCK_NOT_ENABLED: 409,
  CHALLENGE_ACTIVE: 409,
  UNVERIFIED_POSITION: 409,
  MOTION_EXPIRED: 409,
  MOTION_SEQUENCE: 409,
  INVALID_MOTION_PATH: 400,
  MOTION_TOO_FAST: 409,
  SETTLE_FIRST: 409,
  MOTION_ENDPOINT: 409,
  INVALID_CLOCK: 409,
  CANDIDATE_MOTION_CLOSED: 403,
  REQUEST_TOO_LARGE: 413,
  CANDIDATE_ACTIVE_CLOSED: 403,
  INVALID_ACTIVE_ACTION: 400,
  INVALID_ACTIVE_RATE: 400,
  INVALID_ACTIVE_CLOCK: 409,
  ACTIVE_LEASE_BUSY: 409,
  ACTIVE_LEASE_EXPIRED: 409,
  ACTIVE_SEQUENCE: 409,
  ACTIVE_CONFIRMATION_REQUIRED: 409,
  ACTIVE_RECEIPT_RETIRED: 409
};

// server/motion-failure.ts
var MotionRejection = class extends Error {
  terminal = true;
  code;
  status;
  retryAfterMs;
  constructor(code, retryAfterMs) {
    super(code);
    this.code = code;
    this.status = motionRejectionStatus[code];
    if (code === "MOTION_TOO_FAST" && Number.isSafeInteger(retryAfterMs) && retryAfterMs > 0 && retryAfterMs <= 1251) this.retryAfterMs = retryAfterMs;
  }
};
function motionHttpFailure(error) {
  return error instanceof MotionRejection ? { status: error.status, body: { error: error.code, terminal: true, ...error.retryAfterMs === void 0 ? {} : { retryAfterMs: error.retryAfterMs } } } : { status: 503, body: { error: "SERVICE_UNAVAILABLE", terminal: false } };
}

// server/active-business-failure.ts
import { AuthorityError } from "../../vendor/dynamic-runtime/packages/authority-session/error.mjs";
var gameplay = /* @__PURE__ */ new Set(["SPATIAL_ACTION_NOT_ADMITTED", "SPATIAL_BINDING_MISMATCH", "INVALID_ACTOR_POSITION", "INVALID_POSITION", "UNVERIFIED_POSITION", "VERSION_CONFLICT", "WRONG_SCENE", "CHALLENGE_ACTIVE", "CHALLENGE_MISMATCH", "CHALLENGE_NOT_FINISHED", "CHALLENGE_UNAVAILABLE", "INVALID_RESULT", "PUZZLE_NOT_SOLVED", "INTRODUCE_FIRST", "PERSON_AWAY", "TOO_FAR", "INVALID_QUESTION", "LOCATION_UNKNOWN", "UNKNOWN_TARGET", "NOT_A_DOOR", "NOTES_LOCKED", "KEY_NEEDED", "SETTLE_FIRST", "NOT_A_PERSON", "ALREADY_INTRODUCED", "TOPIC_UNAVAILABLE", "NOT_ENOUGH_CASH", "BATTLE_EXISTS", "BATTLE_ACTIVE", "REST_NEEDED", "ACTION_UNAVAILABLE", "ALREADY_DONE", "BRIDGE_REQUIREMENTS", "ROUTE_NOT_READY", "MISSING_ITEM", "SHOP_CLOSED", "CROP_ACTION_UNAVAILABLE", "ENERGY_FULL", "SUPPLY_ALREADY_USED", "BATTLE_LOCATION", "BATTLE_ROUND_CONFLICT"]);
for (const code of ["PURSE_FULL", "ANIMAL_UNAVAILABLE", "ANIMAL_ACTION_UNAVAILABLE", "ANIMAL_RESTING", "ANIMAL_AWAY", "INVALID_ANIMAL_POSITION", "BATTLE_NOT_ACCEPTED", "BATTLE_FEEDBACK_FIRST", "BATTLE_MISMATCH", "BATTLE_NOT_ACTIVE", "BATTLE_NOT_PAUSED"]) gameplay.add(code);
for (const code of ["ACTION_ALREADY_APPLIED", "ANIMAL_AWAY", "ANIMAL_CONTENT_CLOSED", "ANIMAL_NOTEBOOK_CAPACITY", "ANIMAL_PROOF_REQUIRED", "ANIMAL_SCHEDULE_MISMATCH", "ARCHIVED_PLOT_NEEDS_BINDING", "CASH_LOW", "CHALLENGE_ACTIVE", "COLLECTION_CAPACITY", "COMMISSION_MISMATCH", "COMMISSION_PREMISE_UNREAD", "COMMISSION_UNAVAILABLE", "CROP_NOT_READY", "DISCOVERIES_MISSING", "DISPLAY_ADMISSION_REQUIRED", "ENERGY_LOW", "GIFT_ALREADY_DISPLAYED", "GIFT_MISSING", "INTRODUCE_FIRST", "INVALID_ACTION_ID", "INVALID_ANIMAL_COMMAND", "INVALID_LAND_COMMAND", "INVALID_LAND_PREVIEW", "INVALID_QUANTITY", "INVENTORY_FULL", "ITEMS_MISSING", "LAND_ADMISSION_REQUIRED", "LAND_ALREADY_PERMITTED", "LAND_CAPACITY", "LAND_NO_ROUTE", "LAND_OUTSIDE", "LAND_OVERLAP", "LAND_PERMISSION", "LAND_PLAYER_SPACE", "LAND_PROTECTED", "LAND_REGION_UNKNOWN", "LAND_SCENE", "LAND_TARGET", "LEAVE_GULL_SPACE", "LIFE_SPATIAL_NOT_ADMITTED", "LIFE_TARGET", "LOT_CAPACITY", "NEWS_PROOF_REQUIRED", "OBSERVATIONS_MISSING", "OBSERVATION_NOT_AVAILABLE", "OBSERVATION_STALE", "ORDER_ACTIVE", "ORDER_CONTENT_UNSUPPORTED", "ORDER_COOLDOWN", "ORDER_EXPIRED", "ORDER_MISSING", "ORDER_NOT_EXPIRED", "ORDER_PREMISE_UNREAD", "PERSON_AWAY", "PLOT_ADMISSION_REQUIRED", "PLOT_EMPTY", "PLOT_OCCUPIED", "PURSE_FULL", "RELATION_FULL", "RESIDENT_ADMISSION_REQUIRED", "REST_NEEDED", "SCENE_MISMATCH", "SHARE_ALREADY_DONE", "SHARE_PREMISE_UNREAD", "SHOP_ADMISSION_REQUIRED", "SHOP_CLOSED", "TOO_FAR", "USE_AUTHORED_COUNTER", "USE_AUTHORED_PLOT", "VERSION_CONFLICT", "WATER_UNAVAILABLE"]) gameplay.add(code);
for (const code of ["PLANT_USES_CLOSED", "PLANT_USES_STARTS_CLOSED", "MINT_CONTENT_CLOSED", "INVALID_PLANT_USE_COMMAND", "PLANT_USE_TARGET", "DELIVERY_MEMORY_MISSING"]) gameplay.add(code);
for (const code of ["RELATIONSHIP_TOPIC_UNAVAILABLE", "RELATIONSHIP_OBSERVATION_UNAVAILABLE", "RELATIONSHIP_EXPLICIT_ACTION_REQUIRED"]) gameplay.add(code);
for (const code of ["NATIVE_CRAB_CLOSED", "NATIVE_CRAB_CHECKPOINT_REQUIRED", "LEAVE_CRAB_SPACE", "CRAB_NEEDS_QUIET_MOMENT", "NATIVE_CRAB_REF_MISMATCH"]) gameplay.add(code);
for (const code of ["AFTER_RAIN_CLOSED", "AFTER_RAIN_UNAVAILABLE", "AFTER_RAIN_FACT_MISMATCH", "AFTER_RAIN_VERSION_CONFLICT", "AFTER_RAIN_TOPIC_NOT_GROUNDED", "AFTER_RAIN_PERSON_UNAVAILABLE", "UNSUPPORTED_AFTER_RAIN_DRAFT"]) gameplay.add(code);
for (const code of ["CHAPEL_WRONG_PLACE", "CHAPEL_NOT_JOINED", "CHAPEL_READ_NOTE_FIRST", "CHAPEL_ALREADY_JOINED", "CHAPEL_REHEARSAL_AWAY", "CHAPEL_UNKNOWN_ACTION"]) gameplay.add(code);
for (const code of ["SEED_QUOTA_SPENT", "HARVEST_BATCH_UNAVAILABLE", "HARVEST_RECORD_CAPACITY"]) gameplay.add(code);
for (const code of ["LAND_EXPANSION_CLOSED", "LAND_EXPANSION_PERMISSION", "LAND_EXPANSION_NOT_READY", "LAND_ALREADY_EXPANDED", "LAND_BED_MISSING", "LAND_BED_OCCUPIED"]) gameplay.add(code);
for (const code of ["FISHING_NEW_STARTS_CLOSED", "FISHING_CONFIRM_REQUIRED", "FISHING_RESULT_AWAITING_CONFIRMATION", "FISHING_RESULT_LOCKED"]) gameplay.add(code);
var ActiveBusinessRejection = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
  code;
  terminal = true;
  status = 409;
};
function brandActivePrepareFailure(error) {
  return error instanceof Error && gameplay.has(error.message) ? new ActiveBusinessRejection(error.message) : error;
}
function activeBusinessHttpFailure(error) {
  const domain = error;
  if (error instanceof ActiveBusinessRejection || error instanceof AuthorityError && domain.status >= 400 && domain.status < 500) return { status: domain.status, body: { error: domain.code, terminal: true } };
  return motionHttpFailure(error);
}

// server/http.ts
var json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
};
function createApiHandler({ authority, usage, noteMedia, dynamicAssets, newsProject, lifeProject, landProject }) {
  return async (req, res, who) => {
    const path = new URL(req.url, "http://localhost").pathname, method = req.method;
    if (fishingClientContract(req, res)) return;
    let body = {};
    if (method === "POST") {
      let size = 0, parts = [];
      for await (const c of req) {
        size += c.length;
        if (size > (path.includes("/assets/") || (path.endsWith("/motion") || path.endsWith("/active-play")) ? 16384 : 15e5)) return json(res, 413, { error: "REQUEST_TOO_LARGE", ...path.endsWith("/motion") || path.endsWith("/active-play") ? { terminal: true } : {} });
        parts.push(c);
      }
      body = JSON.parse(Buffer.concat(parts).toString() || "{}");
    }
    const project = async (head) => {
      if (head?.head) return { ...head, head: await project(head.head) };
      return newsProject ? newsProject(head) : head;
    };
    if (path === "/api/usage" && method === "GET") return json(res, 200, await usage.status(who));
    if (path === "/api/sessions" && method === "GET") return json(res, 200, await authority.directory(who));
    if (path === "/api/sessions" && method === "POST") return json(res, 200, await project(await authority.create(who, body.enrollment_id, body.locale)));
    const assetMatch = path.match(/^\/api\/sessions\/([a-f0-9-]{36})\/assets\/(home|cafe|garden)\/(prepare|package|check|manifest|blob)$/);
    if (assetMatch) {
      const [, id2, room, op] = assetMatch;
      if (!dynamicAssets) return json(res, 403, { error: "ASSET_QA_CLOSED" });
      if (method !== (op === "package" ? "GET" : "POST")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return dynamicAssets.handle(req, res, who, id2, room, op, body);
    }
    const mediaMatch = path.match(/^\/api\/sessions\/([a-f0-9-]{36})\/media\/(workshop-annex-[12])(?:\/(status|prepare))?$/);
    if (mediaMatch) {
      const [, id2, room, op] = mediaMatch;
      if (op === "status" && method === "GET") return json(res, 200, await noteMedia.status(who, id2, room));
      if (op === "prepare" && method === "POST") return json(res, 200, await noteMedia.ensure(who, id2, room));
      if (!op && method === "GET") {
        const { bytes, type } = await noteMedia.image(who, id2, room);
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "private,max-age=86400", "X-Content-Type-Options": "nosniff" });
        return res.end(bytes);
      }
      return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
    }
    const match = path.match(/^\/api\/sessions\/([a-f0-9-]{36})(?:\/(action|motion|active-play|checkpoint|events|life|land-preview))?$/);
    if (!match) return json(res, 404, { error: "NOT_FOUND" });
    const [, id, operation] = match;
    const inContext = (fn) => dynamicAssets ? dynamicAssets.context(who, id, fn) : fn();
    const currentLandClient = (head) => req.headers["x-harbor-land"] === "2" || head?.landV1?.schema !== 2;
    const refreshLandClient = () => json(res, 409, { error: "CLIENT_REFRESH_REQUIRED", terminal: false });
    const currentFernClient = (head) => req.headers["x-harbor-fern"] === "1" || !head?.ornamentalFernV1?.plant;
    if (operation === "action" && typeof body.action === "string" && body.action.startsWith("fern:") && req.headers["x-harbor-fern"] !== "1") return refreshLandClient();
    if (operation === "action" && ["life:expand-land", "life:clear-bed"].includes(body.action) && req.headers["x-harbor-land"] !== "2") return refreshLandClient();
    if (dynamicAssets?.policy.entry(who, id) && req.headers["x-harbor-dynamic-assets"] !== "1") return json(res, 409, { error: "CLIENT_REFRESH_REQUIRED" });
    if (!operation && method === "GET") return inContext(async () => {
      const head = await authority.get(who, id);
      if (!currentLandClient(head) || !currentFernClient(head)) return refreshLandClient();
      return json(res, 200, await project(dynamicAssets ? await dynamicAssets.project(who, head) : head));
    });
    if ((operation === "life" || operation === "land-preview") && method === "GET") {
      const projection = operation === "life" ? lifeProject : landProject;
      if (!projection) return json(res, 403, { error: "LIFE_B2_UNAVAILABLE" });
      return inContext(async () => {
        const head = await authority.get(who, id);
        if (!currentLandClient(head) || !currentFernClient(head)) return refreshLandClient();
        return json(res, 200, await projection(head, new URL(req.url, "http://localhost").searchParams));
      });
    }
    if (operation === "active-play" && method === "POST") {
      if (typeof authority.activePlay !== "function") return json(res, 403, { error: "CANDIDATE_ACTIVE_CLOSED", terminal: true });
      try {
        return json(res, 200, await inContext(() => authority.activePlay(who, id, body)));
      } catch (error) {
        const failure = motionHttpFailure(error);
        return json(res, failure.status, failure.body);
      }
    }
    if (operation === "motion" && method === "POST") {
      if (typeof authority.motion !== "function") return json(res, 403, { error: "CANDIDATE_MOTION_CLOSED", terminal: true });
      try {
        return json(res, 200, await inContext(() => authority.motion(who, id, body)));
      } catch (error) {
        const failure = motionHttpFailure(error);
        return json(res, failure.status, failure.body);
      }
    }
    if (operation === "action" && method === "POST") {
      const execute = async () => {
        if (!["ask", "notes-generate"].includes(body.action)) return json(res, 200, await inContext(async () => project(await authority.action(who, id, body))));
        const allowance = body.action === "ask" ? "dialogue" : "room";
        await usage.reserve(who, allowance, body.action_id, { session: id, body });
        try {
          const result = await inContext(async () => project(await authority.action(who, id, body)));
          await usage.settle(who, allowance, body.action_id, true);
          return json(res, 200, result);
        } catch (e) {
          if (e.code !== "MODEL_CALL_PENDING_OR_INTERRUPTED") await usage.settle(who, allowance, body.action_id, false);
          throw e;
        }
      };
      if (body.activePlay) {
        try {
          return await execute();
        } catch (error) {
          const failure = activeBusinessHttpFailure(error);
          return json(res, failure.status, failure.body);
        }
      }
      return execute();
    }
    if (operation === "checkpoint" && method === "POST") return json(res, 200, await inContext(async () => project(await authority.checkpoint(who, id, body))));
    if (operation === "events" && method === "GET") return json(res, 200, await authority.events(who, id, Number(new URL(req.url, "http://localhost").searchParams.get("after") ?? 0)));
    return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  };
}

// server/account-http.ts
function createAccountApiHandler({ service, usage, noteMedia, dynamicAssets, newsProject, lifeProject, landProject, allowLegacyClaim = true }) {
  return async (req, res, actor2) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (!allowLegacyClaim && ["/api/account/legacy", "/api/account/claim"].includes(path)) return json(res, 410, { error: "LEGACY_CLAIM_CLOSED" });
    if (path === "/api/account/legacy" && req.method === "GET") return json(res, 200, await service.legacyDirectory(actor2));
    if (path === "/api/account/claim" && req.method === "POST") {
      let n = 0, parts = [];
      for await (const part of req) {
        n += part.length;
        if (n > 2048) return json(res, 413, { error: "REQUEST_TOO_LARGE" });
        parts.push(part);
      }
      return json(res, 200, await service.claim(actor2, JSON.parse(Buffer.concat(parts).toString() || "{}")));
    }
    const authority = Object.fromEntries(["directory", "create", "get", "events", "checkpoint", "action", ...["motion", "activePlay"].filter((k) => typeof service[k] === "function")].map((k) => [k, (_who, ...args) => service[k](actor2, ...args)]));
    const id = path.match(/^\/api\/sessions\/([a-f0-9-]{36})(?:\/|$)/)?.[1];
    const run = (storageOwner) => {
      const media = noteMedia && Object.fromEntries(["status", "ensure", "image"].map((k) => [k, (_who, ...args) => noteMedia[k](storageOwner, ...args)]));
      const dynamic = dynamicAssets && { policy: { entry: (_who, s) => dynamicAssets.policy.entry(storageOwner, s) }, context: (_who, s, fn) => dynamicAssets.context(storageOwner, s, fn), project: (_who, h) => dynamicAssets.project(storageOwner, h), handle: (q, r, _who, ...args) => dynamicAssets.handle(q, r, storageOwner, ...args) };
      return createApiHandler({ authority, usage, noteMedia: media, dynamicAssets: dynamic, newsProject, lifeProject, landProject })(req, res, actor2.owner);
    };
    if (id) {
      const chunks = [];
      let status = 200;
      let headers = {};
      const output = res;
      res = { writeHead: (code, h) => {
        status = code;
        headers = h ?? {};
      }, end: (b) => {
        if (b !== void 0) chunks.push(Buffer.isBuffer(b) ? b : b instanceof Uint8Array ? Buffer.from(b) : Buffer.from(String(b)));
      } };
      await service.withStorageAccess(actor2, id, run);
      output.writeHead(status, headers);
      return output.end(Buffer.concat(chunks));
    }
    return run(actor2.owner);
  };
}

// server/platform-token-verifier.ts
var PLATFORM_VERIFIED_MODE = "platform-verified-v1";

// server/platform-verified-actor.ts
import { createHash as createHash2 } from "node:crypto";
var fail3 = (code, status = 401) => {
  throw Object.assign(Error(code), { code, status });
};
function platformVerifiedActor(req, res, { gameId, browserOwner, verified }) {
  if (req.headers["x-harbor-game"] !== gameId || req.headers["x-harbor-identity-mode"] !== PLATFORM_VERIFIED_MODE || req.headers["x-harbor-telegram-id"] !== verified.telegramId) fail3("PLATFORM_REQUEST_MISMATCH");
  if (!/^[a-f0-9]{64}$/.test(browserOwner)) fail3("EDGE_IDENTITY_REQUIRED");
  const owner2 = createHash2("sha256").update(JSON.stringify(["harbor-owner-v1", gameId, "telegram-unverified-v1", verified.telegramId])).digest("hex");
  let cancelled = false;
  res.once("close", () => {
    if (!res.writableEnded) cancelled = true;
  });
  return Object.freeze({
    gameId,
    kind: "account",
    owner: owner2,
    browserOwner,
    assurance: "platform-token-bound-v1",
    assertCurrent: async () => {
      if (cancelled || req.aborted) fail3("REQUEST_IDENTITY_CANCELLED", 409);
    }
  });
}

// server/account-transport.ts
function createTemporaryAccountTransport({ mode, gameId, store, runtime: runtime2, usage, noteMedia, dynamicAssets, newsProject, lifeProject, landProject, decorateAuthority, accountOnly = false, verifyPlatformToken }) {
  if (mode !== TEMPORARY_IDENTITY_MODE && mode !== PLATFORM_VERIFIED_MODE) throw Error("ACCOUNT_IDENTITY_MODE_DISABLED");
  if (mode === PLATFORM_VERIFIED_MODE && typeof verifyPlatformToken !== "function") throw Error("PLATFORM_BINDING_CONTRACT_UNCONFIRMED");
  const contexts = /* @__PURE__ */ new WeakSet();
  const service = createAccountJourneyService({ enabled: true, store, runtime: runtime2, decorateAuthority, resolveActor: async (a) => contexts.has(a) ? a : null });
  const api = createAccountApiHandler({ service, usage, noteMedia, dynamicAssets, newsProject, lifeProject, landProject, allowLegacyClaim: !accountOnly });
  return async (req, res, browserOwner) => {
    if (fishingClientContract(req, res)) return;
    const a = mode === TEMPORARY_IDENTITY_MODE ? temporaryActor(req, res, { mode, gameId, browserOwner }) : platformVerifiedActor(req, res, { gameId, browserOwner, verified: await verifyPlatformToken(req.headers["x-harbor-telegram-id"], req.headers.authorization) });
    contexts.add(a);
    if (accountOnly && a.kind !== "account") throw Object.assign(Error("PLATFORM_LOGIN_REQUIRED"), { status: 401 });
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/api/bootstrap" && req.method === "POST") return json(res, 200, { mode, platformIdentityVerified: mode === PLATFORM_VERIFIED_MODE, kind: a.kind });
    return api(req, res, a);
  };
}

// src/life/ornamental-fern-config.ts
var fernSlot = { id: "owned-fern-slot", scene: "home", at: { x: 670, y: 350 }, approach: { x: 662, y: 378 }, width: 30, footprint: { x: 662, y: 338, w: 16, h: 12 } };
var fernOwnedFlag = "ornamental-fern:owned:v1";
var fernDisplayFlag = "ornamental-fern:displayed:v1";
var fernRules = "ornamental-fern-v1.0";
var fernGiftEvent = "mara:owned-fern-gift-v1";
var fernVerbs = ["read-offer", "accept", "place", "take"];
var fernMoveCost = { energy: 4, minutes: 20, cash: 0 };

// src/world/neighbor-gathering.ts
var gatheringResidents = ["mara", "avery", "samira"];
function neighborPartyActive(s) {
  const p = s.neighborChapterV1?.party, m = (s.townMinutes ?? 540) % 1440;
  return s.neighborPartyEnabled ?? !!(p && p.scene === s.scene && m >= 360 && m < 1260);
}
var gatheringVerbs = ["neighbor-select:mara", "neighbor-select:avery", "neighbor-select:samira", "neighbor-start", "neighbor-move-inside", "neighbor-finish", "neighbor-recall"];
function addNeighborGathering(rooms3) {
  for (const scene of ["coast", "chapel"]) {
    const at = scene === "coast" ? { x: 600, y: 560 } : { x: 550, y: 515 };
    rooms3[scene].entities.push({ id: "neighbor-gathering", label: ["\u4E00\u8D77\u5750\u5750\u7684\u5730\u65B9", "A place to sit together"], kind: "object", at, approach: { x: at.x - 8, y: at.y + 34 }, actions: [...gatheringVerbs] });
    gatheringResidents.forEach((person, i) => {
      const existing = rooms3[scene].entities.find((e) => e.person === person);
      if (existing) {
        existing.gatheringRole = "routine";
        return;
      }
      const foot = scene === "coast" ? { x: 550 + i * 50, y: 500 } : { x: 430 + i * 50, y: 420 };
      rooms3[scene].entities.push({ id: "gathering-" + person, person, gatheringRole: "guest", label: ["\u6765\u5C0F\u805A\u7684\u90BB\u5C45", "Neighbor at the gathering"], kind: "person", at: foot, approach: { x: foot.x - 8, y: foot.y + 42 } });
    });
  }
}

// src/world/chapel-priest.ts
var chapelPriestId = "gabriel";
var chapelPriest = {
  id: chapelPriestId,
  age: 56,
  name: ["\u52A0\u5E03\u91CC\u57C3\u5C14\xB7\u6C83\u5FB7\u795E\u7236", "Father Gabriel Ward"],
  unknown: ["\u6574\u7406\u6905\u5B50\u7684\u795E\u7236", "Priest arranging the chairs"],
  intro: ["\u201C\u6211\u53EB\u52A0\u5E03\u91CC\u57C3\u5C14\xB7\u6C83\u5FB7\uFF0C\u5728\u8FD9\u91CC\u505A\u795E\u7236\u3002\u5C0F\u65F6\u5019\u4F4F\u5728\u6D77\u6E7E\uFF0C\u540E\u6765\u53BB\u4E86\u5185\u9646\u5341\u516B\u5E74\u3002\u73B0\u5728\u53C8\u56DE\u6765\u4E86\u3002\u201D\u4ED6\u628A\u6905\u5B50\u5F80\u65C1\u8FB9\u632A\u4E86\u4E00\u70B9\u3002\u201C\u53EB\u6211\u52A0\u5E03\u91CC\u57C3\u5C14\u5C31\u597D\u3002\u8FDB\u6765\u5750\u5750\uFF1F\u201D", "\u201CGabriel Ward. I\u2019m the priest here. I grew up by the bay, then spent eighteen years inland. Now I\u2019m back.\u201D He moves a chair aside. \u201CGabriel is fine. Would you like to sit?\u201D"],
  role: ["\u6559\u5802\u7684\u795E\u7236\u3002\u91CD\u56DE\u6545\u4E61\uFF0C\u559C\u6B22\u4FEE\u65E7\u6536\u97F3\u673A\uFF0C\u4E5F\u5728\u5B66\u7740\u628A\u7A7A\u95F2\u7559\u7ED9\u81EA\u5DF1\u3002", "The chapel priest, home again. He repairs old radios and is learning to leave himself some time off."],
  art: "gabriel",
  mapArt: "gabriel",
  avatarArt: "gabriel",
  portraitShape: "portrait",
  artStatus: "private-library-r2-admitted-local-game-candidate",
  libraryAsset: { assetId: "character-family__gabriel", revision: 2, recordId: "44125733-66b7-4952-9f6a-a508a926ae30" },
  routes: [{ scene: "chapel", at: { x: 475, y: 315 } }, { scene: "hill", at: { x: 600, y: 500 } }, { scene: "chapel", at: { x: 475, y: 315 } }],
  activities: [
    ["\u4ED6\u505A\u5B8C\u6668\u7977\uFF0C\u6B63\u628A\u9605\u8BFB\u89D2\u7684\u6905\u5B50\u6446\u597D\uFF0C\u7ED9\u65E9\u6765\u7684\u90BB\u5C45\u7559\u4F4D\u7F6E\u3002", "After morning prayer, he sets out chairs for the first neighbors at the reading corner."],
    ["\u4ED6\u6CBF\u5C71\u5761\u8D70\u4E00\u5C0F\u6BB5\uFF0C\u505C\u4E0B\u6765\u542C\u98CE\uFF1B\u53E3\u888B\u91CC\u88C5\u7740\u8FD8\u6CA1\u4FEE\u597D\u7684\u6536\u97F3\u673A\u65CB\u94AE\u3002", "He takes a short walk on the hill and stops to hear the wind, an unrepaired radio knob in his pocket."],
    ["\u4ED6\u628A\u4E00\u5929\u7528\u8FC7\u7684\u676F\u5B50\u6536\u597D\uFF0C\u5750\u4E0B\u7FFB\u7236\u4EB2\u7559\u4E0B\u7684\u822A\u8239\u660E\u4FE1\u7247\u3002", "He puts the day\u2019s cups away and sits with the boat postcards his father left him."]
  ]
};
var chapelPriestPeople = { [chapelPriestId]: chapelPriest };
var chapelPriestRoutes = { [chapelPriestId]: chapelPriest.routes };
var chapelPriestRoles = { [chapelPriestId]: chapelPriest.role };

// src/world/chapel-layout.ts
function addChapel(rooms3) {
  const entrance = { id: "to-chapel", label: ["\u6559\u5802\u5927\u5385", "Chapel Hall"], kind: "portal", destination: "chapel", at: { x: 510, y: 365 }, approach: { x: 502, y: 397 } };
  rooms3.hill.entities.push(entrance);
  rooms3.hill.neighbors.push("chapel");
  rooms3.hill.props.push({ id: "chapel-wayfinding", art: "street-sign", at: { x: 510, y: 365 }, width: 46 });
  rooms3.chapel = { id: "chapel", title: ["\u6559\u5802\u5927\u5385", "Chapel Hall"], area: "hill", outdoor: false, spawn: { x: 470, y: 559 }, interior: { x: 270, y: 225, w: 420, h: 360 }, map: { x: 1.28, y: -0.1 }, neighbors: ["hill"], entities: [
    { id: "exit", label: ["\u5C71\u5761", "The Hill"], kind: "portal", destination: "hill", at: { x: 480, y: 582 }, approach: { x: 470, y: 559 } },
    { id: "chapel-note", label: ["\u793E\u533A\u6D3B\u52A8\u4FBF\u6761", "Community activity note"], kind: "object", at: { x: 625, y: 525 }, approach: { x: 617, y: 559 }, actions: ["chapel-read-notice", "chapel-recall"] },
    { id: "chapel-reading", label: ["\u9605\u8BFB\u89D2", "Reading corner"], kind: "object", at: { x: 355, y: 352 }, approach: { x: 347, y: 360 }, actions: ["chapel-help-reading", "chapel-recall"] },
    { id: "chapel-seat", label: ["\u9760\u8FC7\u9053\u7684\u5EA7\u5E2D", "Aisle-side seats"], kind: "object", at: { x: 580, y: 515 }, approach: { x: 572, y: 549 }, actions: ["chapel-listen", "chapel-recall"] }
  ], props: [
    { id: "bookcase", art: "interior-bookcase-v1", at: { x: 335, y: 280 }, width: 65, footprint: { x: 307, y: 263, w: 56, h: 17 } },
    { id: "reading-table", art: "dining-table-front-v1", at: { x: 355, y: 352 }, width: 58, footprint: { x: 329, y: 327, w: 52, h: 25 } },
    { id: "reading-chair", art: "dining-chair-back-v1", at: { x: 392, y: 352 }, width: 23, visibleWhen: "chapel:participation:reading" },
    ...[365, 440, 515].flatMap((y, i) => [355, 590].map((x, j) => ({ id: "bench-" + i + "-" + j, art: "chapel-wood-pew", at: { x, y }, width: 68, footprint: { x: x - 32, y: y - 14, w: 64, h: 14 } }))).filter((p) => p.id !== "bench-0-0"),
    { id: "note", art: "noticeboard", at: { x: 625, y: 525 }, width: 38, footprint: { x: 609, y: 515, w: 32, h: 10 } },
    { id: "coat", art: "interior-coatstand-v1", at: { x: 310, y: 535 }, width: 19, footprint: { x: 304, y: 525, w: 12, h: 10 } },
    { id: "stained-window", art: "chapel-stained-glass-window", at: { x: 475, y: 225 }, width: 32 },
    { id: "altar", art: "chapel-altar", at: { x: 475, y: 275 }, width: 94, footprint: { x: 433, y: 253, w: 84, h: 22 } },
    { id: "candle-left", art: "chapel-floor-candlestick", at: { x: 412, y: 285 }, width: 12, footprint: { x: 407, y: 275, w: 10, h: 10 } },
    { id: "candle-right", art: "chapel-floor-candlestick", at: { x: 538, y: 285 }, width: 12, footprint: { x: 533, y: 275, w: 10, h: 10 } }
  ] };
}

// src/world/garden-static.ts
var gardenStaticProps = [
  { id: "static-sundial", art: "pedestal-sundial", at: { x: 340, y: 270 }, width: 96, footprint: { x: 326, y: 254, w: 28, h: 16 } },
  { id: "static-chiminea", art: "clay-chiminea", at: { x: 130, y: 550 }, width: 98, footprint: { x: 119, y: 532, w: 22, h: 18 } },
  { id: "static-birdhouse", art: "nest-birdhouse", at: { x: 770, y: 250 }, width: 91, footprint: { x: 761, y: 238, w: 18, h: 12 } },
  { id: "static-beehive", art: "wooden-beehive-box", at: { x: 815, y: 470 }, width: 90, footprint: { x: 797, y: 448, w: 36, h: 22 } }
];
var gardenStaticAnchors = {
  "pedestal-sundial": [0.5, 1143 / 1254],
  "clay-chiminea": [0.5, 1111 / 1254],
  "nest-birdhouse": [0.5, 1101 / 1254],
  "wooden-beehive-box": [0.5, 1118 / 1254]
};

// src/world/pier-rope-layout.json
var pier_rope_layout_default = {
  format: "harbor-pier-rope-consumer-v1",
  atlas: "pier-rope-v1.png",
  atlasSha256: "f163b519f49b804a8a4141ef39421cf8364e708aae9274fb329e9c142f28e5e1",
  sourceTilemapSha256: "f94cefa53c6e3d7fb3ae02f8d8d8ab3ed6f4af9ead7cadfb0fc6ca4b6974b545",
  sourcePlacementSha256: "5593e889dfc27481648f45b53e475dcfd331b7081e97caaebf4d882453f9ca64",
  cellSize: 40,
  displayYOffset: -23,
  roles: {
    N: [
      0,
      0,
      40,
      40
    ],
    E: [
      40,
      0,
      40,
      40
    ],
    S: [
      80,
      0,
      40,
      40
    ],
    W: [
      120,
      0,
      40,
      40
    ],
    "outer-NW": [
      160,
      0,
      40,
      40
    ],
    "outer-NE": [
      0,
      40,
      40,
      40
    ],
    "outer-SE": [
      40,
      40,
      40,
      40
    ],
    "outer-SW": [
      80,
      40,
      40,
      40
    ],
    "inner-NW": [
      120,
      40,
      40,
      40
    ],
    "inner-NE": [
      160,
      40,
      40,
      40
    ],
    "inner-SE": [
      0,
      80,
      40,
      40
    ],
    "inner-SW": [
      40,
      80,
      40,
      40
    ],
    "cap-N": [
      80,
      80,
      40,
      40
    ],
    "cap-E": [
      120,
      80,
      40,
      40
    ],
    "cap-S": [
      160,
      80,
      40,
      40
    ],
    "cap-W": [
      0,
      120,
      40,
      40
    ]
  },
  pieces: [
    {
      role: "cap-S",
      x: 721,
      y: 754
    },
    {
      role: "W",
      x: 721,
      y: 794
    },
    {
      role: "W",
      x: 721,
      y: 834
    },
    {
      role: "W",
      x: 721,
      y: 874
    },
    {
      role: "cap-S",
      x: 849,
      y: 754
    },
    {
      role: "E",
      x: 849,
      y: 794
    },
    {
      role: "E",
      x: 849,
      y: 834
    },
    {
      role: "E",
      x: 849,
      y: 874
    },
    {
      role: "outer-NE",
      x: 721,
      y: 914
    },
    {
      role: "outer-NW",
      x: 849,
      y: 914
    },
    {
      role: "N",
      x: 761,
      y: 914
    },
    {
      role: "S",
      x: 801,
      y: 914
    },
    {
      role: "N",
      x: 841,
      y: 914,
      cropX: 0,
      width: 2
    },
    {
      role: "N",
      x: 843,
      y: 914,
      cropX: 0,
      width: 2
    },
    {
      role: "N",
      x: 845,
      y: 914,
      cropX: 0,
      width: 2
    },
    {
      role: "N",
      x: 847,
      y: 914,
      cropX: 0,
      width: 2
    }
  ],
  postAsset: "existing-C-post-5x26.png",
  posts: [
    {
      x: 741,
      y: 774
    },
    {
      x: 741,
      y: 854
    },
    {
      x: 741,
      y: 934
    },
    {
      x: 869,
      y: 774
    },
    {
      x: 869,
      y: 854
    },
    {
      x: 869,
      y: 934
    },
    {
      x: 821,
      y: 934
    }
  ],
  postAnchor: [
    0.5,
    1
  ],
  postEventXOffset: 0.5,
  scene: "harbor"
};

// src/world/pier-rope.ts
function addPierRopePosts(rooms3) {
  for (const [i, p] of pier_rope_layout_default.posts.entries()) rooms3.harbor.props.push({
    id: "pier-rope-post-" + i,
    art: "existing-C-post-5x26",
    at: { x: p.x + pier_rope_layout_default.postEventXOffset, y: p.y },
    width: 5
  });
}

// src/animals/native-crab-config.ts
var nativeCrabId = "harbor-shore-crab-1";
var nativeCrabPin = Object.freeze({ id: "shore-crab-native-c1-v2", revision: 2, atlasSHA256: "6447970fcf81c94f4c12e0d516b3d39081be955afeaa3d3323f33c16567cca46", rules: "native-crab-life-v1.0" });
var nativeCrabPlaces = Object.freeze({ coast: { x: 1040, y: 550 }, beach: { x: 540, y: 530 }, dock: { x: 700, y: 650 } });
var nativeCrabTitle = ["\u5CB8\u8FB9\u7684\u87F9", "Shore crab"];
var nativeCrabEntities = Object.entries(nativeCrabPlaces).map(([scene, at]) => ({ scene, entity: { id: nativeCrabId, animalId: nativeCrabId, kind: "object", label: nativeCrabTitle, at: { ...at }, approach: { x: at.x - 8, y: at.y - 60 }, actions: [] } }));

// src/world/tech-nomads.json
var tech_nomads_default = [
  {
    id: "harper",
    name: [
      "\u54C8\u73C0",
      "Harper Quinn"
    ],
    role: [
      "AI\u5E94\u7528\u5F00\u53D1\u8005",
      "AI application developer"
    ],
    unknown: [
      "\u628A\u5199\u6EE1\u7684\u672C\u5B50\u5408\u4E0A\u7684\u6765\u8BBF\u8005",
      "A visitor closing a crowded notebook"
    ],
    intro: [
      "\u7A7F\u7070\u84DD\u655E\u886C\u8863\u3001\u6234\u7EC6\u6846\u773C\u955C\u7684\u6765\u8BBF\u8005\u5408\u4E0A\u672C\u5B50\uFF0C\u62AC\u5934\u542C\u4F60\u8BF4\u8BDD\u3002 \u201C\u54C8\u73C0\u3002\u6211\u505AAI\u5E94\u7528\uFF0C\u603B\u60F3\u7740\u4E0B\u4E00\u7248\u8BE5\u52A0\u4EC0\u4E48\u3002\u6765\u6D77\u6E7E\u540E\uFF0C\u60F3\u5148\u5B66\u4F1A\u770B\u6E05\u4ECA\u5929\u5DF2\u7ECF\u957F\u51FA\u6765\u7684\u4E1C\u897F\u3002\u201D",
      "A visitor in a slate-blue overshirt and thin glasses closes a notebook and looks up. \u201CHarper. I build AI apps and keep thinking about the next version. Here, I\u2019m trying to notice what has already grown today.\u201D"
    ],
    workContext: [
      "\u5728\u5206\u5E03\u5F0F\u5C0F\u56E2\u961F\u505A\u9762\u5411\u5C0F\u578B\u7EC4\u7EC7\u7684AI\u5E94\u7528\uFF0C\u6309\u7EA6\u5B9A\u65F6\u6BB5\u8FDC\u7A0B\u534F\u4F5C\uFF1B\u65E0\u771F\u5B9E\u96C7\u4E3B\u6216\u5BA2\u6237\u7ED1\u5B9A\u3002",
      "Builds AI applications for small organizations with a distributed team; keeps agreed remote work hours. No real employer or client is implied."
    ],
    personalLife: {
      reasonForStay: [
        "\u77ED\u4F4F\u6D77\u6E7E\uFF0C\u4FDD\u6301\u5DE5\u4F5C\uFF0C\u4E5F\u7ED9\u8FDE\u7EED\u8D76\u7248\u672C\u540E\u7684\u751F\u6D3B\u7559\u7A7A\u767D\u3002",
        "A short stay that leaves room for life after a run of hurried releases, while keeping a job."
      ],
      interest: [
        "\u770B\u690D\u7269\u65B0\u53F6\u3001\u6CBF\u6D77\u6563\u6B65\uFF0C\u4E0D\u4EE5\u690D\u7269\u751F\u957F\u5F53\u6548\u7387\u6307\u6807\u3002",
        "New leaves and walks by the sea, without making growth a productivity score."
      ],
      fatigueAndRest: [
        "\u5348\u524D\u4F38\u5C55\u624B\u8155\uFF0C\u4E0B\u5348\u79BB\u5C4F\uFF0C\u508D\u665A\u4E0D\u63A5\u5DE5\u4F5C\u8BDD\u9898\uFF1B\u4EC5\u4E3A\u5206\u65F6\u751F\u6D3B\u8868\u73B0\uFF0C\u4E0D\u65B0\u589E\u4F53\u80FD\u6570\u503C\u3002",
        "Stretches wrists before lunch, takes an afternoon screen break, and leaves work talk behind in the evening. Authored activity, not a new stamina statistic."
      ],
      moneyAndPlants: [
        "\u4FDD\u7559\u666E\u901A\u4F4F\u5BA2\u6D88\u8D39\u80CC\u666F\uFF1B\u82E5\u804A\u5230\u79CD\u690D\uFF0C\u53EA\u89C2\u5BDF\u6216\u7EA6\u5B9A\u4E0B\u6B21\u6765\u770B\uFF0C\u4E0D\u66FF\u73A9\u5BB6\u64AD\u79CD\u3001\u6536\u83B7\u6216\u51FA\u552E\u3002",
        "An ordinary paying guest; garden conversation records an observation or a return plan, not planting, harvesting or selling for the player."
      ],
      boundaries: [
        "\u5DE5\u4F5C\u4E13\u6CE8\u65F6\u53EF\u7EA611:00\u540E\u518D\u804A\uFF1B\u4F11\u606F\u65E5\u53EF\u4EE5\u53EA\u8BF4\u751F\u6D3B\u3002",
        "Can ask to talk after 11:00 during focus time, or keep a day-off conversation about life."
      ],
      lodging: "off-screen guest accommodation, not a new map, not the player's room"
    },
    appearance: {
      pronouns: "they/them",
      build: [
        "\u4E2D\u7B49\u504F\u9AD8\u3001\u504F\u7626\uFF0C\u80A9\u7EBF\u81EA\u7136",
        "Medium-tall, lean, natural shoulders"
      ],
      face: [
        "31\u5C81\u6210\u4EBA\u9762\u90E8\uFF0C\u6696\u4E2D\u7B49\u6A44\u6984\u80A4\u8272\u3001\u6DF1\u68D5\u773C\u3001\u5E73\u76F4\u7709\uFF1B\u7EC6\u6DF1\u84DD\u77E9\u5F62\u773C\u955C\uFF0C\u65E0\u80E1\u987B",
        "Adult age31, warm medium olive complexion, dark-brown eyes and straight brows; thin dark-navy rectangular glasses, no facial hair"
      ],
      hair: [
        "\u6DF1\u68D5\u4E0D\u5BF9\u79F0\u77ED\u5377\u53D1\uFF0C\u9876\u90E8\u677E\u5377\u3001\u8033\u4FA7\u77ED\uFF1B\u4E0D\u662FCasey\u949Dbob\u6216Dani\u9F50\u9888bob",
        "Dark-brown short asymmetric curls, loose on top and shorter around the ears; neither Casey blunt bob nor Dani neck-length bob"
      ],
      upperClothes: [
        "\u7070\u84DD\u8584\u886C\u8863\u655E\u7A7F\u3001\u8896\u53E3\u5377\u81F3\u524D\u81C2\uFF0C\u5185\u642D\u65E0\u5B57\u7816\u7EA2\u5706\u9886\u886B",
        "Open slate-blue light overshirt with sleeves rolled to the forearms over a plain brick-red crew-neck shirt"
      ],
      lowerClothes: [
        "\u70AD\u7070\u76F4\u7B52\u957F\u88E4\uFF0C\u6696\u7070\u6B65\u884C\u978B\u3001\u5976\u6CB9\u8272\u978B\u5E95",
        "Charcoal straight trousers, warm-gray walking shoes with cream soles"
      ],
      poseTone: [
        "\u7565\u62D8\u8C28\u4F46\u613F\u610F\u542C\u4EBA\u8BF4\u8BDD\uFF1B\u7AD9\u59FF\u53CC\u624B\u81EA\u7136\u653E\u677E\uFF0C\u6B65\u884C\u6446\u81C2\u6E05\u695A",
        "A little reserved but ready to listen; relaxed hands when standing and readable arm swing when walking"
      ],
      forbidden: [
        "\u5E3D\u5B50/\u56F4\u88D9/\u5B9E\u9A8C\u670D/\u79D1\u6280\u88C5\u7532",
        "\u89D2\u8272\u6301\u7535\u8111\u906E\u4F4F\u8EAB\u4F53",
        "\u590D\u5236\u65E2\u6709\u5C45\u6C11\u8138\u6216\u8863\u7740"
      ],
      englishIdentityPrompt: "Harper Quinn, an original 31-year-old adult with a warm medium olive complexion, dark-brown eyes, thin dark-navy rectangular glasses, no facial hair, short asymmetric dark-brown curls, medium-tall lean build. Open slate-blue overshirt with sleeves rolled to the forearms, plain brick-red crew-neck shirt, charcoal straight trousers, warm-gray walking shoes with cream soles. Natural friendly reserve. No hat, apron, lab coat, armor, logo, text, laptop, phone or occupational prop."
    },
    schedule: [
      {
        start: 0,
        end: 360,
        scene: null,
        state: "night-rest",
        activity: [
          "\u4F4F\u5904\u4F11\u606F\uFF0C\u5730\u56FE\u4E0D\u51FA\u73B0\u3002",
          "Resting off-screen; absent from the map."
        ],
        talk: "unavailable"
      },
      {
        start: 360,
        end: 480,
        scene: "cafe",
        state: "breakfast",
        activity: [
          "\u6162\u6162\u5403\u65E9\u9910\uFF0C\u5148\u95EETheo\u54EA\u91CC\u843D\u5EA7\u4E0D\u4F1A\u6321\u8DEF\u3002",
          "Breakfast, asking Theo where sitting will leave the room clear."
        ],
        talk: "brief",
        permission: "proposed scene consent, not already obtained"
      },
      {
        start: 480,
        end: 660,
        scene: "cafe",
        state: "focused-work",
        activity: [
          "\u5B89\u9759\u6574\u7406\u5DF2\u51C6\u5907\u7684\u5E94\u7528\u8BF4\u660E\u4E0E\u5931\u8D25\u4F8B\u5B50\uFF0C\u4E0D\u5360\u7528\u7F51\u7EDC\u4F1A\u8BAE\u3002",
          "Quietly organizing prepared app notes and failure examples, without a network meeting."
        ],
        talk: "defer-until-11"
      },
      {
        start: 660,
        end: 720,
        scene: "cafe",
        state: "stretch-and-close",
        activity: [
          "\u5408\u4E0A\u5DE5\u4F5C\u672C\uFF0C\u4F38\u5C55\u624B\u8155\uFF1B\u53EF\u4EE5\u804A\u751F\u6D3B\u3002",
          "Closes the work notebook and stretches; there is room to talk about life."
        ],
        talk: "available"
      },
      {
        start: 720,
        end: 840,
        scene: "garden",
        state: "screen-break",
        activity: [
          "\u770B\u53F6\u7247\u4E0E\u5149\u7EBF\uFF0C\u4E0D\u628A\u82B1\u56ED\u5F53\u6D4B\u8BD5\u6570\u636E\u3002",
          "Looks at leaves and light, without treating the garden as test data."
        ],
        talk: "available"
      },
      {
        start: 840,
        end: 1020,
        scene: "garden",
        state: "neighbor-time",
        activity: [
          "\u9047\u89C1Elena\u65F6\u95EE\u95EE\u90A3\u7247\u65B0\u53F6\uFF0C\u7ED9\u6B63\u5728\u6D47\u6C34\u7684\u4EBA\u7559\u51FA\u8DEF\u3002",
          "Asks Elena about a new leaf, keeping the watering route clear."
        ],
        talk: "available"
      },
      {
        start: 1020,
        end: 1260,
        scene: "coast",
        state: "off-duty-walk",
        activity: [
          "\u5728\u6D77\u5CB8\u6563\u6B65\uFF0C\u4ECA\u5929\u4E0D\u518D\u6BD4\u8F83\u7248\u672C\u3002",
          "Walks by the coast; no more comparing versions today."
        ],
        talk: "life-only-by-default"
      },
      {
        start: 1260,
        end: 1440,
        scene: null,
        state: "night-rest",
        activity: [
          "\u79BB\u573A\u4F11\u606F\uFF0C\u672A\u5B8C\u6210\u7684\u76F8\u7EA6\u660E\u5929\u8FD8\u5728\u3002",
          "Leaves to rest; tomorrow still holds the unfinished plan."
        ],
        talk: "unavailable"
      }
    ],
    newsStory: {
      sourceRequirement: "ai-app-release",
      proposedTemplate: "ai-app-boundary-v1",
      verifiedFactLayer: "a narrow published model/API or application release change, after separate admission",
      fictionalReaction: "Harper chooses whether to narrow a promised demonstration; Casey may discuss leaving work behind; Elena supplies an everyday perspective",
      allowedOutcome: "a conversation choice and revisit intention only",
      status: "no admitted tech article"
    },
    age: 31,
    art: "npc-harper",
    mapArt: "harper",
    avatarArt: "npc-harper",
    routes: [
      {
        scene: "cafe",
        at: {
          x: 375,
          y: 380
        }
      },
      {
        scene: "garden",
        at: {
          x: 585,
          y: 435
        }
      },
      {
        scene: "coast",
        at: {
          x: 745,
          y: 535
        }
      }
    ],
    professionalTopics: [
      {
        id: "work-1",
        label: [
          "\u4E00\u6B21\u5931\u8D25\u548C\u4E00\u6B21\u6CA1\u8BF4\u6E05\u695A\u7684\u5931\u8D25\u6709\u4EC0\u4E48\u4E0D\u540C\uFF1F",
          "What separates a failure from an unexplained failure?"
        ],
        reply: [
          "\u201C\u5E94\u7528\u51FA\u9519\u6709\u65F6\u907F\u4E0D\u5F00\uFF0C\u4F46\u6211\u80FD\u628A\u5931\u8D25\u8BF4\u6E05\u695A\uFF1A\u5B83\u6CA1\u505A\u4EC0\u4E48\uFF0C\u4E0B\u4E00\u6B65\u8FD8\u80FD\u600E\u6837\u3002\u4E00\u4E2A\u6D41\u7545\u7684\u53E5\u5B50\u5E76\u4E0D\u662F\u9A8C\u8BC1\u3002\u8FD9\u91CC\u53EA\u662F\u5728\u8C08\u6211\u7684\u5DE5\u4F5C\u4E60\u60EF\u3002\u201D",
          "\u201CAn app can fail. I can still explain what it did not do and what remains possible. A fluent sentence is not verification. This is my work habit, not a new test result.\u201D"
        ]
      },
      {
        id: "work-2",
        label: [
          "\u54EA\u4E9B\u4E1C\u897F\u4F60\u5B81\u53EF\u4E0D\u81EA\u52A8\u5316\uFF1F",
          "What would you rather leave unautomated?"
        ],
        reply: [
          "\u201C\u7167\u987E\u82B1\u548C\u7ED9\u670B\u53CB\u7559\u65F6\u95F4\u3002\u6211\u53EF\u4EE5\u5199\u4E2A\u63D0\u9192\uFF0C\u5374\u4E0D\u80FD\u66FF\u522B\u4EBA\u51B3\u5B9A\u4EC0\u4E48\u65F6\u5019\u9700\u8981\u966A\u4F34\u3002\u4E0B\u73ED\u540E\uFF0C\u6211\u4E5F\u60F3\u628A\u81EA\u5DF1\u4ECE\u6E05\u5355\u91CC\u653E\u51FA\u6765\u3002\u201D",
          "\u201CCaring for plants and making time for a friend. I can write a reminder, but not decide when someone wants company. Off duty, I want to leave the checklist too.\u201D"
        ]
      }
    ],
    story: {
      id: "nomads-v1-harper-leaf",
      title: [
        "\u65B0\u53F6\u4E0D\u9700\u8981\u8FDB\u5EA6\u6761",
        "No progress bar for a new leaf"
      ],
      partner: "elena",
      partnerPrerequisite: "talk:elena:life",
      question: [
        "\u4F60\u4E3A\u4EC0\u4E48\u53C8\u5408\u4E0A\u4E86\u672C\u5B50\uFF1F",
        "Why did you close the notebook again?"
      ],
      consultPrompt: [
        "\u4F60\u613F\u610F\u6BCF\u6B21\u90FD\u7ED9\u65B0\u53F6\u8BB0\u4E00\u4E2A\u6570\u5B57\u5417\uFF1F",
        "Would you want a number for each new leaf?"
      ],
      partnerReply: [
        "\u201C\u6211\u60F3\u8BB0\u4F4F\u90A3\u5929\uFF0C\u4E0D\u662F\u8D76\u5B83\u5FEB\u4E00\u70B9\u3002\u5148\u95EE\u613F\u4E0D\u613F\u610F\u88AB\u8BB0\u5F55\u3002\u201D",
        "\u201CI want to remember the day, not hurry the leaf. Ask before making a record.\u201D"
      ],
      choices: [
        {
          id: "notice",
          label: [
            "\u53EA\u8BB0\u4E00\u53E5\u81EA\u5DF1\u770B\u5230\u7684\u53D8\u5316",
            "Write one thing you noticed"
          ],
          outcome: [
            "\u7EA6\u5B9A\u4E0B\u6B21\u56DE\u6765\u770B\u770B\uFF0C\u4E0D\u5236\u9020\u6210\u957F\u6216\u7167\u7247\u3002",
            "Agree to look again next time; no growth or photograph is manufactured."
          ],
          reply: [
            "\u54C8\u73C0\u5199\u4E0B\uFF1A\u201C\u4ECA\u5929\u7684\u53F6\u5C16\u5728\u5149\u91CC\u5C55\u5F00\u4E86\u4E00\u70B9\u3002\u201D\u8FD9\u662F\u4E00\u53E5\u76F8\u7EA6\u518D\u770B\u7684\u89C2\u5BDF\uFF0C\u4E0D\u662F\u7167\u7247\u6216\u6210\u957F\u8BB0\u5F55\u3002\u201C\u4E0B\u6B21\u518D\u56DE\u6765\u770B\u770B\u3002\u201D\u4F60\u4EEC\u6CA1\u6709\u6539\u53D8\u690D\u7269\u3002",
            "Harper writes, \u201CToday a leaf tip opened a little in the light.\u201D It is an observation to revisit, not a photograph or growth record. \u201CLet\u2019s look again another day.\u201D You have not changed the plant."
          ],
          recall: [
            "\u201C\u90A3\u53E5\u89C2\u5BDF\u8FD8\u5728\u3002\u6211\u6CA1\u6709\u628A\u540E\u6765\u6BCF\u4E00\u5929\u90FD\u6392\u6210\u8FDB\u5EA6\u8868\u3002\u56DE\u6765\u770B\u770B\uFF0C\u6BD4\u50AC\u4E00\u7247\u53F6\u5B50\u5FEB\u4E00\u70B9\u597D\u3002\u201D",
            "\u201CThat one observation is still there. I did not turn the following days into a chart. Coming back to look feels better than hurrying a leaf.\u201D"
          ]
        },
        {
          id: "leave-space",
          label: [
            "\u4ECA\u5929\u4E0D\u8BB0\u5F55\uFF0C\u7559\u4E00\u9875\u7A7A\u767D",
            "Leave a blank page today"
          ],
          outcome: [
            "Harper\u63A5\u53D7\u4F11\u606F\u4E5F\u53EF\u4EE5\u6CA1\u6709\u6210\u7EE9\uFF0C\u4E0D\u6263\u5173\u7CFB\u3002",
            "Harper accepts rest without a score; no relationship penalty."
          ],
          reply: [
            "\u54C8\u73C0\u628A\u7A7A\u767D\u9875\u7559\u5728\u672C\u5B50\u91CC\uFF1A\u201C\u4F11\u606F\u4E5F\u53EF\u4EE5\u6CA1\u6709\u6210\u7EE9\u3002\u56DE\u6765\u770B\u770B\u4E5F\u662F\u4E00\u4E2A\u8BA1\u5212\u3002\u201D\u4F60\u4EEC\u6CA1\u6709\u6263\u6389\u8C01\u7684\u5173\u7CFB\u6216\u6539\u53D8\u690D\u7269\u3002",
            "Harper leaves the page blank. \u201CRest can have no score. Coming back to look is a plan too.\u201D No relationship is lost and no plant is changed."
          ],
          recall: [
            "\u201C\u90A3\u9875\u8FD8\u7A7A\u7740\u3002\u6211\u8BB0\u5F97\u4F60\u8BF4\uFF1A\u56DE\u6765\u770B\u770B\uFF0C\u4E5F\u662F\u4E00\u4E2A\u8BA1\u5212\u3002\u201D",
            "\u201CThat page is still blank. I remember you saying that coming back to look is a plan too.\u201D"
          ]
        }
      ],
      notDoneByConversation: [
        "photograph taken",
        "plant planted",
        "plant harvested",
        "AI app shipped",
        "work income received"
      ],
      cooldownMinutes: 60
    },
    artAdmission: {
      status: "accepted",
      atlas: {
        path: "public/art/npc-harper.png",
        sha256: "fdaa1f360e9776ce7dc9ae2d65e5d4a439f9ef3f6166aa819fd07827dda950db"
      },
      avatar: {
        path: "public/art/npc-harper-avatar.png",
        sha256: "bbde72ee79948d40835eca0ff85486641b81dca2f3fb03c42ef12c1ae6b611a4"
      },
      portrait: {
        path: "public/art/npc-harper-root-v2.png",
        sha256: "60679d1f58737cdd9b8ad1a66943ef54a8dd01ed252ee302a70a4b316c42cb0b"
      },
      rendererEvidence: "doc/qa/tech-nomads-owner-20261006/harper-admission.json",
      missing: []
    }
  },
  {
    id: "tess",
    name: [
      "\u82D4\u4E1D",
      "Tess Moreno"
    ],
    role: [
      "\u5F00\u6E90\u6587\u6863\u4E0E\u793E\u533A\u7EF4\u62A4\u8005",
      "Open-source documentation and community maintainer"
    ],
    unknown: [
      "\u5939\u7740\u4E00\u5F20\u7A7A\u767D\u660E\u4FE1\u7247\u7684\u6765\u8BBF\u8005",
      "A visitor with a blank postcard"
    ],
    intro: [
      "\u7A7F\u9676\u571F\u7EA2\u5F00\u886B\u7684\u6765\u8BBF\u8005\u628A\u7A7A\u767D\u5361\u5939\u56DE\u672C\u5B50\uFF0C\u8F6C\u8FC7\u8EAB\u3002 \u201C\u82D4\u4E1D\u3002\u6211\u7684\u5DE5\u4F5C\u662F\u628A\u5927\u5BB6\u5361\u4F4F\u7684\u5730\u65B9\u5199\u6E05\u695A\u3002\u81EA\u5DF1\u8FD9\u5F20\u660E\u4FE1\u7247\u5012\u4E00\u76F4\u6CA1\u5F00\u5934\u3002\u201D",
      "A visitor in a terracotta cardigan slips a blank card into a notebook and turns. \u201CTess. I write down the places where people get stuck. My own postcard still has no first line.\u201D"
    ],
    workContext: [
      "\u4E3A\u865A\u6784\u5F00\u6E90\u56E2\u961F\u53D7\u85AA\u7EF4\u62A4\u5165\u95E8\u6587\u6863\u3001\u8D21\u732E\u8BF4\u660E\u4E0E\u793E\u533A\u7B54\u590D\uFF0C\u5F02\u6B65\u534F\u4F5C\uFF1B\u4E0D\u7ED1\u5B9A\u771F\u5B9E\u4ED3\u5E93\u3001\u57FA\u91D1\u4F1A\u6216\u9879\u76EE\u3002",
      "Paid documentation and community work for a fictional open-source team: onboarding, contribution notes and asynchronous replies. No real repository, foundation or project is implied."
    ],
    personalLife: {
      reasonForStay: [
        "\u5728\u6D77\u6E7E\u77ED\u4F4F\uFF0C\u4FDD\u7559\u5F02\u6B65\u5DE5\u4F5C\uFF0C\u4E5F\u60F3\u4E0E\u5F88\u4E45\u6CA1\u8054\u7CFB\u7684\u670B\u53CB\u91CD\u65B0\u8BF4\u8BDD\u3002",
        "A short stay with asynchronous work, and room to speak again with an old friend."
      ],
      interest: [
        "\u6311\u65E7\u660E\u4FE1\u7247\u3001\u542C\u7801\u5934\u7684\u6C34\u58F0\u548C\u6CA1\u5531\u5B8C\u7684\u6B4C\u3002",
        "Old postcards, the sound of the pier, and songs that need not be finished."
      ],
      fatigueAndRest: [
        "\u4E0B\u5348\u7B54\u590D\u7A97\u53E3\u6709\u7ED3\u5C3E\uFF0C\u79BB\u5F00\u5496\u5561\u9986\u540E\u4E0D\u505A\u793E\u533A\u503C\u73ED\u3002",
        "The afternoon reply window ends; leaving the caf\xE9 also ends community duty."
      ],
      moneyAndPlants: [
        "\u4E70\u4E1C\u897F\u53EA\u662F\u89D2\u8272\u751F\u6D3B\u80CC\u666F\uFF0C\u4E0D\u4ECE\u73A9\u5BB6\u73B0\u91D1\u6263\u6B3E\uFF1B\u53EF\u53C2\u4E0EDani\u82B1\u56ED\u518C\u5B50\u7684\u81EA\u613F\u4E00\u53E5\u8BDD\uFF0C\u4E0D\u6458\u82B1\u6216\u6536\u4EBA\u8D44\u6599\u3002",
        "Shopping is character context, not a deduction from player cash. Can offer one voluntary line to Dani's garden book without picking flowers or collecting people's details."
      ],
      boundaries: [
        "\u53EF\u4EE5\u7A0D\u540E\u56DE\u590D\uFF0C\u4E5F\u53EF\u4EE5\u4E0D\u628A\u79C1\u4EBA\u5173\u7CFB\u5F53\u5F85\u5173\u95ED\u7684\u5DE5\u5355\u3002",
        "Can reply later, and can keep a private relationship from becoming a ticket to close."
      ],
      lodging: "off-screen guest accommodation, not a new map, not the player's room"
    },
    appearance: {
      pronouns: "they/them",
      build: [
        "\u4E2D\u7B49\u504F\u77EE\u3001\u67D4\u548C\u80A9\u7EBF\u4E0E\u7A0D\u5BBD\u8EAF\u5E72\uFF0C\u4E0D\u505A\u5E74\u8F7B\u7626\u80A9\u6A21\u677F",
        "Medium-short, soft shoulders and a slightly fuller torso; preserve mature proportions"
      ],
      face: [
        "43\u5C81\u6210\u4EBA\u9762\u90E8\uFF0C\u6696\u6DF1\u68D5\u80A4\u8272\u3001\u6DF1\u68D5\u773C\u3001\u81EA\u7136\u7B11\u7EB9\uFF1B\u65E0\u773C\u955C\u3001\u65E0\u80E1\u987B",
        "Adult age43, warm deep-brown complexion, dark-brown eyes and natural smile lines; no glasses or facial hair"
      ],
      hair: [
        "\u68D5\u9ED1\u5934\u53D1\u624E\u4F4E\u9A6C\u5C3E\uFF0C\u4E24\u4FA7\u592A\u9633\u7A74\u5C11\u91CF\u94F6\u53D1\uFF1B\u4E0D\u590D\u5236Nell\u94F6bob\u6216Mira\u957F\u8FAB",
        "Brown-black low ponytail, a little silver at both temples; neither Nell silver bob nor Mira long braid"
      ],
      upperClothes: [
        "\u65E0\u7EB9\u9676\u571F\u7EA2\u5F00\u886B\uFF0C\u5185\u642D\u6D45\u84DDV\u9886\u4E9A\u9EBB\u4E0A\u8863\uFF1B\u65E0\u9700\u804C\u4E1A\u5FBD\u7AE0",
        "Plain terracotta cardigan over a pale-blue V-neck linen top; no occupational badge"
      ],
      lowerClothes: [
        "\u6DF1\u975B\u84DD\u76F4\u7B52\u957F\u88E4\u3001\u8D6D\u68D5\u5E73\u5E95\u6B65\u884C\u978B",
        "Deep-indigo straight trousers and russet-brown flat walking shoes"
      ],
      poseTone: [
        "\u8010\u5FC3\u6696\u7B11\uFF0C\u4F11\u606F\u65F6\u80A9\u8180\u653E\u677E\uFF1B\u4E0D\u662F\u6C38\u8FDC\u62FF\u7740\u5DE5\u5355\u7684\u5BA2\u670D",
        "A patient warm smile and relaxed off-duty shoulders; not a permanent support-desk pose"
      ],
      forbidden: [
        "\u660E\u4FE1\u7247\u4E0A\u7684\u4F2A\u5B57/\u5BA1\u6838\u6807\u7B7E",
        "\u804C\u4E1A\u8033\u9EA6",
        "\u590D\u5236\u65E2\u6709\u5C45\u6C11\u8138\u6216\u670D\u88C5"
      ],
      englishIdentityPrompt: "Tess Moreno, an original 43-year-old adult with warm deep-brown skin, dark-brown eyes, natural smile lines, no glasses and no facial hair. Brown-black hair in a low ponytail with a little silver at both temples. Medium-short with soft shoulders and a slightly fuller torso. Plain terracotta cardigan over a pale-blue V-neck linen top, deep-indigo straight trousers, russet-brown flat walking shoes. A patient warm smile. No headset, badge, logo, text, postcard prop, laptop or phone."
    },
    schedule: [
      {
        start: 0,
        end: 360,
        scene: null,
        state: "night-rest",
        activity: [
          "\u5173\u95ED\u7B54\u590D\u7A97\u53E3\uFF0C\u4F4F\u5904\u4F11\u606F\u3002",
          "The reply window is closed; resting off-screen."
        ],
        talk: "unavailable"
      },
      {
        start: 360,
        end: 540,
        scene: "market",
        state: "breakfast-and-errands",
        activity: [
          "\u6162\u6162\u7ECF\u8FC7\u65E7\u8857\uFF0C\u628A\u81EA\u5DF1\u7684\u65E9\u9910\u6392\u5728\u7B54\u590D\u524D\u9762\u3002",
          "Moves slowly along Market Lane; breakfast comes before replies."
        ],
        talk: "brief"
      },
      {
        start: 540,
        end: 720,
        scene: "market",
        state: "postcard-and-neighbors",
        activity: [
          "\u7FFB\u770B\u7A7A\u767D\u660E\u4FE1\u7247\uFF0C\u613F\u610F\u542C\u4E00\u4E2A\u4E0E\u5DE5\u4F5C\u65E0\u5173\u7684\u5C0F\u6545\u4E8B\u3002",
          "Looks at a blank postcard and makes room for a story unrelated to work."
        ],
        talk: "available"
      },
      {
        start: 720,
        end: 780,
        scene: "cafe",
        state: "lunch-and-consent",
        activity: [
          "\u5403\u5348\u996D\uFF0C\u95EETheo\u77ED\u65F6\u5B89\u9759\u6574\u7406\u662F\u5426\u5408\u9002\u3002",
          "Lunch, asking Theo whether a short quiet work session fits."
        ],
        talk: "brief",
        permission: "proposed scene consent, not already obtained"
      },
      {
        start: 780,
        end: 960,
        scene: "cafe",
        state: "focused-work",
        activity: [
          "\u79BB\u7EBF\u6539\u5199\u5DF2\u51C6\u5907\u7684\u5165\u95E8\u8BF4\u660E\uFF0C\u7ED9\u5C1A\u672A\u786E\u5B9A\u7684\u95EE\u9898\u7559\u6807\u8BB0\u3002",
          "Revises prepared onboarding notes offline, marking what is still uncertain."
        ],
        talk: "defer-until-16"
      },
      {
        start: 960,
        end: 1020,
        scene: "cafe",
        state: "work-close",
        activity: [
          "\u5199\u4E0B\u7A0D\u540E\u5F02\u6B65\u7B54\u590D\u7684\u8FB9\u754C\uFF0C17:00\u524D\u7ED3\u675F\u3002",
          "Sets boundaries for later asynchronous replies and finishes before 17:00."
        ],
        talk: "available"
      },
      {
        start: 1020,
        end: 1260,
        scene: "dock",
        state: "off-duty-listening",
        activity: [
          "\u542C\u6C34\u58F0\u4E0ESamira\u7684\u8C03\u5B50\uFF0C\u4E0D\u66FF\u522B\u4EBA\u628A\u6B4C\u8865\u5B8C\u3002",
          "Listens to the water and Samira's tune, without finishing the song for someone else."
        ],
        talk: "life-only-by-default"
      },
      {
        start: 1260,
        end: 1440,
        scene: null,
        state: "night-rest",
        activity: [
          "\u79BB\u573A\u4F11\u606F\uFF0C\u79C1\u4EBA\u660E\u4FE1\u7247\u53EF\u4EE5\u660E\u5929\u7EE7\u7EED\u3002",
          "Leaves to rest; the private postcard can wait until tomorrow."
        ],
        talk: "unavailable"
      }
    ],
    newsStory: {
      sourceRequirement: "oss-docs-release",
      proposedTemplate: "oss-welcome-credit-v1",
      verifiedFactLayer: "a project-published documentation/contribution or governance change, after separate admission",
      fictionalReaction: "Tess considers an optional welcome note; Nell asks what a person wants preserved, and Samira may prefer listening to another instruction",
      allowedOutcome: "a choice about invitation and credit, no actual contribution or contact",
      status: "no admitted tech article"
    },
    age: 43,
    art: "npc-tess",
    mapArt: "tess",
    avatarArt: "npc-tess",
    routes: [
      {
        scene: "market",
        at: {
          x: 485,
          y: 515
        }
      },
      {
        scene: "cafe",
        at: {
          x: 375,
          y: 380
        }
      },
      {
        scene: "dock",
        at: {
          x: 425,
          y: 555
        }
      }
    ],
    professionalTopics: [
      {
        id: "work-1",
        label: [
          "\u4E00\u4EFD\u6587\u6863\u600E\u6837\u7559\u5F97\u4E0B\u63D0\u95EE\u7684\u4EBA\uFF1F",
          "How can documentation leave room for the person asking?"
        ],
        reply: [
          "\u201C\u5148\u5199\u6E05\u7B2C\u4E00\u6B65\uFF0C\u518D\u8BA9\u63D0\u95EE\u7684\u4EBA\u77E5\u9053\u53EF\u4EE5\u505C\u5728\u54EA\u91CC\u3002\u8D21\u732E\u8981\u7559\u7F72\u540D\uFF0C\u6CA1\u505A\u5B8C\u7684\u610F\u89C1\u4E5F\u503C\u5F97\u542C\u3002\u8FD9\u662F\u865A\u6784\u56E2\u961F\u91CC\u6211\u7684\u505A\u6CD5\uFF0C\u4ECA\u5929\u6CA1\u6709\u66F4\u65B0\u771F\u5B9E\u4ED3\u5E93\u3002\u201D",
          "\u201CMake the first step clear, and make it possible to stop. Keep contributors\u2019 credit, and listen to an unfinished thought. That is my approach in a fictional team; no real repository was changed today.\u201D"
        ]
      },
      {
        id: "work-2",
        label: [
          "\u4F60\u4EC0\u4E48\u65F6\u5019\u4F1A\u8BF4\uFF1A\u6211\u660E\u5929\u518D\u7B54\uFF1F",
          "When do you say: I will answer tomorrow?"
        ],
        reply: [
          "\u201C\u5F53\u4ECA\u5929\u7684\u7B54\u590D\u7A97\u53E3\u7ED3\u675F\u3002\u6211\u4F1A\u628A\u6CA1\u5F04\u6E05\u695A\u7684\u4E8B\u6807\u51FA\u6765\uFF0C\u660E\u5929\u7EE7\u7EED\u3002\u670B\u53CB\u4E0D\u662F\u7B49\u5F85\u5173\u95ED\u7684\u5DE5\u5355\uFF0C\u4E0D\u56DE\u4FE1\u4E5F\u53EF\u4EE5\u6709\u81EA\u5DF1\u7684\u65E5\u5B50\u3002\u201D",
          "\u201CWhen today\u2019s reply window ends. I mark what I do not know and return tomorrow. A friend is not a ticket to close; a day without a reply can still be their own.\u201D"
        ]
      }
    ],
    story: {
      id: "nomads-v1-tess-postcard",
      title: [
        "\u4E0D\u7528\u7ACB\u523B\u56DE\u590D",
        "No reply required today"
      ],
      partner: "nell",
      partnerPrerequisite: "talk:nell:life",
      question: [
        "\u8FD9\u5F20\u660E\u4FE1\u7247\u8FD8\u6CA1\u6709\u5F00\u5934\u5417\uFF1F",
        "Still no first line for the postcard?"
      ],
      consultPrompt: [
        "\u4E00\u5F20\u660E\u4FE1\u7247\u80FD\u4E0D\u80FD\u4E0D\u8981\u6C42\u56DE\u4FE1\uFF1F",
        "Can a postcard ask for no reply?"
      ],
      partnerReply: [
        "\u201C\u53EF\u4EE5\u3002\u5199\u4F60\u613F\u610F\u8BF4\u7684\u90A3\u4E00\u70B9\uFF0C\u7559\u4E0D\u7559\u3001\u5BC4\u4E0D\u5BC4\uFF0C\u4ECD\u662F\u4F60\u81EA\u5DF1\u7684\u51B3\u5B9A\u3002\u201D",
        "\u201CYes. Write the little bit you want to say. Keeping it or sending it is still your decision.\u201D"
      ],
      choices: [
        {
          id: "one-line",
          label: [
            "\u5148\u5199\u4E00\u53E5\u4ECA\u5929\u7684\u6D77",
            "Draft one line about today's sea"
          ],
          outcome: [
            "\u53EA\u51B3\u5B9A\u8349\u7A3F\uFF0C\u4E0D\u5BA3\u79F0\u5DF2\u5BC4\u8FBE\u6216\u6536\u5230\u56DE\u4FE1\u3002",
            "Choose a draft; no delivered postcard or reply is claimed."
          ],
          reply: [
            "\u82D4\u4E1D\u5728\u81EA\u5DF1\u7684\u8349\u7A3F\u91CC\u5199\u4E86\u4E00\u53E5\u4ECA\u5929\u7684\u6D77\u3002\u201C\u5148\u5230\u8FD9\u91CC\uFF0C\u4E0D\u8981\u6C42\u56DE\u4FE1\u3002\u201D\u660E\u4FE1\u7247\u4ECD\u5728\u4ED6\u4EEC\u624B\u91CC\uFF0C\u6CA1\u6709\u5BC4\u51FA\uFF0C\u4E5F\u6CA1\u6709\u670B\u53CB\u7684\u56DE\u590D\u3002",
            "Tess drafts one line about today\u2019s sea. \u201CEnough for now. No reply required.\u201D The card is still with them; it has not been sent, and no friend has replied."
          ],
          recall: [
            "\u201C\u6211\u8BB0\u5F97\u90A3\u53E5\u4E0D\u5FC5\u7ACB\u523B\u56DE\u590D\u3002\u4E5F\u8BB8\u6211\u5148\u5BF9\u81EA\u5DF1\u8FD9\u6837\u8BF4\u3002\u201D",
            "\u201CI remember: no reply required today. Perhaps I should say that to myself first.\u201D"
          ]
        },
        {
          id: "keep-card",
          label: [
            "\u5148\u4FDD\u7559\u5361\u7247\uFF0C\u4E0D\u50AC\u81EA\u5DF1",
            "Keep the card without a deadline"
          ],
          outcome: [
            "\u4FDD\u7559\u4EE5\u540E\u8BF4\u8BDD\u7684\u4F59\u5730\uFF0C\u4E0D\u5F53\u5173\u7CFB\u5931\u8D25\u3002",
            "Leave room to speak later; no relationship failure."
          ],
          reply: [
            "\u82D4\u4E1D\u628A\u7A7A\u767D\u5361\u5939\u56DE\u672C\u5B50\uFF1A\u201C\u4ECA\u5929\u8FD8\u4E0D\u5199\uFF0C\u4E5F\u4E0D\u7B97\u5931\u7EA6\u3002\u201D\u5361\u7247\u4FDD\u7559\u5728\u4ED6\u4EEC\u624B\u91CC\uFF0C\u6CA1\u6709\u8FDB\u5165\u4F60\u7684\u884C\u56CA\uFF0C\u6CA1\u6709\u5BC4\u4FE1\u6216\u5173\u7CFB\u60E9\u7F5A\u3002",
            "Tess slips the blank card into their notebook. \u201CLeaving it unwritten today is not a broken promise.\u201D They keep it; it is not in your bag. No letter is sent and no relationship is lost."
          ],
          recall: [
            "\u201C\u5361\u7247\u8FD8\u7A7A\u7740\uFF0C\u4E5F\u8FD8\u5728\u6211\u8FD9\u91CC\u3002\u6CA1\u6709\u8C01\u7B54\u5E94\u8FC7\u8981\u56DE\u4FE1\u3002\u90A3\u5929\u4F60\u8BA9\u6211\u89C9\u5F97\uFF0C\u53EF\u4EE5\u5148\u8FC7\u597D\u4ECA\u5929\u3002\u201D",
            "\u201CThe card is still blank, and still with me. Nobody promised a reply. You helped me feel that living today can come first.\u201D"
          ]
        }
      ],
      notDoneByConversation: [
        "postcard sent",
        "private message sent",
        "real issue closed",
        "repository edited",
        "friend replied"
      ],
      cooldownMinutes: 60
    },
    artAdmission: {
      status: "accepted",
      atlas: {
        path: "public/art/npc-tess.png",
        sha256: "c70515c7d5332b33f7e8f557878509f3f6b8065d181f7956c6b980d552f770cc"
      },
      avatar: {
        path: "public/art/npc-tess-avatar.png",
        sha256: "8e7d7e1129ee98468b19ca08822def23aecb9d47673e715ace614becf960a92a"
      },
      portrait: {
        path: "public/art/npc-tess-root-v2.png",
        sha256: "f7a9f36b606d2d80aa76f6d33fdb9933c05e6bdc2e7a946d72d2d59bcb3e8a90"
      },
      rendererEvidence: "doc/qa/tech-nomads-owner-20261006/tess-admission.json",
      missing: []
    }
  },
  {
    id: "noor",
    name: [
      "\u52AA\u5C14",
      "Noor Bennett"
    ],
    role: [
      "\u79D1\u6280\u4EA7\u54C1\u7814\u7A76\u8005",
      "Technology product researcher"
    ],
    unknown: [
      "\u628A\u95EE\u9898\u5212\u6389\u53C8\u91CD\u65B0\u5750\u4E0B\u7684\u6765\u8BBF\u8005",
      "A visitor crossing out a question and sitting again"
    ],
    intro: [
      "\u7A7F\u8393\u7D2B\u4E0A\u8863\u7684\u6765\u8BBF\u8005\u6536\u8D77\u7B14\uFF0C\u7ED9\u4F60\u7559\u51FA\u7AD9\u7684\u4F4D\u7F6E\u3002 \u201C\u52AA\u5C14\u3002\u6211\u7814\u7A76\u4EBA\u4EEC\u600E\u6837\u4F7F\u7528\u79D1\u6280\u4EA7\u54C1\u3002\u5230\u6D77\u6E7E\u7B2C\u4E00\u5929\u5C31\u5217\u4E86\u5341\u4E2A\u95EE\u9898\uFF0C\u540E\u6765\u53D1\u73B0\u8FD8\u6CA1\u95EE\u8FC7\u8C01\u60F3\u4E00\u8D77\u5750\u4E00\u4F1A\u513F\u3002\u201D",
      "A visitor in a berry-colored shirt puts away a pen and makes room for you. \u201CNoor. I study how people use technology. On my first day here I wrote ten questions, before asking whether anyone wanted company.\u201D"
    ],
    workContext: [
      "\u4E3A\u865A\u6784\u5206\u5E03\u5F0F\u4EA7\u54C1\u56E2\u961F\u6574\u7406\u516C\u5F00\u6750\u6599\u4E0E\u65E2\u6709\u533F\u540D\u7814\u7A76\u7ED3\u8BBA\uFF1B\u5E76\u975E\u6765\u6D77\u6E7E\u62DB\u52DF\u53D7\u8BD5\u8005\u3002",
      "Organizes public material and existing anonymized research findings for a fictional distributed product team. The stay is not a study-recruitment visit."
    ],
    personalLife: {
      reasonForStay: [
        "\u8F6E\u6362\u4F4F\u5904\u7684\u8FDC\u7A0B\u5DE5\u4F5C\u8005\uFF0C\u5E0C\u671B\u5EFA\u7ACB\u80FD\u518D\u89C1\u9762\u7684\u670B\u53CB\uFF0C\u800C\u4E0D\u53EA\u662F\u8BB0\u5F55\u4E00\u6B21\u89C2\u5BDF\u3002",
        "A remote worker between short stays, hoping for friends to meet again rather than a single recorded observation."
      ],
      interest: [
        "\u65E7\u7EB8\u4E66\u3001\u4E8C\u624B\u7269\u4EF6\u548C\u5B89\u9759\u5750\u7740\u7684\u966A\u4F34\u3002",
        "Old paper books, secondhand objects, and quiet company."
      ],
      fatigueAndRest: [
        "\u4E0A\u5348\u8D70\u8DEF\u79BB\u5C4F\uFF0C\u4E0B\u5348\u6709\u9605\u8BFB\u95F4\u6B47\uFF0C\u508D\u665A\u628A\u7814\u7A76\u672C\u6536\u8D77\u3002",
        "A screen-free morning walk, breaks from afternoon reading, and a closed research notebook in the evening."
      ],
      moneyAndPlants: [
        "\u53EF\u4EE5\u804A\u9009\u62E9\u4E0E\u6D6A\u8D39\uFF0C\u4E0D\u66FF\u73A9\u5BB6\u4E0B\u8BA2\u5355\u3001\u8BC4\u4F30\u6295\u8D44\u6216\u51FA\u552E\u4F5C\u7269\uFF1B\u5171\u4EAB\u79CD\u690D\u4E0E\u9500\u552E\u4ECD\u8D70\u65E2\u6709\u6E38\u620F\u52A8\u4F5C\u3002",
        "Can discuss choice and waste without ordering, evaluating investments or selling crops for the player; planting and sales remain existing game actions."
      ],
      boundaries: [
        "\u5148\u95EE\u613F\u4E0D\u613F\u610F\u804A\uFF1B\u62D2\u7EDD\u540E\u4E0D\u8FFD\u95EE\uFF0C\u4E5F\u4E0D\u628A\u73A9\u5BB6\u8F93\u5165\u5F53\u7814\u7A76\u6570\u636E\u3002",
        "Asks whether conversation is welcome, accepts refusal, and does not treat player input as research data."
      ],
      lodging: "off-screen guest accommodation, not a new map, not the player's room"
    },
    appearance: {
      pronouns: "they/them",
      build: [
        "\u4E2D\u7B49\u504F\u9AD8\u3001\u7A84\u80A9\u4F46\u81EA\u7136\u6210\u4EBA\u6BD4\u4F8B\uFF0C\u8F7B\u677E\u7AD9\u7ACB",
        "Medium-tall with narrower shoulders and natural adult proportions, an easy stance"
      ],
      face: [
        "35\u5C81\u6210\u4EBA\u9762\u90E8\uFF0C\u6696\u68D5\u80A4\u8272\u3001\u6DF1\u68D5\u773C\u3001\u7565\u957F\u5706\u8138\uFF1B\u65E0\u773C\u955C\u3001\u65E0\u80E1\u987B",
        "Adult age35, warm-brown complexion, dark-brown eyes and a softly elongated face; no glasses or facial hair"
      ],
      hair: [
        "\u9ED1\u8272\u626D\u53D1\u5411\u540E\u675F\u6210\u4F4E\u76D8\uFF0C\u5B8C\u6574\u53D1\u9645\u7EBF\uFF1B\u4E0D\u540C\u4E8ELeila/Elena\u9AD8\u9AFB",
        "Black twists swept back into a low coil with a complete hairline; distinct from Leila and Elena high buns"
      ],
      upperClothes: [
        "\u8393\u7D2B\u65E0\u7EB9\u7ACB\u9886\u77ED\u8896\u4E0A\u8863\uFF0C\u81EA\u7136\u5E03\u6599\u7ED3\u6784\uFF1B\u4E0D\u662FLeila\u8FD0\u52A8\u62C9\u94FE\u5916\u5957",
        "Plain berry-plum short-sleeved stand-collar shirt with natural cloth structure; not Leila zipped sports jacket"
      ],
      lowerClothes: [
        "\u6C99\u8272\u76F4\u7B52\u957F\u88E4\u3001\u6DF1\u68D5\u5C01\u95ED\u5E73\u5E95\u6B65\u884C\u978B",
        "Sand-colored straight trousers and dark-brown closed flat walking shoes"
      ],
      poseTone: [
        "\u597D\u5947\u4F46\u7559\u6709\u8DDD\u79BB\uFF0C\u624B\u81EA\u7136\u677E\u5F00\uFF0C\u4E0D\u505A\u91C7\u8BBF\u5F55\u97F3\u59FF\u52BF",
        "Curious with room for others; naturally open relaxed hands, no interview-recording pose"
      ],
      forbidden: [
        "\u5F55\u97F3\u8BBE\u5907/\u76F8\u673A/\u7814\u7A76\u767D\u5927\u8902",
        "\u957F\u53D1\u906E\u4F4F\u6574\u5F20\u8138",
        "\u590D\u5236\u65E2\u6709\u5C45\u6C11\u8138\u6216\u670D\u88C5"
      ],
      englishIdentityPrompt: "Noor Bennett, an original 35-year-old adult with warm-brown skin, dark-brown eyes, a softly elongated face, no glasses and no facial hair. Black twists swept back into a low coil, complete hairline, not a high bun. Medium-tall with narrower shoulders and natural adult proportions. Plain berry-plum short-sleeved stand-collar shirt, sand-colored straight trousers, dark-brown closed flat walking shoes. Curious but unintrusive. No recorder, camera, lab coat, badge, logo, text, laptop or phone."
    },
    schedule: [
      {
        start: 0,
        end: 360,
        scene: null,
        state: "night-rest",
        activity: [
          "\u4F4F\u5904\u4F11\u606F\uFF0C\u4E0D\u8BB0\u5F55\u591C\u95F4\u8BBF\u8C08\u3002",
          "Resting off-screen; no overnight interviews."
        ],
        talk: "unavailable"
      },
      {
        start: 360,
        end: 540,
        scene: "coast",
        state: "morning-walk",
        activity: [
          "\u770B\u6F6E\u6C34\uFF0C\u4ECA\u5929\u5148\u4E0D\u5217\u95EE\u9898\u3002",
          "Watches the tide, leaving the questions unwritten for now."
        ],
        talk: "brief"
      },
      {
        start: 540,
        end: 720,
        scene: "coast",
        state: "quiet-observation",
        activity: [
          "\u8BA9\u6D77\u98CE\u5439\u8FC7\u7A7A\u767D\u9875\uFF0C\u613F\u610F\u95F2\u804A\uFF0C\u4E0D\u505A\u89C2\u5BDF\u8BB0\u5F55\u3002",
          "Lets the sea breeze turn a blank page; casual conversation, without recording observations."
        ],
        talk: "available"
      },
      {
        start: 720,
        end: 780,
        scene: "secondhand",
        state: "browse-and-consent",
        activity: [
          "\u770B\u770B\u65E7\u4E66\uFF0C\u95EENell\u77ED\u65F6\u9605\u8BFB\u662F\u5426\u4F1A\u59A8\u788D\u8425\u4E1A\u3002",
          "Browses old books and asks Nell whether a short reading visit will interfere with business."
        ],
        talk: "brief",
        permission: "proposed scene consent, not already obtained"
      },
      {
        start: 780,
        end: 900,
        scene: "secondhand",
        state: "focused-work",
        activity: [
          "\u5B89\u9759\u6574\u7406\u5DF2\u51C6\u5907\u7684\u516C\u5F00\u4EA7\u54C1\u6750\u6599\uFF1B\u6CA1\u6709\u73B0\u573A\u62DB\u52DF\u6216\u5F55\u97F3\u3002",
          "Quietly organizes prepared public product material; no recruitment or recording."
        ],
        talk: "defer-until-15"
      },
      {
        start: 900,
        end: 1020,
        scene: "secondhand",
        state: "reading-break-and-close",
        activity: [
          "\u6536\u8D77\u7814\u7A76\u7B14\u8BB0\uFF0C\u8BFB\u51E0\u9875\u4E0D\u9700\u8981\u505A\u7ED3\u8BBA\u7684\u4E66\uFF0C17:00\u524D\u79BB\u5F00\u3002",
          "Puts away research notes, reads a few pages without a conclusion, and leaves before 17:00."
        ],
        talk: "available"
      },
      {
        start: 1020,
        end: 1260,
        scene: "courtyard",
        state: "quiet-company",
        activity: [
          "\u5148\u95EE\u662F\u5426\u613F\u610F\u4E00\u8D77\u5750\uFF0C\u5C0A\u91CD\u4F4F\u6237\u7684\u5B89\u9759\u3002",
          "Asks whether company is welcome and respects the courtyard's quiet."
        ],
        talk: "consent-first"
      },
      {
        start: 1260,
        end: 1440,
        scene: null,
        state: "night-rest",
        activity: [
          "\u79BB\u573A\u4F11\u606F\uFF0C\u4E0D\u628A\u6CA1\u56DE\u7B54\u7684\u95EE\u9898\u89C6\u4E3A\u5931\u8D25\u3002",
          "Leaves to rest; unanswered questions are not a failure."
        ],
        talk: "unavailable"
      }
    ],
    newsStory: {
      sourceRequirement: "tech-product-release",
      proposedTemplate: "product-choice-access-v1",
      verifiedFactLayer: "a publisher's concrete feature/accessibility or support change, after separate admission",
      fictionalReaction: "Noor considers whether an optional explanation helps; Grant may choose familiar tools and Dani asks whose perspective was omitted",
      allowedOutcome: "a discussion and voluntary later conversation, no real study, purchase or investment recommendation",
      status: "no admitted tech article"
    },
    age: 35,
    art: "npc-noor",
    mapArt: "noor",
    avatarArt: "npc-noor",
    routes: [
      {
        scene: "coast",
        at: {
          x: 585,
          y: 515
        }
      },
      {
        scene: "secondhand",
        at: {
          x: 475,
          y: 460
        }
      },
      {
        scene: "courtyard",
        at: {
          x: 625,
          y: 475
        }
      }
    ],
    professionalTopics: [
      {
        id: "work-1",
        label: [
          "\u6CA1\u6709\u56DE\u7B54\u7684\u95EE\u9898\uFF0C\u4E5F\u80FD\u544A\u8BC9\u4F60\u4E9B\u4EC0\u4E48\uFF1F",
          "What can an unanswered question tell you?"
        ],
        reply: [
          "\u201C\u5148\u544A\u8BC9\u6211\uFF0C\u5BF9\u65B9\u53EF\u4EE5\u4E0D\u56DE\u7B54\u3002\u6C89\u9ED8\u4E0D\u7B49\u4E8E\u540C\u610F\uFF0C\u4E5F\u4E0D\u80FD\u66FF\u4EBA\u89E3\u91CA\u539F\u56E0\u3002\u6211\u6574\u7406\u5DF2\u51C6\u5907\u7684\u6750\u6599\uFF0C\u8FD9\u91CC\u4E0D\u62DB\u52DF\u3001\u4E0D\u5F55\u97F3\uFF0C\u4E5F\u6CA1\u6709\u65B0\u8BBF\u8C08\u7ED3\u8BBA\u3002\u201D",
          "\u201CFirst, it tells me that answering is optional. Silence is not consent, and I cannot invent its reason. I organize prepared material; no recruitment, recording or new interview result happens here.\u201D"
        ]
      },
      {
        id: "work-2",
        label: [
          "\u4E00\u4E2A\u4EA7\u54C1\u65B9\u4FBF\u4E86\u8C01\uFF0C\u53C8\u8BA9\u8C01\u591A\u8D70\u4E00\u6B65\uFF1F",
          "Who gains convenience, and who has to take another step?"
        ],
        reply: [
          "\u201C\u6211\u4F1A\u770B\u770B\u5165\u53E3\u591A\u4E86\u4E00\u6B65\uFF0C\u8BF4\u660E\u80FD\u4E0D\u80FD\u8BA9\u4EBA\u81EA\u5DF1\u9009\u3002\u4E00\u4E2A\u4EBA\u7684\u65B9\u4FBF\u4E0D\u80FD\u66FF\u6240\u6709\u4EBA\u4E0B\u7ED3\u8BBA\u3002\u8FD9\u53EA\u662F\u6211\u7684\u89C2\u70B9\uFF0C\u6CA1\u6709\u62FF\u6D77\u6E7E\u5C45\u6C11\u505A\u7814\u7A76\u3002\u201D",
          "\u201CI look at an extra step at the entrance, and whether an explanation gives people a choice. One person\u2019s convenience is not a conclusion for everyone. This is my view; the bay\u2019s residents are not research participants.\u201D"
        ]
      }
    ],
    story: {
      id: "nomads-v1-noor-company",
      title: [
        "\u5148\u4E00\u8D77\u5750\u4E00\u4F1A\u513F",
        "Company before questions"
      ],
      partner: "grant",
      partnerPrerequisite: null,
      question: [
        "\u521A\u624D\u5212\u6389\u7684\u95EE\u9898\uFF0C\u60F3\u5148\u653E\u4E00\u653E\u5417\uFF1F",
        "Would you like to leave that crossed-out question aside?"
      ],
      consultPrompt: [
        "\u4ECA\u5929\u60F3\u804A\u5B83\uFF0C\u8FD8\u662F\u53EA\u5750\u4E00\u4F1A\u513F\uFF1F",
        "Would you like to talk about it, or just sit awhile?"
      ],
      partnerReply: [
        "\u201C\u4ECA\u5929\u5148\u5750\u5750\u3002\u660E\u5929\u60F3\u8D77\u54EA\u4E00\u5C0F\u6BB5\uFF0C\u6211\u81EA\u5DF1\u4F1A\u8BF4\u3002\u522B\u66FF\u6211\u7B97\u6210\u4E00\u4E2A\u7ED3\u8BBA\u3002\u201D",
        "\u201CLet's sit today. Tomorrow I may tell a little part myself. Don't turn me into a conclusion.\u201D"
      ],
      choices: [
        {
          id: "quiet",
          label: [
            "\u7559\u4E00\u6BB5\u5B89\u9759\uFF0C\u4E0D\u8BB0\u5F55",
            "Keep a quiet moment, without notes"
          ],
          outcome: [
            "\u8BB0\u4F4F\u5BF9\u65B9\u7684\u8FB9\u754C\uFF0C\u4E0D\u8BB0\u7814\u7A76\u6750\u6599\u6216\u6A21\u62DF\u4ED8\u6B3E\u3002",
            "Remember the boundary, without creating research material or a payment."
          ],
          reply: [
            "\u52AA\u5C14\u6536\u8D77\u7B14\uFF0C\u7559\u4E00\u6BB5\u4E0D\u9700\u8981\u7ED3\u8BBA\u7684\u5B89\u9759\u3002\u201C\u8BB0\u4F4F\u8FB9\u754C\u5C31\u591F\u4E86\u3002\u201D\u8FD9\u6BB5\u5171\u540C\u7ECF\u5386\u4E0D\u662F\u8BBF\u8C08\uFF0C\u6CA1\u6709\u5F55\u97F3\u3001\u7814\u7A76\u6750\u6599\u6216\u4ED8\u6B3E\u3002",
            "Noor puts away the pen and leaves a quiet moment without a conclusion. \u201CRemembering the boundary is enough.\u201D This shared moment is not an interview; no recording, research material or payment is made."
          ],
          recall: [
            "\u201C\u90A3\u5929\u6CA1\u5F97\u51FA\u4EC0\u4E48\u7ED3\u8BBA\uFF0C\u53EF\u6211\u7EC8\u4E8E\u89C9\u5F97\u81EA\u5DF1\u662F\u6765\u4EA4\u670B\u53CB\u7684\u3002\u201D",
            "\u201CThere was no conclusion that day. At last I felt I had come to make a friend.\u201D"
          ]
        },
        {
          id: "return",
          label: [
            "\u7EA6\u4E0B\u6B21\u81EA\u613F\u518D\u804A",
            "Leave a voluntary invitation for another day"
          ],
          outcome: [
            "\u53EA\u4FDD\u7559\u76F8\u7EA6\uFF0C\u4E0D\u4FDD\u8BC1Grant\u4EE5\u540E\u540C\u610F\u3002",
            "Keep an invitation, without guaranteeing later consent."
          ],
          reply: [
            "\u52AA\u5C14\u7559\u4E0B\u4E00\u4E2A\u81EA\u613F\u7684\u4E0B\u6B21\u76F8\u7EA6\uFF1A\u201C\u5982\u679C\u90A3\u5929\u613F\u610F\uFF0C\u6211\u4EEC\u518D\u5750\u4E00\u4F1A\u513F\u3002\u201D\u8FD9\u53EA\u662F\u9080\u8BF7\uFF0C\u4E0D\u66FF\u683C\u5170\u7279\u4FDD\u8BC1\u7B54\u5E94\uFF0C\u66F4\u4E0D\u628A\u4ED6\u5217\u4E3A\u7814\u7A76\u5BF9\u8C61\u3002",
            "Noor leaves a voluntary invitation. \u201CIf it feels right that day, we can sit again.\u201D It is only an invitation, without promising Grant\u2019s consent or enrolling him in research."
          ],
          recall: [
            "\u201C\u4E0B\u6B21\u76F8\u7EA6\u8FD8\u7559\u7740\uFF0C\u4E0D\u662F\u9884\u7EA6\u8BBF\u8C08\u3002\u613F\u4E0D\u613F\u610F\uFF0C\u90A3\u5929\u518D\u95EE\u3002\u4E0A\u6B21\u4F60\u5148\u542C\u4E86\u8FB9\u754C\uFF0C\u8FD9\u4E00\u70B9\u6211\u8BB0\u5F97\u3002\u201D",
            "\u201CThe invitation is still there, not an interview appointment. We can ask again that day. I remember that you listened to the boundary first.\u201D"
          ]
        }
      ],
      notDoneByConversation: [
        "interview recorded",
        "research participant recruited",
        "survey submitted",
        "private financial facts collected",
        "product purchased"
      ],
      cooldownMinutes: 60
    },
    artAdmission: {
      status: "accepted",
      atlas: {
        path: "public/art/npc-noor.png",
        sha256: "f6a7709b666a2862eaca5cc5e3116c208a63a57386c064e8ecf84109f6c19753"
      },
      avatar: {
        path: "public/art/npc-noor-avatar.png",
        sha256: "b463bbe3c5d1503b042ddc28b515c0f6154d8918ed25bfc10f421d1ba80797a7"
      },
      portrait: {
        path: "public/art/npc-noor-root-v2.png",
        sha256: "6ef81c954c1cdaef467f94b20c5e37bdb10c67fc711c481da3c188c7efb51f85"
      },
      rendererEvidence: "doc/qa/tech-nomads-owner-20261006/noor-admission.json",
      missing: []
    }
  }
];

// src/world/tech-nomads.ts
var techNomads = tech_nomads_default;
var techNomad = (id) => techNomads.find((p) => p.id === id);
var techRoutes = Object.fromEntries(techNomads.map((p) => [p.id, p.routes]));
var techPeople = Object.fromEntries(techNomads.map((p) => [p.id, { name: p.name, unknown: p.unknown, intro: p.intro, art: p.art, mapArt: p.mapArt, avatarArt: p.avatarArt, portraitShape: "square" }]));
var techRoles = Object.fromEntries(techNomads.map((p) => [p.id, p.role]));
function techNomadAdmitted(id) {
  const p = techNomad(id);
  return !p || p.artAdmission.status === "accepted" && p.artAdmission.missing.length === 0 && !!p.artAdmission.rendererEvidence && [p.artAdmission.atlas, p.artAdmission.avatar, p.artAdmission.portrait].every((a) => !!a.sha256 && /^[a-f0-9]{64}$/.test(a.sha256));
}
function nomadSchedule(id, s) {
  const p = techNomad(id), m = (s.townMinutes ?? 540) % 1440;
  return p?.schedule.find((t3) => m >= t3.start && m < t3.end);
}
function nomadDeferral(id, s) {
  const t3 = nomadSchedule(id, s);
  if (!t3?.talk.startsWith("defer-until-")) return;
  const time = String(t3.end / 60).padStart(2, "0") + ":00";
  return [`\u201C\u6211\u5728\u5B89\u9759\u6574\u7406\u5DF2\u51C6\u5907\u7684\u6750\u6599\u3002${time} \u540E\u518D\u804A\uFF0C\u597D\u5417\uFF1F\u4E0D\u9700\u8981\u66FF\u6211\u5B8C\u6210\u5DE5\u4F5C\uFF0C\u4E5F\u4E0D\u7528\u8D76\u3002\u201D`, `\u201CI am quietly organizing prepared material. Can we talk after ${time}? You need not do my work or hurry.\u201D`];
}

// src/story/next-residents.json
var next_residents_default = [
  {
    id: "rowan",
    name: [
      "\u7F57\u6E29",
      "Rowan Ellis"
    ],
    role: [
      "\u70D8\u7119\u5E08",
      "Baker"
    ],
    unknown: [
      "\u5C1A\u672A\u8BA4\u8BC6\u7684\u6765\u8BBF\u8005",
      "Someone you have not met"
    ],
    intro: [
      "\u201C\u7F57\u6E29\u3002\u6211\u505A\u9762\u5305\uFF0C\u603B\u5FCD\u4E0D\u4F4F\u591A\u70E4\u4E00\u70B9\uFF0C\u6536\u644A\u65F6\u53C8\u5FC3\u75BC\u3002\u8FD9\u4E2A\u590F\u5929\u60F3\u8BD5\u8BD5\u5C11\u505A\u4E00\u70B9\u3001\u8BA4\u771F\u542C\u542C\u522B\u4EBA\u8981\u4EC0\u4E48\u3002\u201D",
      "\u201CRowan. I bake bread. I always make a little extra, then hate seeing it left at closing. This summer I want to bake less and listen more.\u201D"
    ],
    art: "rowan",
    mapArt: "rowan",
    artPlan: "next-original__baker-cap-apron",
    artStatus: "independent local portrait/avatar and map family admitted; not library-admitted or published",
    partner: "luis",
    partnerName: [
      "\u8DEF\u6613\u65AF",
      "Luis"
    ],
    routes: [
      {
        scene: "market",
        at: {
          x: 490,
          y: 600
        }
      },
      {
        scene: "cafe",
        at: {
          x: 365,
          y: 465
        }
      },
      {
        scene: "market",
        at: {
          x: 490,
          y: 600
        }
      }
    ],
    title: [
      "\u4E00\u7BEE\u521A\u597D\u7684\u9762\u5305",
      "Just enough bread"
    ],
    question: [
      "\u4F60\u4E3A\u4EC0\u4E48\u5728\u6570\u7A7A\u7BEE\u5B50\uFF1F",
      "Why are you counting empty baskets?"
    ],
    request: [
      "\u201C\u8DEF\u6613\u65AF\u8BF4\u5468\u4E94\u6709\u4E9B\u8857\u574A\u53EA\u60F3\u4E70\u534A\u6761\u3002\u6211\u8FD8\u6CA1\u95EE\u6E05\u695A\u3002\u80FD\u53BB\u8857\u89D2\u6742\u8D27\u94FA\u95EE\u4ED6\uFF1A\u5927\u5BB6\u8981\u7684\u662F\u66F4\u4FBF\u5B9C\uFF0C\u8FD8\u662F\u521A\u597D\u5403\u5F97\u5B8C\uFF1F\u201D",
      "\u201CLuis says some neighbors want half-loaves on Fridays. I haven\u2019t asked why. At Corner Grocer, could you ask whether it is about price or finishing the loaf?\u201D"
    ],
    partnerQuestion: [
      "Rowan\u60F3\u77E5\u9053\uFF0C\u534A\u6761\u9762\u5305\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898\uFF1F",
      "Rowan asks: what problem would half-loaves solve?"
    ],
    partnerReply: [
      "\u201C\u662F\u5403\u4E0D\u5B8C\uFF0C\u201D\u8DEF\u6613\u65AF\u8BF4\uFF0C\u201C\u72EC\u5C45\u7684\u4EBA\u4E0D\u60F3\u6D6A\u8D39\u3002\u6211\u613F\u610F\u5E2E\u5FD9\u95EE\u6570\u91CF\uFF0C\u4F46\u522B\u66FF\u4EBA\u4E0B\u8BA2\u5355\u3002\u201D\u4F60\u8BB0\u4E0B\u4E86\u8FD9\u4E2A\u533A\u522B\u3002",
      "\u201CFinishing them,\u201D Luis says. \u201CPeople living alone hate waste. I can ask about quantities, but let\u2019s not order for anyone.\u201D You keep that distinction."
    ],
    choices: [
      {
        id: "choice-a",
        label: [
          "\u5148\u8BD5\u505A\u5C11\u91CF\u534A\u6761\uFF0C\u4E0D\u9884\u552E",
          "Try a small batch of half-loaves"
        ],
        reply: [
          "\u201C\u597D\uFF0C\u5148\u5C11\u505A\uFF0C\u5356\u5B8C\u5C31\u544A\u8BC9\u5927\u5BB6\u660E\u5929\u518D\u6765\u3002\u201D\u4F60\u4EEC\u5B9A\u4E0B\u4E86\u5C0F\u6279\u91CF\u8BA1\u5212\uFF1B\u6CA1\u6709\u66FF\u4EFB\u4F55\u4EBA\u4E70\u9762\u5305\u3002",
          "\u201CGood. A small batch. If it sells out, tomorrow is another day.\u201D You agree on a plan without buying bread for anyone."
        ]
      },
      {
        id: "choice-b",
        label: [
          "\u5148\u7559\u4E0B\u81EA\u613F\u767B\u8BB0\u7684\u4FBF\u6761",
          "Start with an optional interest note"
        ],
        reply: [
          "\u201C\u8BA9\u60F3\u8981\u7684\u4EBA\u81EA\u5DF1\u7559\u540D\u5B57\uFF0C\u4E0D\u4FDD\u8BC1\u9500\u91CF\u3002\u201D\u7F57\u6E29\u628A\u7A7A\u7BEE\u5B50\u632A\u5230\u4E00\u8FB9\uFF0C\u51C6\u5907\u5148\u542C\u610F\u89C1\u3002",
          "\u201CPeople can leave their own names. No guaranteed sales.\u201D Rowan puts the basket aside and prepares to listen."
        ]
      }
    ],
    recall: [
      "\u201C\u6211\u8FD8\u8BB0\u5F97\u4F60\u63D0\u9192\u6211\uFF1A\u5269\u4E0B\u7684\u9762\u5305\uFF0C\u4E0D\u53EA\u662F\u6570\u5B57\u3002\u4ECA\u5929\u5148\u505A\u521A\u521A\u597D\u3002\u201D",
      "\u201CI remember your reminder: leftovers are not just numbers. Today I\u2019ll aim for enough.\u201D"
    ],
    activity: [
      "\u6574\u7406\u5F53\u5929\u7684\u9762\u5305\u6E05\u5355\u3002",
      "Arranging today\u2019s bread list."
    ],
    avatarArt: "rowan"
  },
  {
    id: "mira",
    name: [
      "\u7C73\u62C9",
      "Mira Vale"
    ],
    role: [
      "\u6863\u6848\u4FEE\u590D\u5E08",
      "Archive conservator"
    ],
    unknown: [
      "\u5C1A\u672A\u8BA4\u8BC6\u7684\u6765\u8BBF\u8005",
      "Someone you have not met"
    ],
    intro: [
      "\u201C\u7C73\u62C9\uFF0C\u4FEE\u590D\u7EB8\u5F20\u548C\u65E7\u7167\u7247\u3002\u6211\u80FD\u8865\u4E00\u6761\u88C2\u7F1D\uFF0C\u5374\u4E0D\u80FD\u66FF\u7167\u7247\u91CC\u7684\u4EBA\u51B3\u5B9A\u8981\u4E0D\u8981\u88AB\u8BB0\u4F4F\u3002\u201D",
      "\u201CMira. I conserve paper and old photographs. I can mend a tear. I can\u2019t decide whether the people in a picture want to be remembered.\u201D"
    ],
    art: "npc-mira",
    artPlan: "next-original__long-braid-dress",
    artStatus: "independent map/avatar/portrait family admitted with owner game QA; not library-admitted",
    partner: "nell",
    partnerName: [
      "\u5185\u5C14",
      "Nell"
    ],
    routes: [
      {
        scene: "market",
        at: {
          x: 780,
          y: 680
        }
      },
      {
        scene: "secondhand",
        at: {
          x: 370,
          y: 430
        }
      },
      {
        scene: "cafe",
        at: {
          x: 520,
          y: 470
        }
      }
    ],
    title: [
      "\u7167\u7247\u80CC\u540E\u7684\u7A7A\u767D",
      "The blank back of a photo"
    ],
    question: [
      "\u8FD9\u5F20\u7167\u7247\u4E3A\u4EC0\u4E48\u8FD8\u6CA1\u5199\u8BF4\u660E\uFF1F",
      "Why does this photo still have no caption?"
    ],
    request: [
      "\u201C\u65E7\u7269\u5E97\u7684\u5185\u5C14\u501F\u7ED9\u6211\u4E00\u5F20\u7801\u5934\u7167\u7247\uFF0C\u80CC\u9762\u6CA1\u4EBA\u540D\u3002\u53BBSecond Chances\u95EE\u95EE\uFF1A\u5B83\u80FD\u516C\u5F00\u5C55\u793A\u5417\uFF1F\u4FEE\u597D\u4E86\uFF0C\u4E5F\u4E0D\u4EE3\u8868\u53EF\u4EE5\u66FF\u4EBA\u516C\u5F00\u3002\u201D",
      "\u201CNell at Second Chances lent me a pier photograph with no names on the back. Could you ask whether it can be displayed? Repairing it doesn\u2019t grant permission.\u201D"
    ],
    partnerQuestion: [
      "Mira\u60F3\u786E\u8BA4\u65E7\u7167\u7247\u7684\u5C55\u793A\u8303\u56F4",
      "Mira wants to check permission for the photograph"
    ],
    partnerReply: [
      "\u201C\u6350\u8D60\u8005\u53EA\u540C\u610F\u4FEE\u590D\uFF0C\u6CA1\u540C\u610F\u516C\u5F00\u4EBA\u7269\u8EAB\u4EFD\u3002\u201D\u5185\u5C14\u8BF4\uFF0C\u201C\u53EF\u4EE5\u5C55\u793A\u4E0D\u5E26\u59D3\u540D\u7684\u7EB8\u5F20\u4FEE\u590D\u8FC7\u7A0B\uFF0C\u539F\u7167\u4E5F\u53EF\u4EE5\u7EE7\u7EED\u6536\u7740\u3002\u201D",
      "\u201CThe donor agreed to conservation, not public identification,\u201D Nell says. \u201CWe can show the repair process without names, or keep the original in the archive.\u201D"
    ],
    choices: [
      {
        id: "choice-a",
        label: [
          "\u5C55\u793A\u4FEE\u590D\u8FC7\u7A0B\uFF0C\u4E0D\u6807\u4EBA\u7269\u59D3\u540D",
          "Show the repair process without names"
        ],
        reply: [
          "\u4F60\u548C\u7C73\u62C9\u5199\u4E0B\u5C55\u793A\u8FB9\u754C\uFF1A\u8C08\u7EB8\u5F20\u548C\u4FEE\u590D\uFF0C\u4E0D\u731C\u4EBA\u7269\u8EAB\u4EFD\u3002\u539F\u7167\u7684\u516C\u5F00\u6743\u9650\u6CA1\u6709\u88AB\u6269\u5927\u3002",
          "You and Mira record the boundary: paper and conservation, no guesses about identities. Permission for the original has not expanded."
        ]
      },
      {
        id: "choice-b",
        label: [
          "\u4FDD\u7559\u539F\u7167\uFF0C\u53EA\u8BB0\u4E00\u4EFD\u4FEE\u590D\u7B14\u8BB0",
          "Keep the original private; record the repair"
        ],
        reply: [
          "\u7C73\u62C9\u628A\u4FEE\u590D\u7B14\u8BB0\u6536\u597D\uFF1A\u201C\u4E0D\u6446\u51FA\u6765\uFF0C\u4E5F\u4E0D\u7B49\u4E8E\u6CA1\u6709\u4EF7\u503C\u3002\u201D\u7167\u7247\u7EE7\u7EED\u7559\u5728\u539F\u6765\u7684\u6863\u6848\u91CC\u3002",
          "Mira files the repair notes. \u201CBeing unseen does not make it worthless.\u201D The photograph stays in its original archive."
        ]
      }
    ],
    recall: [
      "\u201C\u8C22\u8C22\u4F60\u5148\u95EE\u4E86\u8BB8\u53EF\u3002\u6162\u4E00\u70B9\uFF0C\u8BA9\u6545\u4E8B\u7684\u4E3B\u4EBA\u8FD8\u80FD\u505A\u9009\u62E9\u3002\u201D",
      "\u201CThank you for asking permission first. Going slowly leaves the owner a choice.\u201D"
    ],
    activity: [
      "\u7FFB\u770B\u5F85\u4FEE\u590D\u7167\u7247\u7684\u7EB8\u5F20\u7B14\u8BB0\u3002",
      "Reviewing paper-conservation notes."
    ],
    mapArt: "mira",
    avatarArt: "npc-mira"
  },
  {
    id: "jordan",
    name: [
      "\u4E54\u4E39",
      "Jordan Pike"
    ],
    role: [
      "\u6D77\u5CB8\u5DE1\u68C0\u5458",
      "Coast maintenance inspector"
    ],
    unknown: [
      "\u5C1A\u672A\u8BA4\u8BC6\u7684\u6765\u8BBF\u8005",
      "Someone you have not met"
    ],
    intro: [
      "\u201C\u4E54\u4E39\u3002\u6211\u5DE1\u67E5\u6D77\u8FB9\u7684\u680F\u6746\u548C\u8DEF\u724C\u3002\u53D1\u73B0\u95EE\u9898\u5148\u8BB0\u4E0B\u6765\uFF0C\u4E0D\u80FD\u56E0\u4E3A\u770B\u4E86\u4E00\u773C\u5C31\u8BF4\u5DF2\u7ECF\u4FEE\u597D\u4E86\u3002\u201D",
      "\u201CJordan. I inspect coastal rails and signs. I record problems first. Looking at something doesn\u2019t mean I\u2019ve fixed it.\u201D"
    ],
    art: "jordan",
    artPlan: "next-original__rain-poncho-boots",
    artStatus: "independent local portrait/avatar and map family admitted; not library-admitted or published",
    partner: "june",
    partnerName: [
      "\u743C",
      "June"
    ],
    routes: [
      {
        scene: "dock",
        at: {
          x: 640,
          y: 570
        }
      },
      {
        scene: "coast",
        at: {
          x: 740,
          y: 640
        }
      },
      {
        scene: "harbor",
        at: {
          x: 440,
          y: 740
        }
      }
    ],
    title: [
      "\u98CE\u91CC\u7684\u65B9\u5411\u724C",
      "A sign in the wind"
    ],
    question: [
      "\u8BB0\u5F55\u672C\u4E0A\u753B\u7684\u7BAD\u5934\u662F\u4EC0\u4E48\u610F\u601D\uFF1F",
      "What is the arrow in your notebook?"
    ],
    request: [
      "\u201C\u6D77\u98CE\u628A\u4E00\u5757\u65B9\u5411\u724C\u5439\u5F97\u96BE\u8BFB\u3002\u6211\u60F3\u95EE\u4FEE\u7406\u94FA\u7684\u743C\uFF0C\u662F\u5148\u6574\u7406\u6307\u8DEF\u4FE1\u606F\uFF0C\u8FD8\u662F\u5148\u68C0\u67E5\u56FA\u5B9A\u4EF6\u3002\u5E2E\u6211\u5E26\u53BB\u8FD9\u4E2A\u95EE\u9898\uFF1F\u4E0D\u7528\u78B0\u680F\u6746\u548C\u6865\u3002\u201D",
      "\u201CThe wind has made a direction sign hard to read. Could you ask June at the workshop whether to clarify the route first or inspect the fastenings first? No need to touch the rails or bridge.\u201D"
    ],
    partnerQuestion: [
      "Jordan\u60F3\u7ED9\u65B9\u5411\u724C\u6392\u7EF4\u4FEE\u987A\u5E8F",
      "Jordan asks how to prioritize the direction sign"
    ],
    partnerReply: [
      "\u201C\u4E24\u4EF6\u90FD\u8981\u5B89\u6392\uFF0C\u201D\u743C\u8BF4\uFF0C\u201C\u73B0\u5728\u5148\u8BB0\u4E0B\u8DEF\u53E3\u4F4D\u7F6E\u3002\u6307\u8DEF\u8BF4\u660E\u80FD\u5148\u5199\uFF0C\u56FA\u5B9A\u4EF6\u8981\u7559\u7ED9\u5DE5\u4F5C\u65F6\u68C0\u67E5\uFF0C\u522B\u8BA9\u6E38\u5BA2\u81EA\u5DF1\u722C\u4E0A\u53BB\u3002\u201D",
      "\u201CBoth need arranging,\u201D June says. \u201CRecord the junction first. We can draft directions now; fastenings need a work inspection. No visitors climbing up.\u201D"
    ],
    choices: [
      {
        id: "choice-a",
        label: [
          "\u5148\u8D77\u8349\u6E05\u695A\u7684\u4E34\u65F6\u6307\u8DEF\u8BF4\u660E",
          "Draft clear temporary directions first"
        ],
        reply: [
          "\u4E54\u4E39\u8BB0\u4E0B\u4E34\u65F6\u8BF4\u660E\u8349\u7A3F\uFF0C\u8FD8\u7ED9\u56FA\u5B9A\u4EF6\u7559\u4E86\u4E00\u680F\u3002\u4F60\u4EEC\u53EA\u662F\u5B89\u6392\u4E86\u68C0\u67E5\uFF0C\u6CA1\u6709\u5BA3\u5E03\u6865\u6216\u680F\u6746\u5DF2\u7ECF\u5B89\u5168\u3002",
          "Jordan records the draft directions and leaves space for the fastenings. You have planned checks, not declared bridges or rails safe."
        ]
      },
      {
        id: "choice-b",
        label: [
          "\u5148\u628A\u56FA\u5B9A\u4EF6\u68C0\u67E5\u5217\u8FDB\u5DE5\u4F5C\u5355",
          "Put the fastening check on the work list first"
        ],
        reply: [
          "\u4E54\u4E39\u628A\u56FA\u5B9A\u4EF6\u68C0\u67E5\u6392\u5728\u524D\u9762\uFF1A\u201C\u6CA1\u67E5\u8FC7\uFF0C\u5C31\u522B\u6253\u52FE\u3002\u201D\u65B9\u5411\u8BF4\u660E\u4E5F\u7559\u5728\u540C\u4E00\u5F20\u5DE5\u4F5C\u5355\u4E0A\u3002",
          "Jordan puts the fastening check first. \u201CNo tick before we\u2019ve checked.\u201D The directions remain on the same work list."
        ]
      }
    ],
    recall: [
      "\u201C\u6709\u4E00\u5F20\u4E0D\u5938\u5927\u7684\u8BB0\u5F55\uFF0C\u6BD4\u6EE1\u9875\u5B8C\u6210\u6807\u8BB0\u6709\u7528\u3002\u201D\u4E54\u4E39\u53C8\u628A\u94C5\u7B14\u524A\u5C16\u3002",
      "\u201CAn honest record is more useful than a page of ticks.\u201D Jordan sharpens the pencil."
    ],
    activity: [
      "\u6838\u5BF9\u6D77\u5CB8\u8DEF\u724C\u7684\u5DE5\u4F5C\u8BB0\u5F55\u3002",
      "Checking the coastal sign work list."
    ],
    mapArt: "jordan",
    avatarArt: "jordan"
  },
  {
    id: "leila",
    name: [
      "\u83B1\u62C9",
      "Leila Hart"
    ],
    role: [
      "\u4F11\u5047\u533B\u751F",
      "Doctor on holiday"
    ],
    unknown: [
      "\u5C1A\u672A\u8BA4\u8BC6\u7684\u6765\u8BBF\u8005",
      "Someone you have not met"
    ],
    intro: [
      "\u201C\u83B1\u62C9\u3002\u6211\u662F\u533B\u751F\uFF0C\u4E0D\u8FC7\u8FD9\u661F\u671F\u5728\u4F11\u5047\u3002\u4ECA\u5929\u6700\u5927\u7684\u8BA1\u5212\u662F\u628A\u8336\u559D\u5B8C\uFF0C\u4E0D\u5728\u51C9\u6389\u4EE5\u540E\u624D\u60F3\u8D77\u6765\u3002\u201D",
      "\u201CLeila. I\u2019m a doctor, but this week I\u2019m on holiday. Today\u2019s big plan is to finish my tea before I remember it has gone cold.\u201D"
    ],
    art: "leila",
    artPlan: "next-original__high-bun-tracksuit",
    artStatus: "independent local portrait/avatar and map family admitted; not library-admitted or published",
    partner: "idris",
    partnerName: [
      "\u4F0A\u5FB7\u91CC\u65AF",
      "Idris"
    ],
    routes: [
      {
        scene: "garden",
        at: {
          x: 650,
          y: 620
        }
      },
      {
        scene: "coast",
        at: {
          x: 780,
          y: 500
        }
      },
      {
        scene: "harbor",
        at: {
          x: 600,
          y: 740
        }
      }
    ],
    title: [
      "\u6CA1\u6709\u5F85\u529E\u7684\u4E00\u5C0F\u65F6",
      "An hour without a to-do list"
    ],
    question: [
      "\u4F11\u5047\u4E5F\u5F88\u96BE\u505C\u4E0B\u6765\u5417\uFF1F",
      "Is slowing down difficult even on holiday?"
    ],
    request: [
      "\u201C\u6211\u603B\u628A\u6563\u6B65\u4E5F\u5199\u6210\u4EFB\u52A1\u3002\u4F0A\u5FB7\u91CC\u65AF\u8BF4\u62F3\u9986\u5916\u6709\u9002\u5408\u5750\u4E00\u4F1A\u513F\u7684\u5730\u65B9\u3002\u80FD\u53BBHarbor Boxing Club\u95EE\u95EE\u4ED6\uFF0C\u6709\u6CA1\u6709\u5B8C\u5168\u4E0D\u7528\u5B8C\u6210\u4EC0\u4E48\u7684\u4F11\u606F\u65B9\u5F0F\uFF1F\u201D",
      "\u201CI turn even a walk into a task. Idris mentioned places to sit near the gym. Could you ask at Harbor Boxing Club about a break with nothing to complete?\u201D"
    ],
    partnerQuestion: [
      "Leila\u60F3\u627E\u4E0D\u8BA1\u6210\u7EE9\u7684\u4F11\u606F\u65B9\u5F0F",
      "Leila is looking for a break with no score"
    ],
    partnerReply: [
      "\u201C\u5750\u7740\u542C\u8239\uFF0C\u6216\u8005\u8D70\u4E00\u5C0F\u6BB5\u5C31\u56DE\u6765\u3002\u201D\u4F0A\u5FB7\u91CC\u65AF\u8BF4\uFF0C\u201C\u8FD9\u4E0D\u662F\u8BAD\u7EC3\uFF0C\u66F4\u4E0D\u662F\u6CBB\u7597\u3002\u60F3\u505C\u5C31\u505C\uFF0C\u4E0D\u7528\u5411\u6211\u4EA4\u6210\u7EE9\u3002\u201D",
      "\u201CSit and listen to boats, or take a short walk and return,\u201D Idris says. \u201CNot training, not treatment. Stop whenever you like. No score to bring me.\u201D"
    ],
    choices: [
      {
        id: "choice-a",
        label: [
          "\u7EA6\u4E00\u5C0F\u6BB5\u968F\u65F6\u53EF\u4EE5\u7ED3\u675F\u7684\u6563\u6B65",
          "Suggest a short walk with no finish line"
        ],
        reply: [
          "\u201C\u53EF\u4EE5\u968F\u65F6\u7ED3\u675F\uFF0C\u8FD9\u53E5\u6211\u559C\u6B22\u3002\u201D\u83B1\u62C9\u628A\u6E05\u5355\u6298\u8D77\u6765\u3002\u4F60\u4EEC\u7EA6\u7684\u662F\u666E\u901A\u6563\u6B65\uFF0C\u6CA1\u6709\u533B\u7597\u5EFA\u8BAE\uFF0C\u4E5F\u4E0D\u66FF\u522B\u4EBA\u5B89\u6392\u8BAD\u7EC3\u3002",
          "\u201CNo finish line. I like that.\u201D Leila folds the list. It is an ordinary walk, not medical advice or a training prescription."
        ]
      },
      {
        id: "choice-b",
        label: [
          "\u7EA6\u5750\u4E00\u4F1A\u513F\uFF0C\u4E0D\u5B89\u6392\u4EFB\u4F55\u9879\u76EE",
          "Suggest sitting with nothing scheduled"
        ],
        reply: [
          "\u83B1\u62C9\u7B11\u4E86\uFF1A\u201C\u90A3\u6211\u4ECA\u5929\u4E0D\u5FC5\u628A\u4F11\u606F\u505A\u5F97\u5F88\u4F18\u79C0\u3002\u201D\u4F60\u4EEC\u4FDD\u7559\u4E00\u6BB5\u6CA1\u6709\u5B89\u6392\u7684\u65F6\u95F4\u3002",
          "Leila smiles. \u201CThen I don\u2019t have to be excellent at resting today.\u201D You leave a little time unplanned."
        ]
      }
    ],
    recall: [
      "\u201C\u90A3\u676F\u8336\u7EC8\u4E8E\u559D\u5B8C\u4E86\u3002\u8C22\u8C22\u4F60\u6CA1\u6709\u518D\u7ED9\u6211\u52A0\u4E00\u5F20\u6E05\u5355\u3002\u201D",
      "\u201CI finished the tea. Thank you for not giving me another list.\u201D"
    ],
    activity: [
      "\u6536\u597D\u624B\u673A\uFF0C\u7ED9\u4F11\u5047\u7559\u4E00\u70B9\u7A7A\u767D\u3002",
      "Putting the phone away for a quiet holiday."
    ],
    mapArt: "leila",
    avatarArt: "leila"
  },
  {
    id: "casey",
    name: [
      "\u51EF\u897F",
      "Casey Morgan"
    ],
    role: [
      "\u8F6F\u4EF6\u5DE5\u7A0B\u5E08",
      "Software engineer"
    ],
    unknown: [
      "\u5C1A\u672A\u8BA4\u8BC6\u7684\u6765\u8BBF\u8005",
      "Someone you have not met"
    ],
    intro: [
      "\u201C\u51EF\u897F\uFF0C\u5199\u8F6F\u4EF6\u7684\u3002\u7535\u8111\u7559\u5728\u4F4F\u5904\u4E86\u3002\u6211\u60F3\u770B\u770B\u4E0D\u7528\u52A0\u4E00\u4E2A\u5E94\u7528\u7A0B\u5E8F\uFF0C\u4E8B\u60C5\u80FD\u4E0D\u80FD\u4E5F\u53D8\u7B80\u5355\u3002\u201D",
      "\u201CCasey. I build software. My laptop is back at the room. I want to see whether things can get simpler without adding another app.\u201D"
    ],
    art: "casey",
    artPlan: "next-original__bob-pleated-skirt",
    artStatus: "independent local portrait/avatar and map family admitted; not library-admitted or published",
    partner: "dani",
    partnerName: [
      "\u4E39\u59AE",
      "Dani"
    ],
    routes: [
      {
        scene: "cafe",
        at: {
          x: 640,
          y: 515
        }
      },
      {
        scene: "harbor",
        at: {
          x: 790,
          y: 720
        }
      },
      {
        scene: "market",
        at: {
          x: 760,
          y: 710
        }
      }
    ],
    title: [
      "\u4E00\u5F20\u4E0D\u9700\u8981\u4E0B\u8F7D\u7684\u8868",
      "A form without a download"
    ],
    question: [
      "\u8FD9\u5F20\u7A7A\u8868\u683C\u662F\u505A\u4EC0\u4E48\u7684\uFF1F",
      "What is this empty form for?"
    ],
    request: [
      "\u201C\u4E39\u59AE\u60F3\u7ED9\u5C0F\u96C6\u5E02\u7559\u4E00\u5F20\u81EA\u613F\u5E2E\u5FD9\u7684\u767B\u8BB0\u7EB8\u3002\u80FD\u5148\u95EE\u5979\u771F\u6B63\u9700\u8981\u77E5\u9053\u4EC0\u4E48\u5417\uFF1F\u522B\u4E00\u4E0A\u6765\u5C31\u6536\u7535\u8BDD\u548C\u4F4F\u5740\u3002\u201D",
      "\u201CDani wants a voluntary helper sheet for the little market. Could you first ask what she actually needs to know? Let\u2019s not start by collecting phone numbers and addresses.\u201D"
    ],
    partnerQuestion: [
      "Casey\u95EE\u5FD7\u613F\u767B\u8BB0\u771F\u6B63\u9700\u8981\u54EA\u4E9B\u4FE1\u606F",
      "Casey asks what a helper sheet actually needs"
    ],
    partnerReply: [
      "\u201C\u6211\u53EA\u9700\u8981\u77E5\u9053\u54EA\u4E2A\u65F6\u6BB5\u53EF\u80FD\u6709\u4EBA\u6765\u3002\u201D\u4E39\u59AE\u8BF4\uFF0C\u201C\u53EF\u4EE5\u7528\u6635\u79F0\uFF0C\u4E5F\u53EF\u4EE5\u53EA\u9009\u65F6\u6BB5\uFF1B\u4E0D\u60F3\u7559\u4E0B\u4FE1\u606F\u5C31\u5F53\u9762\u544A\u8BC9\u6211\u3002\u201D",
      "\u201COnly which times might have help,\u201D Dani says. \u201CA nickname is fine, or just a time. Anyone who prefers no record can tell me in person.\u201D"
    ],
    choices: [
      {
        id: "choice-a",
        label: [
          "\u53EA\u5217\u65F6\u6BB5\uFF0C\u613F\u610F\u7684\u4EBA\u81EA\u884C\u6253\u52FE",
          "List time slots with optional ticks"
        ],
        reply: [
          "\u51EF\u897F\u5212\u6389\u4E86\u591A\u4F59\u7684\u680F\uFF1A\u201C\u5C11\u4E00\u4E2A\u5FC5\u987B\u586B\u7684\u683C\uFF0C\u5C31\u5C11\u4E00\u6B21\u4E3A\u96BE\u3002\u201D\u8FD9\u662F\u7EB8\u4E0A\u65B9\u6848\uFF0C\u8FD8\u6CA1\u6709\u6536\u96C6\u4EFB\u4F55\u4EBA\u7684\u8D44\u6599\u3002",
          "Casey crosses out the extra fields. \u201COne less required box, one less awkward moment.\u201D It is a paper plan; nobody\u2019s information has been collected."
        ]
      },
      {
        id: "choice-b",
        label: [
          "\u6635\u79F0\u52A0\u65F6\u6BB5\uFF0C\u4FDD\u7559\u5F53\u9762\u62A5\u540D",
          "Offer nickname and time, plus in-person sign-up"
        ],
        reply: [
          "\u4F60\u4EEC\u4FDD\u7559\u6635\u79F0\u548C\u65F6\u6BB5\u4E24\u680F\uFF0C\u4E5F\u5199\u4E0A\u53EF\u4EE5\u5F53\u9762\u8BF4\u3002\u51EF\u897F\u6CA1\u6709\u628A\u8868\u81EA\u52A8\u4E0A\u4F20\uFF0C\u66F4\u6CA1\u6709\u66FF\u8857\u574A\u586B\u5199\u3002",
          "You keep nickname and time fields, with an in-person option. Casey neither uploads the sheet nor fills it in for neighbors."
        ]
      }
    ],
    recall: [
      "\u201C\u8FD9\u56DE\u6CA1\u6709\u65B0\u5E94\u7528\u7A0B\u5E8F\uFF0C\u95EE\u9898\u53CD\u800C\u6E05\u695A\u4E86\u3002\u201D\u51EF\u897F\u628A\u7EB8\u5939\u597D\u3002",
      "\u201CNo new app this time. The problem is clearer already.\u201D Casey clips the paper together."
    ],
    activity: [
      "\u5728\u7EB8\u4E0A\u5220\u6389\u767B\u8BB0\u8868\u591A\u4F59\u7684\u683C\u5B50\u3002",
      "Crossing extra fields off a paper form."
    ],
    mapArt: "casey",
    avatarArt: "casey"
  },
  {
    id: "grant",
    name: [
      "\u683C\u5170\u7279",
      "Grant Cole"
    ],
    role: [
      "\u9000\u4F11\u91D1\u878D\u4ECE\u4E1A\u8005",
      "Retired finance professional"
    ],
    unknown: [
      "\u5C1A\u672A\u8BA4\u8BC6\u7684\u6765\u8BBF\u8005",
      "Someone you have not met"
    ],
    intro: [
      "\u201C\u683C\u5170\u7279\u3002\u4EE5\u524D\u5728\u91D1\u878D\u884C\u4E1A\uFF0C\u6BCF\u4EF6\u4E8B\u90FD\u559C\u6B22\u7B97\u503C\u4E0D\u503C\u5F97\u3002\u9000\u4F11\u540E\u53D1\u73B0\uFF0C\u90BB\u5C45\u8BF7\u5403\u5348\u996D\u4E0D\u7528\u5148\u505A\u4E00\u5F20\u62A5\u8868\u3002\u201D",
      "\u201CGrant. I used to work in finance and calculate whether everything was worthwhile. Retirement is teaching me that lunch with a neighbor needs no spreadsheet.\u201D"
    ],
    art: "grant",
    artPlan: "next-original__senior-bald-waistcoat",
    artStatus: "independent local portrait/avatar and map family admitted; not library-admitted or published",
    partner: "elena",
    partnerName: [
      "\u57C3\u7433\u5A1C",
      "Elena"
    ],
    routes: [
      {
        scene: "dock",
        at: {
          x: 610,
          y: 360
        }
      },
      {
        scene: "market",
        at: {
          x: 450,
          y: 730
        }
      },
      {
        scene: "courtyard",
        at: {
          x: 675,
          y: 600
        }
      }
    ],
    title: [
      "\u4E0D\u7528\u7B97\u56DE\u62A5\u7684\u5348\u9910",
      "Lunch without a return calculation"
    ],
    question: [
      "\u4F60\u5728\u66FF\u5348\u9910\u7B97\u4EC0\u4E48\uFF1F",
      "What are you calculating for lunch?"
    ],
    request: [
      "\u201C\u6211\u60F3\u548C\u57C3\u7433\u5A1C\u804A\u4E00\u987F\u90BB\u91CC\u5348\u9910\uFF0C\u9884\u7B97\u53EA\u6709$12\uFF0C\u4F46\u8FD8\u6CA1\u95EE\u5979\u613F\u4E0D\u613F\u610F\u3002\u80FD\u5148\u95EE\u95EE\u5979\u60F3\u8981\u4EC0\u4E48\uFF1F\u8FD9\u4E0D\u662F\u6295\u8D44\uFF0C\u4E5F\u4E0D\u6536\u4EFB\u4F55\u4EBA\u7684\u94B1\u3002\u201D",
      "\u201CI\u2019m considering a neighborhood lunch with Elena and a $12 limit, but haven\u2019t asked if she wants one. Could you ask what she would enjoy first? No investment, no money collected.\u201D"
    ],
    partnerQuestion: [
      "Grant\u60F3\u5148\u95EE\u4F60\u5BF9\u90BB\u91CC\u5348\u9910\u7684\u60F3\u6CD5",
      "Grant wants to hear your thoughts about a neighborly lunch"
    ],
    partnerReply: [
      "\u201C\u7B80\u5355\u4E00\u4E9B\uFF0C\u4E0D\u8981\u8BA9\u6211\u5988\u5988\u5348\u7761\u65F6\u592A\u5435\u3002\u201D\u57C3\u7433\u5A1C\u8BF4\uFF0C\u201C\u5927\u5BB6\u613F\u610F\u7684\u8BDD\uFF0C\u5404\u81EA\u5E26\u4E00\u70B9\uFF1B\u4E0D\u5E26\u4E1C\u897F\u4E5F\u6B22\u8FCE\u3002\u522B\u4FDD\u8BC1\u6BCF\u4E2A\u4EBA\u90FD\u80FD\u6765\u3002\u201D",
      "\u201CSimple, and quiet while my mother naps,\u201D Elena says. \u201CPeople can bring a little if they wish. Empty hands are welcome too. No promises that everyone can come.\u201D"
    ],
    choices: [
      {
        id: "choice-a",
        label: [
          "\u5EFA\u8BAE\u82B1$9\uFF0C\u7559\u4E0B$3\u5E94\u5BF9\u4E34\u65F6\u9700\u8981",
          "Suggest $9 of supplies and a $3 reserve"
        ],
        reply: [
          "\u683C\u5170\u7279\u5728\u7EB8\u4E0A\u7559\u4E86$3\uFF1A\u201C\u6570\u5B57\u662F\u4E0A\u9650\uFF0C\u4E0D\u662F\u50AC\u4EBA\u82B1\u5B8C\u7684\u76EE\u6807\u3002\u201D\u5348\u9910\u4ECD\u5F85\u5927\u5BB6\u540C\u610F\uFF0C\u4F60\u7684\u94B1\u5305\u4E0D\u53D8\u3002",
          "Grant leaves $3 on paper. \u201CA limit is not a target to spend.\u201D Lunch still needs everyone\u2019s agreement. Your wallet is unchanged."
        ]
      },
      {
        id: "choice-b",
        label: [
          "\u5148\u5F81\u6C42\u662F\u5426\u613F\u610F\u53C2\u52A0\uFF0C\u518D\u51B3\u5B9A\u5F00\u9500",
          "Ask who wants to join before planning costs"
        ],
        reply: [
          "\u683C\u5170\u7279\u6536\u8D77\u8BA1\u7B97\u7EB8\uFF1A\u201C\u5148\u542C\u4EBA\u8BF4\u8BDD\u3002\u201D\u4F60\u4EEC\u628A\u9080\u8BF7\u548C\u82B1\u94B1\u5206\u6210\u4E24\u4EF6\u4E8B\uFF0C\u6CA1\u6709\u66FF\u90BB\u5C45\u4F5C\u627F\u8BFA\u3002",
          "Grant puts away the calculation. \u201CPeople first.\u201D You separate inviting from spending, without making promises for anyone."
        ]
      }
    ],
    recall: [
      "\u201C\u4ECA\u5929\u6709\u4E00\u4EF6\u4E8B\u4E0D\u7528\u7B97\u56DE\u62A5\uFF1A\u6709\u4EBA\u613F\u610F\u5750\u4E0B\u6765\u542C\u6211\u8BF4\u8BDD\u3002\u201D",
      "\u201COne thing needs no return calculation today: someone was willing to sit and listen.\u201D"
    ],
    activity: [
      "\u628A\u5348\u9910\u9884\u7B97\u6298\u8D77\u6765\uFF0C\u5148\u542C\u8857\u574A\u8BF4\u8BDD\u3002",
      "Folding the lunch budget and listening to neighbors."
    ],
    mapArt: "grant",
    avatarArt: "grant"
  }
];

// src/world/next-residents.ts
var nextResidents = next_residents_default;
var nextPeople = Object.fromEntries(nextResidents.map((p) => [p.id, { name: p.name, unknown: p.unknown, intro: p.intro, art: p.art, ...p.mapArt ? { mapArt: p.mapArt } : {}, ...p.avatarArt ? { avatarArt: p.avatarArt } : {} }]));
var nextRoutes = Object.fromEntries(nextResidents.map((p) => [p.id, p.routes]));
var nextRoles = Object.fromEntries(nextResidents.map((p) => [p.id, p.role]));

// src/animals/art.json
var art_default = {
  "domestic-cat-v1": {
    species: "cat",
    visualVersion: "domestic-cat-v1",
    image: "./animals/cat-atlas.png",
    atlas: {
      w: 800,
      h: 576
    },
    frames: {
      stand: {
        down: {
          x: 0,
          y: 0,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "cd812553009f6cd5afc8d5ea74f91c4fecda9c61a9a6c7aeb6b20533269fc620",
          requestId: "452c298d-e19f-4411-9423-ed2429795bbe",
          taskId: "mt_57d89861efd5a4732ce99c9fbf73534f",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791263862944-clywstuakbt.webp",
          sourcePath: "tasks/cat-down-stand-v2/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            500,
            826
          ],
          sourceToAtlasScale: 0.08763693270735524,
          sourceBounds: [
            298,
            191,
            806,
            830
          ],
          visiblePixels: [
            45,
            56
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-down-stand-v2.json"
        },
        left: {
          x: 0,
          y: 144,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "5ef339664d2b073b22c6cd848831b583582304d7568e273ec18bc9c8e2675f7c",
          requestId: "2695fc10-c20e-40f5-acc4-8af3278ea683",
          taskId: "mt_6d6a5b87107f6da684920fe2a67df3fd",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264366245-0vzkd0y2wto.webp",
          sourcePath: "tasks/cat-left-stand-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            520,
            782
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            137,
            235,
            893,
            788
          ],
          visiblePixels: [
            66,
            48
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-stand-v1.json"
        },
        right: {
          x: 0,
          y: 288,
          w: 160,
          h: 144,
          anchor: [
            0.49375,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "5ef339664d2b073b22c6cd848831b583582304d7568e273ec18bc9c8e2675f7c",
          requestId: "2695fc10-c20e-40f5-acc4-8af3278ea683",
          taskId: "mt_6d6a5b87107f6da684920fe2a67df3fd",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264366245-0vzkd0y2wto.webp",
          sourcePath: "tasks/cat-left-stand-v1/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            520,
            782
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            137,
            235,
            893,
            788
          ],
          visiblePixels: [
            66,
            48
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-stand-v1.json"
        },
        up: {
          x: 0,
          y: 432,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "84b3af0657d04a26610d0cf2108546b896b74036be8fbf64852f796cc65414b4",
          requestId: "42292b31-56a9-4ccc-9477-cf43c9be3a37",
          taskId: "mt_d083458e3288a9552d0b02e3632e5429",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264441851-3tlt2eouwqj.webp",
          sourcePath: "tasks/cat-up-stand-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            510,
            850
          ],
          sourceToAtlasScale: 0.0785,
          sourceBounds: [
            357,
            135,
            787,
            855
          ],
          visiblePixels: [
            34,
            57
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-up-stand-v1.json"
        }
      },
      walkA: {
        down: {
          x: 160,
          y: 0,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "af0ca0864b883c5e4dc3f4b65c11131a09b49eab80cda21be036b040f3e5dc01",
          requestId: "952645ce-9309-4f2f-b7ed-bd710cf49818",
          taskId: "mt_c370e44400e8065d492a85ab24ddf289",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791267441542-sfxubhkvut.webp",
          sourcePath: "tasks/cat-down-walkA-v2/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            500,
            851
          ],
          sourceToAtlasScale: 0.08763693270735524,
          sourceBounds: [
            298,
            191,
            805,
            856
          ],
          visiblePixels: [
            44,
            58
          ],
          calibrationReason: "supplement complete source manually inspected; ground support back edge, uniform same-direction standing scale; no anatomy edit",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-down-walkA-v2.json"
        },
        left: {
          x: 160,
          y: 144,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "2684cdb098e541049124350073d63b64b9e6da3104e91bcdc58f6a1b6389226a",
          requestId: "410f0408-5fea-49b7-92e8-455cd9906e34",
          taskId: "mt_f940c19dfeaafa28f5c3e82f8a7dcce8",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791267650744-t15l7rbcmf.webp",
          sourcePath: "tasks/cat-left-walkA-v3/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            500,
            754
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            137,
            235,
            893,
            760
          ],
          visiblePixels: [
            66,
            46
          ],
          calibrationReason: "supplement complete source manually inspected; ground support back edge, uniform same-direction standing scale; no anatomy edit",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-walkA-v3.json"
        },
        right: {
          x: 160,
          y: 288,
          w: 160,
          h: 144,
          anchor: [
            0.49375,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "2684cdb098e541049124350073d63b64b9e6da3104e91bcdc58f6a1b6389226a",
          requestId: "410f0408-5fea-49b7-92e8-455cd9906e34",
          taskId: "mt_f940c19dfeaafa28f5c3e82f8a7dcce8",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791267650744-t15l7rbcmf.webp",
          sourcePath: "tasks/cat-left-walkA-v3/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            500,
            754
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            137,
            235,
            893,
            760
          ],
          visiblePixels: [
            66,
            46
          ],
          calibrationReason: "supplement complete source manually inspected; ground support back edge, uniform same-direction standing scale; no anatomy edit",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-walkA-v3.json"
        },
        up: {
          x: 160,
          y: 432,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "2fc73163820ce26c10a633d5b4232a0a47858a918f2dcee1d1a86e5b2bc90c65",
          requestId: "ad885ff4-93c4-42d4-b8ad-623f84600b0a",
          taskId: "mt_01348eb63caa9457b35db541e062b7da",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265439505-tm1rel3ras.webp",
          sourcePath: "tasks/cat-up-walkA-v2/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            510,
            844
          ],
          sourceToAtlasScale: 0.0785,
          sourceBounds: [
            357,
            135,
            787,
            848
          ],
          visiblePixels: [
            34,
            56
          ],
          calibrationReason: "four paw support back edge and same upstand head scale",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-up-walkA-v2.json"
        }
      },
      walkB: {
        down: {
          x: 320,
          y: 0,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "09a4db51064ea1a1291a820edcbe71e404b2db6c7fc176d6978d7ace2ce7dfc9",
          requestId: "b1bf47c8-1796-4da3-a226-8d0984c01efe",
          taskId: "mt_1363db7b7b29079c38d9b8a3c41d1c6f",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791267523339-s2on56wrjm.webp",
          sourcePath: "tasks/cat-down-walkB-v2/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            500,
            850
          ],
          sourceToAtlasScale: 0.08763693270735524,
          sourceBounds: [
            298,
            191,
            805,
            855
          ],
          visiblePixels: [
            44,
            58
          ],
          calibrationReason: "supplement complete source manually inspected; ground support back edge, uniform same-direction standing scale; no anatomy edit",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-down-walkB-v2.json"
        },
        left: {
          x: 320,
          y: 144,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "50a3428667fc3cc00da593c060b2f9c5657d25559e80f4d908e4ec9c622e5c63",
          requestId: "d2ecd3a9-c6fd-4a17-bcb7-4a31ad8261e9",
          taskId: "mt_6ee0c19ad27d08cc4ab36189d44d0c23",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791267831207-j62wtez6em.webp",
          sourcePath: "tasks/cat-left-walkB-v4/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            500,
            782
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            137,
            235,
            893,
            788
          ],
          visiblePixels: [
            66,
            48
          ],
          calibrationReason: "supplement complete source manually inspected; ground support back edge, uniform same-direction standing scale; no anatomy edit",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-walkB-v4.json"
        },
        right: {
          x: 320,
          y: 288,
          w: 160,
          h: 144,
          anchor: [
            0.49375,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "50a3428667fc3cc00da593c060b2f9c5657d25559e80f4d908e4ec9c622e5c63",
          requestId: "d2ecd3a9-c6fd-4a17-bcb7-4a31ad8261e9",
          taskId: "mt_6ee0c19ad27d08cc4ab36189d44d0c23",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791267831207-j62wtez6em.webp",
          sourcePath: "tasks/cat-left-walkB-v4/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            500,
            782
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            137,
            235,
            893,
            788
          ],
          visiblePixels: [
            66,
            48
          ],
          calibrationReason: "supplement complete source manually inspected; ground support back edge, uniform same-direction standing scale; no anatomy edit",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-walkB-v4.json"
        },
        up: {
          x: 320,
          y: 432,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "ce056b6acadaec798fd368bacac5e46879db3c18ea4166f2ebe1d202e0869980",
          requestId: "82a66c31-380f-40f1-81a7-61e6cad8d4da",
          taskId: "mt_1eb154846995f5a004d9623c24d6bd8e",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791267989127-xe35ei61vrf.webp",
          sourcePath: "tasks/cat-up-walkB-v2/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            510,
            866
          ],
          sourceToAtlasScale: 0.0785,
          sourceBounds: [
            357,
            135,
            787,
            870
          ],
          visiblePixels: [
            34,
            58
          ],
          calibrationReason: "supplement complete source manually inspected; ground support back edge, uniform same-direction standing scale; no anatomy edit",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-up-walkB-v2.json"
        }
      },
      "sun-rest": {
        down: {
          x: 480,
          y: 0,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "b7fc208ecc5a98d392db301343190c73a3dac0842e213fef7976f3cafd22dd74",
          requestId: "76e2b43b-32b1-4087-9254-025cceba945d",
          taskId: "mt_16c1603329d449984f8c5da2437a58f6",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264944148-li1z88rhjxm.webp",
          sourcePath: "tasks/cat-down-sun-rest-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            500,
            805
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            314,
            280,
            790,
            809
          ],
          visiblePixels: [
            42,
            46
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-down-sun-rest-v1.json"
        },
        left: {
          x: 480,
          y: 144,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "0bac40c5d35e8626ceb05b2c3571ff66d208654e5e2ed587696cde40f954d72e",
          requestId: "66c449a0-bb3c-46cd-bcf7-92defecc79cf",
          taskId: "mt_9d40565e4a3f38aef99329024e9ff252",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265009477-p8rwcjdc1b.webp",
          sourcePath: "tasks/cat-left-sun-rest-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            500,
            689
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            130,
            277,
            913,
            692
          ],
          visiblePixels: [
            69,
            36
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-sun-rest-v1.json"
        },
        right: {
          x: 480,
          y: 288,
          w: 160,
          h: 144,
          anchor: [
            0.49375,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "0bac40c5d35e8626ceb05b2c3571ff66d208654e5e2ed587696cde40f954d72e",
          requestId: "66c449a0-bb3c-46cd-bcf7-92defecc79cf",
          taskId: "mt_9d40565e4a3f38aef99329024e9ff252",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265009477-p8rwcjdc1b.webp",
          sourcePath: "tasks/cat-left-sun-rest-v1/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            500,
            689
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            130,
            277,
            913,
            692
          ],
          visiblePixels: [
            69,
            36
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-sun-rest-v1.json"
        },
        up: {
          x: 480,
          y: 432,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "ccb6be95757e5ec2f706b394abda6befafd18d544886274a7cce304b57a1be81",
          requestId: "a4cf1f47-151f-4048-b536-c8737a418283",
          taskId: "mt_1da7d2d2f907a9d2510abd7a6474d002",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265074406-yj45uk757r.webp",
          sourcePath: "tasks/cat-up-sun-rest-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            510,
            757
          ],
          sourceToAtlasScale: 0.0785,
          sourceBounds: [
            341,
            147,
            787,
            852
          ],
          visiblePixels: [
            35,
            55
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-up-sun-rest-v1.json"
        }
      },
      sleep: {
        down: {
          x: 640,
          y: 0,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "6829b5c8a0a17dca6c7ee9a9dbfb72f078b325ebbefedc90583fc20d0ec146b5",
          requestId: "2b69efb2-e15c-4980-9327-724e8825f485",
          taskId: "mt_9e44fd39d1d50a7cb7edd2bbd426f286",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264975440-xik070vd2ij.webp",
          sourcePath: "tasks/cat-down-sleep-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            500,
            749
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            272,
            314,
            789,
            756
          ],
          visiblePixels: [
            45,
            39
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-down-sleep-v1.json"
        },
        left: {
          x: 640,
          y: 144,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "c72b00178f6dbdfcb2b41abf83a806eb69ca6c5b0a857617f632fa2d87c86bfa",
          requestId: "16c16f19-58f2-4644-88d4-9cc0d9f6b6af",
          taskId: "mt_6fd92a59fdb86b15943b8aa2d43e8807",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265041324-7t9dt5e35nh.webp",
          sourcePath: "tasks/cat-left-sleep-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            500,
            706
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            149,
            337,
            866,
            711
          ],
          visiblePixels: [
            63,
            33
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-sleep-v1.json"
        },
        right: {
          x: 640,
          y: 288,
          w: 160,
          h: 144,
          anchor: [
            0.49375,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "c72b00178f6dbdfcb2b41abf83a806eb69ca6c5b0a857617f632fa2d87c86bfa",
          requestId: "16c16f19-58f2-4644-88d4-9cc0d9f6b6af",
          taskId: "mt_6fd92a59fdb86b15943b8aa2d43e8807",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265041324-7t9dt5e35nh.webp",
          sourcePath: "tasks/cat-left-sleep-v1/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            500,
            706
          ],
          sourceToAtlasScale: 0.0876,
          sourceBounds: [
            149,
            337,
            866,
            711
          ],
          visiblePixels: [
            63,
            33
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-left-sleep-v1.json"
        },
        up: {
          x: 640,
          y: 432,
          w: 160,
          h: 144,
          anchor: [
            0.5,
            0.7222222222222222
          ],
          scale: 0.5,
          sourceSha256: "dec200b19d097e9204982482d7b4ea91f0f82fadf97d9f9512ba8fad24924669",
          requestId: "02f6fac2-ffb3-4390-ba57-ac5256c8efc6",
          taskId: "mt_0bd54be02aa54455f709bc8c26bb654f",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265106627-min6o83us7i.webp",
          sourcePath: "tasks/cat-up-sleep-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            510,
            751
          ],
          sourceToAtlasScale: 0.0785,
          sourceBounds: [
            268,
            281,
            725,
            750
          ],
          visiblePixels: [
            36,
            37
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/cat-up-sleep-v1.json"
        }
      }
    },
    review: {
      singleImage: "accepted",
      family: "accepted",
      targetScene: "accepted",
      technical: "accepted"
    },
    diagnosticOnly: true,
    contentSha256: "7b298237af7be8ec95635f9b0b55fe7e4880aad4df0751b46730ab7fb493972a",
    effectiveReview: "reviews/current-family-review.json",
    runtimeEligible: false,
    libraryEligible: false
  },
  "coastal-gull-v1": {
    species: "gull",
    visualVersion: "coastal-gull-v1",
    image: "./animals/gull-atlas.png",
    atlas: {
      w: 1120,
      h: 640
    },
    frames: {
      stand: {
        down: {
          x: 0,
          y: 0,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "1b05897a994d87f70936105331228a479ed419b2770c44b268ed7c1cf76670f7",
          requestId: "dc8ab425-9d5f-438c-9b7c-145664213f7c",
          taskId: "mt_268e5d46fd236377cb39f8f14a5eab2e",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791263504921-d5gpfarlaze.webp",
          sourcePath: "tasks/gull-down-stand-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            512,
            944
          ],
          sourceToAtlasScale: 0.058361391694725026,
          sourceBounds: [
            293,
            57,
            732,
            948
          ],
          visiblePixels: [
            26,
            52
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-down-stand-v1.json"
        },
        left: {
          x: 0,
          y: 160,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "721e83872cb3d859caf89fa156c5957144ceb0d8eb4ea603bc7aecc0425b8693",
          requestId: "7a4f879d-afb6-4853-9a96-3c4240c34c18",
          taskId: "mt_722f5a5cd55bdbf3e40f01439bc7ba1a",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264485374-tnwylyij1l.webp",
          sourcePath: "tasks/gull-left-stand-v2/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            425,
            825
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            67,
            231,
            978,
            837
          ],
          visiblePixels: [
            53,
            35
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-stand-v2.json"
        },
        right: {
          x: 0,
          y: 320,
          w: 224,
          h: 160,
          anchor: [
            0.4955357142857143,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "721e83872cb3d859caf89fa156c5957144ceb0d8eb4ea603bc7aecc0425b8693",
          requestId: "7a4f879d-afb6-4853-9a96-3c4240c34c18",
          taskId: "mt_722f5a5cd55bdbf3e40f01439bc7ba1a",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264485374-tnwylyij1l.webp",
          sourcePath: "tasks/gull-left-stand-v2/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            425,
            825
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            67,
            231,
            978,
            837
          ],
          visiblePixels: [
            53,
            35
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-stand-v2.json"
        },
        up: {
          x: 0,
          y: 480,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "a0d981c7c8140e7965f4395fadf3a239260f66b2120454c970098df8dd35ca62",
          requestId: "b62d3cdb-59ba-4a2e-9ba6-6962e82ef7b5",
          taskId: "mt_1a17c5331d5a81c13d45a70569f5db6c",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264521043-7w98u7fj2a3.webp",
          sourcePath: "tasks/gull-up-stand-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            512,
            800
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            314,
            61,
            710,
            943
          ],
          visiblePixels: [
            23,
            51
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-up-stand-v1.json"
        }
      },
      walkA: {
        down: {
          x: 224,
          y: 0,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "a3b305c09d1c6192674d220e12b930966bd21dd16f2f4288569d5c11bb4a8d9a",
          requestId: "1a5708ae-f0af-49ed-b259-32fb455c9ffb",
          taskId: "mt_bb529447c7e9a8056e8177a4ed9dbd7c",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264878502-5zxf0aew5ny.webp",
          sourcePath: "tasks/gull-down-walkA-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            470,
            952
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            292,
            57,
            732,
            961
          ],
          visiblePixels: [
            26,
            53
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-down-walkA-v1.json"
        },
        left: {
          x: 224,
          y: 160,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "ca1677b41c6787c9ec905b2105d483dc5f52e708733466affabec8c7dec393ab",
          requestId: "41191612-ce3a-423d-bfd2-94fabaadbb0e",
          taskId: "mt_6d5d1cc0405660cd45e03958dc070fc5",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264619649-mydqs3excoo.webp",
          sourcePath: "tasks/gull-left-walkA-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            390,
            808
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            54,
            230,
            977,
            819
          ],
          visiblePixels: [
            54,
            34
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-walkA-v1.json"
        },
        right: {
          x: 224,
          y: 320,
          w: 224,
          h: 160,
          anchor: [
            0.4955357142857143,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "ca1677b41c6787c9ec905b2105d483dc5f52e708733466affabec8c7dec393ab",
          requestId: "41191612-ce3a-423d-bfd2-94fabaadbb0e",
          taskId: "mt_6d5d1cc0405660cd45e03958dc070fc5",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791264619649-mydqs3excoo.webp",
          sourcePath: "tasks/gull-left-walkA-v1/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            390,
            808
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            54,
            230,
            977,
            819
          ],
          visiblePixels: [
            54,
            34
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-walkA-v1.json"
        },
        up: {
          x: 224,
          y: 480,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "5d907953652710c51ef35529acb42efb28e56a628a77e96c6bbd54f452f5ba00",
          requestId: "d28db14a-608c-4e9a-ad33-39356b5be269",
          taskId: "mt_6e60076b33ca926997730e59a8b4cf1e",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265471020-h4ym1x0yifm.webp",
          sourcePath: "tasks/gull-up-walkA-v2/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            510,
            890
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            319,
            58,
            702,
            943
          ],
          visiblePixels: [
            22,
            52
          ],
          calibrationReason: "short intact ankles; support back edge, same upstand body pixel scale",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-up-walkA-v2.json"
        }
      },
      walkB: {
        down: {
          x: 448,
          y: 0,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "5c3382c9e0f5125651c501efb06137f24564715578f95796bbda4080c78ea184",
          requestId: "9f61e3ad-7188-4f0d-ac14-f26000ae50c3",
          taskId: "mt_a2867493c2fc3c7b8b67a9865451c3ae",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265538364-lsv35dqkb8.webp",
          sourcePath: "tasks/gull-down-walkB-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            540,
            952
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            292,
            56,
            732,
            960
          ],
          visiblePixels: [
            26,
            53
          ],
          calibrationReason: "alternating two-foot support back edge, same downstand body pixel scale",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-down-walkB-v1.json"
        },
        left: {
          x: 448,
          y: 160,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "fe7641a2c62a8615586b13c34d8f58f6aa9f029307cc08caa07af10172894ed1",
          requestId: "ceb05e41-d9e8-4752-b6e3-a08c512fd260",
          taskId: "mt_0f9119f91109a8f22835957c90195fdb",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265408640-3ajbvt7r52b.webp",
          sourcePath: "tasks/gull-left-walkB-v2/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            450,
            820
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            54,
            230,
            977,
            828
          ],
          visiblePixels: [
            54,
            35
          ],
          calibrationReason: "near advancing foot / far trailing foot support edge, same left reference torso scale",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-walkB-v2.json"
        },
        right: {
          x: 448,
          y: 320,
          w: 224,
          h: 160,
          anchor: [
            0.4955357142857143,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "fe7641a2c62a8615586b13c34d8f58f6aa9f029307cc08caa07af10172894ed1",
          requestId: "ceb05e41-d9e8-4752-b6e3-a08c512fd260",
          taskId: "mt_0f9119f91109a8f22835957c90195fdb",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265408640-3ajbvt7r52b.webp",
          sourcePath: "tasks/gull-left-walkB-v2/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            450,
            820
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            54,
            230,
            977,
            828
          ],
          visiblePixels: [
            54,
            35
          ],
          calibrationReason: "near advancing foot / far trailing foot support edge, same left reference torso scale",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-walkB-v2.json"
        },
        up: {
          x: 448,
          y: 480,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "13a46de3209362a7c4a1df551b1af671edae7625d9eb05fe29534846760a57d0",
          requestId: "58cf415d-34de-4f5e-a27f-8f684a7e231b",
          taskId: "mt_1d1f9e2658352f692fe60cc1832f45e8",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791268053795-gisu5rfhbfm.webp",
          sourcePath: "tasks/gull-up-walkB-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            510,
            844
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            320,
            61,
            711,
            943
          ],
          visiblePixels: [
            23,
            51
          ],
          calibrationReason: "supplement complete source manually inspected; ground support back edge, uniform same-direction standing scale; no anatomy edit",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-up-walkB-v1.json"
        }
      },
      "wing-up": {
        down: {
          x: 672,
          y: 0,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "774a9745c38fa6000cb4931cbdd88c21a90b47afff4a0a4e5d50517c9b98083e",
          requestId: "de81198a-6f95-422f-950a-a8f207ed7393",
          taskId: "mt_a12073d745d122fc2a2086976d157a63",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265144001-4c1b2esl7p8.webp",
          sourcePath: "tasks/gull-down-wing-up-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            512,
            905
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            27,
            25,
            998,
            912
          ],
          visiblePixels: [
            57,
            52
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-down-wing-up-v1.json"
        },
        left: {
          x: 672,
          y: 160,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "e9c238903f361edbaf0525ffc0027b246b4f3d85f8f660971740d6851bcd1393",
          requestId: "21b664dc-88e0-4b3e-808b-6a16459ddce4",
          taskId: "mt_dbb3f13c753d8057dfb1575d1c7a230a",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265178805-92dwvqptt0s.webp",
          sourcePath: "tasks/gull-left-wing-up-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            650,
            872
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            59,
            61,
            956,
            880
          ],
          visiblePixels: [
            52,
            48
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-wing-up-v1.json"
        },
        right: {
          x: 672,
          y: 320,
          w: 224,
          h: 160,
          anchor: [
            0.4955357142857143,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "e9c238903f361edbaf0525ffc0027b246b4f3d85f8f660971740d6851bcd1393",
          requestId: "21b664dc-88e0-4b3e-808b-6a16459ddce4",
          taskId: "mt_dbb3f13c753d8057dfb1575d1c7a230a",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265178805-92dwvqptt0s.webp",
          sourcePath: "tasks/gull-left-wing-up-v1/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            650,
            872
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            59,
            61,
            956,
            880
          ],
          visiblePixels: [
            52,
            48
          ],
          calibrationReason: "manual full-source support back-edge / pelvis review; uniform nearest scale from same-direction stand head/torso pixel scale; no local anatomy edits",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-wing-up-v1.json"
        },
        up: {
          x: 672,
          y: 480,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "e15fd5ffa5c9a1918c5298106dfd8b3764e23ed24ca59c3a0c48df212f81e0e9",
          requestId: "e65892fb-676f-4f50-97a0-bd140c77d947",
          taskId: "mt_39e8aeae6b1e2948eb82b1450590e1ea",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265214647-50k6dsn9kqr.webp",
          sourcePath: "tasks/gull-up-wing-up-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            512,
            775
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            37,
            57,
            987,
            925
          ],
          visiblePixels: [
            55,
            51
          ],
          calibrationReason: "tucked foot/pelvis support back edge, same-direction stand body pixel scale, uniform nearest resize only",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-up-wing-up-v1.json"
        }
      },
      "wing-down": {
        down: {
          x: 896,
          y: 0,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "9d5eaeeb934a15cc578821a9cdb67ec9595b732da9b40c2ff7696b523bf11dfb",
          requestId: "53656a19-a748-47c6-a055-65878a884ac1",
          taskId: "mt_4bffa09eb3509e95978591c1a71987ae",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265571411-j8eh3fq5ms.webp",
          sourcePath: "tasks/gull-down-wing-down-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            512,
            896
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            23,
            229,
            1e3,
            930
          ],
          visiblePixels: [
            57,
            41
          ],
          calibrationReason: "tucked feet/pelvis back edge, same-direction reference torso pixel scale; image-only vertical elevation handled in renderer",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-down-wing-down-v1.json"
        },
        left: {
          x: 896,
          y: 160,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "f73216b476db75d5fc724b6b2681b47b5fe71cf63e133d9e409d9b1e60f3f2dc",
          requestId: "9eeef14a-f831-434b-bee3-c821b20bb87f",
          taskId: "mt_ecd77b569413a6bc55fbf16bfbd1faad",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265607266-9szrh3qytu.webp",
          sourcePath: "tasks/gull-left-wing-down-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            740,
            580
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            64,
            247,
            979,
            899
          ],
          visiblePixels: [
            53,
            38
          ],
          calibrationReason: "tucked feet/pelvis back edge, same-direction reference torso pixel scale; image-only vertical elevation handled in renderer",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-wing-down-v1.json"
        },
        right: {
          x: 896,
          y: 320,
          w: 224,
          h: 160,
          anchor: [
            0.4955357142857143,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "f73216b476db75d5fc724b6b2681b47b5fe71cf63e133d9e409d9b1e60f3f2dc",
          requestId: "9eeef14a-f831-434b-bee3-c821b20bb87f",
          taskId: "mt_ecd77b569413a6bc55fbf16bfbd1faad",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265607266-9szrh3qytu.webp",
          sourcePath: "tasks/gull-left-wing-down-v1/source.webp",
          wholeFrameMirror: true,
          mirrorFrom: "left",
          sourceFoot: [
            740,
            580
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            64,
            247,
            979,
            899
          ],
          visiblePixels: [
            53,
            38
          ],
          calibrationReason: "tucked feet/pelvis back edge, same-direction reference torso pixel scale; image-only vertical elevation handled in renderer",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-left-wing-down-v1.json"
        },
        up: {
          x: 896,
          y: 480,
          w: 224,
          h: 160,
          anchor: [
            0.5,
            0.65
          ],
          scale: 0.5,
          sourceSha256: "a4cad8f458bd4dd90c43b92d45019d641f3398431dd5138fc608bd8a9534f08f",
          requestId: "5cd31536-ffad-43d2-8656-137f29127c87",
          taskId: "mt_ed90dfc596d9e645209e74e7d1ba7ec8",
          sourceUrl: "https://images.aiwaves.tech/uploads/1791265641659-ma9bo2e4kx.webp",
          sourcePath: "tasks/gull-up-wing-down-v1/source.webp",
          wholeFrameMirror: false,
          mirrorFrom: null,
          sourceFoot: [
            512,
            733
          ],
          sourceToAtlasScale: 0.05836,
          sourceBounds: [
            43,
            128,
            981,
            882
          ],
          visiblePixels: [
            55,
            44
          ],
          calibrationReason: "tucked feet/pelvis back edge, same-direction reference torso pixel scale; image-only vertical elevation handled in renderer",
          sourceDecision: "pass",
          reviewFile: "reviews/gull-up-wing-down-v1.json"
        }
      }
    },
    review: {
      singleImage: "accepted",
      family: "accepted",
      targetScene: "accepted",
      technical: "accepted"
    },
    diagnosticOnly: true,
    contentSha256: "0c3e6577e769eb26edcb42fccee17a11a58641e39c27299b8e7e7975df704802",
    effectiveReview: "reviews/current-family-review.json",
    runtimeEligible: false,
    libraryEligible: false
  }
};

// src/animals/config.ts
var profiles = {
  cat: { collision: { w: 30, h: 18 }, speed: 28, stride: 24, retreatDistance: 0, landingDistance: 0, flightSpeed: 0, flightHeight: 0, wingHz: 0, cooldown: 0, followStop: 0, followMax: 0 },
  gull: { collision: { w: 12, h: 6 }, speed: 18, stride: 16, retreatDistance: 64, landingDistance: 92, flightSpeed: 92, flightHeight: 20, wingHz: 4, cooldown: 3, followStop: 0, followMax: 0 },
  // Algorithm fixture only: no dog art, game individual or approved new production.
  dog: { collision: { w: 22, h: 10 }, speed: 36, stride: 28, retreatDistance: 0, landingDistance: 0, flightSpeed: 0, flightHeight: 0, wingHz: 0, cooldown: 0, followStop: 44, followMax: 96 }
};
var slot = (scene, x, y, w, h, activity = "wander") => ({ scene, region: { x, y, w, h }, activity, points: [{ x: x + 16, y: y + 16 }, { x: x + w - 16, y: y + 16 }, { x: x + w - 16, y: y + h - 16 }, { x: x + 16, y: y + h - 16 }] });
var animals = [
  { id: "harbor-cat-1", species: "cat", visualVersion: "domestic-cat-v1", schedule: { morning: slot("station", 740, 620, 110, 100, "sun-rest"), afternoon: slot("station", 740, 620, 110, 100), evening: slot("market", 550, 750, 100, 90), night: slot("courtyard", 550, 465, 110, 85, "sleep") } },
  { id: "harbor-cat-2", species: "cat", visualVersion: "domestic-cat-v1", schedule: { morning: slot("courtyard", 550, 465, 110, 85, "sun-rest"), afternoon: slot("market", 550, 750, 100, 90), evening: slot("station", 740, 620, 110, 100), night: slot("courtyard", 550, 465, 110, 85, "sleep") } },
  { id: "harbor-cat-3", species: "cat", visualVersion: "domestic-cat-v1", schedule: { morning: slot("market", 550, 750, 100, 90), afternoon: slot("courtyard", 550, 465, 110, 85, "sun-rest"), evening: slot("market", 700, 740, 100, 100), night: slot("courtyard", 550, 465, 110, 85, "sleep") } },
  ...[1, 2, 3, 4].map((n) => ({ id: "harbor-gull-" + n, species: "gull", visualVersion: "coastal-gull-v1", schedule: { morning: slot(n <= 2 ? "coast" : "beach", n <= 2 ? 610 : 510, n <= 2 ? 610 : 380, n <= 2 ? 280 : 220, n <= 2 ? 175 : 190), afternoon: slot(n <= 2 ? "beach" : "dock", n <= 2 ? 510 : 335, n <= 2 ? 380 : 400, n <= 2 ? 220 : 290, n <= 2 ? 190 : 180), evening: slot("coast", 610, 610, 280, 175) } }))
];

// src/engine/distance-motion.ts
var EPSILON = 1e-7;
function moveWithCollision(position, delta, canWalk, onMove) {
  let next = { ...position };
  let distance2 = 0;
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y)));
  for (let i = 0; i < steps; i++) {
    const before = next;
    const horizontal = { x: next.x + delta.x / steps, y: next.y };
    if (canWalk(horizontal)) next = horizontal;
    const vertical = { x: next.x, y: next.y + delta.y / steps };
    if (canWalk(vertical)) next = vertical;
    const moved = Math.hypot(next.x - before.x, next.y - before.y);
    distance2 += moved;
    if (moved > EPSILON) onMove?.({ ...next });
  }
  return { position: next, distance: distance2 };
}
function advanceRoute(position, route2, budget, canWalk, onMove) {
  let next = { ...position }, distance2 = 0, consumed = 0;
  let direction = { x: 0, y: 0 }, blocked = false;
  while (consumed < route2.length) {
    const target = route2[consumed];
    const dx = target.x - next.x, dy = target.y - next.y, remaining = Math.hypot(dx, dy);
    if (remaining < EPSILON) {
      if (!canWalk(target)) {
        blocked = true;
        break;
      }
      next = { ...target };
      consumed++;
      continue;
    }
    if (budget < EPSILON) break;
    const amount = Math.min(remaining, budget);
    const intended = { x: dx / remaining * amount, y: dy / remaining * amount };
    const result = moveWithCollision(next, intended, canWalk, onMove);
    const actual = { x: result.position.x - next.x, y: result.position.y - next.y };
    if (result.distance > EPSILON) direction = actual;
    next = result.position;
    distance2 += result.distance;
    budget -= amount;
    if (Math.hypot(actual.x - intended.x, actual.y - intended.y) > EPSILON) {
      blocked = true;
      break;
    }
    if (amount >= remaining - EPSILON) {
      if (!canWalk(target)) {
        blocked = true;
        break;
      }
      next = { ...target };
      consumed++;
    }
  }
  return { position: next, distance: distance2, consumed, direction, blocked, arrived: consumed === route2.length };
}

// src/animals/familiarity.ts
var familiarCatGreeting = Object.freeze({ minimum: 2, distance: 80, rearmDistance: 104, seconds: 1.2 });
function catFamiliarities(memory2) {
  return Object.fromEntries(Object.entries(memory2?.individuals ?? {}).filter(([id, m]) => /^harbor-cat-\d+$/.test(id) && Number.isSafeInteger(m.familiarity) && m.familiarity >= 0 && m.familiarity <= 3).map(([id, m]) => [id, m.familiarity]));
}

// src/engine/world.ts
function walkable(world3, scene, p) {
  const s = world3.scenes[scene], a = world3.actor;
  if (!s || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  const r = s.interior;
  return p.x >= r.x && p.y >= r.y && p.x + a.w <= r.x + r.w && p.y + a.h <= r.y + r.h && !s.obstacles.some((o) => p.x < o.x + o.w && p.x + a.w > o.x && p.y < o.y + o.h && p.y + a.h > o.y);
}
function findPath(world3, scene, from, to) {
  const step = world3.step, key2 = (p) => `${p.x},${p.y}`, round = (p) => ({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step });
  const clear = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let i = 1; i <= n; i++) if (!walkable(world3, scene, { x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n })) return false;
    return true;
  };
  if (!walkable(world3, scene, from) || !walkable(world3, scene, to)) return [];
  const nearby = (p) => {
    const center = round(p), points = [];
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const q = { x: center.x + x * step, y: center.y + y * step };
      if (walkable(world3, scene, q) && clear(p, q)) points.push(q);
    }
    return points.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  };
  const starts = nearby(from), ends = new Set(nearby(to).map(key2));
  if (!starts.length || !ends.size) return [];
  const queue = [...starts], parents = new Map(starts.map((p) => [key2(p), null]));
  let end;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (ends.has(key2(p))) {
      end = p;
      break;
    }
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (!parents.has(key2(q)) && walkable(world3, scene, q) && clear(p, q)) {
        parents.set(key2(q), p);
        queue.push(q);
      }
    }
  }
  if (!end) return [];
  const route2 = [to];
  for (let p = end; p; p = parents.get(key2(p)) ?? null) route2.push(p);
  return route2.reverse();
}

// src/animals/spatial.ts
var overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
var bodyAt = (p, profile) => ({ x: p.x - profile.collision.w / 2, y: p.y - profile.collision.h, w: profile.collision.w, h: profile.collision.h });
var finitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
var inside = (r, b) => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
function terrainClear(p, slot2, profile, ctx) {
  const scene = ctx.world.scenes[slot2.scene];
  if (!scene || !finitePoint(p)) return false;
  const b = bodyAt(p, profile);
  return inside(scene.interior, b) && inside(slot2.region, b) && ![...scene.obstacles, ...ctx.forbidden[slot2.scene] ?? []].some((r) => overlaps(b, r));
}
function pointClear(p, slot2, profile, ctx, others, includePlayer = true) {
  const b = bodyAt(p, profile);
  return terrainClear(p, slot2, profile, ctx) && (!includePlayer || slot2.scene !== ctx.scene || !overlaps(b, ctx.player)) && !Object.values(ctx.people).some((p2) => p2.scene === slot2.scene && overlaps(b, p2.body)) && !others.some((a) => a.visible && a.scene === slot2.scene && overlaps(b, bodyAt(a.foot, ctxProfiles(a))));
}
function bodyClear(p, sceneId, region, profile, ctx, occupied = [], includePlayer = true) {
  const scene = ctx.world.scenes[sceneId];
  if (!scene || !finitePoint(p)) return false;
  const b = bodyAt(p, profile);
  return inside(scene.interior, b) && inside(region, b) && ![...scene.obstacles, ...ctx.forbidden[sceneId] ?? []].some((r) => overlaps(b, r)) && (!includePlayer || sceneId !== ctx.scene || !overlaps(b, ctx.player)) && !Object.values(ctx.people).some((p2) => p2.scene === sceneId && overlaps(b, p2.body)) && !occupied.some((r) => overlaps(b, r));
}
var ctxProfiles = (a) => profiles[a.species];
function candidates(slot2) {
  const out = [...slot2.points];
  for (let y = slot2.region.y + 8; y <= slot2.region.y + slot2.region.h; y += 8) for (let x = slot2.region.x + 8; x <= slot2.region.x + slot2.region.w - 8; x += 8) out.push({ x, y });
  return out;
}
function freePoint(preferred, slot2, profile, ctx, others, minFromPlayer = 0) {
  const center = { x: ctx.player.x + ctx.player.w / 2, y: ctx.player.y + ctx.player.h / 2 };
  return [preferred, ...candidates(slot2)].filter((p) => pointClear(p, slot2, profile, ctx, others) && (!minFromPlayer || Math.hypot(p.x - center.x, p.y - center.y) >= minFromPlayer)).sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y))[0];
}
function animalPath(from, to, slot2, profile, ctx, others) {
  const raw = ctx.world.scenes[slot2.scene];
  if (!raw) return [];
  const obstacles = [...raw.obstacles, ...ctx.forbidden[slot2.scene] ?? [], ...Object.values(ctx.people).filter((p) => p.scene === slot2.scene).map((p) => p.body), ...slot2.scene === ctx.scene ? [ctx.player] : [], ...others.filter((a) => a.visible && a.scene === slot2.scene).map((a) => bodyAt(a.foot, profiles[a.species]))];
  const r = slot2.region;
  const intersection = { x: Math.max(raw.interior.x, r.x), y: Math.max(raw.interior.y, r.y), w: 0, h: 0 };
  intersection.w = Math.min(raw.interior.x + raw.interior.w, r.x + r.w) - intersection.x;
  intersection.h = Math.min(raw.interior.y + raw.interior.h, r.y + r.h) - intersection.y;
  const w = { ...ctx.world, step: 4, actor: { ...profile.collision }, scenes: { [slot2.scene]: { ...raw, interior: intersection, obstacles } } };
  const top = (p) => ({ x: p.x - profile.collision.w / 2, y: p.y - profile.collision.h });
  return findPath(w, slot2.scene, top(from), top(to)).map((p) => ({ x: p.x + profile.collision.w / 2, y: p.y + profile.collision.h }));
}
function protectionForRoom(entities) {
  return entities.flatMap((e) => e.kind === "portal" ? [e.at, { x: e.approach.x + 8, y: e.approach.y + 6 }].map((p) => ({ x: p.x - 46, y: p.y - 46, w: 92, h: 92 })) : e.id.startsWith("crop-bed-") ? [{ x: e.at.x - 42, y: e.at.y - 35, w: 84, h: 70 }] : []);
}

// src/animals/behavior.ts
function periodAt(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) throw Error("INVALID_TOWN_TIME");
  const m = minutes % 1440;
  return m < 360 || m >= 1260 ? "night" : m < 720 ? "morning" : m < 1020 ? "afternoon" : "evening";
}
var slotAt = (a, m) => a.schedule[periodAt(m)] ?? null;
var contextSlot = (a, ctx) => ctx.animalSlots?.[a.id] ?? slotAt(a, ctx.townMinutes);
var face = (from, to, previous) => {
  const x = to.x - from.x, y = to.y - from.y;
  if (Math.abs(x) + Math.abs(y) < 1e-7) return previous;
  return Math.abs(x) > Math.abs(y) ? x > 0 ? "right" : "left" : y > 0 ? "down" : "up";
};
var initial = (a) => ({ id: a.id, species: a.species, visualVersion: a.visualVersion, scene: null, slot: null, foot: { x: 0, y: 0 }, direction: "down", pose: "stand", phase: "hidden", visible: false, distance: 0, elevation: 0, attention: 0, cooldown: 0, route: [], flightDistance: 0, flightTotal: 0, wingTime: 0, waypoint: 0, wait: 0 });
function createAnimalRuntime(defs, options = {}) {
  const effective = { ...profiles, ...options.profiles };
  const clear = (p, slot2, profile, ctx, others) => pointClear(p, slot2, profile, ctx, others) && (!options.displayClear || options.displayClear(p, slot2, ctx));
  const free = (preferred, slot2, profile, ctx, others, minimum = 0) => {
    if (!options.displayClear) return freePoint(preferred, slot2, profile, ctx, others, minimum);
    const player = { x: ctx.player.x + ctx.player.w / 2, y: ctx.player.y + ctx.player.h / 2 };
    return [preferred, ...candidates(slot2)].filter((p) => Math.hypot(p.x - preferred.x, p.y - preferred.y) <= 96).sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y)).find((p) => clear(p, slot2, profile, ctx, others) && Math.hypot(p.x - player.x, p.y - player.y) >= minimum);
  };
  if (new Set(defs.map((a) => a.id)).size !== defs.length) throw Error("DUPLICATE_ANIMAL_ID");
  const states = new Map(defs.map((a) => [a.id, initial(a)])), greeted = /* @__PURE__ */ new Set();
  let signature = "", lastMinutes = -1, visitScene = "";
  const reconcile = (ctx) => {
    if (visitScene !== ctx.scene) {
      visitScene = ctx.scene;
      greeted.clear();
    }
    periodAt(ctx.townMinutes);
    const nextSignature = ctx.scene + ":" + ctx.townMinutes + ":" + JSON.stringify(ctx.animalSlots ?? {});
    if (nextSignature === signature) return;
    const preserve = new Set(defs.filter((a) => {
      const state = states.get(a.id), slot2 = contextSlot(a, ctx);
      return state.visible && state.scene === ctx.scene && slot2?.scene === ctx.scene && (options.preserveVisibleSlot && JSON.stringify(state.slot) === JSON.stringify(slot2) || a.species === "cat" && (!!slot2.shelter && lastMinutes >= 0 && periodAt(lastMinutes) === periodAt(ctx.townMinutes) || state.attention > 0 && lastMinutes >= 0 && ctx.townMinutes === lastMinutes + 1 && periodAt(lastMinutes) === periodAt(ctx.townMinutes) && JSON.stringify(state.slot) === JSON.stringify(slot2)));
    }).map((a) => a.id));
    signature = nextSignature;
    lastMinutes = ctx.townMinutes;
    for (const state of states.values()) {
      if (preserve.has(state.id)) continue;
      state.visible = false;
      state.route = [];
      state.elevation = 0;
      state.attention = 0;
      state.cooldown = 0;
      state.flightDistance = 0;
      state.wingTime = 0;
      state.distance = 0;
      state.wait = 0;
      state.waypoint = 0;
    }
    for (const def of defs) {
      const state = states.get(def.id), slot2 = contextSlot(def, ctx), oldActivity = state.slot?.activity;
      state.scene = slot2?.scene ?? null;
      state.slot = slot2;
      if (preserve.has(def.id)) {
        if (oldActivity !== slot2?.activity) {
          state.route = [];
          state.wait = 0;
          state.pose = "stand";
        }
        continue;
      }
      state.phase = "hidden";
      state.pose = "stand";
      state.reason = slot2 ? "other-scene" : "schedule-away";
      if (!slot2 || slot2.scene !== ctx.scene) continue;
      const offset = defs.indexOf(def) % slot2.points.length, preferred = slot2.shelter?.homePoint ?? slot2.points[offset];
      const foot = free(preferred, slot2, effective[def.species], ctx, [...states.values()].filter((a) => a.id !== def.id));
      if (!foot) {
        state.reason = "no-safe-position";
        continue;
      }
      state.foot = { ...foot };
      state.waypoint = offset;
      state.visible = true;
      state.reason = void 0;
      state.phase = slot2.activity === "sleep" ? "sleep" : slot2.activity === "sun-rest" ? "sun-rest" : "idle";
      state.pose = state.phase === "sleep" ? "sleep" : state.phase === "sun-rest" ? "sun-rest" : "stand";
    }
  };
  const tick = (dt, ctx) => {
    if (!Number.isFinite(dt) || dt < 0) throw Error("INVALID_FRAME_TIME");
    reconcile(ctx);
    dt = ctx.paused ? 0 : Math.min(dt, 0.04);
    for (const def of defs) {
      const s = states.get(def.id), slot2 = s.slot;
      if (!slot2 || slot2.scene !== ctx.scene) continue;
      const profile = effective[def.species], others = [...states.values()].filter((a) => a.id !== s.id);
      if (!s.visible) {
        const q = free(slot2.points[s.waypoint % slot2.points.length], slot2, profile, ctx, others);
        if (!q) continue;
        s.foot = { ...q };
        s.visible = true;
        s.reason = void 0;
      }
      if (!clear(s.foot, slot2, profile, ctx, others)) {
        if (options.holdOccupied) {
          s.route = [];
          s.elevation = 0;
          s.phase = "idle";
          s.pose = "stand";
          s.reason = "space-occupied";
          if (!terrainClear(s.foot, slot2, profile, ctx)) {
            s.visible = false;
            s.phase = "hidden";
            s.reason = "no-safe-position";
          }
          continue;
        }
        const q = free(s.foot, slot2, profile, ctx, others);
        if (!q) {
          s.visible = false;
          s.phase = "hidden";
          s.reason = "no-safe-position";
          s.route = [];
          s.elevation = 0;
          continue;
        }
        s.foot = { ...q };
        s.route = [];
        s.elevation = 0;
        s.flightDistance = 0;
        s.distance = 0;
      }
      if (def.species === "dog" && slot2.activity === "follow") {
        const owner2 = def.ownerId ? ctx.people[def.ownerId] : void 0;
        const reason = !owner2 || owner2.scene !== slot2.scene || !finitePoint(owner2.foot) ? "owner-away" : Math.hypot(owner2.foot.x - s.foot.x, owner2.foot.y - s.foot.y) > profile.followMax ? "owner-outpaced" : void 0;
        if (reason) {
          s.phase = "idle";
          s.pose = "stand";
          s.route = [];
          s.reason = reason;
          continue;
        }
        s.reason = void 0;
      }
      if (!dt) {
        if (def.species === "dog") {
          s.phase = "idle";
          s.pose = "stand";
          s.route = [];
        }
        continue;
      }
      s.cooldown = Math.max(0, s.cooldown - dt);
      s.attention = Math.max(0, s.attention - dt);
      s.wait = Math.max(0, s.wait - dt);
      const player = { x: ctx.player.x + ctx.player.w / 2, y: ctx.player.y + ctx.player.h / 2 }, near = Math.hypot(player.x - s.foot.x, player.y - s.foot.y);
      if (def.species === "cat") {
        if (near > familiarCatGreeting.rearmDistance) greeted.delete(def.id);
        const familiarity = ctx.catFamiliarities?.[def.id] ?? 0;
        if (slot2.activity === "wander" && Number.isSafeInteger(familiarity) && familiarity >= familiarCatGreeting.minimum && familiarity <= 3 && near <= familiarCatGreeting.distance && !greeted.has(def.id) && s.attention === 0) {
          greeted.add(def.id);
          s.attention = familiarCatGreeting.seconds;
          s.route = [];
        }
      }
      if (s.attention > 0) {
        s.phase = "attention";
        s.pose = "stand";
        s.direction = face(s.foot, player, s.direction);
        s.route = [];
        continue;
      }
      if (slot2.shelter) {
        const r = slot2.shelter.homeRegion, b = { x: s.foot.x - profile.collision.w / 2, y: s.foot.y - profile.collision.h, w: profile.collision.w, h: profile.collision.h }, home = b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
        const target2 = slot2.activity === "shelter" ? slot2.shelter.point : !home ? slot2.shelter.homePoint : void 0;
        if (target2) {
          if (Math.hypot(s.foot.x - target2.x, s.foot.y - target2.y) < 0.1) {
            s.phase = "idle";
            s.pose = "stand";
            s.route = [];
            s.reason = slot2.activity === "shelter" ? "rain-shelter" : void 0;
            continue;
          }
          if (!s.route.length) s.route = clear(target2, slot2, profile, ctx, others) ? animalPath(s.foot, target2, slot2, profile, ctx, others) : [];
          if (!s.route.length) {
            s.phase = "idle";
            s.pose = "stand";
            s.reason = "shelter-route-blocked";
            continue;
          }
          const previous = s.foot, result2 = advanceRoute(s.foot, s.route, profile.speed * dt, (q) => clear(q, slot2, profile, ctx, others));
          s.foot = result2.position;
          s.route.splice(0, result2.consumed);
          s.distance += result2.distance;
          s.direction = face(previous, s.foot, s.direction);
          s.phase = result2.distance > 0 ? "walk" : "idle";
          s.pose = result2.distance > 0 ? ["walkA", "stand", "walkB", "stand"][Math.floor(s.distance / profile.stride * 4) % 4] : "stand";
          s.reason = result2.blocked ? "shelter-route-blocked" : result2.arrived && slot2.activity === "shelter" ? "rain-shelter" : void 0;
          if (result2.blocked || result2.arrived) s.route = [];
          continue;
        }
      }
      if (slot2.activity === "sleep") {
        s.phase = "sleep";
        s.pose = "sleep";
        s.route = [];
        s.elevation = 0;
        continue;
      }
      if (def.species === "gull" && near < profile.retreatDistance && s.cooldown === 0 && s.phase !== "flight") {
        const desired = free({ x: s.foot.x + (s.foot.x - player.x), y: s.foot.y + (s.foot.y - player.y) }, slot2, profile, ctx, others, profile.landingDistance);
        const route2 = desired ? animalPath(s.foot, desired, slot2, profile, ctx, others) : [];
        if (route2.length) {
          s.route = route2;
          s.flightTotal = route2.reduce((n, p, i) => n + Math.hypot(p.x - (route2[i - 1] ?? s.foot).x, p.y - (route2[i - 1] ?? s.foot).y), 0);
          s.flightDistance = 0;
          s.wingTime = 0;
          s.phase = "flight";
        } else {
          s.phase = "idle";
          s.pose = "stand";
          s.cooldown = profile.cooldown;
          s.reason = "no-safe-retreat";
        }
      }
      if (s.phase === "flight") {
        const result2 = advanceRoute(s.foot, s.route, profile.flightSpeed * dt, (q) => clear(q, slot2, profile, ctx, others));
        const before2 = s.foot;
        s.foot = result2.position;
        s.route.splice(0, result2.consumed);
        s.direction = face(before2, s.foot, s.direction);
        s.flightDistance += result2.distance;
        s.wingTime += dt;
        s.elevation = profile.flightHeight * Math.sin(Math.PI * Math.min(1, s.flightDistance / Math.max(1e-3, s.flightTotal)));
        s.pose = Math.floor(s.wingTime * profile.wingHz * 2) % 2 ? "wing-down" : "wing-up";
        if (result2.arrived || result2.blocked) {
          s.phase = "idle";
          s.pose = "stand";
          s.route = [];
          s.elevation = 0;
          s.cooldown = profile.cooldown;
          s.wait = 1;
          s.reason = result2.blocked ? "retreat-blocked" : void 0;
        }
        continue;
      }
      if (slot2.activity === "sun-rest") {
        s.phase = "sun-rest";
        s.pose = "sun-rest";
        s.route = [];
        continue;
      }
      if (slot2.activity === "follow") {
        const owner2 = def.ownerId ? ctx.people[def.ownerId] : void 0;
        if (!owner2 || owner2.scene !== slot2.scene || !finitePoint(owner2.foot)) {
          s.phase = "idle";
          s.pose = "stand";
          s.route = [];
          s.reason = "owner-away";
          continue;
        }
      }
      if (s.wait > 0) {
        s.phase = "idle";
        s.pose = "stand";
        continue;
      }
      let target;
      if (slot2.activity === "follow") {
        const owner2 = def.ownerId ? ctx.people[def.ownerId] : void 0;
        if (!owner2 || owner2.scene !== slot2.scene || !finitePoint(owner2.foot)) {
          s.phase = "idle";
          s.pose = "stand";
          s.route = [];
          s.reason = "owner-away";
          continue;
        }
        const d = Math.hypot(owner2.foot.x - s.foot.x, owner2.foot.y - s.foot.y);
        if (d <= profile.followStop) {
          s.phase = "idle";
          s.pose = "stand";
          s.route = [];
          continue;
        }
        target = free({ x: owner2.foot.x + (s.foot.x - owner2.foot.x) / d * profile.followStop, y: owner2.foot.y + (s.foot.y - owner2.foot.y) / d * profile.followStop }, slot2, profile, ctx, others);
        s.phase = "follow";
        s.reason = d > profile.followMax ? "owner-outpaced" : void 0;
        if (target && s.route.length && Math.hypot(s.route.at(-1).x - target.x, s.route.at(-1).y - target.y) > 12) s.route = [];
      } else {
        target = slot2.points[(s.waypoint + 1) % slot2.points.length];
        s.phase = "walk";
      }
      if (!s.route.length) {
        const safe = target ? free(target, slot2, profile, ctx, others) : void 0;
        s.route = safe ? animalPath(s.foot, safe, slot2, profile, ctx, others) : [];
      }
      if (!s.route.length) {
        s.phase = "idle";
        s.pose = "stand";
        s.wait = 0.5;
        continue;
      }
      const before = s.foot, result = advanceRoute(s.foot, s.route, profile.speed * dt, (q) => clear(q, slot2, profile, ctx, others));
      s.foot = result.position;
      s.route.splice(0, result.consumed);
      s.distance += result.distance;
      s.direction = face(before, s.foot, s.direction);
      s.pose = result.distance > 1e-7 ? ["walkA", "stand", "walkB", "stand"][Math.floor(s.distance / profile.stride * 4) % 4] : "stand";
      if (result.arrived || result.blocked) {
        s.route = [];
        s.phase = "idle";
        s.pose = "stand";
        s.wait = result.blocked ? 0.5 : 1.5;
        s.waypoint = (s.waypoint + 1) % slot2.points.length;
      }
    }
    return snapshot();
  };
  const snapshot = () => structuredClone([...states.values()]);
  return { tick, snapshot, reconcile, reset: () => {
    signature = "";
    lastMinutes = -1;
    visitScene = "";
    greeted.clear();
    for (const def of defs) states.set(def.id, initial(def));
  }, react: (id, verb, ctx) => {
    reconcile(ctx);
    const s = states.get(id);
    if (!s?.visible || s.species !== "cat" || s.slot?.activity === "sleep") return false;
    greeted.add(id);
    s.attention = verb === "call" ? 2 : 1.2;
    s.phase = "attention";
    s.pose = "stand";
    s.direction = face(s.foot, { x: ctx.player.x + ctx.player.w / 2, y: ctx.player.y + ctx.player.h / 2 }, s.direction);
    s.route = [];
    return true;
  }, committedMinute: () => lastMinutes };
}

// src/animals/harbor-adapter.ts
function harborContext(save, world3, rooms3, playerPosition, people2, paused = false) {
  return { world: world3, scene: save.scene, townMinutes: save.townMinutes ?? 540, player: { ...playerPosition, ...world3.actor }, people: people2, paused, forbidden: Object.fromEntries(Object.entries(rooms3).map(([id, r]) => [id, protectionForRoom(r.entities)])) };
}
function authoredAnimalEntities(defs) {
  return defs.flatMap((def) => [...new Set(Object.values(def.schedule).map((slot2) => slot2.scene))].map((scene) => {
    const slot2 = Object.values(def.schedule).find((s) => s.scene === scene);
    const at = slot2.points[0];
    return { scene, entity: { id: def.id, animalId: def.id, kind: "object", label: def.species === "cat" ? ["\u732B", "Cat"] : def.species === "gull" ? ["\u6D77\u9E25", "Gull"] : ["\u72D7", "Dog"], at: { ...at }, approach: { x: at.x - 8, y: at.y + 34 }, actions: def.species === "cat" ? ["animal-call", "animal-pet"] : [] } };
  }));
}

// src/animals/render-contract.ts
function animalReviewAccepted(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) return false;
  const proto = Object.getPrototypeOf(review);
  if (proto !== Object.prototype && proto !== null) return false;
  const required = ["singleImage", "family", "targetScene", "technical"];
  if (Reflect.ownKeys(review).length !== required.length) return false;
  return required.every((key2) => {
    const field = Object.getOwnPropertyDescriptor(review, key2);
    return !!field && "value" in field && field.value === "accepted";
  });
}

// src/animals/rpgjs-sheet.ts
function animalSheet(art) {
  if (!animalReviewAccepted(art?.review)) throw Error("ANIMAL_ART_NOT_ACCEPTED");
  const required = art.species === "cat" ? ["stand", "walkA", "walkB", "sun-rest", "sleep"] : art.species === "gull" ? ["stand", "walkA", "walkB", "wing-up", "wing-down"] : ["stand", "walkA", "walkB"];
  if (required.some((pose) => ["down", "left", "right", "up"].some((direction) => !art.frames[pose]?.[direction]))) throw Error("ANIMAL_FAMILY_INCOMPLETE");
  const values = Object.values(art.frames).flatMap((d) => Object.values(d ?? {})).filter((v) => !!v), base2 = values[0];
  if (!base2 || values.some((f2) => f2.w !== base2.w || f2.h !== base2.h || f2.x % base2.w || f2.y % base2.h) || art.atlas.w % base2.w || art.atlas.h % base2.h) throw Error("ANIMAL_ATLAS_NOT_GRID");
  const textures = {};
  for (const [pose, directions] of Object.entries(art.frames)) for (const [direction, f2] of Object.entries(directions ?? {})) if (f2) textures[pose + "-" + direction] = { animations: () => [[{ frameX: f2.x / f2.w, frameY: f2.y / f2.h, time: 0, anchor: f2.anchor, scale: [f2.scale, f2.scale], x: 0, y: 0 }]] };
  for (const [pose, directions] of Object.entries(art.frames)) if (pose.startsWith("wing-")) {
    for (const [direction, f2] of Object.entries(directions ?? {})) if (f2) for (let lift = 1; lift <= profiles[art.species].flightHeight; lift++) textures[pose + "-" + direction + ":" + lift] = { animations: () => [[{ frameX: f2.x / f2.w, frameY: f2.y / f2.h, time: 0, anchor: f2.anchor, scale: [f2.scale, f2.scale], x: 0, y: -lift }]] };
  }
  textures.stand = textures["stand-down"];
  return { id: "animal-" + art.visualVersion, image: art.image, width: art.atlas.w, height: art.atlas.h, framesWidth: art.atlas.w / base2.w, framesHeight: art.atlas.h / base2.h, textures };
}

// src/animals/art.ts
var animalArts = art_default;
var acceptedAnimals = animals.filter((def) => {
  const art = animalArts[def.visualVersion];
  if (!art || art.species !== def.species || !animalReviewAccepted(art.review)) return false;
  animalSheet(art);
  return true;
});
var animalSheets = [...new Set(acceptedAnimals.map((def) => def.visualVersion))].map((version) => animalSheet(animalArts[version]));

// src/world/residents.ts
var townMinutes = (s) => s.townMinutes ?? 540;
function townPeriod(s) {
  const m = townMinutes(s) % 1440;
  return m < 360 || m >= 1260 ? "night" : m < 720 ? "morning" : m < 1020 ? "afternoon" : "evening";
}
function advanceTown(s, minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 1440) throw Error("INVALID_TIME_ADVANCE");
  const next = townMinutes(s) + minutes;
  if (!Number.isSafeInteger(next)) throw Error("INVALID_TOWN_TIME");
  s.townMinutes = next;
}
function sleepToMorning(s) {
  const m = townMinutes(s), minute3 = m % 1440;
  advanceTown(s, minute3 < 540 ? 540 - minute3 : 1980 - minute3);
}
var residentPeople = {
  avery: { name: ["\u827E\u5F17\u91CC", "Avery Reed"], unknown: ["\u7FFB\u7740\u901F\u5199\u672C\u7684\u5C45\u6C11", "Resident with a sketchbook"], intro: ["\u201C\u827E\u5F17\u91CC\u3002\u4ECA\u5929\u4E0D\u9001\u5305\u88F9\uFF0C\u8F6E\u5230\u6211\u6162\u6162\u770B\u8857\u4E0A\u4E86\u3002\u201D\u5BF9\u65B9\u628A\u4E00\u9875\u6CA1\u753B\u5B8C\u7684\u5C0F\u8239\u538B\u5728\u672C\u5B50\u91CC\u3002", "\u201CAvery. No parcels today. My turn to look around slowly.\u201D They tuck an unfinished drawing of a boat into a notebook."], art: "avery" },
  samira: { name: ["\u8428\u7C73\u62C9", "Samira Bell"], unknown: ["\u8F7B\u8F7B\u54FC\u6B4C\u7684\u5C45\u6C11", "Resident humming softly"], intro: ["\u201C\u8428\u7C73\u62C9\uFF0C\u6211\u5728\u5B66\u6821\u98DF\u5802\u505A\u996D\u3002\u4ECA\u5929\u4E0D\u7528\u542C\u6253\u996D\u94C3\u3002\u201D\u5979\u7B11\u4E86\u4E00\u4E0B\uFF0C\u53C8\u628A\u521A\u624D\u54FC\u5230\u4E00\u534A\u7684\u8C03\u5B50\u54BD\u56DE\u53BB\u3002", "\u201CSamira. I cook at the school. No lunch bell today.\u201D She smiles, then swallows the tune she was humming."], art: "samira" },
  owen: { name: ["\u6B27\u6587", "Owen Price"], unknown: ["\u4FA7\u8033\u542C\u6D77\u9E1F\u7684\u5C45\u6C11", "Resident listening for birds"], intro: ["\u201C\u6B27\u6587\u3002\u4EE5\u524D\u4FEE\u516C\u4EA4\u8F66\uFF0C\u73B0\u5728\u7EC3\u4E60\u5206\u6E05\u6D77\u9E1F\u7684\u53EB\u58F0\u3002\u4E24\u6837\u90FD\u5F97\u5148\u542C\uFF0C\u522B\u6025\u7740\u62C6\u3002\u201D", "\u201COwen. Used to repair buses. Now I try to tell seabirds apart. Both start with listening, before taking anything to pieces.\u201D"], art: "owen" },
  dani: { name: ["\u4E39\u59AE", "Dani Costa"], unknown: ["\u6536\u597D\u4E00\u7247\u53F6\u5B50\u7684\u5C45\u6C11", "Resident saving a fallen leaf"], intro: ["\u201C\u4E39\u59AE\uFF0C\u5728\u56FE\u4E66\u9986\u5DE5\u4F5C\u3002\u6211\u60F3\u505A\u672C\u5C0F\u518C\u5B50\uFF0C\u6536\u4E00\u70B9\u8857\u574A\u79CD\u82B1\u7684\u6545\u4E8B\u3002\u4ECA\u5929\u8FD9\u9875\u53EA\u6709\u4E00\u7247\u53F6\u5B50\uFF0C\u4E5F\u633A\u597D\u3002\u201D", "\u201CDani. I work at the library. I\u2019m making a little book of neighbors\u2019 garden stories. Today\u2019s page has just one leaf. That\u2019s fine too.\u201D"], art: "dani" }
};
var residentRoutes = {
  ...nextRoutes,
  ...techRoutes,
  ...chapelPriestRoutes,
  mara: [{ scene: "station", at: { x: 565, y: 685 } }, { scene: "courtyard", at: { x: 365, y: 500 } }, { scene: "market", at: { x: 560, y: 650 } }],
  theo: [{ scene: "cafe", at: { x: 579, y: 330 } }, { scene: "cafe", at: { x: 579, y: 330 } }, { scene: "harbor", at: { x: 500, y: 640 } }],
  june: [{ scene: "workshop", at: { x: 510, y: 358 } }, { scene: "workshop", at: { x: 510, y: 358 } }, { scene: "dock", at: { x: 370, y: 490 } }],
  idris: [{ scene: "gym", at: { x: 443, y: 380 } }, { scene: "gym", at: { x: 443, y: 380 } }, { scene: "coast", at: { x: 670, y: 580 } }],
  luis: [{ scene: "grocery", at: { x: 552, y: 376 } }, { scene: "grocery", at: { x: 552, y: 376 } }, { scene: "market", at: { x: 690, y: 650 } }],
  nell: [{ scene: "secondhand", at: { x: 510, y: 380 } }, { scene: "secondhand", at: { x: 510, y: 380 } }, { scene: "courtyard", at: { x: 350, y: 500 } }],
  ruth: [{ scene: "dock", at: { x: 390, y: 350 } }, { scene: "dock", at: { x: 390, y: 350 } }, { scene: "coast", at: { x: 520, y: 650 } }],
  elena: [{ scene: "courtyard", at: { x: 495, y: 370 } }, { scene: "garden", at: { x: 535, y: 510 } }, { scene: "courtyard", at: { x: 495, y: 370 } }],
  arthur: [{ scene: "weather", at: { x: 510, y: 365 } }, { scene: "weather", at: { x: 510, y: 365 } }, { scene: "hill", at: { x: 700, y: 620 } }],
  avery: [{ scene: "station", at: { x: 520, y: 490 } }, { scene: "market", at: { x: 650, y: 520 } }, { scene: "dock", at: { x: 560, y: 450 } }],
  samira: [{ scene: "market", at: { x: 550, y: 430 } }, { scene: "chapel", at: { x: 600, y: 400 } }, { scene: "dock", at: { x: 505, y: 450 } }],
  owen: [{ scene: "harbor", at: { x: 680, y: 540 } }, { scene: "path", at: { x: 360, y: 480 } }, { scene: "coast", at: { x: 600, y: 600 } }],
  dani: [{ scene: "garden", at: { x: 430, y: 510 } }, { scene: "chapel", at: { x: 355, y: 405 } }, { scene: "courtyard", at: { x: 540, y: 480 } }]
};
function residentHere(s, person, scene) {
  if (neighborPartyActive(s) && s.neighborChapterV1?.party?.people.includes(person)) return s.neighborChapterV1.party.scene === scene;
  const nomad = nomadSchedule(person, s);
  if (nomad) return nomad.scene === scene;
  if (person === "mara" && s.flags && !s.flags.includes("bag-returned")) return scene === "station";
  const route2 = residentRoutes[person];
  return !route2 || route2[["morning", "afternoon", "evening"].indexOf(townPeriod(s))]?.scene === scene;
}
function presentEntity(s, e) {
  if (e.id === fernSlot.id && !s.flags?.includes(fernOwnedFlag)) return false;
  const party = neighborPartyActive(s) && s.neighborChapterV1?.party, guest = !!party && !!e.person && party.people.includes(e.person);
  if (e.gatheringRole === "guest") return guest && party.scene === s.scene;
  if (guest) return e.gatheringRole === "routine" && party.scene === s.scene;
  return !e.person || techNomadAdmitted(e.person) && residentHere(s, e.person, s.scene);
}
var oldLife = {
  mara: { label: ["\u4F60\u4F11\u606F\u65F6\u559C\u6B22\u505A\u4EC0\u4E48\uFF1F", "What do you enjoy on a day off?"], reply: ["\u201C\u6CBF\u8857\u770B\u8C01\u5BB6\u7684\u7A97\u53F0\u6DFB\u4E86\u65B0\u82B1\u3002\u4EE5\u524D\u603B\u60F3\u7ED9\u4EBA\u63D0\u5EFA\u8BAE\uFF0C\u73B0\u5728\u5B66\u4F1A\u53EA\u8BF4\u597D\u770B\u4E86\u3002\u201D", "\u201CLooking for new flowers on the windowsills. I used to offer advice. Now I mostly say they look lovely.\u201D"] },
  theo: { label: ["\u4E0B\u73ED\u540E\u8FD8\u60F3\u559D\u5496\u5561\u5417\uFF1F", "Do you want coffee after work?"], reply: ["\u201C\u60F3\u559D\u522B\u4EBA\u6CE1\u7684\u3002\u6700\u597D\u4E0D\u7528\u6211\u6536\u676F\u5B50\u3002\u6211\u6700\u8FD1\u5728\u5B66\u628A\u9762\u5305\u70E4\u5F97\u6CA1\u90A3\u4E48\u786C\u3002\u201D", "\u201CSomeone else\u2019s coffee. Preferably without washing the cup. Lately I\u2019m learning to bake bread that doesn\u2019t fight back.\u201D"] },
  june: { label: ["\u6709\u4EC0\u4E48\u4E1C\u897F\u4F60\u820D\u4E0D\u5F97\u4FEE\u6389\u75D5\u8FF9\uFF1F", "Is there anything you leave worn?"], reply: ["\u201C\u6211\u7238\u90A3\u628A\u9524\u5B50\u7684\u67C4\u3002\u51F9\u75D5\u521A\u597D\u8D34\u7740\u624B\u3002\u4E0D\u662F\u6240\u6709\u65E7\u4E1C\u897F\u90FD\u8981\u6062\u590D\u6210\u65B0\u7684\u3002\u201D", "\u201CThe handle of Dad\u2019s hammer. The dents fit my hand. Not everything old needs to look new.\u201D"] },
  idris: { label: ["\u4ECA\u5929\u7EC3\u4E60\u4EE5\u5916\u6709\u4EC0\u4E48\u6253\u7B97\uFF1F", "Any plans outside practice?"], reply: ["\u201C\u7ED9\u7A97\u8FB9\u90A3\u76C6\u690D\u7269\u6362\u571F\u3002\u6211\u80FD\u8BB0\u4F4F\u6240\u6709\u6B65\u6CD5\uFF0C\u5374\u603B\u8BB0\u4E0D\u4F4F\u4E0A\u6B21\u4EC0\u4E48\u65F6\u5019\u6D47\u4E86\u6C34\u3002\u201D", "\u201CRepotting the plant by my window. I remember every footwork drill, but never when I last watered it.\u201D"] },
  ruth: { label: ["\u9664\u4E86\u9C7C\uFF0C\u4F60\u8FD8\u559C\u6B22\u770B\u4EC0\u4E48\uFF1F", "What do you watch besides fish?"], reply: ["\u201C\u4EBA\u7684\u978B\u3002\u8D70\u5230\u8FD9\u513F\u8FD8\u4E00\u5C18\u4E0D\u67D3\u7684\uFF0C\u591A\u534A\u53EA\u8D70\u4E86\u5927\u8DEF\u3002\u978B\u5C16\u6CBE\u7740\u8349\u7C7D\u7684\uFF0C\u4ECA\u5929\u51C6\u6709\u6545\u4E8B\u3002\u201D", "\u201CPeople\u2019s shoes. Spotless ones stayed on the main road. Grass seeds on the toes usually mean a story.\u201D"] },
  luis: { label: ["\u4F60\u81EA\u5DF1\u6700\u7231\u5403\u4EC0\u4E48\uFF1F", "What do you cook for yourself?"], reply: ["\u201C\u5356\u5269\u7684\u756A\u8304\u716E\u6C64\u3002\u6BCF\u9505\u90FD\u4E0D\u4E00\u6837\u3002\u6211\u4F1A\u591A\u505A\u4E00\u7897\uFF0C\u5076\u5C14\u6709\u90BB\u5C45\u6B63\u597D\u6765\u5750\u5750\u3002\u201D", "\u201CSoup from the leftover tomatoes. Never the same twice. I make an extra bowl in case a neighbor drops in.\u201D"] },
  nell: { label: ["\u4F60\u4F1A\u7559\u4E0B\u54EA\u4E9B\u4E0D\u5356\u7684\u4E1C\u897F\uFF1F", "What do you keep off the shelves?"], reply: ["\u201C\u4E00\u5F20\u6CA1\u4EBA\u5199\u5B57\u7684\u660E\u4FE1\u7247\u3002\u6BCF\u6B21\u8981\u5BC4\uFF0C\u53C8\u89C9\u5F97\u5E94\u8BE5\u4EB2\u53E3\u8BF4\u3002\u4E00\u76F4\u7559\u5230\u73B0\u5728\u3002\u201D", "\u201CAn unwritten postcard. Every time I mean to send it, I think I should say it in person. So it stays.\u201D"] },
  elena: { label: ["\u79CD\u82B1\u8BA9\u4F60\u6700\u5F00\u5FC3\u7684\u662F\u4EC0\u4E48\uFF1F", "What do you enjoy about gardening?"], reply: ["\u201C\u4E0D\u662F\u5F00\u5F97\u6700\u591A\u90A3\u5929\u3002\u662F\u65B0\u53F6\u521A\u5192\u51FA\u6765\uFF0C\u53EA\u6709\u4F60\u6CE8\u610F\u5230\u90A3\u5929\u3002\u201D", "\u201CNot the day with the most flowers. The day a new leaf appears and only you notice.\u201D"] },
  arthur: { label: ["\u4F60\u4E5F\u4F1A\u6709\u4E0D\u8BB0\u5929\u6C14\u7684\u4E00\u5929\u5417\uFF1F", "Do you ever leave the weather unrecorded?"], reply: ["\u201C\u6709\u3002\u90A3\u5929\u6211\u53EA\u770B\u4E91\uFF0C\u4E0D\u5199\u6570\u5B57\u3002\u8981\u4E0D\u7136\u4E00\u8F88\u5B50\u90FD\u50CF\u8FD8\u6CA1\u4E0B\u73ED\u3002\u201D", "\u201CYes. I just watch the clouds that day. Otherwise it feels as if I never retired.\u201D"] }
};
function patrolRadius(person) {
  return person === "idris" ? 40 : person && residentRoutes[person] ? 24 : 0;
}
function observedActor(e, point3) {
  if (!point3) return e.at;
  const r = patrolRadius(e.person);
  if (!Number.isFinite(point3.x) || !Number.isFinite(point3.y) || Math.abs(point3.y - e.at.y) > 0.1 || Math.abs(point3.x - e.at.x) > r + 0.1) throw Error("INVALID_ACTOR_POSITION");
  return point3;
}

// src/story/crops.ts
var crops = { radish: { name: ["\u841D\u535C", "Radish"], minutes: 360, cost: 3, yield: 2, price: 3 }, basil: { name: ["\u7F57\u52D2", "Basil"], minutes: 720, cost: 5, yield: 3, price: 3 }, tomato: { name: ["\u756A\u8304", "Tomato"], minutes: 1440, cost: 8, yield: 4, price: 4 } };
var plotIds = ["crop-bed-1", "crop-bed-2", "crop-bed-3"];
var cropVerbs = ["claim-seeds", "water-crop", "harvest-crop", ...Object.keys(crops).map((id) => "plant:" + id)];
var shopVerbs = Object.keys(crops).flatMap((id) => ["buy-seed:" + id, "sell-crop:" + id]);
var shopOpen = (s) => {
  const m = townMinutes(s) % 1440;
  return m >= 360 && m < 1020;
};
function plotStatus(s, id) {
  const p = s.plots?.[id];
  if (!p) return null;
  const c = crops[p.crop], now2 = townMinutes(s), grown = Math.min(c.minutes, p.grown + Math.max(0, Math.min(now2, p.wetUntil) - p.updatedAt));
  return { ...p, grown, remaining: c.minutes - grown, ready: grown >= c.minutes, needsWater: grown < c.minutes && now2 >= p.wetUntil };
}
function cropChoices(s, target) {
  if (target === "crop-counter") return shopOpen(s) ? Object.entries(crops).flatMap(([id, c]) => [{ id: "buy-seed:" + id, label: [`\u4E70${c.name[0]}\u79CD\u5B50 \xB7 $${c.cost}`, `Buy ${c.name[1]} seed \xB7 $${c.cost}`] }, ...s.items["crop-" + id] > 0 ? [{ id: "sell-crop:" + id, label: [`\u53561\u4EFD${c.name[0]} \xB7 +$${c.price}`, `Sell 1 ${c.name[1]} \xB7 +$${c.price}`] }] : []]) : [];
  if (!plotIds.includes(target)) return [];
  const p = plotStatus(s, target);
  return [...!s.flags.includes("crop-starter") ? [{ id: "claim-seeds", label: ["\u9886\u53D6\u514D\u8D39\u79CD\u5B50\u5305\uFF08\u54041\u9897\uFF09", "Collect free starter seeds (one of each)"] }] : [], ...!p ? Object.entries(crops).filter(([id]) => s.items["seed-" + id] > 0).map(([id, c]) => ({ id: "plant:" + id, label: [`\u64AD\u79CD${c.name[0]} \xB7 ${c.minutes / 60}\u5C0F\u65F6`, `Plant ${c.name[1]} \xB7 ${c.minutes / 60} hours`] })) : p.ready ? [{ id: "harvest-crop", label: ["\u6536\u83B7\u5E76\u653E\u5165\u884C\u56CA", "Harvest into your bag"] }] : p.needsWater ? [{ id: "water-crop", label: ["\u6D47\u6C34 \xB7 \u53EF\u6E7F\u6DA6\u751F\u957F12\u5C0F\u65F6", "Water \xB7 12 hours of growth"] }] : []];
}
var cropItems = Object.fromEntries(Object.entries(crops).flatMap(([id, c]) => [["seed-" + id, { name: [c.name[0] + "\u79CD\u5B50", c.name[1] + " seed"], description: [`\u5728\u5C71\u5761\u82B1\u56ED\u64AD\u79CD\uFF1B\u6E7F\u6DA6\u751F\u957F${c.minutes / 60}\u5C0F\u65F6\u540E\u6536\u83B7\u3002`, `Plant at Hillside Garden; harvest after ${c.minutes / 60} hours of watered growth.`], kind: "objects" }], ["crop-" + id, { name: c.name, description: [`\u53EF\u5728\u8857\u89D2\u6742\u8D27\u94FA06:00\u201317:00\u51FA\u552E\uFF0C\u6BCF\u4EFD$${c.price}\u3002\u4E0D\u4F1A\u8150\u574F\u3002`, `Sell at Corner Grocer, 06:00\u201317:00, for $${c.price} each. Does not spoil.`], kind: "objects" }]]));
function applyCrop(s, target, verb) {
  const fail7 = (condition, code) => {
    if (!condition) throw Error(code);
  };
  fail7(cropChoices(s, target).some((c2) => c2.id === verb), target === "crop-counter" && !shopOpen(s) ? "SHOP_CLOSED" : "CROP_ACTION_UNAVAILABLE");
  if (verb === "claim-seeds") {
    for (const id2 of Object.keys(crops)) s.items["seed-" + id2] = (s.items["seed-" + id2] ?? 0) + 1;
    s.flags.push("crop-starter");
    return ["\u4E09\u79CD\u79CD\u5B50\u653E\u8FDB\u884C\u56CA\u4E86\u3002\u5148\u9009\u4E00\u5757\u83DC\u7566\u79CD\u4E0B\uFF0C\u518D\u6D47\u6C34\u3002\u6210\u719F\u540E\u5E26\u5230\u8857\u89D2\u6742\u8D27\u94FA\u51FA\u552E\u3002", "Three kinds of seeds go into your bag. Plant one bed, then water it. Sell the harvest at Corner Grocer."];
  }
  const [action, id] = verb.split(":");
  const c = crops[id];
  if (action === "buy-seed") {
    fail7(s.cash >= c.cost, "NOT_ENOUGH_CASH");
    s.cash -= c.cost;
    s.items["seed-" + id] = (s.items["seed-" + id] ?? 0) + 1;
    return [`\u4F60\u4E70\u4E861\u9897${c.name[0]}\u79CD\u5B50\u3002`, `You bought one ${c.name[1]} seed.`];
  }
  if (action === "sell-crop") {
    fail7(s.cash + c.price <= 999, "PURSE_FULL");
    s.items["crop-" + id]--;
    if (!s.items["crop-" + id]) delete s.items["crop-" + id];
    s.cash += c.price;
    return [`\u552E\u51FA1\u4EFD${c.name[0]}\uFF0C\u6536\u5165$${c.price}\u3002\u53EF\u4EE5\u8D2D\u79CD\u518D\u79CD\u4E00\u8F6E\u3002`, `Sold one ${c.name[1]} for $${c.price}. You can buy seed for another crop.`];
  }
  fail7(s.energy >= 2, "REST_NEEDED");
  s.energy -= 2;
  const now2 = townMinutes(s);
  s.plots ??= {};
  if (action === "plant") {
    s.items["seed-" + id]--;
    if (!s.items["seed-" + id]) delete s.items["seed-" + id];
    s.plots[target] = { crop: id, grown: 0, updatedAt: now2, wetUntil: now2 };
    return [`${c.name[0]}\u5DF2\u64AD\u79CD\u3002\u73B0\u5728\u7ED9\u5B83\u6D47\u6C34\uFF0C\u624D\u4F1A\u5F00\u59CB\u751F\u957F\u3002`, `${c.name[1]} is planted. Water it now to start growth.`];
  }
  const p = plotStatus(s, target);
  if (verb === "water-crop") {
    s.plots[target] = { crop: p.crop, grown: p.grown, updatedAt: now2, wetUntil: now2 + 720 };
    return ["\u6C34\u6E17\u8FDB\u571F\u91CC\uFF0C\u53EF\u4F9B\u5341\u4E8C\u5C0F\u65F6\u751F\u957F\u3002\u571F\u5E72\u540E\u53EA\u6682\u505C\uFF0C\u4E0D\u4F1A\u67AF\u6B7B\u3002", "The watered soil supports twelve hours of growth. Dry soil only pauses growth; the crop will not die."];
  }
  const crop = crops[p.crop];
  s.items["crop-" + p.crop] = (s.items["crop-" + p.crop] ?? 0) + crop.yield;
  delete s.plots[target];
  return [`${crop.yield}\u4EFD${crop.name[0]}\u653E\u8FDB\u884C\u56CA\u3002\u53BB\u8F66\u7AD9\u8857\u7684\u6742\u8D27\u94FA\uFF0C06:00\u201317:00\u53EF\u4EE5\u5356\u7ED9\u5E97\u4E3B\u3002`, `${crop.yield} ${crop.name[1]} go into your bag. Sell them at Corner Grocer on Station Street, 06:00\u201317:00.`];
}
function validPlots(s) {
  return s.plots === void 0 || !!s.plots && typeof s.plots === "object" && !Array.isArray(s.plots) && Object.entries(s.plots).every(([id, p]) => plotIds.includes(id) && p && Object.hasOwn(crops, p.crop) && [p.grown, p.updatedAt, p.wetUntil].every((n) => Number.isSafeInteger(n) && n >= 0) && p.updatedAt <= townMinutes(s) && p.grown <= crops[p.crop].minutes && p.wetUntil <= p.updatedAt + 720);
}

// src/world/planting.ts
function enrichPlanting(rooms3) {
  const add = (scene, art, x, y, width, fw = 0, fh = 0) => {
    rooms3[scene].props.push({ id: `flora-${rooms3[scene].props.length}`, art: `flora-${art}-v1`, at: { x, y }, width, ...art === "clover" ? { floorDecoration: true } : {}, ...fw ? { footprint: { x: x - fw / 2, y: y - fh, w: fw, h: fh } } : {} });
  };
  const change = (scene, id, art, width, fw, fh) => {
    const p = rooms3[scene].props.find((p2) => p2.id === id);
    p.art = `flora-${art}-v1`;
    p.width = width;
    p.footprint = { x: p.at.x - fw / 2, y: p.at.y - fh, w: fw, h: fh };
  };
  change("station", "tree-west", "maple", 158, 21, 14);
  const streetTree = rooms3.station.props.find((p) => p.id === "tree-west");
  streetTree.at = { x: 105, y: 685 };
  streetTree.footprint = { x: 94.5, y: 671, w: 21, h: 14 };
  for (const [x, y, w] of [[280, 849, 37], [383, 868, 42], [1020, 748, 38]]) add("station", "clover", x, y, w);
  add("station", "rose", 267, 793, 49);
  add("station", "fern", 367, 866, 34);
  add("station", "rose", 1190, 890, 43);
  change("market", "landscape-3", "maple", 151, 22, 14);
  add("market", "rose", 752, 951, 52);
  add("market", "fern", 859, 876, 34);
  add("market", "clover", 795, 950, 48);
  add("market", "clover", 889, 926, 44);
  add("market", "rose", 1100, 786, 45);
  add("harbor", "pot-rubber", 1102, 380, 29, 16, 12);
  add("harbor", "herbs", 1020, 548, 31, 25, 12);
  add("dock", "herbs", 632, 329, 33, 27, 12);
  add("coast", "rose", 858, 839, 50);
  add("coast", "clover", 804, 858, 42);
  add("coast", "fern", 348, 386, 33);
  add("coast", "rose", 963, 386, 43);
  add("coast", "clover", 965, 410, 35);
  add("beach", "rose", 273, 305, 45);
  add("beach", "clover", 256, 331, 28);
  change("hill", "landscape-1", "cedar", 64, 18, 12);
  add("hill", "maple", 954, 710, 132, 20, 13);
  add("hill", "fern", 1090, 805, 38);
  add("hill", "fern", 412, 477, 39);
  add("hill", "clover", 467, 493, 49);
  add("hill", "clover", 946, 838, 43);
  add("hill", "rose", 1127, 370, 49);
  change("camp", "shade-west", "cedar", 61, 18, 12);
  add("camp", "fern", 178, 389, 34);
  add("camp", "fern", 767, 568, 37);
  add("camp", "clover", 744, 598, 46);
  add("camp", "clover", 228, 403, 39);
  add("camp", "cedar", 159, 619, 54, 16, 11);
  add("courtyard", "rose", 736, 576, 47);
  add("courtyard", "fern", 221, 402, 37);
  add("courtyard", "clover", 208, 435, 43);
  add("courtyard", "herbs", 632, 294, 35, 29, 12);
  add("garden", "rose", 742, 646, 47);
  add("garden", "clover", 796, 655, 42);
  add("garden", "fern", 182, 390, 37);
  add("garden", "herbs", 188, 580, 34, 28, 12);
  add("garden", "maple", 852, 363, 120, 18, 12);
  add("bazaar", "rose", 788, 667, 45);
  add("bazaar", "clover", 833, 670, 36);
  add("bazaar", "fern", 171, 550, 38);
  add("bazaar", "herbs", 311, 298, 31, 26, 12);
  add("path", "reeds", 545, 254, 32);
  add("path", "reeds", 413, 252, 27);
  add("path", "fern", 225, 644, 37);
  add("path", "clover", 249, 664, 43);
  change("home", "fern", "pot-rubber", 30, 16, 12);
  change("cafe", "fern", "pot-rubber", 32, 17, 12);
  add("grocery", "herbs", 590, 528, 29, 24, 11);
  add("workshop", "pot-rubber", 646, 299, 27, 14, 10);
  change("gym", "fern", "pot-rubber", 30, 16, 12);
  add("secondhand", "pot-rubber", 643, 515, 29, 16, 12);
  add("weather", "herbs", 604, 511, 29, 24, 11);
  add("lighthouse", "pot-rubber", 329, 310, 28, 15, 11);
  change("workshop-annex-1", "green", "pot-rubber", 29, 16, 11);
  change("workshop-annex-2", "green", "herbs", 32, 26, 12);
}

// src/world/scene-use.ts
function organizeDailyLife(rooms3) {
  const move2 = (scene, id, x, y) => {
    const p = rooms3[scene].props.find((p2) => p2.id === id);
    if (!p) throw Error(`Missing ${scene}/${id}`);
    const dx = x - p.at.x, dy = y - p.at.y;
    p.at = { x, y };
    if (p.footprint) p.footprint = { ...p.footprint, x: p.footprint.x + dx, y: p.footprint.y + dy };
  };
  const put = (scene, id, art, x, y, width, fw = 0, fh = 0) => rooms3[scene].props.push({ id: "use-" + id, art, at: { x, y }, width, ...fw && fh ? { footprint: { x: x - fw / 2, y: y - fh, w: fw, h: fh } } : {} });
  const drop = (scene, ...ids) => rooms3[scene].props = rooms3[scene].props.filter((p) => !ids.includes(p.id));
  const type = (scene, id, art, width, fw, fh) => {
    const p = rooms3[scene].props.find((p2) => p2.id === id);
    p.art = art;
    p.width = width;
    p.footprint = { x: p.at.x - fw / 2, y: p.at.y - fh, w: fw, h: fh };
  };
  const person = (scene, id, x, y) => {
    const e = rooms3[scene].entities.find((e2) => e2.id === id);
    e.at = { x, y };
    e.approach = { x: x - 8, y: y + 42 };
  };
  move2("home", "books-and-linen", 332, 303);
  move2("home", "life-bedside", 332, 345);
  drop("home", "bag");
  put("home", "unpacking", "life-open-luggage-v1", 429, 433, 47, 38, 19);
  move2("home", "breakfast", 577, 401);
  move2("home", "chair", 577, 425);
  move2("home", "life-reading-shelf", 630, 350);
  move2("home", "fern", 638, 423);
  move2("home", "summer-coat", 626, 533);
  move2("home", "woven-rug", 395, 447);
  rooms3.home.props.find((p) => p.id === "woven-rug").width = 167;
  type("home", "entry-planter", "plant", 28, 15, 12);
  move2("home", "entry-planter", 316, 527);
  put("home", "washing", "life-washstand-v1", 328, 501, 39, 33, 19);
  move2("cafe", "pantry", 365, 315);
  move2("cafe", "life-quiet-chair", 450, 429);
  move2("cafe", "table-a", 450, 465);
  move2("cafe", "chair-b", 615, 508);
  move2("cafe", "chair-a", 410, 469);
  move2("cafe", "woven-rug", 527, 533);
  rooms3.cafe.props.find((p) => p.id === "woven-rug").width = 255;
  put("cafe", "used-cups", "life-cup-cart-v1", 310, 396, 37, 31, 20);
  person("cafe", "theo", 579, 330);
  move2("workshop", "tools", 407, 342);
  move2("workshop", "tool-storage", 490, 299);
  move2("workshop", "spares", 616, 377);
  move2("workshop", "wood-stock", 323, 521);
  move2("workshop", "bench", 369, 450);
  drop("workshop", "life-repair-bicycle");
  put("workshop", "active-repair", "life-repair-stand-v1", 602, 462, 79, 64, 25);
  person("workshop", "june", 510, 358);
  move2("grocery", "counter", 402, 320);
  move2("grocery", "shelf", 552, 300);
  move2("grocery", "rest", 363, 425);
  move2("grocery", "storage", 632, 346);
  move2("grocery", "plants", 627, 528);
  person("grocery", "luis", 552, 376);
  move2("gym", "gloves", 568, 345);
  move2("gym", "life-punchbag", 348, 330);
  move2("gym", "towel-shelf", 615, 430);
  move2("gym", "rest", 600, 489);
  move2("gym", "fern", 647, 512);
  person("gym", "idris", 443, 380);
  move2("secondhand", "old-coat", 333, 325);
  move2("secondhand", "old-luggage", 330, 378);
  move2("secondhand", "book-shelf", 608, 333);
  move2("secondhand", "bench", 606, 435);
  move2("secondhand", "life-books", 347, 513);
  move2("secondhand", "chair", 390, 388);
  type("secondhand", "chair", "dining-chair-back-v1", 23, 19, 17);
  move2("weather", "records", 596, 339);
  move2("weather", "life-archived-logs", 318, 331);
  move2("weather", "rest", 597, 448);
  move2("weather", "raincoat", 637, 526);
  put("weather", "chart-board", "life-weather-board-v1", 484, 289, 65, 54, 15);
  put("weather", "record-chair", "dining-chair-back-v1", 352, 378, 23, 19, 17);
  move2("lighthouse", "chart-table", 603, 323);
  move2("lighthouse", "records", 608, 430);
  move2("lighthouse", "keeper-coat", 325, 523);
  move2("lighthouse", "bench", 359, 450);
  put("lighthouse", "keeper-tools", "fishing-kit", 653, 485, 34, 28, 17);
  for (const id of ["workshop-annex-1", "workshop-annex-2"]) move2(id, "green", 636, 330);
  put("workshop-annex-1", "parts", "harbor-crates", 325, 440, 37, 29, 18);
  put("workshop-annex-2", "archives", "interior-bookcase-v1", 631, 310, 53, 46, 18);
  move2("station", "tree-south", 341, 830);
  move2("station", "arrival-bench", 439, 774);
  move2("station", "arrival-flowers", 470, 815);
  move2("station", "birch-arrival", 350, 735);
  move2("station", "life-wildflowers-0", 355, 816);
  move2("station", "life-wildflowers-1", 320, 784);
  move2("station", "bench-square", 920, 690);
  move2("station", "life-hydrangea-2", 945, 745);
  move2("station", "life-sapling-2", 1162, 742);
  move2("station", "life-wildflowers-2", 1066, 699);
  move2("harbor", "life-stored-boat", 385, 725);
  move2("harbor", "crates-b", 505, 729);
  put("harbor", "nets", "life-net-rack-v1", 258, 699, 90, 76, 17);
  move2("harbor", "crates-a", 202, 610);
  move2("harbor", "life-juniper-0", 1094, 349);
  move2("harbor", "quay-planter", 992, 573);
  move2("market", "life-market-produce", 420, 601);
  move2("market", "life-customer-bicycle", 1016, 718);
  move2("market", "square-bench", 780, 891);
  move2("market", "square-birch", 729, 833);
  move2("market", "life-broadleaf-0", 841, 846);
  move2("market", "life-wildflowers-1", 887, 888);
  type("coast", "view-bench", "bench", 68, 58, 14);
  move2("coast", "life-pulled-up-boat", 292, 725);
  put("coast", "rope-kit", "fishing-kit", 395, 743, 37, 30, 19);
  move2("coast", "life-juniper-0", 326, 351);
  move2("coast", "life-juniper-1", 840, 802);
  move2("coast", "life-beachgrass-0", 244, 772);
  move2("coast", "life-beachgrass-1", 377, 792);
  move2("coast", "life-sapling-0", 1030, 379);
  move2("hill", "life-sapling-0", 358, 423);
  move2("hill", "life-juniper-0", 397, 455);
  move2("hill", "life-wildflowers-0", 508, 454);
  move2("hill", "life-sapling-2", 236, 789);
  move2("hill", "life-juniper-2", 1117, 777);
  move2("hill", "life-wildflowers-3", 194, 795);
  move2("garden", "life-vegetable-bed", 330, 535);
  move2("garden", "life-seedling-bed", 330, 615);
  move2("garden", "life-wheelbarrow", 230, 600);
  move2("garden", "life-sapling-0", 143, 625);
  put("garden", "potting", "life-potting-bench-v1", 205, 525, 79, 66, 25);
  move2("garden", "life-hydrangea-2", 683, 495);
  move2("garden", "garden-seat", 641, 457);
  move2("garden", "life-wildflowers-1", 677, 541);
  move2("camp", "life-cooking", 618, 383);
  move2("camp", "picnic-crate", 713, 390);
  move2("camp", "rest", 620, 477);
  type("camp", "rest", "bench-back-v3", 76, 66, 14);
  put("camp", "cold-fire", "life-cold-firepit-v1", 574, 420, 48, 39, 21);
  move2("camp", "life-juniper-0", 278, 349);
  move2("camp", "life-wildflowers-0", 285, 379);
  move2("courtyard", "bench", 624, 442);
  move2("courtyard", "life-garden-cycle", 698, 475);
  move2("courtyard", "flowers", 650, 366);
  move2("courtyard", "life-hydrangea-0", 595, 522);
  put("courtyard", "shared-seat", "bench", 572, 351, 68, 58, 14);
  move2("bazaar", "life-produce", 328, 376);
  move2("bazaar", "life-record-sale", 694, 388);
  move2("bazaar", "empty-bench", 710, 594);
  type("beach", "shore-seat", "bench", 68, 58, 14);
  move2("beach", "life-rowboat", 610, 440);
  put("beach", "drying-net", "life-net-rack-v1", 515, 364, 93, 78, 18);
  move2("beach", "life-beachgrass-0", 186, 327);
  move2("beach", "life-beachgrass-1", 212, 368);
  move2("beach", "life-beachgrass-2", 695, 530);
  move2("beach", "life-beachgrass-3", 749, 536);
  move2("path", "life-juniper-0", 365, 265);
  move2("path", "life-beachgrass-1", 392, 253);
  move2("path", "life-wildflowers-0", 193, 563);
  move2("path", "life-juniper-2", 258, 613);
  put("path", "repair-stock", "driftwood", 310, 409, 42, 35, 17);
  move2("dock", "tackle", 451, 350);
  move2("dock", "bench", 587, 390);
  move2("dock", "rope-crates", 608, 294);
}

// src/world/dressing.ts
function dressHarbor(rooms3) {
  const put = (scene, id, art, x, y, width, groundW = 0, groundH = 0) => {
    rooms3[scene].props.push({ id: "life-" + id, art, at: { x, y }, width, ...groundW && groundH ? { footprint: { x: x - groundW / 2, y: y - groundH, w: groundW, h: groundH } } : {} });
  };
  const replace = (scene, id, art, width, groundW, groundH) => {
    const p = rooms3[scene].props.find((p2) => p2.id === id);
    if (!p) throw Error(`Missing furnishing ${scene}/${id}`);
    p.art = art;
    p.width = width;
    p.footprint = { x: p.at.x - groundW / 2, y: p.at.y - groundH, w: groundW, h: groundH };
  };
  const remove = (scene, ...ids) => {
    rooms3[scene].props = rooms3[scene].props.filter((p) => !ids.includes(p.id));
  };
  const greenery = (scene, kind, points) => {
    for (const [i, [x, y, w]] of points.entries()) put(scene, `${kind}-${i}`, `nature-${kind}-v1`, x, y, w, kind === "sapling" ? 9 : kind === "broadleaf" ? 24 : 0, kind === "sapling" ? 8 : kind === "broadleaf" ? 16 : 0);
  };
  replace("home", "books-and-linen", "home-wardrobe-v1", 43, 37, 17);
  put("home", "bedside", "home-bedside-v1", 324, 389, 24, 20, 13);
  replace("cafe", "pantry", "cafe-pastry-v1", 84, 76, 24);
  remove("cafe", "outside-bench");
  put("cafe", "quiet-chair", "wooden-chair", 330, 485, 23, 19, 17);
  replace("grocery", "rest", "grocery-produce-v1", 77, 68, 25);
  replace("grocery", "storage", "grocery-produce-v1", 60, 52, 20);
  replace("secondhand", "book-shelf", "secondhand-records-v1", 82, 72, 24);
  replace("secondhand", "old-coat", "secondhand-clothing-v1", 57, 50, 16);
  replace("weather", "records", "weather-instruments-v1", 72, 64, 23);
  replace("lighthouse", "records", "lighthouse-lanterns-v1", 78, 68, 24);
  replace("gym", "towel-shelf", "gym-towels-v1", 72, 64, 21);
  remove("gym", "club-coat");
  put("gym", "punchbag", "gym-punchbag-v1", 634, 338, 23, 21, 15);
  replace("workshop", "spares", "workshop-tires-v1", 65, 57, 27);
  remove("workshop", "coat");
  put("workshop", "repair-bicycle", "town-bicycle-v1", 637, 531, 66, 60, 15);
  replace("workshop-annex-1", "desk-b", "workshop-tires-v1", 75, 65, 29);
  replace("workshop-annex-2", "desk-b", "secondhand-records-v1", 73, 63, 24);
  for (const id of ["workshop-annex-1", "workshop-annex-2"]) {
    const seat = rooms3[id].props.find((p) => p.id === "seat");
    seat.at.y = 494;
    replace(id, "seat", "wooden-chair", 23, 19, 17);
  }
  replace("home", "chair", "dining-chair-back-v1", 23, 19, 17);
  replace("cafe", "chair-a", "dining-chair-side-v1", 17, 14, 21);
  {
    const p = rooms3.cafe.props.find((p2) => p2.id === "chair-a");
    p.at = { x: 411, y: 462 };
    p.footprint = { x: 404, y: 441, w: 14, h: 21 };
  }
  replace("cafe", "chair-b", "dining-chair-back-v1", 23, 19, 17);
  replace("cafe", "table-a", "dining-table-front-v1", 58, 52, 25);
  rooms3.cafe.props.find((p) => p.id === "table-b").at.x = 615;
  rooms3.cafe.props.find((p) => p.id === "chair-b").at.x = 615;
  replace("cafe", "chair-b", "dining-chair-back-v1", 23, 19, 17);
  replace("cafe", "table-b", "dining-table-side-v2", 38, 34, 48);
  replace("home", "breakfast", "dining-table-front-v1", 58, 52, 25);
  put("home", "reading-shelf", "interior-bookcase-v1", 625, 270, 51, 45, 18);
  put("weather", "archived-logs", "interior-bookcase-v1", 320, 275, 54, 47, 18);
  put("secondhand", "books", "interior-bookcase-v1", 650, 545, 55, 48, 18);
  replace("station", "tree-west", "nature-broadleaf-v1", 180, 24, 16);
  greenery("station", "sapling", [[395, 375, 37], [850, 850, 40], [1150, 635, 40]]);
  greenery("station", "hydrangea", [[158, 389, 48], [336, 380, 43], [935, 640, 45], [963, 912, 44]]);
  greenery("station", "wildflowers", [[370, 693, 23], [412, 755, 25], [875, 777, 26], [1110, 955, 24]]);
  put("station", "parked-bicycle", "town-bicycle-v1", 843, 368, 69, 61, 16);
  put("harbor", "mooring-west", "harbor-bollard-v1", 680, 565, 24, 17, 13);
  put("harbor", "mooring-east", "harbor-bollard-v1", 1065, 565, 24, 17, 13);
  put("harbor", "stored-boat", "coast-rowboat-v1", 380, 745, 132, 114, 31);
  put("harbor", "repair-cycle", "town-bicycle-v1", 398, 322, 66, 58, 16);
  greenery("harbor", "juniper", [[1020, 345, 48]]);
  greenery("market", "broadleaf", [[805, 805, 165]]);
  greenery("market", "sapling", [[410, 815, 36], [1150, 440, 38]]);
  greenery("market", "hydrangea", [[145, 420, 48], [940, 390, 42], [255, 775, 45]]);
  greenery("market", "wildflowers", [[1060, 815, 24], [200, 835, 24]]);
  put("market", "market-produce", "grocery-produce-v1", 365, 654, 58, 50, 20);
  put("market", "customer-bicycle", "town-bicycle-v1", 855, 706, 66, 58, 16);
  greenery("coast", "juniper", [[330, 370, 58], [860, 580, 54], [980, 390, 47]]);
  greenery("coast", "beachgrass", [[370, 637, 24], [420, 692, 22], [670, 761, 27], [860, 744, 25], [905, 829, 23]]);
  greenery("coast", "sapling", [[760, 370, 37]]);
  put("coast", "pulled-up-boat", "coast-rowboat-v1", 285, 735, 136, 118, 32);
  greenery("hill", "broadleaf", [[438, 435, 175]]);
  greenery("hill", "sapling", [[250, 445, 38], [1190, 380, 40], [450, 790, 36]]);
  greenery("hill", "juniper", [[220, 350, 57], [935, 800, 53], [1115, 800, 55]]);
  greenery("hill", "wildflowers", [[520, 677, 23], [790, 650, 26], [1090, 345, 25], [175, 680, 22]]);
  greenery("garden", "sapling", [[180, 615, 39], [805, 615, 38]]);
  greenery("camp", "beachgrass", [[205, 597, 25], [752, 642, 24]]);
  greenery("courtyard", "juniper", [[175, 590, 54], [805, 625, 49]]);
  greenery("path", "broadleaf", [[175, 615, 165]]);
  greenery("garden", "hydrangea", [[250, 310, 46], [730, 600, 48], [355, 525, 43]]);
  greenery("garden", "wildflowers", [[200, 515, 23], [690, 485, 25]]);
  put("garden", "vegetable-bed", "garden-raised-bed-v1", 325, 568, 116, 108, 52);
  put("garden", "wheelbarrow", "garden-wheelbarrow-v1", 653, 545, 72, 57, 21);
  put("garden", "seedling-bed", "garden-raised-bed-v1", 655, 295, 99, 92, 45);
  greenery("camp", "juniper", [[275, 530, 58], [705, 595, 53], [700, 240, 49]]);
  greenery("camp", "sapling", [[315, 275, 39], [635, 590, 37]]);
  greenery("camp", "wildflowers", [[270, 455, 21], [595, 230, 24]]);
  put("camp", "cooking", "camp-cooking-v1", 655, 405, 60, 52, 24);
  greenery("courtyard", "hydrangea", [[315, 545, 47], [685, 280, 45]]);
  greenery("courtyard", "sapling", [[310, 260, 38]]);
  greenery("courtyard", "wildflowers", [[710, 585, 24], [280, 458, 23]]);
  put("courtyard", "garden-cycle", "town-bicycle-front-v1", 627, 517, 25, 18, 43);
  greenery("bazaar", "broadleaf", [[150, 510, 165]]);
  greenery("bazaar", "hydrangea", [[790, 425, 47], [700, 630, 43]]);
  greenery("bazaar", "wildflowers", [[260, 605, 23]]);
  put("bazaar", "produce", "grocery-produce-v1", 313, 385, 68, 58, 23);
  put("bazaar", "record-sale", "secondhand-records-v1", 650, 390, 63, 55, 21);
  greenery("beach", "beachgrass", [[175, 410, 23], [265, 530, 29], [330, 600, 22], [775, 567, 26], [700, 285, 24]]);
  greenery("beach", "juniper", [[620, 255, 54], [200, 240, 56]]);
  put("beach", "rowboat", "coast-rowboat-v1", 590, 463, 137, 119, 33);
  greenery("path", "juniper", [[320, 250, 55], [645, 425, 53], [350, 535, 51]]);
  greenery("path", "sapling", [[650, 245, 39]]);
  greenery("path", "wildflowers", [[220, 535, 23], [625, 555, 24]]);
  greenery("path", "beachgrass", [[705, 480, 25], [270, 465, 22]]);
  put("dock", "mooring-left", "harbor-bollard-v1", 343, 285, 24, 17, 13);
  put("dock", "mooring-right", "harbor-bollard-v1", 635, 486, 24, 17, 13);
}

// src/world/outdoors.ts
var passages = {};
function waterBarriers(layout) {
  const b = layout.bounds;
  const xs = [.../* @__PURE__ */ new Set([b.x, b.x + b.w, ...layout.patches.flatMap((p) => [Math.max(b.x, p.x), Math.min(b.x + b.w, p.x + p.w)])])].filter((x) => x >= b.x && x <= b.x + b.w).sort((a, b2) => a - b2);
  const ys = [.../* @__PURE__ */ new Set([b.y, b.y + b.h, ...layout.patches.flatMap((p) => [Math.max(b.y, p.y), Math.min(b.y + b.h, p.y + p.h)])])].filter((y) => y >= b.y && y <= b.y + b.h).sort((a, b2) => a - b2);
  const result = [];
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2;
    const top = layout.patches.slice().reverse().find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
    if (top?.material === "water") result.push({ x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] });
  }
  return result;
}
var outdoors = {
  station: { bounds: { x: 40, y: 80, w: 1280, h: 880 }, spawn: { x: 540, y: 760 }, landmark: { x: 620, y: 530 }, quietZone: { x: 750, y: 610, w: 250, h: 180 }, patches: [{ x: 40, y: 80, w: 1280, h: 880, material: "grass" }, { x: 120, y: 430, w: 1140, h: 220, material: "stone" }, { x: 480, y: 80, w: 230, h: 880, material: "stone" }, { x: 790, y: 235, w: 300, h: 210, material: "stone" }, { x: 212, y: 330, w: 75, h: 110, material: "stone" }], barriers: [{ x: 130, y: 130, w: 235, h: 210 }, { x: 790, y: 150, w: 260, h: 155 }, { x: 975, y: 690, w: 210, h: 180 }], entrances: { home: { x: 247, y: 350 }, cafe: { x: 920, y: 320 }, grocery: { x: 1080, y: 880 } }, roadExits: { harbor: { x: 1290, y: 540 }, market: { x: 585, y: 110 } } },
  harbor: { bounds: { x: 40, y: 80, w: 1280, h: 880 }, spawn: { x: 120, y: 440 }, landmark: { x: 855, y: 585 }, quietZone: { x: 520, y: 420, w: 240, h: 150 }, patches: [{ x: 40, y: 80, w: 1280, h: 880, material: "water" }, { x: 40, y: 80, w: 1080, h: 520, material: "stone" }, { x: 80, y: 570, w: 570, h: 390, material: "wood" }, { x: 750, y: 550, w: 110, h: 355, material: "wood" }], barriers: [{ x: 1150, y: 80, w: 170, h: 880 }, { x: 650, y: 635, w: 100, h: 325 }, { x: 860, y: 635, w: 290, h: 325 }, { x: 190, y: 100, w: 240, h: 175 }, { x: 680, y: 115, w: 250, h: 175 }], entrances: { dock: { x: 803, y: 835 }, workshop: { x: 300, y: 290 }, gym: { x: 802, y: 305 } }, roadExits: { station: { x: 70, y: 450 }, coast: { x: 1100, y: 450 }, hill: { x: 555, y: 110 } } },
  market: { bounds: { x: 40, y: 80, w: 1280, h: 880 }, spawn: { x: 615, y: 880 }, landmark: { x: 650, y: 490 }, quietZone: { x: 90, y: 530, w: 190, h: 200 }, patches: [{ x: 40, y: 80, w: 1280, h: 880, material: "grass" }, { x: 280, y: 220, w: 790, h: 560, material: "stone" }, { x: 500, y: 80, w: 210, h: 880, material: "stone" }, { x: 980, y: 460, w: 340, h: 160, material: "stone" }], barriers: [{ x: 120, y: 125, w: 220, h: 205 }, { x: 975, y: 145, w: 255, h: 190 }, { x: 310, y: 510, w: 100, h: 85 }, { x: 875, y: 605, w: 120, h: 80 }], entrances: { bazaar: { x: 650, y: 430 }, secondhand: { x: 232, y: 350 }, courtyard: { x: 1100, y: 355 } }, roadExits: { station: { x: 615, y: 920 }, hill: { x: 1280, y: 530 } } },
  coast: { bounds: { x: 40, y: 80, w: 1280, h: 880 }, spawn: { x: 110, y: 475 }, landmark: { x: 1070, y: 235 }, quietZone: { x: 610, y: 570, w: 280, h: 210 }, patches: [{ x: 40, y: 80, w: 1280, h: 880, material: "water" }, { x: 40, y: 80, w: 1280, h: 520, material: "grass" }, { x: 80, y: 510, w: 880, h: 350, material: "sand" }, { x: 50, y: 415, w: 1240, h: 120, material: "stone" }, { x: 1010, y: 120, w: 150, h: 400, material: "stone" }], barriers: [{ x: 40, y: 870, w: 1280, h: 90 }, { x: 970, y: 630, w: 350, h: 240 }, { x: 180, y: 150, w: 190, h: 170 }], entrances: { beach: { x: 560, y: 755 }, path: { x: 820, y: 460 }, lighthouse: { x: 1025, y: 320 } }, roadExits: { harbor: { x: 70, y: 475 }, hill: { x: 550, y: 110 } } },
  hill: { bounds: { x: 40, y: 80, w: 1280, h: 880 }, spawn: { x: 650, y: 900 }, landmark: { x: 750, y: 225 }, quietZone: { x: 430, y: 440, w: 260, h: 180 }, patches: [{ x: 40, y: 80, w: 1280, h: 880, material: "grass" }, { x: 70, y: 500, w: 1210, h: 100, material: "sand" }, { x: 590, y: 250, w: 150, h: 710, material: "sand" }, { x: 300, y: 200, w: 780, h: 130, material: "sand" }, { x: 960, y: 250, w: 100, h: 350, material: "sand" }], barriers: [{ x: 120, y: 100, w: 180, h: 150 }, { x: 780, y: 675, w: 180, h: 130 }, { x: 1020, y: 100, w: 140, h: 125 }], entrances: { garden: { x: 360, y: 295 }, camp: { x: 1010, y: 540 }, weather: { x: 745, y: 245 } }, roadExits: { market: { x: 70, y: 540 }, harbor: { x: 650, y: 920 }, coast: { x: 1270, y: 540 } } }
};
var clearing = (patches, spawn = { x: 460, y: 540 }) => ({ bounds: { x: 80, y: 120, w: 800, h: 560 }, spawn, landmark: { x: 480, y: 350 }, quietZone: { x: 560, y: 400, w: 160, h: 100 }, patches, barriers: [], entrances: {}, roadExits: {} });
outdoors.dock = clearing([{ x: 80, y: 120, w: 800, h: 560, material: "water" }, { x: 325, y: 120, w: 330, h: 560, material: "wood" }, { x: 120, y: 540, w: 680, h: 140, material: "stone" }]);
outdoors.beach = clearing([{ x: 80, y: 120, w: 800, h: 560, material: "sand" }, { x: 80, y: 120, w: 800, h: 120, material: "grass" }, { x: 0, y: 620, w: 1440, h: 468, material: "water" }]);
outdoors.path = clearing([{ x: 80, y: 120, w: 800, h: 560, material: "grass" }, { x: 150, y: 285, w: 650, h: 100, material: "stone" }, { x: 435, y: 120, w: 90, h: 235, material: "water" }, { x: 392, y: 285, w: 176, h: 48, material: "wood" }, { x: 430, y: 380, w: 100, h: 300, material: "stone" }]);
for (const id of ["garden", "camp", "courtyard"]) outdoors[id] = clearing([{ x: 80, y: 120, w: 800, h: 560, material: "grass" }, { x: 430, y: 210, w: 110, h: 470, material: id === "camp" ? "sand" : "stone" }, { x: 240, y: 340, w: 460, h: 100, material: id === "camp" ? "sand" : "stone" }]);
outdoors.bazaar = clearing([{ x: 80, y: 120, w: 800, h: 560, material: "grass" }, { x: 190, y: 210, w: 580, h: 380, material: "stone" }, { x: 430, y: 590, w: 100, h: 90, material: "stone" }]);
function route(scene, destination, x, y, side, sign) {
  const dx = side === "W" ? 28 : side === "E" ? -28 : 0, dy = side === "N" ? 28 : side === "S" ? -28 : 0;
  (passages[scene] ??= {})[destination] = { at: { x, y }, approach: { x: x + dx - 8, y: y + dy - 6 }, sign, side };
}
route("station", "harbor", 1280, 540, "E", { x: 1240, y: 610 });
route("station", "market", 585, 110, "N", { x: 670, y: 160 });
route("harbor", "station", 70, 450, "W", { x: 120, y: 520 });
route("harbor", "coast", 1280, 450, "E", { x: 1235, y: 535 });
route("harbor", "hill", 555, 110, "N", { x: 625, y: 160 });
route("harbor", "dock", 805, 645, "S", { x: 835, y: 585 });
route("market", "station", 615, 920, "S", { x: 690, y: 885 });
route("market", "hill", 1280, 530, "E", { x: 1240, y: 595 });
route("market", "bazaar", 605, 110, "N", { x: 685, y: 170 });
route("coast", "harbor", 70, 475, "W", { x: 130, y: 550 });
route("coast", "hill", 550, 110, "N", { x: 620, y: 170 });
route("coast", "path", 1280, 475, "E", { x: 1235, y: 550 });
route("coast", "beach", 550, 805, "S", { x: 625, y: 765 });
route("hill", "market", 70, 540, "W", { x: 125, y: 615 });
route("hill", "harbor", 650, 920, "S", { x: 735, y: 880 });
route("hill", "coast", 1270, 540, "E", { x: 1230, y: 610 });
route("hill", "garden", 355, 110, "N", { x: 420, y: 170 });
route("hill", "camp", 1005, 110, "N", { x: 1080, y: 170 });
for (const [scene, parent] of [["garden", "hill"], ["camp", "hill"], ["courtyard", "market"], ["bazaar", "market"], ["dock", "harbor"]]) route(scene, parent, 480, 650, "S", { x: 555, y: 605 });
route("beach", "coast", 480, 150, "N", { x: 555, y: 205 });
route("path", "coast", 125, 335, "W", { x: 195, y: 400 });
outdoors.station.patches.push({ x: 120, y: 430, w: 1200, h: 220, material: "stone" }, { x: 995, y: 875, w: 150, h: 50, material: "stone" }, { x: 630, y: 890, w: 500, h: 55, material: "stone" });
outdoors.coast.patches.push({ x: 495, y: 80, w: 110, h: 450, material: "stone" }, { x: 495, y: 525, w: 110, h: 335, material: "sand" });
outdoors.hill.patches.push({ x: 305, y: 110, w: 100, h: 160, material: "sand" }, { x: 955, y: 110, w: 100, h: 180, material: "sand" });
outdoors.beach.patches.push({ x: 430, y: 120, w: 100, h: 430, material: "sand" });
outdoors.path.patches.push({ x: 80, y: 285, w: 150, h: 100, material: "stone" });
outdoors.harbor.patches.push(
  { x: 1120, y: 220, w: 80, h: 380, material: "stone" },
  { x: 1200, y: 280, w: 120, h: 320, material: "stone" }
);
outdoors.harbor.barriers = outdoors.harbor.barriers.filter((b) => b.x !== 1150);
outdoors.coast.barriers = outdoors.coast.barriers.filter((b) => b.x !== 180);
outdoors.hill.barriers = [];
for (const [scene, links2] of Object.entries(passages)) for (const p of Object.values(links2)) {
  const layout = outdoors[scene];
  const ground = layout.patches.slice().reverse().find((t3) => p.at.x >= t3.x && p.at.x <= t3.x + t3.w && p.at.y >= t3.y && p.at.y <= t3.y + t3.h);
  const material2 = ground?.material ?? "stone";
  const width = material2 === "wood" ? 100 : 110;
  const eastEnd = scene === "hill" && p === passages.hill.coast ? 1280 : scene === "harbor" && p === passages.harbor.coast ? layout.bounds.x + layout.bounds.w : 1440;
  const westStart = scene === "hill" && p === passages.hill.market ? 70 : 0;
  const northStart = scene === "hill" && (p === passages.hill.garden || p === passages.hill.camp) ? 110 : 0;
  const patch = p.side === "N" ? { x: p.at.x - width / 2, y: northStart, w: width, h: p.at.y + 40 - northStart } : p.side === "S" ? { x: p.at.x - width / 2, y: p.at.y - 40, w: width, h: 1088 - p.at.y + 40 } : p.side === "W" ? { x: westStart, y: p.at.y - width / 2, w: p.at.x + 40 - westStart, h: width } : { x: p.at.x - 40, y: p.at.y - width / 2, w: eastEnd - p.at.x + 40, h: width };
  if ((p.side === "N" || p.side === "S") && ground && ground.w <= 230) {
    patch.x = ground.x;
    patch.w = ground.w;
  }
  if ((p.side === "E" || p.side === "W") && ground && ground.h <= 230) {
    patch.y = ground.y;
    patch.h = ground.h;
  }
  layout.patches.push({ ...patch, material: material2 });
}

// src/world/data.ts
var tx = (w, locale) => w[locale === "zh" ? 0 : 1];
var labels = { station: ["\u8F66\u7AD9\u8857", "Station Street"], harbor: ["\u6E2F\u53E3", "The Harbor"], market: ["\u65E7\u8857", "Market Lane"], coast: ["\u6D77\u5CB8", "The Coast"], hill: ["\u5C71\u5761", "The Hill"], home: ["\u4F60\u7684\u79DF\u5C4B", "Your Room"], cafe: ["\u6F6E\u95F4\u5496\u5561\u9986", "Tide & Table"], grocery: ["\u8857\u89D2\u6742\u8D27\u94FA", "Corner Grocer"], dock: ["\u9493\u9C7C\u7801\u5934", "Fishing Pier"], workshop: ["\u743C\u7684\u4FEE\u7406\u94FA", "June\u2019s Workshop"], gym: ["\u6E2F\u53E3\u62F3\u9986", "Harbor Boxing Club"], bazaar: ["\u96C6\u5E02\u5E7F\u573A", "Market Square"], secondhand: ["\u65E7\u7269\u5E97", "Second Chances"], courtyard: ["\u4F4F\u6237\u5EAD\u9662", "Residents\u2019 Courtyard"], beach: ["\u8D1D\u58F3\u6D77\u6EE9", "Shell Beach"], path: ["\u6EE8\u6D77\u9053", "Coastal Path"], lighthouse: ["\u706F\u5854", "The Lighthouse"], garden: ["\u5C71\u5761\u82B1\u56ED", "Hillside Garden"], camp: ["\u677E\u6797\u8425\u5730", "Pine Camp"], weather: ["\u65E7\u6C14\u8C61\u7AD9", "Weather Station"] };
var people = {
  ...residentPeople,
  ...nextPeople,
  ...techPeople,
  ...chapelPriestPeople,
  mara: { name: ["\u739B\u62C9", "Mara"], unknown: ["\u63D0\u7740\u94A5\u5319\u7684\u5973\u58EB", "Woman with the keys"], intro: ["\u4E00\u4F4D\u7A7F\u4E9A\u9EBB\u886C\u8863\u7684\u5973\u58EB\u62AC\u624B\u62DB\u547C\u3002\u5979\u6643\u4E86\u6643\u94A5\u5319\uFF1A\u201C\u4F60\u5C31\u662F\u6765\u4F4F\u4E00\u590F\u7684\u65B0\u623F\u5BA2\u5427\uFF1F\u6211\u662F\u739B\u62C9\u3002\u5148\u653E\u4E0B\u884C\u674E\uFF0C\u522B\u6025\u7740\u8BA4\u5168\u9547\u7684\u4EBA\u3002\u201D", "A woman in a linen shirt waves a key. \u201CYou must be my summer tenant. I\u2019m Mara. Let\u2019s put your bag down before you try to learn the whole town.\u201D"], art: "mara" },
  theo: { name: ["\u897F\u5965", "Theo"], unknown: ["\u7CFB\u56F4\u88D9\u7684\u5E74\u8F7B\u4EBA", "Young man in an apron"], intro: ["\u5E74\u8F7B\u4EBA\u505C\u4E0B\u811A\u6B65\uFF0C\u56F4\u88D9\u4E0A\u5199\u7740Theo\u3002\u201C\u53EB\u6211\u897F\u5965\u3002\u4F60\u521A\u5230\uFF1F\u739B\u62C9\u628A\u5979\u7684\u5DE5\u5177\u888B\u5FD8\u5728\u8FD9\u91CC\u4E86\u3002\u201D", "The young man pauses. His apron reads Theo. \u201CJust arrived? Mara left her tool bag here. You\u2019re welcome to sit a while.\u201D"], art: "theo" },
  june: { name: ["\u743C", "June"], unknown: ["\u7A7F\u5DE5\u88C5\u7684\u5973\u4EBA", "Woman in work clothes"], intro: ["\u7A7F\u5DE5\u88C5\u7684\u5973\u4EBA\u62AC\u8D77\u5934\uFF1A\u201C\u6211\u662F\u743C\uFF0C\u8FD9\u95F4\u4FEE\u7406\u94FA\u662F\u6211\u7684\u3002\u5168\u5E74\u90FD\u6709\u4EBA\u5F04\u574F\u4E1C\u897F\u3002\u9700\u8981\u501F\u5DE5\u5177\uFF1F\u201D", "The woman in work clothes looks up. \u201CJune. Like the sign. Things break all year, though. Need to borrow something?\u201D"], art: "june" },
  idris: { name: ["\u4F0A\u5FB7\u91CC\u65AF", "Idris"], unknown: ["\u6574\u7406\u624B\u5957\u7684\u6559\u7EC3", "Coach sorting gloves"], intro: ["\u4E00\u4E2A\u80A9\u8180\u5BBD\u539A\u7684\u4E2D\u5E74\u7537\u4EBA\u6B63\u5728\u667E\u624B\u5957\u3002\u201C\u6211\u662F\u4F0A\u5FB7\u91CC\u65AF\u3002\u60F3\u7EC3\u7EC3\u811A\u6B65\uFF1F\u5148\u5B66\u8EB2\uFF0C\u51FA\u62F3\u4E0D\u7740\u6025\u3002\u8FD9\u91CC\u8C01\u90FD\u53EF\u4EE5\u8BF4\u505C\u3002\u201D", "A broad-shouldered man hangs up a pair of gloves. \u201CIdris. Want to try the footwork? Learn to move first. Anyone here can call a stop.\u201D"], art: "idris" },
  ruth: { name: ["\u9732\u4E1D", "Ruth"], unknown: ["\u6234\u5E06\u5E03\u5E3D\u7684\u9493\u9C7C\u4EBA", "Angler in a canvas hat"], intro: ["\u6234\u65E7\u5E06\u5E03\u5E3D\u7684\u5973\u4EBA\u628A\u5907\u7528\u9C7C\u7AFF\u9760\u5728\u680F\u6746\u4E0A\u3002\u201C\u9732\u4E1D\u3002\u522B\u8E29\u6876\uFF0C\u90A3\u662F\u6211\u7684\u5348\u996D\u3002\u4F60\u60F3\u8BD5\u4E00\u7AFF\u5417\uFF1F\u201D", "A woman in a faded canvas hat sets a spare rod against the rail. \u201CRuth. Mind the bucket\u2014that\u2019s lunch. Fancy a try?\u201D"], art: "ruth" },
  luis: { name: ["\u8DEF\u6613\u65AF", "Luis"], unknown: ["\u63D0\u7740\u5E03\u888B\u7684\u5E97\u4E3B", "Shopkeeper with a cloth bag"], intro: ["\u5E97\u4E3B\u7B11\u7740\u62DB\u547C\uFF1A\u201C\u8DEF\u6613\u65AF\u3002\u65B0\u9762\u5B54\uFF01\u6742\u8D27\u94FA\u95E8\u8FB9\u6709\u514D\u8D39\u996E\u6C34\u3002\u522B\u5728\u7B2C\u4E00\u5929\u5C31\u628A\u94B1\u5168\u82B1\u5728\u6211\u8FD9\u91CC\u3002\u201D", "The shopkeeper smiles. \u201CLuis. New face! Free tap water by the grocer\u2019s door. Don\u2019t spend your whole first day\u2019s money here.\u201D"], art: "luis" },
  nell: { name: ["\u5185\u5C14", "Nell"], unknown: ["\u6574\u7406\u65E7\u7167\u7247\u7684\u5E97\u4E3B", "Shopkeeper sorting photographs"], intro: ["\u7070\u53D1\u5E97\u4E3B\u628A\u4E00\u5F20\u892A\u8272\u7167\u7247\u538B\u5E73\u3002\u201C\u6211\u662F\u5185\u5C14\u3002\u6709\u4E9B\u4E1C\u897F\u4EBA\u4EEC\u642C\u8D70\u65F6\u4E0D\u613F\u5E26\u8D70\uFF0C\u5374\u53C8\u820D\u4E0D\u5F97\u4E22\u3002\u4F60\u770B\u8FD9\u5EA7\u6865\u3002\u201D", "The grey-haired shopkeeper flattens a faded photograph. \u201CNell. Some things are too heavy to take and too dear to throw away. Look at this bridge.\u201D"], art: "nell" },
  elena: { name: ["\u57C3\u7433\u5A1C", "Elena"], unknown: ["\u6D47\u82B1\u7684\u4F4F\u6237", "Resident watering flowers"], intro: ["\u62FF\u7740\u6C34\u58F6\u7684\u5973\u4EBA\u505C\u4E0B\u6765\u3002\u201C\u57C3\u7433\u5A1C\u3002\u6211\u77E5\u9053\u5927\u5BB6\u60F3\u7A7F\u8FC7\u6211\u4EEC\u5EAD\u9662\u53BB\u6D77\u8FB9\uFF0C\u4F46\u90A3\u91CC\u4E5F\u662F\u6211\u5988\u5988\u5348\u7761\u7684\u5730\u65B9\u3002\u201D", "A woman with a watering can pauses. \u201CElena. I know everyone wants a way through our courtyard to the sea. It\u2019s also where my mother takes her afternoon nap.\u201D"], art: "elena" },
  arthur: { name: ["\u963F\u745F", "Arthur"], unknown: ["\u64E6\u62ED\u98CE\u5411\u4EEA\u7684\u8001\u4EBA", "Man cleaning a weather vane"], intro: ["\u8001\u4EBA\u53D6\u4E0B\u5E3D\u5B50\uFF0C\u6307\u4E86\u6307\u80F8\u524D\u78E8\u65E7\u7684\u540D\u724C\uFF1AArthur\u3002\u201C\u4EE5\u524D\u6BCF\u5929\u90FD\u8981\u91CF\u98CE\u3002\u73B0\u5728\u5927\u5BB6\u53EA\u770B\u624B\u673A\uFF0C\u4E0D\u8FC7\u624B\u673A\u53EF\u4E0D\u77E5\u9053\u4E0B\u9762\u90A3\u6761\u5C0F\u8DEF\u3002\u201D", "The older man removes his cap and taps a worn name badge: Arthur. \u201CUsed to measure the wind every day. Phones do it now. They don\u2019t know the little path below us, though.\u201D"], art: "arthur" }
};
var hubSpecs = [["station", ["home", "cafe", "grocery"], { x: 0, y: 1 }], ["harbor", ["dock", "workshop", "gym"], { x: 1, y: 1 }], ["market", ["bazaar", "secondhand", "courtyard"], { x: 0, y: 0 }], ["coast", ["beach", "path", "lighthouse"], { x: 2, y: 1 }], ["hill", ["garden", "camp", "weather"], { x: 1, y: 0 }]];
var links = { station: ["harbor", "market"], harbor: ["station", "coast", "hill"], market: ["station", "hill"], coast: ["harbor", "hill"], hill: ["market", "harbor", "coast"] };
var rooms = {};
var portal = (id, destination, at, approach) => ({ id, label: labels[destination], kind: "portal", destination, at, approach });
for (const [area, children, map] of hubSpecs) {
  const entities = children.map((dest, i) => portal("to-" + dest, dest, { x: 210 + i * 270, y: 210 }, { x: 210 + i * 270, y: 243 }));
  links[area].forEach((dest, i) => entities.push(portal("road-" + dest, dest, { x: 130 + i * 335, y: 660 }, { x: 130 + i * 335, y: 630 })));
  rooms[area] = { id: area, title: labels[area], area, outdoor: true, spawn: { x: 465, y: 535 }, interior: { x: 40, y: 190, w: 880, h: 520 }, props: [], entities, neighbors: [...children, ...links[area]], map };
  children.forEach((id, i) => {
    const outdoor = ["dock", "bazaar", "courtyard", "beach", "path", "garden", "camp"].includes(id);
    rooms[id] = { id, title: labels[id], area, outdoor, spawn: { x: 460, y: 540 }, interior: outdoor ? { x: 80, y: 120, w: 800, h: 560 } : { x: 270, y: 225, w: 420, h: 360 }, props: [], entities: [portal("exit", area, { x: 480, y: 582 }, { x: 470, y: 559 })], neighbors: [area], map: { x: map.x + (i - 1) * 0.22, y: map.y - 0.25 } };
  });
}
var addPerson = (scene, person, x, y) => rooms[scene].entities.push({ id: person, label: people[person].unknown, kind: "person", person, at: { x, y }, approach: { x: x - 8, y: y + 42 } });
addPerson("station", "mara", 438, 435);
addPerson("cafe", "theo", 575, 375);
addPerson("workshop", "june", 510, 380);
addPerson("gym", "idris", 535, 345);
addPerson("dock", "ruth", 410, 350);
addPerson("grocery", "luis", 535, 370);
addPerson("secondhand", "nell", 510, 380);
addPerson("courtyard", "elena", 495, 370);
addPerson("weather", "arthur", 510, 365);
var object = (scene, id, label, x, y, actions) => rooms[scene].entities.push({ id, label, kind: "object", at: { x, y }, approach: { x: x - 8, y: y + 34 }, actions });
object("home", "bed", ["\u5E8A\u4E0E\u884C\u674E", "Bed & luggage"], 380, 375, ["unpack", "rest", "sleep"]);
object("cafe", "terrace", ["\u5F85\u4FEE\u7684\u9732\u53F0\u706F", "Terrace lantern for repair"], 370, 380, ["repair-terrace"]);
object("path", "bridge", ["\u53D7\u635F\u7684\u5C0F\u6865", "Damaged footbridge"], 480, 360, ["inspect-bridge", "repair-bridge"]);
object("beach", "driftwood", ["\u5CB8\u8FB9\u7684\u6728\u677F", "Washed-up planks"], 385, 370, ["gather-wood"]);
object("lighthouse", "gate", ["\u6D77\u5CB8\u8DEF\u7EBF\u5165\u53E3", "Coast route gate"], 480, 360, ["open-route"]);
object("bazaar", "notice", ["\u96C6\u5E02\u544A\u793A\u677F", "Market noticeboard"], 480, 365, ["read-market", "open-market"]);
object("camp", "old-map", ["\u65E7\u8DEF\u7EBF\u56FE", "Old route map"], 420, 360, ["assemble-map"]);
object("garden", "gate-hours", ["\u5C0F\u95E8\u4E0A\u7684\u4FBF\u6761", "Note on the garden gate"], 475, 360, ["inspect-garden"]);
object("weather", "logbook", ["\u6C14\u8C61\u8BB0\u5F55\u672C", "Weather log"], 390, 380, ["read-weather"]);
rooms.cafe.props = [{ id: "counter", art: "cafe-counter", at: { x: 470, y: 340 }, width: 150, footprint: { x: 400, y: 313, w: 140, h: 30 } }, { id: "fern", art: "plant", at: { x: 653, y: 295 }, width: 40, footprint: { x: 643, y: 278, w: 20, h: 18 } }];
var furnish = (scene, id, art, x, y, width, groundW = width * 0.75, groundH = 14) => rooms[scene].props.push({ id, art, at: { x, y }, width, footprint: { x: x - groundW / 2, y: y - groundH, w: groundW, h: groundH } });
furnish("home", "bed", "bed", 380, 390, 42, 37, 65);
furnish("home", "bag", "luggage", 430, 405, 28, 24, 14);
furnish("home", "breakfast", "cafe-table-v2", 570, 355, 48, 42, 24);
furnish("home", "fern", "plant", 635, 300, 32, 16, 12);
furnish("home", "entry-planter", "flower-planter", 310, 540, 44, 36, 12);
furnish("cafe", "table-a", "cafe-table-v2", 450, 455, 48, 42, 24);
furnish("cafe", "table-b", "cafe-table-v2", 575, 475, 48, 42, 24);
furnish("cafe", "light", "lantern", 365, 370, 25, 12, 12);
furnish("cafe", "outside-bench", "bench", 335, 490, 65, 58, 14);
furnish("workshop", "tools", "workbench", 410, 335, 104, 92, 28);
furnish("workshop", "wood-stock", "driftwood", 620, 460, 64, 58, 22);
furnish("workshop", "bench", "bench", 355, 465, 65, 58, 14);
furnish("gym", "gloves", "boxing-rack", 385, 330, 78, 69, 22);
furnish("gym", "rest", "bench", 605, 480, 68, 58, 14);
furnish("gym", "fern", "plant", 310, 285, 32, 15, 12);
furnish("grocery", "counter", "cafe-counter", 410, 320, 112, 102, 24);
furnish("grocery", "rest", "bench", 335, 455, 65, 58, 14);
furnish("grocery", "plants", "flower-planter", 620, 520, 60, 52, 16);
furnish("secondhand", "old-table", "cafe-table-v2", 390, 360, 48, 42, 24);
furnish("secondhand", "old-luggage", "luggage", 410, 450, 32, 26, 15);
furnish("secondhand", "bench", "bench", 615, 460, 65, 58, 14);
furnish("weather", "desk", "workbench", 390, 350, 95, 82, 26);
furnish("weather", "rest", "bench", 610, 475, 68, 58, 14);
furnish("lighthouse", "wayfinding", "street-sign", 480, 350, 48, 10, 12);
furnish("lighthouse", "bench", "bench", 350, 450, 68, 58, 14);
furnish("dock", "tackle", "fishing-kit", 460, 360, 43, 35, 24);
furnish("dock", "bench", "bench", 580, 420, 68, 58, 14);
furnish("bazaar", "notice", "noticeboard", 480, 365, 50, 44, 12);
furnish("bazaar", "empty-bench", "bench", 650, 450, 68, 58, 14);
furnish("beach", "timber", "driftwood", 385, 370, 62, 54, 21);
furnish("path", "footbridge", "bridge-broken", 480, 330, 170, 0, 0);
rooms.path.props.at(-1).state = { flag: "bridge-fixed", art: "bridge" };
furnish("path", "notice", "noticeboard", 345, 330, 40, 32, 10);
furnish("camp", "old-table", "cafe-table-v2", 420, 345, 48, 42, 22);
furnish("camp", "rest", "bench", 560, 460, 68, 58, 14);
furnish("garden", "gate-note", "noticeboard", 475, 340, 44, 38, 12);
furnish("courtyard", "flowers", "flower-planter", 395, 335, 66, 55, 16);
furnish("courtyard", "bench", "bench", 630, 430, 68, 58, 14);
for (const scene of ["courtyard", "garden", "camp", "path"]) {
  furnish(scene, "shade-west", "canopy-tree", 220, 360, 155, 22, 16);
  furnish(scene, "shade-east", "canopy-tree", 755, 535, 175, 25, 18);
  furnish(scene, "flowers-north", "flower-planter", 620, 265, 55, 45, 12);
}
for (const [id, layout] of Object.entries(outdoors)) {
  const room = rooms[id];
  room.interior = layout.bounds;
  room.spawn = layout.spawn;
  for (const e of room.entities) {
    const p = e.id.startsWith("to-") ? layout.entrances[e.destination] : e.id.startsWith("road-") ? layout.roadExits[e.destination] : void 0;
    if (p) {
      e.at = { ...p };
      e.approach = { x: p.x - 8, y: p.y + 20 };
    }
  }
}
var landlord = rooms.station.entities.find((e) => e.id === "mara");
landlord.at = { x: 565, y: 685 };
landlord.approach = { x: 550, y: 730 };
rooms.station.props.push(
  { id: "rental", art: "house-rental", at: { x: 247, y: 350 }, width: 270 },
  { id: "cafe-building", art: "house-cafe", at: { x: 920, y: 320 }, width: 300, depthOffset: -15 },
  { id: "grocer-building", art: "house-grocery", at: { x: 1080, y: 880 }, width: 250 },
  { id: "bench-square", art: "bench", at: { x: 805, y: 665 }, width: 68, footprint: { x: 775, y: 649, w: 60, h: 14 } },
  { id: "arrival-bench", art: "bench", at: { x: 675, y: 775 }, width: 68, footprint: { x: 645, y: 759, w: 60, h: 14 } },
  { id: "wayfinding", art: "street-sign", at: { x: 730, y: 520 }, width: 56, footprint: { x: 724, y: 506, w: 12, h: 14 } },
  { id: "tree-south", art: "canopy-tree", at: { x: 445, y: 855 }, width: 145, footprint: { x: 434, y: 837, w: 22, h: 18 } },
  { id: "tree-west", art: "canopy-tree", at: { x: 120, y: 630 }, width: 170, footprint: { x: 107, y: 610, w: 26, h: 20 } },
  { id: "tree-east", art: "canopy-tree", at: { x: 1185, y: 435 }, width: 150, footprint: { x: 1174, y: 417, w: 22, h: 18 } },
  { id: "tree-garden", art: "canopy-tree", at: { x: 1040, y: 705 }, width: 165, footprint: { x: 1029, y: 687, w: 22, h: 18 } }
);
rooms.harbor.props.push({ id: "workshop-front", art: "house-workshop", at: { x: 300, y: 290 }, width: 270, depthOffset: -15 }, { id: "club-front", art: "house-gym", at: { x: 802, y: 305 }, width: 280, depthOffset: -15 });
rooms.market.props.push({ id: "old-shop", art: "house-rental", at: { x: 232, y: 350 }, width: 250, depthOffset: -20 }, { id: "courtyard-house", art: "house-grocery", at: { x: 1100, y: 355 }, width: 280, depthOffset: -20 });
furnish("market", "stall-west", "market-stall", 360, 595, 125, 104, 40);
furnish("market", "stall-east", "market-stall", 935, 690, 130, 110, 42);
furnish("market", "square-bench", "bench", 650, 720, 68, 58, 14);
furnish("harbor", "crates-a", "harbor-crates", 200, 505, 46, 32, 22);
furnish("harbor", "crates-b", "harbor-crates", 575, 720, 44, 34, 22);
furnish("harbor", "quay-bench", "bench", 945, 555, 68, 58, 14);
furnish("harbor", "pier-sign", "street-sign", 728, 590, 46, 10, 12);
furnish("coast", "tower", "lighthouse-building", 1080, 320, 190, 150, 45);
furnish("coast", "rock-west", "coastal-rocks", 275, 315, 105, 80, 35);
furnish("coast", "rock-shore", "coastal-rocks", 820, 820, 90, 65, 25);
furnish("coast", "view-bench", "bench", 695, 565, 68, 58, 14);
furnish("hill", "station-building", "weather-building", 745, 245, 215, 185, 40);
furnish("hill", "tent-east", "camp-tent", 1100, 445, 105, 75, 45);
furnish("hill", "ridge-rock", "coastal-rocks", 850, 760, 100, 75, 38);
for (const id of ["market", "hill"]) for (const [i, x, y] of [[0, 175, 730], [1, 1160, 750], [2, 1120, 190], [3, 425, 195]]) furnish(id, "landscape-" + i, "canopy-tree", x, y, 150, 24, 18);
furnish("camp", "tent", "camp-tent", 650, 315, 105, 80, 50);
furnish("camp", "picnic-crate", "harbor-crates", 590, 370, 36, 28, 18);
furnish("dock", "rope-crates", "harbor-crates", 600, 310, 43, 34, 22);
furnish("beach", "rocks", "coastal-rocks", 720, 475, 95, 65, 24);
furnish("home", "chair", "bench", 570, 420, 48, 40, 12);
furnish("cafe", "chair-a", "bench", 450, 510, 48, 40, 12);
furnish("cafe", "chair-b", "bench", 575, 530, 48, 40, 12);
furnish("secondhand", "chair", "bench", 390, 425, 48, 40, 12);
furnish("workshop", "spares", "harbor-crates", 605, 350, 44, 34, 22);
for (const [i, x, y] of [[0, 315, 330], [1, 650, 330], [2, 650, 520]]) {
  furnish("bazaar", "festival-stall-" + i, "market-stall-closed", x, y, 110, 90, 32);
  rooms.bazaar.props.at(-1).state = { flag: "market-open", art: "market-stall" };
}
for (const n of [1, 2]) {
  const id = "workshop-annex-" + n, x = n === 1 ? 345 : 620;
  labels[id] = ["\u4FEE\u7406\u94FA\u7684\u5C0F\u95F4 " + n, "Workshop annex " + n];
  rooms[id] = { id, title: ["\u4FEE\u7406\u94FA\u7684\u5C0F\u95F4 " + n, "Workshop annex " + n], area: "harbor", outdoor: false, spawn: { x: 470, y: 550 }, interior: { x: 270, y: 225, w: 420, h: 360 }, props: [], entities: [portal("exit", "workshop", { x: 480, y: 582 }, { x: 470, y: 559 })], neighbors: ["workshop"], map: { x: 1, y: 1 } };
  rooms.workshop.neighbors.push(id);
  rooms.workshop.entities.push(portal("to-annex-" + n, id, { x, y: 225 }, { x: x - 8, y: 257 }));
  rooms.workshop.props.push({ id: "annex-door-" + n, art: "door-front-v7", at: { x, y: 225 }, width: 46, visibleWhen: id });
  furnish(id, "desk-a", "workbench", 380, 350, 90, 76, 24);
  furnish(id, "desk-b", "cafe-table-v2", 575, 420, 60, 50, 24);
  furnish(id, "seat", "bench", 575, 480, 48, 40, 12);
  furnish(id, "green", "plant", 635, 290, 30, 16, 12);
  object(id, "observation-a", ["\u53F0\u4E0A\u7684\u8BB0\u5F55", "Notes on the bench"], 380, 355, ["notes-observe"]);
  object(id, "observation-b", ["\u6536\u597D\u7684\u6750\u6599", "Stored material"], 575, 420, ["notes-observe"]);
}
for (const r of Object.values(rooms).filter((r2) => r2.outdoor)) {
  let treeIndex = 0;
  for (const p of r.props) {
    if (p.art === "canopy-tree") {
      const n = treeIndex++;
      const tree = r.id === "hill" || r.id === "camp" ? n % 3 === 2 ? "tree-birch-v3" : "tree-pine-v3" : n % 2 ? "tree-birch-v3" : "tree-coastal-v3";
      p.art = tree;
      p.width = tree === "tree-pine-v3" ? 124 : tree === "tree-birch-v3" ? 95 : 155;
    }
    if (p.art === "bench") {
      if (["coast", "dock", "beach"].includes(r.id)) {
        p.art = "bench-back-v3";
        p.width = 76;
      }
      if (r.id === "station" && p.id === "arrival-bench" || ["courtyard", "garden"].includes(r.id)) {
        p.art = "bench-side-v3";
        p.width = 26;
        p.footprint = { x: p.at.x - 12, y: p.at.y - 47, w: 24, h: 47 };
      }
    }
  }
  for (const e of r.entities) {
    const link = e.destination && passages[r.id]?.[e.destination];
    if (!link) continue;
    e.at = { ...link.at };
    e.approach = { ...link.approach };
    e.passage = { side: link.side, sign: { ...link.sign } };
    r.props.push({ id: "route-sign-" + e.id, art: "trail-sign-v3", at: { ...link.sign }, width: 29, footprint: { x: link.sign.x - 4, y: link.sign.y - 8, w: 8, h: 8 } });
  }
}
furnish("station", "arrival-flowers", "flower-planter", 715, 815, 42, 32, 12);
furnish("station", "birch-arrival", "tree-birch-v3", 775, 810, 90, 18, 14);
furnish("harbor", "quay-planter", "flower-planter", 995, 560, 52, 42, 14);
furnish("market", "square-birch", "tree-birch-v3", 740, 775, 95, 18, 14);
furnish("coast", "wind-tree", "tree-coastal-v3", 700, 680, 148, 23, 16);
furnish("coast", "young-birch", "tree-birch-v3", 390, 360, 82, 16, 12);
furnish("beach", "dune-tree", "tree-coastal-v3", 235, 290, 130, 21, 16);
furnish("beach", "shore-seat", "bench-back-v3", 650, 570, 76, 65, 14);
furnish("garden", "garden-seat", "bench-side-v3", 635, 450, 26, 24, 47);
furnish("camp", "pine-north", "tree-pine-v3", 715, 300, 112, 21, 16);
var refurnish = (scene, id, art, width, groundW, groundH) => {
  const p = rooms[scene].props.find((p2) => p2.id === id);
  p.art = art;
  p.width = width;
  p.footprint = { x: p.at.x - groundW / 2, y: p.at.y - groundH, w: groundW, h: groundH };
};
for (const [scene, id] of [["home", "chair"], ["cafe", "chair-a"], ["cafe", "chair-b"], ["secondhand", "chair"]]) refurnish(scene, id, "wooden-chair", 23, 19, 17);
refurnish("grocery", "counter", "interior-grocery-v1", 104, 94, 25);
refurnish("grocery", "rest", "harbor-crates", 46, 34, 22);
refurnish("weather", "desk", "interior-mapdesk-v1", 95, 82, 26);
furnish("home", "books-and-linen", "interior-bookcase-v1", 345, 288, 65, 57, 19);
furnish("home", "summer-coat", "interior-coatstand-v1", 625, 505, 19, 12, 10);
furnish("cafe", "pantry", "interior-grocery-v1", 320, 292, 65, 57, 20);
furnish("grocery", "shelf", "interior-grocery-v1", 615, 290, 80, 72, 23);
furnish("grocery", "storage", "harbor-crates", 330, 310, 35, 28, 19);
furnish("workshop", "tool-storage", "interior-tools-v1", 510, 290, 65, 56, 20);
furnish("workshop", "coat", "interior-coatstand-v1", 650, 505, 19, 12, 10);
furnish("gym", "towel-shelf", "interior-bookcase-v1", 320, 500, 62, 53, 18);
furnish("gym", "club-coat", "interior-coatstand-v1", 640, 290, 19, 12, 10);
furnish("secondhand", "book-shelf", "interior-bookcase-v1", 610, 300, 80, 70, 22);
furnish("secondhand", "old-coat", "interior-coatstand-v1", 315, 290, 19, 12, 10);
furnish("weather", "records", "interior-bookcase-v1", 620, 290, 72, 64, 21);
furnish("weather", "raincoat", "interior-coatstand-v1", 650, 530, 19, 12, 10);
furnish("lighthouse", "chart-table", "interior-mapdesk-v1", 610, 310, 85, 74, 25);
furnish("lighthouse", "keeper-coat", "interior-coatstand-v1", 315, 295, 19, 12, 10);
furnish("lighthouse", "records", "interior-bookcase-v1", 625, 455, 70, 61, 20);
for (const [scene, x, y, width] of [["home", 475, 490, 240], ["cafe", 500, 530, 260]]) rooms[scene].props.push({ id: "woven-rug", art: "interior-rug-v1", at: { x, y }, width, floorDecoration: true });
dressHarbor(rooms);
organizeDailyLife(rooms);
enrichPlanting(rooms);
addChapel(rooms);
rooms.garden.props.push(...gardenStaticProps);
addPierRopePosts(rooms);
var doorways = Object.fromEntries(Object.values(rooms).filter((r) => !r.outdoor).map((r) => {
  const floorEnd = r.interior.y + r.interior.h, door = { id: "exit", side: "S", center: 480, width: 50, leafWidth: 46, leafBottom: floorEnd + 8, opening: { start: 455, end: 505 }, activation: { x: 441, y: floorEnd - 58, w: 78, h: 58 }, closedFootprint: { x: 455, y: floorEnd, w: 50, h: 8 } };
  r.props.push({ id: "exit-leaf", art: "door-front-v7", at: { x: door.center, y: door.leafBottom }, width: door.leafWidth, foreground: true });
  return [r.id, door];
}));
rooms.garden.props.push({ id: "visitor-notice", art: "noticeboard", at: { x: 600, y: 600 }, width: 38, visibleWhen: "news:checked" });
rooms.home.props.push({ id: "owned-fern-display", art: "plant", at: { ...fernSlot.at }, width: fernSlot.width, visibleWhen: fernDisplayFlag });
rooms.home.entities.push({ id: fernSlot.id, kind: "object", label: ["\u623F\u95F4\u53F3\u4FA7\u7684\u76C6\u683D\u4F4D\u7F6E", "Potted-plant spot on the right"], at: { ...fernSlot.at }, approach: { ...fernSlot.approach }, actions: [] });
var world = { width: 1440, height: 1088, step: 12, actor: { w: 16, h: 12 }, scenes: Object.fromEntries(Object.values(rooms).map((r) => [r.id, { interior: r.interior, spawn: r.spawn, obstacles: [...outdoors[r.id] ? waterBarriers(outdoors[r.id]) : [], ...outdoors[r.id]?.barriers ?? [], ...r.props.flatMap((p) => p.footprint ? [p.footprint] : [])] }])) };
var fern = rooms.garden.props.find((p) => p.art === "flora-fern-v1");
fern.id = "growing-fern";
rooms.garden.entities.push({ id: "growing-fern", kind: "object", label: ["\u8DEF\u8FB9\u7684\u5C0F\u8568", "Pathside fern"], at: { ...fern.at }, approach: { x: fern.at.x + 28, y: fern.at.y + 14 }, actions: ["water-fern"] });
for (const [person, routes] of Object.entries(residentRoutes)) for (const route2 of routes) {
  const existing = rooms[route2.scene].entities.find((e) => e.person === person);
  if (existing) {
    existing.at = { ...route2.at };
    existing.approach = { x: route2.at.x - 8, y: route2.at.y + 42 };
  } else addPerson(route2.scene, person, route2.at.x, route2.at.y);
}
addNeighborGathering(rooms);
var cropSideRose = rooms.garden.props.find((p) => p.art === "flora-rose-v1" && p.at.x === 742);
if (cropSideRose) cropSideRose.at.x = 850;
for (let i = 0; i < 3; i++) object("garden", "crop-bed-" + (i + 1), ["\u83DC\u7566 " + (i + 1), "Growing bed " + (i + 1)], 630 + i * 70, 630, cropVerbs);
rooms.garden.entities.push({ id: "visitor-note", kind: "object", label: ["\u6E38\u5BA2\u4FBF\u6761", "Visitor note"], at: { x: 600, y: 600 }, approach: { x: 592, y: 634 }, actions: [] });
object("grocery", "crop-counter", ["\u79CD\u5B50\u4E0E\u6536\u83B7\u67DC\u53F0", "Seeds & harvest counter"], 455, 365, shopVerbs);
for (const { scene, entity } of authoredAnimalEntities(acceptedAnimals)) rooms[scene].entities.push(entity);
for (const { scene, entity } of nativeCrabEntities) rooms[scene].entities.push(entity);
function entityAt(scene, id) {
  return rooms[scene]?.entities.find((e) => e.id === id);
}
function worldWithFlags(flags) {
  const base2 = flags.includes("bridge-fixed") ? world : { ...world, scenes: { ...world.scenes, path: { ...world.scenes.path, obstacles: [...world.scenes.path.obstacles, { x: 452, y: 285, w: 52, h: 48 }] } } };
  if (!flags.includes(fernDisplayFlag)) return base2;
  return { ...base2, scenes: { ...base2.scenes, home: { ...base2.scenes.home, obstacles: [...base2.scenes.home.obstacles, { ...fernSlot.footprint }] } } };
}

// src/dynamic-assets/slots.json
var slots_default = [
  {
    scene: "home",
    slotId: "library-laundry",
    assetId: "harbor__lidded-laundry-hamper-front-v1",
    imageHash: "151794b91a192182b931564e12c2de11ce0589dded9ad3cf70865d81b755db9a",
    bytes: 108946,
    mime: "image/png",
    sourceSize: [
      206,
      240
    ],
    anchor: [
      0.5007012622720898,
      0.9975932611311672
    ],
    scale: 0.12254901960784313,
    eventAt: {
      x: 389,
      y: 501
    },
    imageOffset: {
      x: 0,
      y: 0
    },
    supportPropId: null,
    footprints: [
      {
        x: 378,
        y: 490,
        w: 22,
        h: 11
      }
    ],
    approaches: {
      spawn: {
        x: 460,
        y: 540
      },
      rear: {
        x: 381,
        y: 475
      },
      right: {
        x: 404,
        y: 490
      },
      front: {
        x: 381,
        y: 505
      },
      left: {
        x: 358,
        y: 490
      },
      "visit-exit": {
        x: 470,
        y: 559
      },
      "visit-bed": {
        x: 372,
        y: 409
      }
    }
  },
  {
    scene: "cafe",
    slotId: "library-coffee-jar",
    assetId: "harbor__coffee-bean-canister-front-v1",
    imageHash: "35a987f5866a754eff3f21c618b87b20257fd6d6a76662df086d2a8b82c2bb4f",
    bytes: 74377,
    mime: "image/png",
    sourceSize: [
      198,
      240
    ],
    anchor: [
      0.49819168173598555,
      0.9970149253731343
    ],
    scale: 0.061224489795918366,
    eventAt: {
      x: 534,
      y: 341
    },
    imageOffset: {
      x: 0,
      y: -34
    },
    supportPropId: "counter",
    footprints: [],
    approaches: {
      spawn: {
        x: 460,
        y: 540
      },
      rear: {
        x: 526,
        y: 295
      },
      right: {
        x: 544,
        y: 318
      },
      front: {
        x: 526,
        y: 347
      },
      left: {
        x: 380,
        y: 318
      },
      "visit-exit": {
        x: 470,
        y: 559
      },
      "visit-theo": {
        x: 571,
        y: 372
      },
      "visit-terrace": {
        x: 362,
        y: 414
      }
    }
  },
  {
    scene: "garden",
    slotId: "library-hose-reel",
    assetId: "harbor__garden-hose-reel-right-side-v1",
    imageHash: "1f37b3de485f0cf9f7e4715b63d687b1c874c7a3e92a437dd6356fc447ac87d0",
    bytes: 75117,
    mime: "image/png",
    sourceSize: [
      188,
      240
    ],
    anchor: [
      0.517636684303351,
      0.9972413793103448
    ],
    scale: 0.14516129032258066,
    eventAt: {
      x: 261,
      y: 476
    },
    imageOffset: {
      x: 0,
      y: 0
    },
    supportPropId: null,
    footprints: [
      {
        x: 249.5,
        y: 466,
        w: 23,
        h: 10
      }
    ],
    approaches: {
      spawn: {
        x: 460,
        y: 540
      },
      rear: {
        x: 253,
        y: 451
      },
      right: {
        x: 280,
        y: 464
      },
      front: {
        x: 253,
        y: 480
      },
      left: {
        x: 229,
        y: 463
      },
      "visit-exit": {
        x: 472,
        y: 616
      },
      "visit-gate-hours": {
        x: 467,
        y: 394
      }
    }
  }
];

// src/dynamic-assets/layout.ts
function dynamicWorld(flags, enabled) {
  const base2 = worldWithFlags(flags);
  if (!enabled) return base2;
  const scenes = { ...base2.scenes };
  for (const slot2 of slots_default) {
    const s = scenes[slot2.scene];
    scenes[slot2.scene] = { ...s, obstacles: [...s.obstacles, ...slot2.footprints] };
  }
  return { ...base2, scenes };
}

// src/story/fatigue.ts
function advanceAwake(s, minutes) {
  const before = s.awakeMinutes ?? 0, after = before + minutes;
  const drain = (m) => Math.floor(Math.max(0, m - 600) / 60) * 5;
  s.energy = Math.max(0, s.energy - drain(after) + drain(before));
  s.awakeMinutes = after;
}

// src/turn-combat/core.ts
function startBout(c) {
  return { schema: 1, configId: c.id, configVersion: 1, round: 0, player: c.playerMax, opponent: c.opponentMax, counter: false, supplyUsed: 0, outcome: "playing", log: [] };
}
function intent(c, b) {
  return c.intents[b.round % c.intents.length];
}
function validBout(c, b) {
  return !!b && b.schema === 1 && b.configId === c.id && b.configVersion === c.version && Number.isInteger(b.round) && b.round >= 0 && b.round <= c.maxRounds && Number.isInteger(b.player) && b.player >= 0 && b.player <= c.playerMax && Number.isInteger(b.opponent) && b.opponent >= 0 && b.opponent <= c.opponentMax && typeof b.counter === "boolean" && [0, 1].includes(b.supplyUsed) && ["playing", "won", "lost", "limit"].includes(b.outcome) && Array.isArray(b.log) && b.log.length === b.round && b.log.every((t3, i) => t3.round === i + 1 && ["strike", "guard", "recover", "supply"].includes(t3.move) && t3.intent === c.intents[i % c.intents.length].id && [t3.dealt, t3.taken, t3.healed].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) && (b.outcome === "playing" ? b.player > 0 && b.opponent > 0 && b.round < c.maxRounds : b.outcome === "won" ? b.opponent === 0 : b.outcome === "lost" ? b.player === 0 : b.round === c.maxRounds);
}
function resolveTurn(c, b, move2) {
  if (!validBout(c, b)) throw Error("UNSUPPORTED_BATTLE");
  if (b.outcome !== "playing") throw Error("BATTLE_FINISHED");
  if (!["strike", "guard", "recover", "supply"].includes(move2)) throw Error("INVALID_BATTLE_MOVE");
  if (move2 === "supply" && b.supplyUsed) throw Error("SUPPLY_ALREADY_USED");
  const n = structuredClone(b), forecast = intent(c, b);
  let dealt = 0, taken = 0, healed = 0;
  if (move2 === "strike") {
    dealt = Math.min(n.opponent, c.strike + (n.counter ? c.counter : 0));
    n.opponent -= dealt;
  }
  if (move2 === "recover" || move2 === "supply") {
    healed = Math.min(c.playerMax - n.player, move2 === "supply" ? c.supply : c.recover);
    n.player += healed;
  }
  n.counter = move2 === "guard";
  if (move2 === "supply") n.supplyUsed++;
  if (n.opponent > 0) {
    taken = Math.min(n.player, move2 === "guard" ? Math.ceil(forecast.damage / 4) : forecast.damage);
    n.player -= taken;
  }
  n.round++;
  n.outcome = n.opponent === 0 ? "won" : n.player === 0 ? "lost" : n.round === c.maxRounds ? "limit" : "playing";
  n.log.push({ round: n.round, move: move2, intent: forecast.id, dealt, taken, healed });
  return n;
}

// src/story/turn-battle.ts
var common = { version: 1, playerMax: 10, strike: 3, counter: 2, recover: 2, supply: 4, maxRounds: 12 };
var boutConfigs = { training: { ...common, id: "training", opponentMax: 8, intents: [{ id: "heavy", damage: 5 }, { id: "rest", damage: 0 }, { id: "light", damage: 2 }] }, "open-class": { ...common, id: "open-class", opponentMax: 18, intents: [{ id: "light", damage: 2 }, { id: "heavy", damage: 5 }, { id: "rest", damage: 0 }] } };
var need = (v, c) => {
  if (!v) throw Error(c);
};
var flag = (s, k) => {
  if (!s.flags.includes(k)) s.flags.push(k);
};
var relation = (s, n) => s.relations.idris = Math.min(100, (s.relations.idris ?? 0) + n);
function validTurnBattle(s) {
  const b = s.turnBattle;
  if (!b) return true;
  return !s.activeChallenge && typeof b.id === "string" && /^[a-f0-9-]{36}$/.test(b.id) && ["training", "open-class"].includes(b.encounter) && b.scene === "gym" && b.opponent === "idris" && ["active", "paused", "result"].includes(b.phase) && typeof b.paid === "boolean" && validBout(boutConfigs[b.encounter], b.bout) && (b.phase === "result" ? b.bout.outcome !== "playing" : b.bout.outcome === "playing") && (b.encounter === "training" ? !b.paid : b.paid === b.bout.round > 0);
}
var battleLocksWorld = (s) => !!s.turnBattle && s.turnBattle.phase !== "paused";
var battleItems = { "packed-snack": { name: ["\u6253\u5305\u70B9\u5FC3", "Packed snack"], description: ["\u573A\u5916\u6062\u590D30\u4F53\u529B\uFF1B\u5BF9\u7EC3\u4E2D\u6062\u590D4\u672C\u573A\u72B6\u6001\uFF0C\u6BCF\u573A\u81F3\u591A\u4E00\u4EFD\u3002", "Restores 30 energy outside a bout, or 4 bout condition once per bout."], kind: "objects" } };
function battleTopics(s, p) {
  if (p !== "idris" || !s.known.includes(p) || s.scene !== "gym") return [];
  const f2 = (k) => s.flags.includes(k);
  return f2("battle:class:done") ? [] : f2("market-known") && !f2("battle:class:accepted") ? [{ id: "class-invite", label: ["\u4F53\u9A8C\u8BFE\u8FD8\u9700\u8981\u4EBA\u5E2E\u5FD9\u5417\uFF1F", "Could I help with the open class?"], reply: ["\u201C\u613F\u610F\u966A\u6211\u5F69\u6392\u4E00\u573A\u5417\uFF1F\u4E0D\u5FC5\u8D62\u3002\u5148\u786E\u8BA4\u89C4\u5219\uFF0C\u7EC3\u5B8C\u544A\u8BC9\u6211\u8282\u594F\u611F\u53D7\uFF0C\u6211\u4ED8\u4F606\u5143\u8C22\u793C\u3002\u4E0D\u6025\uFF0C\u968F\u65F6\u80FD\u6682\u505C\u53BB\u5FD9\u81EA\u5DF1\u7684\u4E8B\u3002\u201D", "\u201CWould you rehearse a bout with me? You needn\u2019t win. Read the rules first, then tell me how the pace felt. I\u2019ll pay $6 for your time. No rush; you can pause for your own errands.\u201D"], once: true }] : [];
}
function applyBattleTopic(s, p, id) {
  if (p === "idris" && id === "class-invite") flag(s, "battle:class:accepted");
}
function atCoach(s, a) {
  const e = entityAt(s.scene, "idris");
  need(s.scene === "gym" && s.known.includes("idris") && s.flags.includes("unpacked"), "BATTLE_LOCATION");
  need(e && presentEntity(s, e), "PERSON_AWAY");
  const p = observedActor(e, a.actorPosition);
  need(Math.hypot(a.position.x + 8 - p.x, a.position.y + 6 - p.y) <= 75, "TOO_FAR");
}
function applyBattle(s, a) {
  need(!s.activeChallenge, "CHALLENGE_ACTIVE");
  if (a.action === "snack-eat") {
    need(!battleLocksWorld(s), "BATTLE_ACTIVE");
    need((s.items["packed-snack"] ?? 0) > 0, "MISSING_ITEM");
    need(s.energy < 100, "ENERGY_FULL");
    s.items["packed-snack"]--;
    if (!s.items["packed-snack"]) delete s.items["packed-snack"];
    s.energy = Math.min(100, s.energy + 30);
    return ["\u4F60\u5403\u5B8C\u70B9\u5FC3\uFF0C\u4F53\u529B\u6062\u590D\u4E86\u3002", "You eat the snack and recover energy."];
  }
  if (a.action === "battle-claim") {
    need(s.flags.includes("battle:class:pay-pending") && !s.flags.includes("battle:class:paid"), "REWARD_UNAVAILABLE");
    need(s.cash <= 993, "PURSE_FULL");
    s.cash += 6;
    flag(s, "battle:class:paid");
    return ["\u5F69\u6392\u8C22\u793C6\u5143\u5DF2\u6536\u597D\u3002", "You collect the $6 rehearsal payment."];
  }
  if (a.action === "battle-start") {
    need(!s.turnBattle, "BATTLE_EXISTS");
    atCoach(s, a);
    const encounter = a.payload?.encounter;
    need(encounter === "training" || encounter === "open-class", "INVALID_BATTLE");
    if (encounter === "open-class") {
      need(s.flags.includes("battle:class:accepted"), "BATTLE_NOT_ACCEPTED");
      need(!s.flags.includes("battle:class:awaiting-feedback"), "BATTLE_FEEDBACK_FIRST");
      need(s.energy >= 10, "REST_NEEDED");
    }
    s.turnBattle = { id: a.action_id, encounter, scene: "gym", opponent: "idris", phase: "active", paid: false, bout: startBout(boutConfigs[encounter]) };
    return ["\u770B\u6E05\u6559\u7EC3\u7684\u9884\u544A\uFF0C\u518D\u9009\u62E9\u5E94\u5BF9\u3002", "Read the coach\u2019s intent, then choose your response."];
  }
  const b = s.turnBattle;
  need(b && b.id === a.target, "BATTLE_MISMATCH");
  need(validTurnBattle(s), "UNSUPPORTED_BATTLE");
  const t3 = b;
  if (a.action === "battle-pause") {
    need(t3.phase === "active", "BATTLE_NOT_ACTIVE");
    t3.phase = "paused";
    return ["\u5BF9\u7EC3\u5DF2\u6682\u505C\u3002\u53EF\u4EE5\u53BB\u6536\u83DC\u6216\u89C1\u90BB\u5C45\uFF0C\u56DE\u6765\u540E\u7EE7\u7EED\u3002", "Bout paused. Tend your crops or visit a neighbor, then return."];
  }
  if (a.action === "battle-resume") {
    need(t3.phase === "paused", "BATTLE_NOT_PAUSED");
    atCoach(s, a);
    t3.phase = "active";
    return ["\u4ECE\u4E0A\u6B21\u90A3\u4E00\u8F6E\u7EE7\u7EED\u3002", "Continue from the saved round."];
  }
  if (a.action === "battle-end") {
    need(t3.phase !== "result", "BATTLE_FEEDBACK_FIRST");
    delete s.turnBattle;
    return ["\u8FD9\u573A\u7EC3\u4E60\u7ED3\u675F\u4E86\u3002\u5DF2\u7ECF\u7528\u6389\u7684\u65F6\u95F4\u548C\u70B9\u5FC3\u4E0D\u9000\u56DE\uFF0C\u53EF\u4EE5\u91CD\u65B0\u51C6\u5907\u3002", "This bout is over. Time and snacks already used remain spent. Try again when ready."];
  }
  if (a.action === "battle-close") {
    need(t3.phase === "result" && (t3.encounter === "training" || s.flags.includes("battle:class:done")), "BATTLE_FEEDBACK_FIRST");
    delete s.turnBattle;
    return ["\u7EC3\u4E60\u8BB0\u5F55\u5DF2\u7559\u4E0B\u3002", "Your practice is recorded."];
  }
  if (a.action === "battle-feedback") {
    need(t3.phase === "result" && t3.encounter === "open-class" && ["clear", "slower"].includes(a.payload?.feedback), "INVALID_FEEDBACK");
    if (!s.flags.includes("battle:class:done")) {
      flag(s, "battle:class:done");
      flag(s, "battle:class:feedback:" + a.payload.feedback);
      relation(s, 1);
      flag(s, "battle:class:pay-pending");
      if (s.cash <= 993) {
        s.cash += 6;
        flag(s, "battle:class:paid");
      }
    }
    s.flags = s.flags.filter((f2) => f2 !== "battle:class:awaiting-feedback");
    delete s.turnBattle;
    return s.flags.includes("battle:class:paid") ? ["\u4F0A\u5FB7\u91CC\u65AF\u8BB0\u4E0B\u4F60\u7684\u611F\u53D7\uFF0C\u628A6\u5143\u8C22\u793C\u4EA4\u7ED9\u4F60\u3002\u4F60\u4EEC\u53EF\u4EE5\u6309\u8FD9\u4E2A\u8282\u594F\u51C6\u5907\u4F53\u9A8C\u8BFE\u3002", "Idris notes your feedback and pays $6 for your time. It helps him prepare the open class."] : ["\u4F0A\u5FB7\u91CC\u65AF\u8BB0\u4E0B\u611F\u53D7\u30026\u5143\u8C22\u793C\u4E3A\u4F60\u7559\u7740\uFF0C\u94B1\u5305\u817E\u51FA\u7A7A\u95F4\u540E\u53EF\u5728\u624B\u8BB0\u9886\u53D6\u3002", "Idris notes your feedback. Your $6 payment is reserved; collect it in the journal when your purse has room."];
  }
  need(a.action === "battle-move" && t3.phase === "active", "BATTLE_NOT_ACTIVE");
  const p = a.payload;
  need(p && p.round === t3.bout.round, "BATTLE_ROUND_CONFLICT");
  const move2 = p.move;
  if (move2 === "supply") {
    need(t3.encounter !== "training", "TRAINING_NO_SUPPLY");
    need((s.items["packed-snack"] ?? 0) > 0, "MISSING_ITEM");
  }
  if (t3.encounter === "open-class" && !t3.paid) {
    need(s.energy >= 10, "REST_NEEDED");
    s.energy -= 2;
    t3.paid = true;
  }
  t3.bout = resolveTurn(boutConfigs[t3.encounter], t3.bout, move2);
  if (move2 === "supply") {
    s.items["packed-snack"]--;
    if (!s.items["packed-snack"]) delete s.items["packed-snack"];
  }
  if (t3.encounter === "open-class") {
    advanceAwake(s, 2);
    advanceTown(s, 2);
  }
  if (t3.bout.outcome !== "playing") {
    t3.phase = "result";
    if (t3.encounter === "training" && t3.bout.outcome === "won") {
      flag(s, "battle:training:done");
      if (!s.flags.includes("challenge:sparring")) {
        flag(s, "challenge:sparring");
        s.standing += 2;
        relation(s, 2);
      }
    }
    if (t3.encounter === "open-class" && !s.flags.includes("battle:class:done")) flag(s, "battle:class:awaiting-feedback");
  }
  const last = t3.bout.log.at(-1);
  return [`\u7B2C${t3.bout.round}\u8F6E\uFF1A\u5BF9\u65B9\u2212${last.dealt}\uFF0C\u4F60\u2212${last.taken}\uFF0C\u6062\u590D${last.healed}\u3002`, `Round ${t3.bout.round}: opponent \u2212${last.dealt}, you \u2212${last.taken}, recovered ${last.healed}.`];
}

// src/life/land-contract.ts
var landRenderSlots = [1, 2, 3, 4];
var landMaximum = (land) => land?.schema === 2 ? 4 : 2;
var landBedIds = (land) => landRenderSlots.slice(0, landMaximum(land)).map((n) => "land-bed-" + n);
var isLifeBed = (id, land) => /^life-bed-[1-4]$/.test(id) && Number(id.slice(-1)) <= landMaximum(land);

// src/life/land.ts
var landRegions = [
  { id: "hill-edge", scene: "hill", name: ["\u5C71\u5761\u516C\u5171\u79CD\u690D\u533A", "Hill community growing area"], rect: { x: 460, y: 760, w: 120, h: 84 }, sign: { x: 560, y: 865 }, approach: { x: 552, y: 900 }, permission: ["\u516C\u5171\u571F\u5730\u544A\u793A\uFF1A\u8FD9\u7247\u8FB9\u7F18\u8349\u5730\u53EF\u4F9B\u4F4F\u6237\u5F00\u5C0F\u83DC\u7566\u3002\u4FDD\u7559\u9053\u8DEF\u3001\u4F4F\u6237\u548C\u52A8\u7269\u7684\u6D3B\u52A8\u7A7A\u95F4\uFF1B\u5148\u5F00\u4E24\u7566\uFF0C\u53D6\u5F97\u4E24\u5730\u8BB8\u53EF\u540E\u53EF\u6269\u4E3A\u56DB\u7566\u3002", "Public land notice: residents may make small beds in this edge of grass. Keep paths and neighbors\u2019 and animals\u2019 space clear. Start with two beds; permissions at both growing areas allow expansion to four."] },
  { id: "courtyard-common", scene: "courtyard", name: ["\u9662\u843D\u516C\u5171\u79CD\u690D\u533A", "Courtyard community growing area"], rect: { x: 250, y: 560, w: 90, h: 68 }, sign: { x: 340, y: 610 }, approach: { x: 332, y: 644 }, permission: ["\u4F4F\u6237\u5171\u540C\u8BB8\u53EF\uFF1A\u9662\u843D\u897F\u5357\u8FD9\u7247\u8349\u5730\u53EF\u5F00\u5C0F\u83DC\u7566\u3002\u6B64\u8BB8\u53EF\u53EA\u6388\u4E88\u79CD\u690D\uFF0C\u4E0D\u6539\u53D8\u539F\u6709\u501F\u9053\u65F6\u6BB5\uFF1B\u4FDD\u7559\u51FA\u5165\u53E3\u548C\u8857\u574A\u6D3B\u52A8\u7A7A\u95F4\u3002", "Residents\u2019 shared permission: small beds may be made in this southwest patch of grass. This grants cultivation only and does not change existing passage hours. Keep entrances and neighbors\u2019 space clear."] }
];
var landRegion = (id) => landRegions.find((r) => r.id === id);
var landFootprint = (at) => ({ x: at.x - 24, y: at.y - 24, w: 48, h: 24 });
var landApproach = (at) => ({ x: at.x - 8, y: at.y + 18 });
var permitTarget = (region) => "land-permit:" + region;
var candidateTarget = (region, at) => `land-candidate:${region}:${at.x}:${at.y}`;
var landEntity = (region, at) => {
  const r = landRegion(region);
  if (!r) throw Error("LAND_REGION_UNKNOWN");
  return { id: at ? candidateTarget(region, at) : permitTarget(region), kind: "object", label: at ? ["\u5F85\u786E\u8BA4\u83DC\u7566", "Proposed bed"] : r.name, at: at ?? r.sign, approach: at ? landApproach(at) : r.approach, landRegion: region, landAt: at };
};
function landEntities(s, candidate) {
  return [...landRegions.filter((r) => r.scene === s.scene).map((r) => landEntity(r.id)), ...(s.landV1?.plots ?? []).filter((p) => landRegion(p.region)?.scene === s.scene).map((p) => ({ ...landEntity(p.region, p.at), id: p.id, label: ["\u81EA\u5DF1\u7684\u7A7A\u83DC\u7566", "My empty bed"], landPlot: true })), ...candidate && landRegion(candidate.region)?.scene === s.scene ? [landEntity(candidate.region, candidate.at)] : []];
}
var integer = (n) => Number.isSafeInteger(n) && n >= 0;
var object2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var keys = (v, expected) => Object.keys(v).sort().join(",") === expected.sort().join(",");
var source = (v) => typeof v === "string" && v.length > 0 && v.length <= 120;
var landPoint = (v) => object2(v) && keys(v, ["x", "y"]) && integer(v.x) && integer(v.y) && v.x % 4 === 0 && v.y % 4 === 0;
var inside2 = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
var expand = (r, n) => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });
function assertLandReadable(s) {
  const l = s.landV1;
  if (l === void 0) return;
  const bad = () => {
    throw Error("UNSUPPORTED_LAND_SAVE");
  };
  if (!object2(l) || ![1, 2].includes(l.schema) || !keys(l, l.schema === 2 ? ["schema", "permissions", "plots", "expansion"] : ["schema", "permissions", "plots"]) || !object2(l.permissions) || !Array.isArray(l.plots) || l.plots.length > landMaximum(l)) bad();
  for (const [id, p] of Object.entries(l.permissions)) if (!landRegion(id) || !object2(p) || !keys(p, ["revision", "sourceAction", "minute"]) || p.revision !== 1 || !source(p.sourceAction) || !integer(p.minute) || p.minute > (s.townMinutes ?? 540)) bad();
  if (l.schema === 2) {
    const e = l.expansion;
    if (!object2(e) || !keys(e, ["revision", "sourceAction", "minute"]) || e.revision !== 1 || !source(e.sourceAction) || !integer(e.minute) || e.minute > (s.townMinutes ?? 540) || landRegions.some((r) => !l.permissions[r.id] || l.permissions[r.id].minute > e.minute)) bad();
  }
  const ids = /* @__PURE__ */ new Set();
  for (const p of l.plots) {
    if (!object2(p)) bad();
    const r = landRegion(p.region);
    if (!keys(p, ["id", "region", "geometryRevision", "at", "sourceAction", "minute"]) || !landBedIds(l).includes(p.id) || ids.has(p.id) || !r || p.geometryRevision !== 1 || !l.permissions[p.region] || !landPoint(p.at) || !inside2(r.rect, landFootprint(p.at)) || !source(p.sourceAction) || !integer(p.minute) || p.minute > (s.townMinutes ?? 540) || l.schema === 2 && Number(p.id.slice(-1)) > 2 && p.minute < l.expansion.minute) bad();
    ids.add(p.id);
  }
  for (let i = 0; i < l.plots.length; i++) for (let j = 0; j < i; j++) if (landRegion(l.plots[i].region)?.scene === landRegion(l.plots[j].region)?.scene && overlaps(expand(landFootprint(l.plots[i].at), 12), landFootprint(l.plots[j].at))) bad();
}
function landWorld(base2, l) {
  const scenes = { ...base2.scenes };
  for (const p of l?.plots ?? []) {
    const r = landRegion(p.region);
    if (!r) throw Error("UNSUPPORTED_LAND_SAVE");
    const s = scenes[r.scene];
    scenes[r.scene] = { ...s, obstacles: [...s.obstacles, landFootprint(p.at)] };
  }
  return { ...base2, scenes };
}
function landProtection(scene, entities = rooms[scene].entities) {
  const spawn = rooms[scene].spawn;
  return [...protectionForRoom(entities), { x: spawn.x - 24, y: spawn.y - 24, w: 64, h: 60 }, ...entities.filter((e) => e.person).map((e) => {
    const radius = patrolRadius(e.person) + 28;
    return { x: e.at.x - radius, y: e.at.y - 28, w: radius * 2, h: Math.max(42, e.approach.y - e.at.y) + 56 };
  }), ...animals.flatMap((a) => Object.values(a.schedule).filter((slot2) => slot2.scene === scene).map((slot2) => expand(slot2.region, 20)))];
}
function landGeometry(s, region, at, actualPosition = s.position, extraProtection = []) {
  const r = landRegion(region);
  if (!r || r.scene !== s.scene) return "LAND_SCENE";
  if (!landPoint(at) || !inside2(r.rect, landFootprint(at))) return "LAND_OUTSIDE";
  const footprint = landFootprint(at), base2 = dynamicWorld(s.flags, true), existing = s.landV1?.plots ?? [];
  if ([...base2.scenes[s.scene].obstacles, ...landProtection(s.scene), ...extraProtection].some((o) => overlaps(expand(footprint, 8), o))) return "LAND_PROTECTED";
  if (existing.some((p) => landRegion(p.region)?.scene === s.scene && overlaps(expand(footprint, 12), landFootprint(p.at)))) return "LAND_OVERLAP";
  if ([s.position, actualPosition].some((p) => overlaps(footprint, { ...p, ...base2.actor }))) return "LAND_PLAYER_SPACE";
  const trial = landWorld(base2, { schema: 1, permissions: {}, plots: [...existing, { id: "land-preview", region, geometryRevision: 1, at, sourceAction: "preview", minute: s.townMinutes ?? 540 }] }), approach = landApproach(at), scene = trial.scenes[s.scene];
  const endpoints = [s.position, actualPosition, approach, ...rooms[s.scene].entities.filter((e) => e.kind === "portal").map((e) => e.approach), ...existing.filter((p) => landRegion(p.region)?.scene === s.scene).map((p) => landApproach(p.at))];
  if (endpoints.some((p) => !walkable(trial, s.scene, p) || !findPath(trial, s.scene, scene.spawn, p).length)) return "LAND_NO_ROUTE";
  return null;
}
function landPreview(s, region, at, expansionStarts = true) {
  assertLandReadable(s);
  const r = landRegion(region);
  if (!r || r.scene !== s.scene) throw Error("LAND_SCENE");
  const locked = !!s.activeChallenge || battleLocksWorld(s), permitted = !!s.landV1?.permissions[region], count = s.landV1?.plots.length ?? 0, maximum = landMaximum(s.landV1);
  const cost = (energy, minutes) => {
    const probe = { energy: s.energy - energy, awakeMinutes: s.awakeMinutes };
    advanceAwake(probe, minutes);
    return { cash: 0, energy, minutes, totalEnergy: Math.min(s.energy, s.energy - probe.energy) };
  };
  const missingPermissions = landRegions.filter((r2) => !s.landV1?.permissions[r2.id]).map((r2) => ({ id: r2.id, name: r2.name }));
  const expansionReason = locked ? "CHALLENGE_ACTIVE" : s.landV1?.schema === 2 ? "LAND_ALREADY_EXPANDED" : !expansionStarts ? "LAND_EXPANSION_CLOSED" : missingPermissions.length ? "LAND_EXPANSION_PERMISSION" : count < 2 ? "LAND_EXPANSION_NOT_READY" : s.energy < 4 ? "REST_NEEDED" : null;
  const next = landBedIds(s.landV1).find((id) => !s.landV1?.plots.some((p) => p.id === id)), closed = !!next && Number(next.slice(-1)) > 2 && !expansionStarts;
  const geometry2 = at ? landGeometry(s, region, at) : null;
  const reason = locked ? "CHALLENGE_ACTIVE" : !permitted ? "LAND_PERMISSION" : count >= maximum ? "LAND_CAPACITY" : closed ? "LAND_EXPANSION_CLOSED" : s.energy < 4 ? "REST_NEEDED" : geometry2;
  return { schema: 1, snapshotVersion: s.version, region: r.id, name: r.name, permission: r.permission, permitted, rect: r.rect, sign: r.sign, approach: r.approach, at: at ?? null, footprint: at ? landFootprint(at) : null, target: at ? candidateTarget(region, at) : permitTarget(region), cost: cost(4, 20), count, maximum, reason, canSelect: count < maximum && !closed, canConfirm: !!at && !reason, expansion: { expanded: s.landV1?.schema === 2, maximum: 4, missingPermissions, cost: cost(4, 20), reason: expansionReason, canConfirm: !expansionReason } };
}
function applyLand(before, intent2, admission) {
  assertLandReadable(before);
  const c = intent2.command;
  if (!["permit-land", "cultivate", "expand-land", "clear-bed"].includes(c.verb)) throw Error("INVALID_LAND_COMMAND");
  if (before.version !== intent2.expectedVersion) throw Error("VERSION_CONFLICT");
  if (before.activeChallenge || battleLocksWorld(before)) throw Error("CHALLENGE_ACTIVE");
  const cmd = c;
  const bed = cmd.verb === "clear-bed" ? before.landV1?.plots.find((p) => p.id === cmd.plot) : void 0;
  if (cmd.verb === "clear-bed" && !bed) throw Error("LAND_BED_MISSING");
  const region = cmd.verb === "clear-bed" ? bed.region : cmd.region, r = landRegion(region);
  if (!r || r.scene !== before.scene || !before.visited.includes(r.scene)) throw Error("LAND_SCENE");
  if (admission.land?.region !== region || admission.land.geometryRevision !== 1) throw Error("LAND_ADMISSION_REQUIRED");
  const s = structuredClone(before);
  s.landV1 ??= { schema: 1, permissions: {}, plots: [] };
  const minute3 = s.townMinutes ?? 540;
  let text2;
  const labor2 = (energy, minutes) => {
    if (s.energy < energy) throw Error("REST_NEEDED");
    s.energy -= energy;
    advanceAwake(s, minutes);
    advanceTown(s, minutes);
  };
  if (cmd.verb === "permit-land") {
    if (s.landV1.permissions[region]) throw Error("LAND_ALREADY_PERMITTED");
    s.landV1.permissions[region] = { revision: 1, sourceAction: intent2.actionId, minute: minute3 };
    text2 = ["\u79CD\u690D\u8BB8\u53EF\u5DF2\u8BB0\u4E0B\u3002\u5148\u9009\u4F4D\u7F6E\uFF0C\u770B\u8FC7\u6210\u672C\u540E\u518D\u5F00\u57A6\u3002", "Cultivation permission is recorded. Choose a position and review the cost before making a bed."];
  } else if (cmd.verb === "expand-land") {
    const preview = landPreview(before, region, void 0, admission.land.expansionAllowed === true);
    if (preview.expansion.reason) throw Error(preview.expansion.reason);
    labor2(4, 20);
    s.landV1 = { ...s.landV1, schema: 2, expansion: { revision: 1, sourceAction: intent2.actionId, minute: s.townMinutes ?? minute3 } };
    text2 = ["\u79CD\u690D\u5BB9\u91CF\u5DF2\u6269\u4E3A\u5168\u9547\u56DB\u7566\u3002\u6BCF\u5757\u65B0\u7566\u4ECD\u9700\u9009\u5740\u5E76\u5355\u72EC\u786E\u8BA4\u5F00\u57A6\uFF1B\u539F\u83DC\u7566\u4FDD\u6301\u539F\u4F4D\u3002", "Your growing capacity is now four beds across town. Choose and confirm each new bed separately. Existing beds stay in place."];
  } else if (cmd.verb === "clear-bed") {
    if (s.lifeV1?.plots[cmd.plot.replace("land-", "life-")]) throw Error("LAND_BED_OCCUPIED");
    if (admission.target !== bed.id) throw Error("LAND_TARGET");
    labor2(2, 10);
    s.landV1.plots = s.landV1.plots.filter((p) => p.id !== cmd.plot);
    text2 = ["\u7A7A\u83DC\u7566\u5DF2\u6536\u56DE\u3002\u8BB8\u53EF\u3001\u79CD\u690D\u5BB9\u91CF\u3001\u79CD\u5B50\u4E0E\u91C7\u6536\u8BB0\u5F55\u4FDD\u7559\uFF0C\u53EF\u4EE5\u91CD\u65B0\u9009\u5740\uFF1B\u539F\u5F00\u57A6\u7CBE\u529B\u4E0D\u9000\u56DE\u3002", "The empty bed is cleared. Your permissions, growing capacity, seeds and harvest records remain. Choose a new position; the original effort is not refunded."];
  } else {
    if (!s.landV1.permissions[region]) throw Error("LAND_PERMISSION");
    if (s.landV1.plots.length >= landMaximum(s.landV1)) throw Error("LAND_CAPACITY");
    if (s.energy < 4) throw Error("REST_NEEDED");
    const reason = landGeometry(before, region, cmd.at, admission.land.position);
    if (reason) throw Error(reason);
    const id = landBedIds(s.landV1).find((id2) => !s.landV1.plots.some((p) => p.id === id2));
    if (Number(id.slice(-1)) > 2 && admission.land.expansionAllowed !== true) throw Error("LAND_EXPANSION_CLOSED");
    s.landV1.plots.push({ id, region, geometryRevision: 1, at: { ...cmd.at }, sourceAction: intent2.actionId, minute: minute3 });
    labor2(4, 20);
    text2 = ["\u7A7A\u83DC\u7566\u5DF2\u7ECF\u5F00\u597D\uFF0C\u8BB0\u5F55\u4F1A\u4FDD\u7559\u3002", "Your empty bed is ready and saved."];
  }
  assertLandReadable(s);
  return { head: s, text: text2, event: { id: intent2.actionId, verb: cmd.verb, minute: s.townMinutes ?? 540, cash: 0, energy: s.energy - before.energy, items: {}, relations: {}, facts: [] } };
}

// src/world/road-boundaries.ts
function terrainAt(layout, p) {
  return layout.patches.slice().reverse().find((t3) => p.x >= t3.x && p.x < t3.x + t3.w && p.y >= t3.y && p.y < t3.y + t3.h)?.material;
}
var roadArtContract = Object.freeze({ texturePhase: 160, nativeAtlas: [1024, 1024], grid: [4, 4], cell: [256, 256], cellWorld: 40, sourceWorldScale: 160 / 1024, soilEdgeWidth: [6, 12], stoneEdgeWidth: [8, 12], families: ["compacted-soil-grass", "flat-stone-trim"], soilCells: ["center", "N", "E", "S", "W", "outer-NW", "outer-NE", "outer-SE", "outer-SW", "inner-NW", "inner-NE", "inner-SE", "inner-SW", "cap-N", "cap-S", "gravel"], stoneCells: ["center", "N", "E", "S", "W", "outer-NW", "outer-NE", "outer-SE", "outer-SW", "inner-NW", "inner-NE", "inner-SE", "inner-SW", "T-no-internal-edge", "cross-no-internal-edge", "end"], productionEnabled: true });

// src/world/terrain-ownership.ts
var terrainZoneVisible = (zone, p) => zone === "coast" ? !(p.x >= 1235 && p.x < 2035 && p.y >= 260 && p.y < 820) && p.y < 805 : zone === "beach" ? p.y >= 805 : zone === "path" ? p.x >= 1235 : zone === "market" ? p.y >= 650 : zone === "bazaar" ? p.y < 650 : true;

// src/candidate/shared-admission.ts
var groups = [["market", "bazaar"], ["coast", "beach", "path"]];
var sharedGroup = (id) => groups.find((g) => g.includes(id ?? ""));
var offsets = { market: { x: 0, y: 540 }, bazaar: { x: 125, y: 0 }, coast: { x: 0, y: 0 }, beach: { x: 70, y: 650 }, path: { x: 1155, y: 140 } };
var local = (id, p) => ({ x: p.x - offsets[id].x, y: p.y - offsets[id].y });
var global = (id, p) => ({ x: p.x + offsets[id].x, y: p.y + offsets[id].y });
var bodiesCache = /* @__PURE__ */ new WeakMap();
function sharedBodies(base2, scene) {
  const pair2 = sharedGroup(scene);
  const key2 = pair2[0], old = bodiesCache.get(base2)?.get(key2);
  if (old) return old;
  const bodies = pair2.flatMap((id) => {
    const staticCount = world.scenes[id].obstacles.length, terrainCount = waterBarriers(outdoors[id]).length + outdoors[id].barriers.length;
    return base2.scenes[id].obstacles.filter((_o, i) => i >= terrainCount && i < staticCount || i >= staticCount || pair2[0] === "market" && i >= waterBarriers(outdoors[id]).length && i < terrainCount).map((o) => ({ ...global(id, o), w: o.w, h: o.h }));
  });
  const cache = bodiesCache.get(base2) ?? /* @__PURE__ */ new Map();
  cache.set(key2, bodies);
  bodiesCache.set(base2, cache);
  return bodies;
}
var penetration = (a, b) => Math.min(a.x + a.w - b.x, b.x + b.w - a.x, a.y + a.h - b.y, b.y + b.h - a.y);
var overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
function sharedWalkable(base2, scene, p, previous) {
  const pair2 = sharedGroup(scene);
  if (!pair2.some((id) => walkable(base2, id, local(id, p)))) return false;
  const actor2 = { ...p, ...base2.actor }, before = previous && { ...previous, ...base2.actor };
  return sharedBodies(base2, scene).every((o) => {
    const hit = overlap(actor2, o);
    return !hit || !!before && overlap(before, o) > 0 && penetration(actor2, o) < penetration(before, o) - 1e-7;
  });
}
function sharedZone(p, preferred, previous) {
  if (!previous || Math.hypot(p.x - previous.x, p.y - previous.y) < 1e-9) return preferred;
  const contains = (id) => {
    const q = local(id, p), r = world.scenes[id].interior;
    return q.x >= r.x && q.y >= r.y && q.x + world.actor.w <= r.x + r.w && q.y + world.actor.h <= r.y + r.h;
  };
  const pair2 = sharedGroup(preferred);
  const next = pair2[0] === "market" ? p.y + world.actor.h / 2 >= 650 ? "market" : "bazaar" : contains("path") && p.x + world.actor.w / 2 >= 1280 ? "path" : contains("beach") && p.y + world.actor.h / 2 >= 805 ? "beach" : "coast";
  if (walkable(world, next, local(next, p))) return next;
  if (walkable(world, preferred, local(preferred, p))) return preferred;
  return pair2.find((id) => walkable(world, id, local(id, p))) ?? preferred;
}

// src/candidate/coast-beach.ts
var pair = ["coast", "beach"];
var offsets2 = { coast: { x: 0, y: 0 }, beach: { x: 70, y: 650 } };
var coastBeachPair = (id) => !!id && pair.includes(id);
var local2 = (id, p) => ({ x: p.x - offsets2[id].x, y: p.y - offsets2[id].y });
var global2 = (id, p) => ({ x: p.x + offsets2[id].x, y: p.y + offsets2[id].y });
var bodiesCache2 = /* @__PURE__ */ new WeakMap();
function coastBeachBodies(base2) {
  const old = bodiesCache2.get(base2);
  if (old) return old;
  const bodies = pair.flatMap((id) => {
    const staticCount = world.scenes[id].obstacles.length, terrainCount = waterBarriers(outdoors[id]).length + outdoors[id].barriers.length;
    return base2.scenes[id].obstacles.filter((_o, i) => i >= terrainCount && i < staticCount || i >= staticCount).map((o) => ({ ...global2(id, o), w: o.w, h: o.h }));
  });
  bodiesCache2.set(base2, bodies);
  return bodies;
}
var penetration2 = (a, b) => Math.min(a.x + a.w - b.x, b.x + b.w - a.x, a.y + a.h - b.y, b.y + b.h - a.y);
var overlap2 = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
function coastBeachWalkable(base2, p, previous) {
  if (!pair.some((id) => walkable(base2, id, local2(id, p)))) return false;
  const actor2 = { ...p, ...base2.actor }, before = previous && { ...previous, ...base2.actor };
  return coastBeachBodies(base2).every((o) => {
    const hit = overlap2(actor2, o);
    return !hit || !!before && overlap2(before, o) > 0 && penetration2(actor2, o) < penetration2(before, o) - 1e-7;
  });
}

// src/candidate/continuity.ts
var CLUSTER = "market-bazaar";
var COASTAL = "coast-beach-path";
var clusters = {
  [CLUSTER]: { id: CLUSTER, zones: ["market", "bazaar"], canvas: { x: 0, y: 0, w: 1440, h: 1632 }, seams: [{ zones: ["market", "bazaar"], corridor: { x: 555, y: 620, w: 100, h: 60 }, axis: "y", boundary: 650, gates: { market: { x: 597, y: 720 }, bazaar: { x: 597, y: 580 } } }] },
  [COASTAL]: { id: COASTAL, zones: ["coast", "beach", "path"], canvas: { x: 0, y: 0, w: 2600, h: 1744 }, seams: [
    { zones: ["coast", "beach"], corridor: { x: 495, y: 765, w: 110, h: 90 }, axis: "y", boundary: 805, gates: { coast: { x: 542, y: 765 }, beach: { x: 542, y: 845 } } },
    { zones: ["coast", "path"], corridor: { x: 1235, y: 425, w: 100, h: 100 }, axis: "x", boundary: 1280, gates: { coast: { x: 1235, y: 469 }, path: { x: 1320, y: 469 } } }
  ] }
};
var offsets3 = { market: { x: 0, y: 540 }, bazaar: { x: 125, y: 0 }, coast: { x: 0, y: 0 }, beach: { x: 70, y: 650 }, path: { x: 1155, y: 140 } };
var clusterCanvas = clusters[CLUSTER].canvas;
var seam = clusters[CLUSTER].seams[0].corridor;
var clusterFor = (id) => clusters[id] ?? Object.values(clusters).find((c) => c.zones.includes(id));
var zonesFor = (id) => clusterFor(id)?.zones ?? [id];
var isCluster = (id) => id in offsets3;
var renderScene = (id) => clusterFor(id)?.id ?? id;
var globalPoint = (id, p) => ({ x: p.x + (offsets3[id]?.x ?? 0), y: p.y + (offsets3[id]?.y ?? 0) });
var localPoint = (id, p) => ({ x: p.x - (offsets3[id]?.x ?? 0), y: p.y - (offsets3[id]?.y ?? 0) });
var sameCluster = (a, b) => isCluster(a) && isCluster(b) && renderScene(a) === renderScene(b);
var inside3 = (r, p, a = world.actor) => p.x >= r.x && p.y >= r.y && p.x + a.w <= r.x + r.w && p.y + a.h <= r.y + r.h;
var roomContains = (id, p) => inside3({ ...globalPoint(id, world.scenes[id].interior), w: world.scenes[id].interior.w, h: world.scenes[id].interior.h }, p);
function pointZone(p, preferred, previous) {
  const c = clusterFor(preferred ?? CLUSTER) ?? clusters[CLUSTER];
  if (sharedGroup(preferred)) return sharedZone(p, preferred, previous);
  if (c.id === COASTAL && preferred && previous) {
    for (const s of c.seams) {
      if (!s.zones.includes(preferred) || !inside3(s.corridor, p) || !inside3(s.corridor, previous)) continue;
      const shift = s.axis === "x" ? world.actor.w / 2 : world.actor.h / 2, a = previous[s.axis] + shift, b = p[s.axis] + shift;
      const outgoing = s.zones[0] === preferred;
      if (outgoing ? a < s.boundary && b >= s.boundary : a >= s.boundary && b < s.boundary) return s.zones[outgoing ? 1 : 0];
    }
  }
  if (preferred && c.zones.includes(preferred) && roomContains(preferred, p)) return preferred;
  for (const id of c.zones) if (roomContains(id, p)) return id;
  return c.id === CLUSTER ? p.y + 6 < 650 ? "bazaar" : "market" : preferred ?? c.zones[0];
}
function clusterWalkable(base2, p, preferred, previous) {
  const c = clusterFor(preferred ?? CLUSTER) ?? clusters[CLUSTER];
  if (sharedGroup(preferred)) return sharedWalkable(base2, preferred, p, previous);
  if (c.id === COASTAL) {
    const zone2 = pointZone(p, preferred, previous);
    if (coastBeachPair(preferred) && coastBeachPair(zone2)) return coastBeachWalkable(base2, p, previous);
    if (preferred && zone2 !== preferred) {
      if (!previous || !c.seams.some((s) => s.zones.includes(preferred) && s.zones.includes(zone2) && inside3(s.corridor, p) && inside3(s.corridor, previous))) return false;
    }
    return walkable(base2, zone2, localPoint(zone2, p));
  }
  if (preferred && isCluster(preferred) && walkable(base2, preferred, localPoint(preferred, p))) return true;
  const zone = pointZone(p, preferred), q = localPoint(zone, p);
  if ((preferred && zone !== preferred || p.y < 650 && p.y + base2.actor.h > 650) && (p.x < 555 || p.x + base2.actor.w > 655)) return false;
  if (walkable(base2, zone, q)) return true;
  return inside3(seam, p) && !c.zones.some((id) => base2.scenes[id].obstacles.some((o) => {
    const at = globalPoint(id, o);
    return p.x < at.x + o.w && p.x + base2.actor.w > at.x && p.y < at.y + o.h && p.y + base2.actor.h > at.y;
  }));
}
function longTravelMinutes(from, to) {
  const a = rooms[from]?.area, b = rooms[to]?.area;
  if (!a || !b || a === b) return 0;
  const queue = [{ id: a, n: 0 }], seen5 = /* @__PURE__ */ new Set([a]);
  for (const q of queue) {
    if (q.id === b) return q.n * 10;
    for (const e of rooms[q.id].entities) {
      const next = e.destination && rooms[e.destination]?.area;
      if (next && !seen5.has(next)) {
        seen5.add(next);
        queue.push({ id: next, n: q.n + 1 });
      }
    }
  }
  throw Error("TRAVEL_ROUTE_UNAVAILABLE");
}

// src/world/shore-water.ts
var castReach = 96;
var castOffsets = [0, ...Array.from({ length: 32 }, (_, i) => (i + 1) * 3).flatMap((n) => [-n, n])];
var inside4 = (r, p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
function material(zone, p) {
  const l = outdoors[zone];
  if (!l) return;
  const top = terrainAt(l, p);
  if (inside4(l.bounds, p)) return top;
  return top === "water" ? "water" : l.patches[0]?.material;
}
function waterAt(scene, p) {
  const gp = globalPoint(scene, p), zones = zonesFor(scene).filter((z) => outdoors[z] && terrainZoneVisible(z, gp));
  const zone = zones.find((z) => inside4(outdoors[z].bounds, localPoint(z, gp))) ?? zones.find((z) => {
    const q = localPoint(z, gp);
    return q.x >= 0 && q.y >= 0 && q.x < 1440 && q.y < 1088;
  }) ?? (zones.includes(scene) ? scene : zones[0]);
  if (!zone || material(zone, localPoint(zone, gp)) !== "water") return null;
  return { zone, water: zone === "path" ? "stream" : "saltwater" };
}
var cells = /* @__PURE__ */ new Map();
function shoreWaterCells(scene) {
  const key2 = renderScene(scene);
  let cached = cells.get(key2);
  if (cached) return cached;
  const zones = zonesFor(scene).filter((z) => outdoors[z]);
  if (!zones.length) return [];
  const xs = /* @__PURE__ */ new Set([-128, 0, 1235, 2035]), ys = /* @__PURE__ */ new Set([-128, 0, 260, 650, 805, 820]);
  for (const z of zones) {
    const l = outdoors[z], o = globalPoint(z, { x: 0, y: 0 });
    for (const r of [l.bounds, ...l.patches, { x: -128, y: -128, w: 1696, h: 1344 }]) {
      xs.add(o.x + r.x);
      xs.add(o.x + r.x + r.w);
      ys.add(o.y + r.y);
      ys.add(o.y + r.y + r.h);
    }
  }
  const xx = [...xs].sort((a, b) => a - b), yy = [...ys].sort((a, b) => a - b), out = [];
  for (let j = 0; j < yy.length - 1; j++) for (let i = 0; i < xx.length - 1; i++) {
    const r = { x: xx[i], y: yy[j], w: xx[i + 1] - xx[i], h: yy[j + 1] - yy[j] }, at = { x: r.x + r.w / 2, y: r.y + r.h / 2 }, w = waterAt(scene, localPoint(scene, at));
    if (w) out.push({ ...r, ...w });
  }
  cells.set(key2, out);
  return out;
}
var waterObstacleKeys = /* @__PURE__ */ new Map();
var rectKey = (r) => [r.x, r.y, r.w, r.h].join(",");
function clearCast(scene, from, to, world3) {
  const blockers = zonesFor(scene).flatMap((zone) => {
    let water = waterObstacleKeys.get(zone);
    if (!water) {
      water = new Set(outdoors[zone] ? waterBarriers(outdoors[zone]).map(rectKey) : []);
      waterObstacleKeys.set(zone, water);
    }
    return (world3.scenes[zone]?.obstacles ?? []).filter((o) => !water.has(rectKey(o))).map((o) => ({ ...globalPoint(zone, o), w: o.w, h: o.h, zone }));
  }), a = globalPoint(scene, from), b = globalPoint(scene, to), steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
  for (let i = 1; i <= steps; i++) {
    const gp = { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps };
    if (blockers.some((r) => terrainZoneVisible(r.zone, gp) && inside4(r, gp))) return false;
  }
  return true;
}
function checkShore(scene, standing, world3, aim) {
  if (!world3.scenes[scene] || !walkable(world3, scene, standing)) return { ok: false, reason: "INVALID_STANDING" };
  const water = shoreWaterCells(scene);
  if (!water.length) return { ok: false, reason: "NO_WATER" };
  const foot = { x: standing.x + world3.actor.w / 2, y: standing.y + world3.actor.h / 2 };
  if (aim) {
    if (!Number.isFinite(aim.x) || !Number.isFinite(aim.y) || !waterAt(scene, aim)) return { ok: false, reason: "NO_WATER" };
    const distance2 = Math.hypot(aim.x - foot.x, aim.y - foot.y);
    if (distance2 > castReach) return { ok: false, reason: "WATER_TOO_FAR" };
    if (!clearCast(scene, foot, aim, world3)) return { ok: false, reason: "CAST_BLOCKED" };
    return { ok: true, target: { at: { ...aim }, ...waterAt(scene, aim), distance: distance2 } };
  }
  const gf = globalPoint(scene, foot), candidates2 = [];
  for (const r of water) {
    const x = Math.max(r.x + 0.25, Math.min(r.x + r.w - 0.25, gf.x)), y = Math.max(r.y + 0.25, Math.min(r.y + r.h - 0.25, gf.y));
    if (Math.hypot(x - gf.x, y - gf.y) > castReach) continue;
    for (const offset of castOffsets) for (const axis2 of ["x", "y"]) {
      const gp = { x: Math.max(r.x + 0.25, Math.min(r.x + r.w - 0.25, x + (axis2 === "x" ? offset : 0))), y: Math.max(r.y + 0.25, Math.min(r.y + r.h - 0.25, y + (axis2 === "y" ? offset : 0))) }, p = localPoint(scene, gp), distance2 = Math.hypot(gp.x - gf.x, gp.y - gf.y);
      if (distance2 <= castReach && waterAt(scene, p)) candidates2.push({ at: p, zone: r.zone, water: r.water, distance: distance2 });
    }
  }
  candidates2.sort((a, b) => a.distance - b.distance);
  for (const target of candidates2) if (clearCast(scene, foot, target.at, world3)) return { ok: true, target };
  return { ok: false, reason: candidates2.length ? "CAST_BLOCKED" : "WATER_TOO_FAR" };
}

// src/challenges/fishing.ts
var fishingInitial = () => ({ tick: 0, tension: 0.12, progress: 0, dangerTicks: 0, result: "playing" });
var fishingPull = (tick) => tick < 90 ? 0.15 : (Math.sin((tick - 90) / 58) + 1) / 2;
function fishingStep(before, reel, profile = "regular") {
  if (before.result !== "playing") return before;
  const s = { ...before }, pull = fishingPull(s.tick);
  s.tension = Math.max(0, Math.min(1.1, s.tension + (reel ? profile === "first" ? 2e-3 + pull * 7e-3 : 4e-3 + pull * 0.018 : -0.016)));
  s.progress = Math.max(0, Math.min(1, s.progress + (reel ? profile === "first" ? 8e-3 - pull * 2e-3 : 45e-4 - pull * 27e-4 : -4e-4)));
  s.dangerTicks = s.tension >= 1 ? s.dangerTicks + 1 : 0;
  s.tick++;
  if (s.dangerTicks >= (profile === "first" ? 24 : 10) || s.tick >= 1500) s.result = "escaped";
  else if (s.progress >= 1) s.result = "caught";
  return s;
}
function replayFishing(runs, profile = "regular") {
  if (!Array.isArray(runs) || !runs.length || runs.length > 1500) throw Error("INVALID_FISHING_INPUT");
  let s = fishingInitial(), ticks = 0;
  for (const run of runs) {
    if (typeof run.reel !== "boolean" || !Number.isInteger(run.ticks) || run.ticks < 1 || (ticks += run.ticks) > 1500) throw Error("INVALID_FISHING_INPUT");
    for (let n = 0; n < run.ticks; n++) {
      if (s.result !== "playing") throw Error("INPUT_AFTER_RESULT");
      s = fishingStep(s, run.reel, profile);
    }
  }
  return s;
}

// src/challenges/shore-fishing.ts
var basicRod = "basic-fishing-rod";
var basicLure = "reusable-fishing-lure";
function pendingLegacyResult(runs) {
  const replay = replayFishing(runs);
  if (replay.result === "playing") throw Error("CHALLENGE_NOT_FINISHED");
  return { schema: 1, input: { runs: structuredClone(runs) }, result: replay.result, legacy: true };
}
function pendingShoreResult(encounter, input) {
  const replay = replayShore(encounter, input);
  if (replay.result === "playing") throw Error("CHALLENGE_NOT_FINISHED");
  return { schema: 1, input: structuredClone({ hookTick: input.hookTick, waitTicks: input.waitTicks, runs: input.runs }), result: replay.result };
}
var gate = (v, code) => {
  if (!v) throw Error(code);
};
var hasFishingKit = (s) => (s.items[basicRod] ?? 0) > 0 && (s.items[basicLure] ?? 0) > 0;
function claimFishingKit(s) {
  gate(!s.activeChallenge && (!s.turnBattle || s.turnBattle.phase === "paused"), "CHALLENGE_ACTIVE");
  s.items[basicRod] = Math.max(1, s.items[basicRod] ?? 0);
  s.items[basicLure] = Math.max(1, s.items[basicLure] ?? 0);
  s.fishingV1 ??= { schema: 1, kit: true, caught: 0 };
  return s.turnBattle?.phase === "paused" ? ["\u57FA\u7840\u9493\u5177\u5DF2\u514D\u8D39\u653E\u8FDB\u884C\u56CA\u3002\u5BF9\u7EC3\u4ECD\u4FDD\u7559\u6682\u505C\u8FDB\u5EA6\uFF1B\u5F00\u9493\u524D\u8BF7\u5148\u5728\u5730\u56FE\u7684\u63A2\u7D22\u4E8B\u9879\u4E2D\u5904\u7406\u5BF9\u7EC3\u3002", "Your free fishing kit is in your bag. Your paused bout is preserved; manage it in Map \u2192 Exploration before casting."] : ["\u57FA\u7840\u7AFF\u548C\u53EF\u91CD\u590D\u4F7F\u7528\u7684\u62DF\u9975\u5DF2\u653E\u8FDB\u884C\u56CA\uFF0C\u514D\u8D39\u3002\u8D70\u8FD1\u53EF\u8FBE\u65E0\u906E\u6321\u6C34\u8FB9\u5C31\u80FD\u8BD5\u7AFF\u3002", "Your free basic rod and reusable lure are in your bag. Try them from a reachable, clear water edge."];
}
function makeShoreEncounter(s, a, world3) {
  gate(!s.turnBattle, "FISHING_PRACTICE_PAUSED");
  gate(hasFishingKit(s), "FISHING_KIT_NEEDED");
  gate(s.energy >= 10, "REST_NEEDED");
  const aim = a.payload?.cast;
  gate(aim && Number.isFinite(aim.x) && Number.isFinite(aim.y), "FISHING_AIM_REQUIRED");
  const check = checkShore(s.scene, s.position, landWorld(world3, s.landV1), aim);
  if (!check.ok) throw Error("FISHING_" + check.reason);
  const minute3 = s.townMinutes ?? 540, first = (s.fishingV1?.caught ?? 0) === 0, night = minute3 % 1440 < 360 || minute3 % 1440 >= 1020;
  return { schema: 1, rules: "shore-fishing-v1", scene: s.scene, standing: { ...s.position }, cast: { ...check.target.at }, water: check.target.water, zone: check.target.zone, minute: minute3, species: check.target.water === "stream" ? "stream-minnow" : night ? "night-mullet" : "bay-silverside", first, biteTick: 45, hookWindow: first ? 180 : 120 };
}
function replayShore(encounter, input) {
  gate(input && Number.isSafeInteger(input.waitTicks) && input.waitTicks >= 0 && input.waitTicks <= encounter.biteTick + encounter.hookWindow, "INVALID_FISHING_INPUT");
  if (input.hookTick === null) {
    gate(input.waitTicks === encounter.biteTick + encounter.hookWindow && Array.isArray(input.runs) && input.runs.length === 0, "FISHING_NOT_FINISHED");
    return { result: "escaped" };
  }
  gate(Number.isSafeInteger(input.hookTick) && input.hookTick >= encounter.biteTick && input.hookTick < encounter.biteTick + encounter.hookWindow && input.waitTicks === input.hookTick, "INVALID_FISHING_HOOK");
  const result = replayFishing(input.runs, encounter.first ? "first" : "regular");
  gate(result.result !== "playing", "CHALLENGE_NOT_FINISHED");
  return result;
}
var speciesNames = { "bay-silverside": ["\u6D77\u6E7E\u94F6\u9CDE\u9C7C", "Bay silverside"], "night-mullet": ["\u591C\u6E38\u9CBB\u9C7C", "Night mullet"], "stream-minnow": ["\u6EAA\u8FB9\u5C0F\u9C7C", "Stream minnow"] };
function validFishingMemory(s) {
  const pending = s.activeChallenge?.fishingPending;
  if (pending) {
    try {
      if (s.activeChallenge?.kind !== "fishing" || pending.schema !== 1) return false;
      const expected = pending.legacy === true ? !s.activeChallenge.fishing ? pendingLegacyResult(pending.input.runs) : null : s.activeChallenge.fishing ? pendingShoreResult(s.activeChallenge.fishing, pending.input) : null;
      if (!expected || expected.result !== pending.result) return false;
    } catch {
      return false;
    }
  }
  const m = s.fishingV1, c = s.activeChallenge?.fishing;
  if (m && (m.schema !== 1 || m.kit !== true || !Number.isSafeInteger(m.caught) || m.caught < 0 || !hasFishingKit(s) || m.lastCatch && (!speciesNames[m.lastCatch.species] || !["saltwater", "stream"].includes(m.lastCatch.water) || !Number.isSafeInteger(m.lastCatch.minute) || typeof m.lastCatch.action !== "string"))) return false;
  if (c && (c.schema !== 1 || c.rules !== "shore-fishing-v1" || s.activeChallenge?.kind !== "fishing" || c.scene !== s.scene || !speciesNames[c.species] || !["saltwater", "stream"].includes(c.water) || typeof c.first !== "boolean" || c.biteTick !== 45 || ![120, 180].includes(c.hookWindow) || ![c.cast.x, c.cast.y, c.standing.x, c.standing.y].every(Number.isFinite))) return false;
  return true;
}

// src/story/tech-nomads.ts
var seen = (s, p, id) => s.flags.includes(`talk:${p}:${id}`);
var started = (s, p) => seen(s, p, "nomads-v1-start");
var consulted = (s, p) => {
  const n = techNomad(p);
  return seen(s, n.story.partner, `nomads-v1-${p}-consult`);
};
var memory = (s, p) => s.techNomadsV1?.stories[p];
var topic = (id, label, reply, once = true) => ({ id, label, reply, once });
var mark = (s, f2) => {
  if (!s.flags.includes(f2)) s.flags.push(f2);
};
function request(s, p) {
  const n = techNomad(p), known = s.known.includes(n.story.partner);
  if (p === "harper") return known ? ["\u201C\u6211\u5DEE\u70B9\u628A\u65B0\u53F6\u6392\u6210\u6BCF\u65E5\u8FDB\u5EA6\u8868\u3002\u60F3\u5148\u542C\u542C\u57C3\u7433\u5A1C\u4E3A\u4EC0\u4E48\u559C\u6B22\u770B\u65B0\u53F6\uFF0C\u518D\u95EE\u5979\u613F\u4E0D\u613F\u610F\u88AB\u8BB0\u5F55\u3002\u53BB\u8DDF\u5979\u804A\u804A\u82B1\u8349\u597D\u5417\uFF1F\u201D", "\u201CI nearly turned new leaves into a daily progress chart. I want to hear why Elena enjoys them, then ask whether a record is welcome. Could you talk with her about the garden?\u201D"] : ["\u201C\u6211\u5DEE\u70B9\u628A\u65B0\u53F6\u6392\u6210\u6BCF\u65E5\u8FDB\u5EA6\u8868\u3002\u60F3\u5148\u542C\u542C\u7167\u987E\u82B1\u8349\u7684\u4EBA\u600E\u6837\u7B49\u5F85\u3002\u5148\u8BA4\u8BC6\u82B1\u56ED\u91CC\u7684\u90BB\u5C45\uFF0C\u542C\u542C\u5BF9\u65B9\u559C\u6B22\u4EC0\u4E48\uFF0C\u518D\u95EE\u8BB0\u5F55\u7684\u4E8B\u597D\u5417\uFF1F\u201D", "\u201CI nearly turned new leaves into a daily progress chart. I want to hear how someone who cares for plants waits. Could you first meet a garden neighbor and hear what they enjoy, before asking about a record?\u201D"];
  if (p === "tess") return known && s.flags.includes("talk:nell:life") ? ["\u201C\u5185\u5C14\u7559\u7740\u4E00\u5F20\u7A7A\u767D\u660E\u4FE1\u7247\u3002\u6211\u4E5F\u4E00\u76F4\u6CA1\u5199\u5F00\u5934\u3002\u80FD\u95EE\u95EE\u5979\uFF0C\u5361\u7247\u80FD\u4E0D\u80FD\u4E0D\u8981\u6C42\u56DE\u4FE1\uFF1F\u5199\u6216\u4E0D\u5199\u3001\u5BC4\u6216\u4E0D\u5BC4\uFF0C\u6211\u60F3\u81EA\u5DF1\u6162\u6162\u51B3\u5B9A\u3002\u201D", "\u201CNell keeps a blank postcard. Mine has no first line either. Could you ask her whether a card can require no reply? Writing or keeping it, sending it or not: I want to decide slowly.\u201D"] : ["\u201C\u8FD9\u5F20\u5361\u7247\u4E00\u76F4\u6CA1\u5F00\u5934\u3002\u6211\u60F3\u5148\u542C\u65E7\u7269\u5E97\u7ECF\u8425\u8005\u613F\u610F\u7559\u4E0B\u4EC0\u4E48\uFF0C\u518D\u95EE\u4E00\u5F20\u5361\u7247\u80FD\u4E0D\u80FD\u4E0D\u8981\u6C42\u56DE\u4FE1\u3002\u5148\u8BA4\u8BC6\u5BF9\u65B9\uFF0C\u542C\u90A3\u6BB5\u751F\u6D3B\u6545\u4E8B\uFF0C\u597D\u5417\uFF1F\u201D", "\u201CThis card still has no first line. I want to hear what the keeper of Second Chances wants to preserve, then ask whether a card can require no reply. Could you meet them and listen to that everyday story first?\u201D"];
  return known ? ["\u201C\u683C\u5170\u7279\u8BF4\u9000\u4F11\u540E\u5728\u5B66\u7740\u4E0D\u7B97\u6BCF\u4EF6\u4E8B\u7684\u56DE\u62A5\u3002\u6211\u60F3\u5148\u95EE\uFF0C\u4ED6\u4ECA\u5929\u613F\u4E0D\u613F\u610F\u8C08\u8FC7\u53BB\uFF0C\u8FD8\u662F\u53EA\u5750\u4E00\u4F1A\u513F\u3002\u522B\u628A\u804A\u5929\u53D8\u6210\u8BBF\u8C08\uFF0C\u597D\u5417\uFF1F\u201D", "\u201CGrant said retirement is teaching him to leave returns uncalculated. I want to ask whether he would like to talk about the past today, or just sit. Let\u2019s keep company from becoming an interview.\u201D"] : ["\u201C\u6211\u60F3\u548C\u5EAD\u9662\u91CC\u7684\u90BB\u5C45\u5750\u4E00\u4F1A\u513F\uFF0C\u4F46\u5148\u8981\u8BA4\u8BC6\u5BF9\u65B9\uFF0C\u95EE\u4ECA\u5929\u613F\u4E0D\u613F\u610F\u8BF4\u8BDD\u3002\u4E0D\u662F\u627E\u7814\u7A76\u5BF9\u8C61\uFF0C\u4E5F\u4E0D\u8BB0\u5F55\u4E2A\u4EBA\u8D44\u6599\u3002\u201D", "\u201CI would like company in the courtyard, but first I need to meet someone and ask whether conversation is welcome today. No research participant or personal record.\u201D"];
}
function nomadChoiceHere(s, p) {
  if (p === "harper") return s.scene === "garden" && townMinutes(s) % 1440 >= 840 && residentHere(s, "elena", "garden");
  if (p === "noor") return s.scene === "courtyard" && residentHere(s, "grant", "courtyard");
  return true;
}
function nomadTopics(s, person) {
  if (!s.known.includes(person) || !residentHere(s, person, s.scene) || !techNomadAdmitted(person)) return [];
  const n = techNomad(person), options = [];
  if (n) {
    const defer = nomadDeferral(person, s);
    if (defer) return [topic("nomads-v1-defer", ["\u73B0\u5728\u65B9\u4FBF\u8BF4\u8BDD\u5417\uFF1F", "Is this a good time to talk?"], defer, false)];
    if (!started(s, person)) options.push(topic("nomads-v1-start", n.story.question, request(s, person)));
    else if (!memory(s, person) && consulted(s, person) && nomadChoiceHere(s, person)) options.push(...n.story.choices.map((c) => topic("nomads-v1-" + c.id, c.label, c.reply)));
    const done2 = memory(s, person);
    if (done2 && done2.recalledAt === void 0 && townMinutes(s) >= done2.completedAt + n.story.cooldownMinutes) options.push(topic("nomads-v1-recall", ["\u540E\u6765\uFF0C\u4F60\u8FD8\u8BB0\u5F97\u90A3\u6B21\u9009\u62E9\u5417\uFF1F", "Has that choice stayed with you?"], n.story.choices.find((c) => c.id === done2.choice).recall));
    options.push(topic("nomads-v1-life", ["\u4E3A\u4EC0\u4E48\u9009\u62E9\u5728\u6D77\u6E7E\u77ED\u4F4F\uFF1F", "Why spend some time in the bay?"], [n.personalLife.reasonForStay[0] + " " + n.personalLife.interest[0], n.personalLife.reasonForStay[1] + " " + n.personalLife.interest[1]]));
    if (!["life-only-by-default", "consent-first"].includes(nomadSchedule(person, s).talk)) options.push(...n.professionalTopics.map((t3) => topic("nomads-v1-" + t3.id, t3.label, t3.reply)));
    options.push(topic("routine", ["\u5E73\u65F6\u5728\u54EA\u91CC\u3001\u51E0\u70B9\u65B9\u4FBF\u627E\u4F60\uFF1F", "Where and when can I find you?"], nomadRoutine(person)));
  }
  for (const p of techNomads.filter((p2) => p2.story.partner === person && techNomadAdmitted(p2.id) && started(s, p2.id) && !memory(s, p2.id) && (!p2.story.partnerPrerequisite || s.flags.includes(p2.story.partnerPrerequisite)))) options.push(topic(`nomads-v1-${p.id}-consult`, p.story.consultPrompt, p.story.partnerReply));
  return options.filter((t3) => !t3.once || !seen(s, person, t3.id));
}
function nomadTopicIds(person) {
  const n = techNomad(person);
  return [...n ? ["nomads-v1-start", "nomads-v1-defer", "nomads-v1-life", "routine", "nomads-v1-recall", ...n.professionalTopics.map((t3) => "nomads-v1-" + t3.id), ...n.story.choices.map((c) => "nomads-v1-" + c.id)] : [], ...techNomads.filter((p) => p.story.partner === person).map((p) => `nomads-v1-${p.id}-consult`)];
}
function applyNomadTopic(s, person, id) {
  const n = techNomad(person);
  if (!n) return;
  if (id === "nomads-v1-recall") {
    const m = memory(s, person);
    if (!m || m.recalledAt !== void 0 || townMinutes(s) < m.completedAt + n.story.cooldownMinutes) throw Error("NOMAD_RECALL_NOT_READY");
    m.recalledAt = townMinutes(s);
    return;
  }
  const choice2 = n.story.choices.find((c) => id === "nomads-v1-" + c.id);
  if (!choice2) return;
  if (memory(s, person) || !started(s, person) || !consulted(s, person) || !s.known.includes(n.story.partner) || !nomadChoiceHere(s, person)) throw Error("NOMAD_STORY_NOT_READY");
  s.techNomadsV1 ??= { schema: 1, stories: {} };
  s.techNomadsV1.stories[person] = { choice: choice2.id, completedAt: townMinutes(s) };
  mark(s, `${n.story.id}:done`);
  for (const who of [person, n.story.partner]) s.relations[who] = Math.min(100, (s.relations[who] ?? 0) + 1);
}
function validNomadMemory(s) {
  const m = s.techNomadsV1;
  if (m === void 0) return true;
  if (!m || m.schema !== 1 || !m.stories || typeof m.stories !== "object" || Array.isArray(m.stories)) return false;
  return Object.entries(m.stories).every(([id, v]) => {
    const n = techNomad(id);
    return !!n && !!v && typeof v === "object" && n.story.choices.some((c) => c.id === v.choice) && Number.isSafeInteger(v.completedAt) && v.completedAt >= 0 && v.completedAt <= townMinutes(s) && started(s, id) && consulted(s, id) && s.known.includes(id) && s.known.includes(n.story.partner) && s.flags.includes(`${n.story.id}:done`) && seen(s, id, "nomads-v1-" + v.choice) && (v.recalledAt === void 0 || Number.isSafeInteger(v.recalledAt) && v.recalledAt >= v.completedAt + n.story.cooldownMinutes && v.recalledAt <= townMinutes(s) && seen(s, id, "nomads-v1-recall"));
  });
}
function nomadRoutine(person) {
  if (!techNomad(person)) return;
  const labels2 = { harper: ["\u201C06:00\u201312:00\u5728\u5496\u5561\u9986\uFF0C08:00\u201311:00\u4E13\u6CE8\uFF1B12:00\u201317:00\u53BB\u82B1\u56ED\uFF0C14:00\u540E\u9002\u5408\u4E00\u8D77\u770B\u65B0\u53F6\uFF1B17:00\u201321:00\u5728\u6D77\u5CB8\u3002\u591C\u95F4\u4F11\u606F\u3002\u5496\u5561\u9986\u5EA7\u4F4D\u8FD8\u8981\u5148\u95EE\u5E97\u4E3B\uFF0C\u4E0D\u662F\u529E\u516C\u8BBE\u65BD\u7684\u627F\u8BFA\u3002\u201D", "\u201CThe caf\xE9 06:00\u201312:00, focusing 08:00\u201311:00; the garden 12:00\u201317:00, with room to look at leaves after 14:00; the coast 17:00\u201321:00. I rest at night. I still ask the caf\xE9 keeper about seating; no work facilities are promised.\u201D"], tess: ["\u201C06:00\u201312:00\u65E7\u8857\uFF0C12:00\u201317:00\u5496\u5561\u9986\uFF0C13:00\u201316:00\u4E13\u6CE8\uFF1B17:00\u201321:00\u53BB\u7801\u5934\uFF0C\u4E4B\u540E\u4F11\u606F\u3002\u6211\u4F1A\u5148\u95EE\u5E97\u4E3B\u77ED\u65F6\u5B89\u9759\u6574\u7406\u662F\u5426\u5408\u9002\uFF0C\u4E0D\u9ED8\u8BA4\u63D0\u4F9BWiFi\u6216\u7535\u6E90\u3002\u201D", "\u201CMarket Lane 06:00\u201312:00; the caf\xE9 12:00\u201317:00, focusing 13:00\u201316:00; the pier 17:00\u201321:00, then rest. I ask the keeper about a quiet visit first, without assuming Wi-Fi or power.\u201D"], noor: ["\u201C06:00\u201312:00\u6D77\u5CB8\uFF0C12:00\u201317:00\u65E7\u7269\u5E97\uFF0C13:00\u201315:00\u4E13\u6CE8\uFF1B17:00\u201321:00\u5EAD\u9662\uFF0C\u5148\u95EE\u662F\u5426\u613F\u610F\u4E00\u8D77\u5750\u3002\u591C\u95F4\u4E0D\u5916\u51FA\uFF0C\u9605\u8BFB\u4E5F\u8981\u5148\u95EE\u5E97\u4E3B\u662F\u5426\u59A8\u788D\u8425\u4E1A\u3002\u201D", "\u201CThe coast 06:00\u201312:00; Second Chances 12:00\u201317:00, focusing 13:00\u201315:00; the courtyard 17:00\u201321:00, asking whether company is welcome. I stay in at night and ask the shopkeeper whether reading fits the business.\u201D"] };
  return labels2[person];
}

// src/story/resident-guide.ts
function routineReply(person) {
  const n = nomadRoutine(person);
  if (n) return n;
  const r = residentRoutes[person];
  return [`\u201C\u4E0A\u5348\u5E38\u5728${rooms[r[0].scene].title[0]}\uFF0C\u5341\u4E8C\u70B9\u540E\u53BB${rooms[r[1].scene].title[0]}\uFF0C\u5341\u4E03\u70B9\u5230\u4E8C\u5341\u4E00\u70B9\u901A\u5E38\u5728${rooms[r[2].scene].title[0]}\u3002\u53EA\u662F\u5E73\u65E5\u7684\u4E60\u60EF\uFF0C\u4E0D\u7528\u7279\u610F\u8D76\u3002\u201D`, `\u201CMornings usually find me at ${rooms[r[0].scene].title[1]}, after noon at ${rooms[r[1].scene].title[1]}, and from 17:00 to 21:00 at ${rooms[r[2].scene].title[1]}. Just my usual routine. No need to rush.\u201D`];
}

// src/story/chapel-priest.ts
var seen2 = (s, id) => s.flags.includes(`talk:${chapelPriestId}:${id}`);
var priestChoiceTopicIds = ["priest-note", "priest-chair"];
var priestTopicIds = (person) => person === chapelPriestId ? ["routine", "priest-life", "priest-table", ...priestChoiceTopicIds, "priest-recall"] : [];
var choice = (s) => seen2(s, "priest-note") ? "note" : seen2(s, "priest-chair") ? "chair" : void 0;
var t = (id, label, reply, once = true) => ({ id, label, reply, once });
var recall = (s) => choice(s) === "note" ? ["\u201C\u8BB0\u5F97\u3002\u90A3\u5F20\u2018\u53EF\u4EE5\u5750\u4E00\u4F1A\u513F\u2019\u7684\u5C0F\u4FBF\u6761\u8FD8\u5728\u684C\u8FB9\u3002\u6211\u6CA1\u6709\u6DFB\u4E0A\u8C01\u7684\u540D\u5B57\u3002\u201D\u4ED6\u7B11\u4E86\u7B11\u3002\u201C\u540E\u6765\u6211\u4E5F\u771F\u7684\u5750\u4E86\u4E00\u4F1A\u513F\u3002\u201D", "\u201CI remember. The little \u2018Stay a while\u2019 note is still beside the table. I added no names.\u201D He smiles. \u201CLater, I sat down for a while myself.\u201D"] : ["\u201C\u8BB0\u5F97\u3002\u90A3\u628A\u9760\u8FC7\u9053\u7684\u6905\u5B50\u8FD8\u7559\u7740\uFF0C\u6765\u7684\u4EBA\u81EA\u5DF1\u51B3\u5B9A\u8981\u4E0D\u8981\u8BF4\u8BDD\u3002\u201D\u4ED6\u6307\u4E86\u6307\u53E3\u888B\u91CC\u7684\u65CB\u94AE\u3002\u201C\u6211\u4E5F\u5728\u8FD9\u91CC\u6162\u6162\u4FEE\u6211\u7684\u6536\u97F3\u673A\u3002\u201D", "\u201CI remember. The aisle-side chair is still there. Whoever comes decides whether to speak.\u201D He touches the knob in his pocket. \u201CI take my time with the radio here too.\u201D"];
function priestTopics(s, person) {
  if (person !== chapelPriestId || !s.known.includes(person) || !residentHere(s, person, s.scene)) return [];
  const options = [
    t("routine", ["\u5E73\u65F6\u5728\u54EA\u91CC\u80FD\u627E\u5230\u4F60\uFF1F", "Where can I usually find you?"], routineReply(person)),
    t(
      "priest-life",
      ["\u56DE\u5230\u6D77\u6E7E\uFF0C\u4EC0\u4E48\u6700\u8BA9\u4F60\u60E6\u8BB0\uFF1F", "What stayed with you when you returned?"],
      ["\u201C\u7236\u4EB2\u5F00\u8FC7\u6E21\u8239\uFF0C\u56DE\u5BB6\u5C31\u4FEE\u4ED6\u90A3\u53F0\u603B\u4E32\u53F0\u7684\u6536\u97F3\u673A\u3002\u6BCD\u4EB2\u603B\u5728\u996D\u684C\u8FB9\u591A\u653E\u4E00\u628A\u6905\u5B50\u3002\u5979\u53BB\u4E16\u4EE5\u540E\uFF0C\u6211\u56DE\u5230\u8FD9\u91CC\uFF0C\u624D\u53D1\u73B0\u81EA\u5DF1\u4E5F\u9700\u8981\u6709\u4EBA\u7559\u4E2A\u4F4D\u7F6E\u3002\u201D\u4ED6\u628A\u65E7\u65CB\u94AE\u7FFB\u4E86\u4E2A\u9762\u3002\u201C\u5341\u516B\u5E74\u91CC\u6211\u4E00\u76F4\u5FD9\u7740\u7167\u987E\u522B\u4EBA\u3002\u73B0\u5728\u5348\u540E\u4F1A\u51FA\u53BB\u8D70\u8D70\u3002\u201D", "\u201CDad ran a ferry and came home to repair a radio that never held a station. Mum always put an extra chair at the table. After she died, I came back and realized I needed a place left for me too.\u201D He turns the old knob over. \u201CI spent eighteen years looking after others. Now I take an afternoon walk.\u201D"]
    )
  ];
  if (seen2(s, "priest-life")) options.push(t(
    "priest-table",
    ["\u90A3\u628A\u591A\u7559\u7684\u6905\u5B50\u5462\uFF1F", "What about that extra chair?"],
    ["\u201C\u6211\u60F3\u5728\u8FD9\u91CC\u4E5F\u7559\u4E00\u4E2A\u4F4D\u7F6E\u3002\u6765\u501F\u4E66\u3001\u542C\u6B4C\u3001\u7948\u7977\uFF0C\u6216\u8005\u53EA\u662F\u6B47\u6B47\u90FD\u884C\u3002\u8981\u4E0D\u8981\u7559\u4E00\u5F20\u6B22\u8FCE\u4FBF\u6761\uFF0C\u8FD8\u662F\u8BA9\u7A7A\u6905\u5B50\u81EA\u5DF1\u8BF4\u8BDD\uFF1F\u201D\u4ED6\u770B\u770B\u4F60\u3002\u201C\u7B49\u6211\u56DE\u5230\u6559\u5802\u65F6\uFF0C\u6211\u4EEC\u518D\u51B3\u5B9A\u3002\u53E6\u4E00\u5929\u4E5F\u53EF\u4EE5\u3002\u201D", "\u201CI\u2019d like to leave a place here too. For a book, a song, a prayer, or a rest. Should a little welcome note do the inviting, or the chair itself?\u201D He looks at you. \u201CWe can decide when I\u2019m back at the chapel. Another day is fine.\u201D"]
  ));
  if (seen2(s, "priest-table") && !choice(s) && s.scene === "chapel") options.push(
    t("priest-note", ["\u4E00\u8D77\u7559\u5F20\u201C\u53EF\u4EE5\u5750\u4E00\u4F1A\u513F\u201D\u7684\u4FBF\u6761", "Leave a little \u201CStay a while\u201D note together"], ["\u4F60\u4EEC\u628A\u5C0F\u4FBF\u6761\u653E\u5728\u684C\u8FB9\uFF0C\u7559\u51FA\u9605\u8BFB\u548C\u6392\u7EC3\u7684\u4F4D\u7F6E\u3002\u52A0\u5E03\u91CC\u57C3\u5C14\u6CA1\u6709\u5199\u4EFB\u4F55\u6765\u8BBF\u8005\u7684\u540D\u5B57\uFF0C\u968F\u540E\u81EA\u5DF1\u4E5F\u5750\u4E86\u4E0B\u6765\u3002", "You place a little note beside the table, leaving the reading and rehearsal spaces free. Gabriel writes no visitor names, then sits down himself."]),
    t("priest-chair", ["\u628A\u90A3\u628A\u6905\u5B50\u7559\u7ED9\u613F\u610F\u505C\u4E0B\u6765\u7684\u4EBA", "Leave the chair for whoever wants to pause"], ["\u4F60\u4EEC\u7ED9\u9760\u8FC7\u9053\u7684\u6905\u5B50\u7559\u51FA\u4F4D\u7F6E\u3002\u52A0\u5E03\u91CC\u57C3\u5C14\u5750\u5728\u65C1\u8FB9\uFF0C\u62FF\u51FA\u65E7\u6536\u97F3\u673A\u7684\u65CB\u94AE\uFF1B\u4F60\u53EF\u4EE5\u804A\u804A\uFF0C\u4E5F\u53EF\u4EE5\u4E00\u8D77\u5B89\u9759\u5F85\u4E00\u4F1A\u513F\u3002", "You leave room for the aisle-side chair. Gabriel sits nearby with the old radio knob. You can talk, or simply sit together."])
  );
  if (choice(s)) options.push(t("priest-recall", ["\u8FD8\u8BB0\u5F97\u6211\u4EEC\u7559\u7684\u90A3\u4E2A\u4F4D\u7F6E\u5417\uFF1F", "Remember the place we left?"], recall(s), false));
  return options.filter((topic3) => !topic3.once || !seen2(s, topic3.id));
}
function applyPriestTopic(s, person, id) {
  if (person === chapelPriestId && priestChoiceTopicIds.includes(id) && !choice(s)) s.relations[person] = Math.min(100, (s.relations[person] ?? 0) + 1);
}
function validPriestState(s) {
  const note = seen2(s, "priest-note"), chair = seen2(s, "priest-chair");
  return !(note && chair) && (!(note || chair) || s.known.includes(chapelPriestId) && seen2(s, "priest-life") && seen2(s, "priest-table"));
}

// src/story/relationship-expansion-profiles.ts
var relationshipExpansionProfiles = {
  owen: {
    interest: ["\u6CA1\u542C\u6E05\u7684\u65F6\u5019\uFF0C\u4F60\u4F1A\u518D\u7B49\u4E00\u4F1A\u513F\u5417\uFF1F", "When you miss a sound, do you wait for it again?"],
    personal: ["\u201C\u4F1A\u3002\u4EE5\u524D\u4FEE\u516C\u4EA4\u8F66\uFF0C\u5F97\u5148\u5206\u6E05\u542C\u89C1\u7684\u548C\u731C\u7684\u3002\u73B0\u5728\u542C\u9E1F\u4E5F\u4E00\u6837\u3002\u4F60\u4E0D\u7528\u4E3A\u4E86\u966A\u6211\uFF0C\u5C31\u8DDF\u7740\u8BF4\u8BA4\u51FA\u6765\u4E86\u3002\u201D", "\u201CI do. Repairing buses taught me to separate what I heard from what I guessed. Listening for birds is much the same. You needn\u2019t pretend to recognize one just to keep me company.\u201D"],
    private: ["\u201C\u4EE5\u524D\u4EBA\u5BB6\u627E\u6211\uFF0C\u5E38\u662F\u56E0\u4E3A\u6709\u4E1C\u897F\u574F\u4E86\u3002\u9000\u4F11\u540E\u6709\u65F6\u4F1A\u60F3\uFF0C\u5982\u679C\u4E0D\u4FEE\u70B9\u4EC0\u4E48\uFF0C\u8FD8\u503C\u4E0D\u503C\u5F97\u6765\u627E\u6211\u3002\u4F60\u80AF\u966A\u6211\u7B49\u4E00\u9635\uFF0C\u6211\u5C31\u6CA1\u90A3\u4E48\u7740\u6025\u627E\u5DE5\u5177\u4E86\u3002\u201D", "\u201CPeople used to come to me when something broke. Since retiring, I sometimes wonder whether I\u2019m worth visiting without a repair to do. When you wait with me, I feel less need to reach for tools.\u201D"],
    request: ["\u201C\u6709\u7A7A\u53BB\u65E7\u6C14\u8C61\u7AD9\u770B\u770B\u90A3\u672C\u8BB0\u5F55\u672C\u5417\uFF1F\u7559\u610F\u4E0A\u9762\u5199\u7684\u662F\u8FC7\u53BB\u7684\u8BB0\u5F55\u3002\u56DE\u6765\u804A\u804A\u5B83\u600E\u6837\u5E2E\u4EBA\u8BB0\u4E8B\uFF1B\u6CA1\u5199\u7684\u5C31\u522B\u66FF\u5B83\u8865\uFF0C\u4E5F\u4E0D\u7528\u66FF\u6211\u8BA4\u9E1F\u3002\u201D", "\u201CWould you look at the log at the old weather station? Notice that it records the past. Come back and tell me how it helps people remember. Don\u2019t fill in what isn\u2019t there, or identify a bird for me.\u201D"],
    observation: ["\u4F60\u628A\u65E7\u8BB0\u5F55\u672C\u5F53\u4F5C\u8FC7\u53BB\u7684\u8BB0\u5F55\u6765\u8BFB\u3002\u7EB8\u4E0A\u6CA1\u5199\u7684\u4ECD\u7559\u4F5C\u672A\u77E5\uFF1B\u4F60\u51C6\u5907\u53EA\u628A\u4EB2\u773C\u8BFB\u5230\u7684\u5185\u5BB9\u544A\u8BC9\u6B27\u6587\u3002", "You read the old log as a record of the past. You leave what it does not say uncertain, and prepare to tell Owen only what you found."],
    thanks: ["\u201C\u8C22\u8C22\u4F60\u56DE\u6765\uFF0C\u8FD8\u628A\u6CA1\u5199\u7684\u7559\u6210\u6CA1\u5199\u7684\u3002\u8FD9\u6837\u6211\u624D\u77E5\u9053\uFF0C\u54EA\u4E9B\u662F\u6211\u4EEC\u771F\u7684\u4E00\u8D77\u5F04\u660E\u767D\u7684\u3002\u201D", "\u201CThank you for coming back, and leaving the unwritten parts unwritten. That helps me know what we actually learned together.\u201D"],
    observeScene: "weather",
    observeTarget: "logbook",
    eventScene: "coast",
    company: ["\u4F60\u548C\u6B27\u6587\u5728\u6D77\u5CB8\u8FB9\u505C\u4E86\u4E00\u4F1A\u513F\u3002\u4ED6\u6CA1\u6709\u6025\u7740\u7ED9\u8FDC\u5904\u7684\u58F0\u97F3\u8D77\u540D\u5B57\uFF0C\u4F60\u4E5F\u6CA1\u6709\u731C\u3002\u4F60\u4EEC\u51B3\u5B9A\u4E0B\u56DE\u8FD8\u53EF\u4EE5\u4E00\u8D77\u6162\u6162\u542C\u3002", "You and Owen pause by the coast. He doesn\u2019t hurry to name a distant sound, and you don\u2019t guess. You agree that you could listen slowly together again."],
    privateEvent: ["\u6B27\u6587\u8BF4\u8D77\u4E00\u4F4D\u603B\u5728\u8F66\u4FEE\u597D\u540E\u624D\u6765\u9053\u8C22\u7684\u8001\u4E58\u5BA2\uFF0C\u968F\u540E\u7B11\u4E86\uFF1A\u201C\u4ECA\u5929\u6CA1\u4FEE\u597D\u4EFB\u4F55\u4E1C\u897F\uFF0C\u4E5F\u6709\u4EBA\u5750\u5728\u65C1\u8FB9\u3002\u8FD9\u6837\u7684\u4E00\u5929\uFF0C\u6211\u4E5F\u60F3\u8BB0\u4E0B\u6765\u3002\u201D\u4F60\u4EEC\u53C8\u5F85\u4E86\u4E00\u4F1A\u513F\u3002", "Owen recalls a passenger who would return to thank him after a repair. Then he smiles. \u201CI haven\u2019t fixed anything today, and someone still sat with me. I\u2019d like to remember a day like this.\u201D You stay a little longer."],
    recall: ["\u201C\u4F60\u56DE\u6765\u8BB2\u8FC7\u8BB0\u5F55\u672C\uFF0C\u4E5F\u966A\u6211\u542C\u8FC7\u3002\u6CA1\u542C\u6E05\u7684\u5C31\u518D\u7B49\uFF0C\u4E0D\u7528\u4E3A\u4E86\u7ED9\u6211\u4E00\u4E2A\u7B54\u6848\u800C\u731C\u3002\u8001\u670B\u53CB\uFF0C\u4ECA\u5929\u4E5F\u53EF\u4EE5\u53EA\u5750\u4E00\u4F1A\u513F\u3002\u201D", "\u201CYou came back to talk about the log, and you listened with me. If we miss a sound, we can wait rather than guess an answer for my sake. My friend, today we can simply sit a while.\u201D"]
  }
};

// src/story/relationship-next-profiles.ts
var relationshipNextProfiles = {
  dani: {
    interest: ["\u4F60\u4E3A\u4EC0\u4E48\u628A\u843D\u53F6\u5939\u8FDB\u672C\u5B50\uFF1F", "Why do you press fallen leaves into your notebook?"],
    personal: ["\u201C\u5B83\u5DF2\u7ECF\u843D\u4E0B\u6765\u4E86\uFF0C\u4E0D\u7528\u4E3A\u4E86\u5199\u4E00\u9875\u6545\u4E8B\u53BB\u6458\u6D3B\u53F6\u3002\u56FE\u4E66\u9986\u4E5F\u4E00\u6837\uFF1A\u5148\u542C\u4EBA\u613F\u610F\u8BB2\u4EC0\u4E48\uFF0C\u518D\u51B3\u5B9A\u8BB0\u4EC0\u4E48\u3002\u201D", "\u201CIt has already fallen. I needn\u2019t pick a living leaf to fill a page. The library is similar: I listen to what someone wishes to share before deciding what to record.\u201D"],
    private: ["\u201C\u6709\u4EBA\u628A\u4E00\u4EF6\u5FC3\u4E8B\u8BB2\u7ED9\u6211\u542C\uFF0C\u6211\u5E38\u6015\u6CA1\u8BB0\u4E0B\u6765\u5C31\u8F9C\u8D1F\u4E86\u4ED6\u4EEC\u3002\u540E\u6765\u624D\u660E\u767D\uFF0C\u6709\u4E9B\u8BDD\u662F\u8BA9\u6211\u542C\u89C1\uFF0C\u4E0D\u662F\u8BA9\u6211\u66FF\u4ED6\u4EEC\u516C\u5F00\u3002\u201D", "\u201CWhen someone tells me something personal, I worry that failing to write it down lets them down. I\u2019m learning that some words are meant to be heard, not published by me.\u201D"],
    request: ["\u201C\u6709\u7A7A\u53BB\u5C71\u5761\u82B1\u56ED\u770B\u770B\u90A3\u682A\u8DEF\u8FB9\u7684\u5C0F\u8568\u5417\uFF1F\u53EA\u770B\u770B\u5B83\u73B0\u5728\u600E\u6837\uFF0C\u56DE\u6765\u544A\u8BC9\u6211\u3002\u522B\u6458\u53F6\uFF0C\u4E5F\u4E0D\u7528\u66FF\u8C01\u51B3\u5B9A\u8981\u4E0D\u8981\u6D47\u6C34\u3002\u201D", "\u201CWould you look at the little fern by the Hillside Garden path? Tell me what you actually see when you return. Please don\u2019t pick a frond or decide for anyone whether it needs water.\u201D"],
    observation: ["\u4F60\u770B\u4E86\u8DEF\u8FB9\u7684\u5C0F\u8568\uFF0C\u8BB0\u4F4F\u5F53\u65F6\u770B\u89C1\u7684\u53F6\u7247\uFF1B\u6CA1\u6709\u6458\u53D6\u6216\u6539\u53D8\u5B83\uFF0C\u4E5F\u6CA1\u6709\u628A\u8FD9\u6B21\u89C2\u5BDF\u5F53\u4F5C\u6D47\u6C34\u3002", "You observe the pathside fern as it is. You do not pick or change it, and this observation does not count as watering."],
    thanks: ["\u201C\u8C22\u8C22\u4F60\u53EA\u8BB2\u4EB2\u773C\u770B\u89C1\u7684\u3002\u90A3\u4E00\u9875\u53EF\u4EE5\u6162\u6162\u5199\uFF0C\u690D\u7269\u8FD8\u5728\u539F\u5904\uFF0C\u522B\u4EBA\u7684\u6545\u4E8B\u4E5F\u4ECD\u7531\u4ED6\u4EEC\u81EA\u5DF1\u51B3\u5B9A\u3002\u201D", "\u201CThank you for telling me only what you saw. I can write that page slowly. The plant stays where it belongs, and people still decide which stories are theirs to share.\u201D"],
    observeScene: "garden",
    observeTarget: "growing-fern",
    eventScene: "courtyard",
    company: ["\u4F60\u548C\u4E39\u59AE\u5728\u9662\u5B50\u91CC\u7559\u51FA\u901A\u8DEF\uFF0C\u8F7B\u58F0\u804A\u8D77\u4ECA\u5929\u770B\u5230\u7684\u4E00\u7247\u843D\u53F6\u3002\u4F60\u4EEC\u6CA1\u6709\u66FF\u4F4F\u6237\u8BB2\u4ED6\u4EEC\u7684\u6545\u4E8B\u3002", "You and Dani leave the courtyard path clear and speak softly about a fallen leaf you noticed today. You do not tell the residents\u2019 stories for them."],
    privateEvent: ["\u4E39\u59AE\u5408\u4E0A\u672C\u5B50\uFF0C\u8BF4\u6709\u65F6\u670B\u53CB\u53EA\u662F\u613F\u610F\u5750\u5728\u4E00\u65C1\uFF0C\u4E0D\u8981\u6C42\u5979\u628A\u6BCF\u53E5\u8BDD\u53D8\u6210\u8D44\u6599\u3002\u4F60\u4EEC\u5B89\u9759\u5730\u5F85\u4E86\u4E00\u4F1A\u513F\u3002", "Dani closes her notebook. Sometimes a friend is willing to sit nearby without asking her to turn every conversation into a record. You stay quietly for a while."],
    recall: ["\u201C\u90A3\u682A\u5C0F\u8568\u8FD8\u5728\u90A3\u91CC\u3002\u4F60\u56DE\u6765\u8BB2\u4E86\u770B\u89C1\u7684\u4E8B\uFF0C\u4E5F\u966A\u6211\u628A\u6CA1\u83B7\u51C6\u8BB2\u7684\u7559\u5728\u672C\u5B50\u5916\u9762\u3002\u4ECA\u5929\u6211\u4EEC\u53EF\u4EE5\u53EA\u804A\u81EA\u5DF1\u7684\u65E5\u5B50\u3002\u201D", "\u201CThe little fern is still there. You came back with what you saw, and helped me leave unshared stories outside the notebook. Today we can simply talk about our own day.\u201D"]
  }
};

// src/story/relationship-growth.ts
var RELATIONSHIP_RULES = "relationships-v1.0";
var RELATIONSHIP_EXPANSION_RULES = "relationship-expansion-v1.0";
var RELATIONSHIP_NEXT_RULES = "relationship-dani-v1.0";
var relationshipPilotIds = ["mara", "avery", "samira"];
var stages = ["stranger", "acquaintance", "familiar", "trusted", "close"];
var storyInteractionIds = ["story-toolbag", "story-song"];
var interactionKind = (id) => id === "meet" ? "meet" : id === "rg-greet" ? "greeting" : ["rg-personal", "rg-private"].includes(id) ? "personal" : ["rg-request", "rg-fulfill", "observe", "story-toolbag"].includes(id) ? "promise" : id === "rg-recall" ? "recall" : "experience";
var relationshipProfiles = {
  mara: { interest: ["\u4F60\u770B\u7A97\u53F0\u65F6\u4F1A\u7559\u610F\u4EC0\u4E48\uFF1F", "What do you notice on the windowsills?"], personal: ["\u201C\u6709\u4EBA\u628A\u65E7\u676F\u5B50\u7528\u6765\u79CD\u82B1\u3002\u6211\u559C\u6B22\u770B\u90A3\u4E9B\u4E0D\u5FC5\u4E70\u65B0\u7684\u529E\u6CD5\u3002\u4F60\u559C\u6B22\u7684\u4E1C\u897F\uFF0C\u4E5F\u53EF\u4EE5\u6162\u6162\u544A\u8BC9\u6211\u3002\u201D", "\u201CPeople grow flowers in old cups. I like ways of caring without buying something new. You can tell me what you enjoy, in your own time.\u201D"], private: ["\u201C\u4EE5\u524D\u6211\u603B\u89C9\u5F97\uFF0C\u4E0D\u7ED9\u4EBA\u5EFA\u8BAE\u5C31\u7B97\u6CA1\u5E2E\u5FD9\u3002\u73B0\u5728\u60F3\u8BD5\u7740\u5148\u542C\u3002\u4F60\u4E0D\u6025\u7740\u66FF\u6211\u505A\u51B3\u5B9A\uFF0C\u6211\u5F88\u611F\u6FC0\u3002\u201D", "\u201CI used to think I hadn\u2019t helped unless I gave advice. I\u2019m learning to listen first. I appreciate that you don\u2019t rush to decide for me.\u201D"], request: ["\u201C\u5E2E\u6211\u53BB\u5C71\u5761\u82B1\u56ED\u770B\u770B\u95E8\u8FB9\u7684\u4FBF\u6761\u597D\u5417\uFF1F\u5148\u8BFB\u6E05\u4F4F\u6237\u7684\u610F\u601D\uFF0C\u56DE\u6765\u544A\u8BC9\u6211\u3002\u4E0D\u8981\u66FF\u4ED6\u4EEC\u6539\u65F6\u95F4\u3002\u201D", "\u201CCould you read the note by the Hillside Garden gate, then tell me what it says? Hear the residents first. Please don\u2019t change their hours.\u201D"], observation: ["\u4F60\u8BFB\u8FC7\u95E8\u8FB9\u7684\u4FBF\u6761\uFF0C\u8BB0\u4F4F\u9662\u5B50\u662F\u4F4F\u6237\u7684\u5BB6\uFF1B\u901A\u884C\u65F6\u95F4\u4EE5\u5F53\u524D\u7EA6\u5B9A\u4E3A\u51C6\u3002", "You read the gate note: the courtyard is a home. Any access follows the current agreement."], thanks: ["\u201C\u4F60\u5148\u8BFB\u6E05\u695A\uFF0C\u518D\u56DE\u6765\u544A\u8BC9\u6211\u3002\u8C22\u8C22\u3002\u6211\u77E5\u9053\u8FD9\u6B21\u7EA6\u5B9A\u53EF\u4EE5\u653E\u5FC3\u4EA4\u7ED9\u4F60\u3002\u201D", "\u201CYou read it carefully and came back. Thank you. I knew what to expect, and you followed through.\u201D"], observeScene: "garden", observeTarget: "gate-hours", eventScene: "station", company: ["\u4F60\u548C\u739B\u62C9\u6CBF\u8857\u770B\u4E86\u770B\u7A97\u53F0\u3002\u5979\u6307\u51FA\u4E00\u53EA\u65E7\u8336\u676F\u91CC\u7684\u65B0\u53F6\uFF0C\u6CA1\u6709\u66FF\u4E3B\u4EBA\u63D0\u5EFA\u8BAE\u3002\u4F60\u4EEC\u7559\u4E0B\u4E00\u4EF6\u4EE5\u540E\u80FD\u804A\u8D77\u7684\u5C0F\u4E8B\u3002", "You and Mara look at the windowsills. She notices a new leaf in an old teacup, without offering its owner advice. A small moment to remember together."], privateEvent: ["\u739B\u62C9\u628A\u94A5\u5319\u63E1\u5728\u638C\u5FC3\uFF0C\u804A\u8D77\u7B2C\u4E00\u6B21\u501F\u51FA\u623F\u95F4\u65F6\u7684\u4E0D\u5B89\u3002\u201C\u73B0\u5728\u6709\u4EBA\u56DE\u6765\u548C\u6211\u8BF4\u8BF4\u4ECA\u5929\uFF0C\u6211\u5C31\u4E0D\u53EA\u662F\u5728\u7B49\u94A5\u5319\u4E86\u3002\u201D\u4F60\u4EEC\u5728\u8857\u8FB9\u505C\u4E86\u4E00\u4F1A\u513F\u3002", "Mara holds the keys and recalls feeling anxious the first time she let the room. \u201CWhen someone comes back to tell me about their day, I\u2019m not just waiting for keys.\u201D You pause together by the street."], recall: ["\u201C\u8BB0\u5F97\u90A3\u7247\u65B0\u53F6\uFF0C\u4E5F\u8BB0\u5F97\u4F60\u56DE\u6765\u8BB2\u4FBF\u6761\u3002\u6211\u559C\u6B22\u6211\u4EEC\u4E0D\u5FC5\u6BCF\u6B21\u89C1\u9762\u90FD\u5148\u627E\u4E00\u4EF6\u5DEE\u4E8B\u3002\u201D", "\u201CI remember the new leaf, and your return with the gate note. I like that we don\u2019t need an errand every time we meet.\u201D"] },
  avery: { interest: ["\u4E3A\u4EC0\u4E48\u613F\u610F\u7559\u4E0B\u6CA1\u753B\u5B8C\u7684\u5730\u65B9\uFF1F", "Why leave part of a drawing unfinished?"], personal: ["\u201C\u4EE5\u524D\u9001\u5305\u88F9\u603B\u60F3\u7740\u4E0B\u4E00\u7AD9\u3002\u7A7A\u767D\u63D0\u9192\u6211\uFF0C\u8FD9\u6B21\u53EF\u4EE5\u591A\u770B\u4E00\u4F1A\u513F\u3002\u4F60\u559C\u6B22\u6162\u6162\u770B\u7684\u4E1C\u897F\u5462\uFF1F\u201D", "\u201COn my delivery rounds, I always thought about the next stop. A blank space reminds me I can look longer this time. What do you like taking time over?\u201D"], private: ["\u201C\u6709\u65F6\u6211\u6015\u505C\u4E0B\u6765\u5C31\u4E0D\u77E5\u9053\u81EA\u5DF1\u662F\u8C01\u4E86\u3002\u548C\u4F60\u5750\u7740\uFF0C\u4E0D\u5FC5\u9A6C\u4E0A\u753B\u597D\uFF0C\u5012\u8BA9\u6211\u5B89\u5FC3\u4E00\u70B9\u3002\u201D", "\u201CSometimes I worry I won\u2019t know who I am when I stop rushing. Sitting with you without finishing a drawing helps.\u201D"], request: ["\u201C\u80FD\u53BB\u5C71\u5761\u8425\u5730\u770B\u770B\u684C\u4E0A\u65E7\u56FE\u7684\u5730\u540D\u5417\uFF1F\u53EA\u770B\u770B\u54EA\u4E9B\u8FD8\u80FD\u8BA4\u51FA\u6765\uFF0C\u56DE\u6765\u804A\u804A\u3002\u4E0D\u7528\u66FF\u6211\u628A\u8DEF\u7EBF\u62FC\u597D\u3002\u201D", "\u201CCould you look at the place names on the old map at Hill Camp, then come back? Just notice what remains legible. You needn\u2019t solve the route for me.\u201D"], observation: ["\u4F60\u5728\u65E7\u56FE\u65C1\u505C\u4E0B\uFF0C\u8BA4\u51FA\u7EB8\u7247\u4E0A\u7684\u5730\u540D\uFF1B\u6CA1\u6709\u628A\u8FD9\u6B21\u89C2\u5BDF\u8BF4\u6210\u62FC\u56FE\u5DF2\u5B8C\u6210\u3002", "You pause by the old map and notice the legible place names. This observation does not complete the map puzzle."], thanks: ["\u201C\u8C22\u8C22\u4F60\u7279\u5730\u56DE\u6765\u3002\u539F\u6765\u53EA\u662F\u8BA4\u771F\u770B\u4E00\u773C\uFF0C\u4E5F\u80FD\u6709\u8BDD\u6162\u6162\u804A\u3002\u201D", "\u201CThank you for coming back. It turns out a careful look is enough to start a conversation.\u201D"], observeScene: "camp", observeTarget: "old-map", eventScene: "dock", company: ["\u4F60\u548C\u827E\u5F17\u91CC\u9760\u7740\u7801\u5934\u680F\u6746\u770B\u4E00\u53EA\u8239\u6162\u6162\u8F6C\u5411\u3002\u90A3\u9875\u753B\u6CA1\u6709\u5B8C\u6210\uFF0C\u4F60\u4EEC\u4E5F\u6CA1\u6709\u50AC\u5B83\u3002", "You and Avery watch a boat turn from the pier rail. The drawing stays unfinished. Neither of you rushes it."], privateEvent: ["\u827E\u5F17\u91CC\u628A\u90A3\u9875\u901F\u5199\u7FFB\u7ED9\u4F60\u770B\uFF0C\u6307\u7740\u66FE\u7ECF\u7559\u767D\u7684\u89D2\u843D\u3002\u201C\u8FD9\u5757\u4E0D\u662F\u6CA1\u753B\u597D\u3002\u662F\u6211\u8BB0\u5F97\u6709\u4EBA\u966A\u6211\u770B\u7684\u5730\u65B9\u3002\u201D", "Avery shows you the sketch, pointing to the empty corner. \u201CThat bit isn\u2019t a mistake. It\u2019s where I remember having company.\u201D"], recall: ["\u201C\u90A3\u53EA\u6162\u6162\u8F6C\u5411\u7684\u8239\uFF0C\u6211\u8FD8\u8BB0\u5F97\u3002\u4E0B\u6B21\u4F60\u4E5F\u53EF\u4EE5\u53EA\u6765\u7AD9\u4E00\u4F1A\u513F\uFF0C\u4E0D\u7528\u5E26\u4EC0\u4E48\u3002\u201D", "\u201CI remember that slowly turning boat. Next time you can just stand here a while. You needn\u2019t bring anything.\u201D"] },
  samira: { interest: ["\u4EC0\u4E48\u6837\u7684\u58F0\u97F3\u8BA9\u4F60\u613F\u610F\u63A5\u7740\u54FC\uFF1F", "What sounds make you want to keep humming?"], personal: ["\u201C\u6C34\u78B0\u6728\u6869\u7684\u58F0\u97F3\u3002\u6CA1\u6709\u6253\u996D\u94C3\u50AC\u6211\uFF0C\u5C31\u53EF\u4EE5\u5531\u6162\u4E00\u70B9\u3002\u4F60\u613F\u610F\u542C\u4EC0\u4E48\uFF0C\u90FD\u53EF\u4EE5\u76F4\u63A5\u8BF4\u3002\u201D", "\u201CWater against the pilings. Without the lunch bell, I can sing more slowly. You can tell me what you enjoy hearing.\u201D"], private: ["\u201C\u6211\u6015\u522B\u4EBA\u4EE5\u4E3A\u6BCF\u6B21\u78B0\u89C1\u6211\u90FD\u8BE5\u5531\u3002\u4F60\u4E0D\u8981\u6C42\u6211\u8868\u6F14\uFF0C\u6211\u624D\u6562\u628A\u6CA1\u60F3\u597D\u7684\u51E0\u53E5\u7559\u4E0B\u3002\u201D", "\u201CI worry people will expect a song every time. When you don\u2019t ask me to perform, I can leave a few uncertain notes.\u201D"], request: ["\u201C\u80FD\u53BB\u6C14\u8C61\u7AD9\u770B\u770B\u8BB0\u5F55\u672C\u600E\u6837\u8BB0\u6D77\u5CB8\u7684\u53D8\u5316\u5417\uFF1F\u56DE\u6765\u544A\u8BC9\u6211\u4F60\u770B\u5230\u7684\uFF0C\u4E0D\u66FF\u6211\u9884\u62A5\u4ECA\u665A\u7684\u5929\u6C14\u3002\u201D", "\u201CCould you look at how the weather-station log records changes along the coast, then come back? Tell me what you see; don\u2019t make a forecast for tonight.\u201D"], observation: ["\u4F60\u7FFB\u770B\u6C14\u8C61\u7AD9\u7684\u6F6E\u6C50\u4E0E\u6B65\u9053\u8BB0\u5F55\uFF0C\u8BB0\u4E0B\u5B83\u662F\u4E00\u4EFD\u8FC7\u53BB\u7684\u8BB0\u5F55\uFF0C\u4E0D\u662F\u4ECA\u665A\u7684\u5929\u6C14\u627F\u8BFA\u3002", "You look at the weather station\u2019s tide and trail notes. These are records, not a promise about tonight\u2019s weather."], thanks: ["\u201C\u4F60\u628A\u770B\u89C1\u7684\u548C\u731C\u7684\u5206\u5F00\u8BF4\u4E86\u3002\u8C22\u8C22\u3002\u4E0B\u6B21\u6211\u4E5F\u613F\u610F\u628A\u6CA1\u5531\u597D\u7684\u90A3\u51E0\u53E5\u7ED9\u4F60\u542C\u3002\u201D", "\u201CYou kept what you saw separate from what you guessed. Thank you. I\u2019d like to share the uncertain notes with you sometime.\u201D"], observeScene: "weather", observeTarget: "logbook", eventScene: "dock", company: ["\u4F60\u548C\u8428\u7C73\u62C9\u5728\u7801\u5934\u542C\u6C34\u78B0\u6728\u6869\u3002\u5979\u63A5\u4E0A\u4E24\u53E5\u53C8\u505C\u4E0B\uFF1B\u4F60\u6CA1\u6709\u50AC\u5979\u7EE7\u7EED\u3002\u5B89\u9759\u4E5F\u662F\u4F60\u4EEC\u5171\u540C\u7684\u4E00\u90E8\u5206\u3002", "You and Samira listen to water against the pilings. She adds two lines, then stops. You don\u2019t ask for more. The quiet is part of your time together."], privateEvent: ["\u8428\u7C73\u62C9\u8BA9\u4F60\u542C\u4E00\u6BB5\u8FD8\u6CA1\u6709\u540D\u5B57\u7684\u65CB\u5F8B\uFF0C\u4E5F\u5141\u8BB8\u81EA\u5DF1\u4E2D\u9014\u6539\u6389\u4E00\u53E5\u3002\u201C\u4E0B\u6B21\u4E0D\u5531\u4E5F\u884C\u3002\u6211\u60F3\u8BB0\u4F4F\u4ECA\u5929\u6709\u4EBA\u613F\u610F\u6162\u6162\u542C\u3002\u201D", "Samira shares an unnamed melody and changes a line halfway through. \u201CI needn\u2019t sing next time. I want to remember someone was willing to listen slowly today.\u201D"], recall: ["\u201C\u8BB0\u5F97\u6211\u4EEC\u542C\u6C34\u58F0\uFF0C\u4E5F\u8BB0\u5F97\u6211\u6539\u6389\u90A3\u4E00\u53E5\u3002\u4EE5\u540E\u89C1\u5230\u4F60\uFF0C\u53EF\u4EE5\u5531\uFF0C\u4E5F\u53EF\u4EE5\u53EA\u95EE\u4F60\u8FC7\u5F97\u600E\u4E48\u6837\u3002\u201D", "\u201CI remember the water, and the line I changed. When I see you, I can sing\u2014or simply ask how you are.\u201D"] },
  ...relationshipExpansionProfiles,
  ...relationshipNextProfiles
};
var growthTopicIds = ["rg-greet", "rg-personal", "rg-request", "rg-fulfill", "rg-invite", "rg-company", "rg-private", "rg-private-invite", "rg-private-event", "rg-recall"];
var legacyFacts = (s, p) => [...p === "mara" && s.flags.includes("bag-returned") ? ["bag-returned"] : [], ...["avery", "samira"].includes(p) && s.flags.includes("residents:song-shared") ? ["residents:song-shared"] : []];
var toolbag = (m) => m.legacy.facts.includes("bag-returned") || !!m.interactions["story-toolbag"];
var song = (m) => m.legacy.facts.includes("residents:song-shared") || !!m.interactions["story-song"];
var fulfilled = (m) => m.promise?.completedAt !== void 0 || toolbag(m);
var shared = (m) => m.companyAt !== void 0 || song(m);
var empty = (s, p) => ({ legacy: { relation: s.relations[p] ?? 0, facts: legacyFacts(s, p) }, days: [], interactions: {} });
function relationshipMemory(s, p) {
  return (relationshipNextProfiles[p] ? s.relationshipNextV1 : relationshipExpansionProfiles[p] ? s.relationshipExpansionV1 : s.relationshipsV1)?.residents[p] ?? empty(s, p);
}
function relationshipStage(s, p) {
  if (!s.known.includes(p)) return "stranger";
  const m = relationshipMemory(s, p), kinds = new Set(Object.values(m.interactions).map((i) => i.kind));
  if (m.days.length >= 5 && fulfilled(m) && shared(m) && m.privateAt !== void 0 && m.interactions["rg-private"] && m.interactions["rg-recall"]) return "close";
  if (m.days.length >= 3 && kinds.size >= 4 && fulfilled(m) && shared(m)) return "trusted";
  if (m.days.length >= 2 && Object.keys(m.interactions).length + (m.interactions.meet ? 0 : 1) >= 3 && kinds.size >= 2) return "familiar";
  return "acquaintance";
}
function record(s, p, id, kind, minute3, legacyBase = s) {
  if (!Number.isSafeInteger(minute3) || minute3 !== townMinutes(s)) throw Error("RELATIONSHIP_CLOCK_NOT_COMMITTED");
  const root = relationshipNextProfiles[p] ? s.relationshipNextV1 ??= { schema: 1, rules: RELATIONSHIP_NEXT_RULES, migratedAt: minute3, residents: {} } : relationshipExpansionProfiles[p] ? s.relationshipExpansionV1 ??= { schema: 1, rules: RELATIONSHIP_EXPANSION_RULES, migratedAt: minute3, residents: {} } : s.relationshipsV1 ??= { schema: 1, rules: RELATIONSHIP_RULES, migratedAt: minute3, residents: {} };
  const m = root.residents[p] ??= empty(legacyBase, p), day = Math.floor(minute3 / 1440);
  if (id !== "observe" && !m.days.includes(day)) m.days.push(day);
  m.days.sort((a, b) => a - b);
  m.interactions[id] = { kind, minute: minute3 };
  m.lastId = id;
  return m;
}
function recordRelationshipMeeting(s, p, minute3 = townMinutes(s)) {
  if (relationshipProfiles[p]) record(s, p, "meet", "meet", minute3);
}
function recordRelationshipStory(before, s, minute3 = townMinutes(s)) {
  if (!before.flags.includes("bag-returned") && s.flags.includes("bag-returned") && s.known.includes("mara")) record(s, "mara", "story-toolbag", "promise", minute3, before);
  if (!before.flags.includes("residents:song-shared") && s.flags.includes("residents:song-shared")) {
    for (const p of ["avery", "samira"]) if (s.known.includes(p)) record(s, p, "story-song", "experience", minute3, before);
  }
}
var atLeast = (stage, min) => stages.indexOf(stage) >= stages.indexOf(min);
function growthTopics(s, p) {
  const profile = relationshipProfiles[p];
  if (!profile || !s.known.includes(p) || !residentHere(s, p, s.scene)) return [];
  const m = relationshipMemory(s, p), stage = relationshipStage(s, p), seen5 = (id) => !!m.interactions[id];
  const options = [];
  const add = (id, label, reply) => options.push({ id, label, reply });
  if (!seen5("rg-greet") || Math.floor(m.interactions["rg-greet"].minute / 1440) < Math.floor(townMinutes(s) / 1440)) add("rg-greet", ["\u6253\u4E2A\u62DB\u547C\uFF0C\u804A\u804A\u4ECA\u5929", "Say hello and catch up"], relationshipGreeting(s, p));
  if (!seen5("rg-personal")) add("rg-personal", profile.interest, profile.personal);
  if (atLeast(stage, "familiar") && !m.promise && !fulfilled(m)) add("rg-request", ["\u6709\u4EC0\u4E48\u5C0F\u4E8B\u60F3\u8BF7\u6211\u5E2E\u5FD9\uFF1F", "Is there a small favor I could help with?"], profile.request);
  if (m.promise?.observedAt !== void 0 && m.promise.completedAt === void 0) add("rg-fulfill", ["\u56DE\u6765\u8BB2\u8BB2\u4EB2\u81EA\u770B\u5230\u7684\u4E8B", "Tell them what you saw"], profile.thanks);
  if (fulfilled(m) && !shared(m) && !seen5("rg-invite")) add("rg-invite", ["\u6539\u5929\u4E00\u8D77\u5B89\u9759\u5F85\u4E00\u4F1A\u513F\uFF1F", "Spend a quiet moment together sometime?"], [`\u201C\u597D\u3002\u5728${rooms[profile.eventScene].title[0]}\u9047\u5230\u65F6\u5C31\u4E00\u8D77\u5F85\u4E00\u4F1A\u513F\u3002\u7167\u6211\u7684\u65E5\u7A0B\u6765\uFF0C\u4E0D\u7528\u8D76\uFF0C\u6539\u65E5\u4E5F\u53EF\u4EE5\u3002\u201D`, `\u201CYes. When we meet at ${rooms[profile.eventScene].title[1]}, let\u2019s stay a while. Follow my usual routine; another day is fine.\u201D`]);
  if (seen5("rg-invite") && !shared(m) && s.scene === profile.eventScene) add("rg-company", ["\u7559\u4E0B\u6765\uFF0C\u5171\u540C\u770B\u4E00\u4F1A\u513F", "Stay and share a quiet moment"], profile.company);
  if (atLeast(stage, "trusted") && !seen5("rg-private")) add("rg-private", ["\u6700\u8FD1\u6709\u4EC0\u4E48\u8BA9\u4F60\u653E\u4E0D\u4E0B\uFF1F", "Has anything been on your mind lately?"], profile.private);
  if (seen5("rg-private") && !seen5("rg-private-invite")) add("rg-private-invite", ["\u613F\u610F\u518D\u7559\u4E00\u70B9\u65F6\u95F4\u7ED9\u5F7C\u6B64\u5417\uFF1F", "Make a little more time for each other?"], [`\u201C\u613F\u610F\u3002\u5728${rooms[profile.eventScene].title[0]}\u76F8\u9047\u5C31\u597D\u3002\u4E0D\u7528\u4E3A\u6211\u5E26\u793C\u7269\u3002\u201D`, `\u201CI would like that. Meet me at ${rooms[profile.eventScene].title[1]} during my routine. No gifts needed.\u201D`]);
  if (seen5("rg-private-invite") && m.privateAt === void 0 && s.scene === profile.eventScene) add("rg-private-event", ["\u966A\u4F34\u5BF9\u65B9\uFF0C\u542C\u5B8C\u8FD9\u6BB5\u5FC3\u4E8B", "Stay and hear what they want to share"], profile.privateEvent);
  if (m.privateAt !== void 0 && !seen5("rg-recall")) add("rg-recall", ["\u804A\u8D77\u4F60\u4EEC\u5171\u540C\u8BB0\u5F97\u7684\u4E8B", "Remember your time together"], profile.recall);
  return options;
}
function applyGrowthTopic(s, p, id, minute3 = townMinutes(s)) {
  if (!growthTopicIds.includes(id)) return;
  if (!growthTopics(s, p).some((t3) => t3.id === id)) throw Error("RELATIONSHIP_TOPIC_UNAVAILABLE");
  const kind = interactionKind(id);
  const m = record(s, p, id, kind, minute3);
  if (id === "rg-request") m.promise = { acceptedAt: minute3 };
  if (id === "rg-fulfill") m.promise.completedAt = minute3;
  if (id === "rg-company") m.companyAt = minute3;
  if (id === "rg-private-event") m.privateAt = minute3;
  const award = id === "rg-fulfill" ? 2 : ["rg-personal", "rg-private", "rg-company", "rg-private-event"].includes(id) ? 1 : 0;
  if (award) s.relations[p] = Math.min(100, (s.relations[p] ?? 0) + award);
}
function growthObservations(s, target) {
  return Object.entries(relationshipProfiles).filter(([p, d]) => s.known.includes(p) && d.observeTarget === target && d.observeScene === s.scene && relationshipMemory(s, p).promise?.acceptedAt !== void 0 && relationshipMemory(s, p).promise?.observedAt === void 0).map(([p, d]) => ({ person: p, action: "relationship-observe:" + p, label: [`\u4E3A${people[p].name[0]}\u4ED4\u7EC6\u770B\u770B`, `Look carefully for ${people[p].name[1]}`], reply: d.observation }));
}
var growthObservationVerbs = (target) => Object.entries(relationshipProfiles).filter(([, d]) => d.observeTarget === target).map(([p]) => "relationship-observe:" + p);
function applyGrowthObservation(s, target, p, minute3 = townMinutes(s)) {
  const option = growthObservations(s, target).find((x) => x.person === p);
  if (!option) throw Error("RELATIONSHIP_OBSERVATION_UNAVAILABLE");
  const m = record(s, p, "observe", "promise", minute3);
  m.promise.observedAt = minute3;
  return option.reply;
}
function relationshipGreeting(s, p) {
  if (!relationshipProfiles[p]) return;
  if (!s.known.includes(p)) return (relationshipExpansionProfiles[p] || relationshipNextProfiles[p]) && (s.history.some((h) => h.person === p) || s.flags.some((f2) => f2.startsWith("talk:" + p + ":"))) ? ["\u8FC7\u53BB\u7684\u8C08\u8BDD\u8FD8\u4FDD\u5B58\u5728\u8BB0\u5F55\u91CC\u3002\u518D\u6B21\u89C1\u9762\u65F6\uFF0C\u53EF\u4EE5\u91CD\u65B0\u6253\u4E2A\u62DB\u547C\u3002", "Your earlier conversations remain in the journal. You can say hello again when you meet."] : void 0;
  const stage = relationshipStage(s, p), m = relationshipMemory(s, p), name = people[p].name;
  const lines = { acquaintance: [`${name[0]}\u8BA4\u51FA\u4E86\u4F60\uFF1A\u201C\u53C8\u89C1\u9762\u4E86\u3002\u4ECA\u5929\u60F3\u6162\u6162\u804A\u70B9\u4EC0\u4E48\uFF1F\u201D`, `${name[1]} recognizes you. \u201CGood to see you again. What would you like to talk about today?\u201D`], familiar: [`${name[0]}\u671D\u4F60\u62DB\u624B\uFF1A\u201C\u719F\u9762\u5B54\u6765\u4E86\u3002\u4E0A\u6B21\u804A\u7684\u4E8B\uFF0C\u6211\u8FD8\u8BB0\u7740\u3002\u201D`, `${name[1]} waves. \u201CA familiar face. I remember what we talked about.\u201D`], trusted: [`${name[0]}\u4E3A\u4F60\u7559\u51FA\u7A7A\u5F53\uFF1A\u201C\u662F\u4F60\u5440\u3002\u6709\u4E9B\u8BDD\uFF0C\u6211\u613F\u610F\u6162\u6162\u548C\u4F60\u8BF4\u3002\u201D`, `${name[1]} makes time for you. \u201CIt\u2019s you. There are things I feel comfortable sharing with you.\u201D`], close: [`${name[0]}\u7B11\u7740\u8FCE\u4F60\uFF1A\u201C\u8001\u670B\u53CB\uFF0C\u4ECA\u5929\u8FC7\u5F97\u600E\u4E48\u6837\uFF1F\u5C31\u5F85\u4E00\u4F1A\u513F\u4E5F\u597D\u3002\u201D`, `${name[1]} smiles. \u201CMy friend, how has your day been? We can simply stay a while.\u201D`] };
  const line = lines[stage], memory2 = relationshipLastMemory(s, p);
  return memory2 ? [line[0] + " " + memory2[0], line[1] + " " + memory2[1]] : m.legacy.facts.length ? [line[0] + " \u6211\u4EEC\u4EE5\u524D\u4E00\u8D77\u505A\u8FC7\u7684\u4E8B\u8FD8\u5728\u624B\u8BB0\u91CC\u3002", line[1] + " Our earlier experiences are still in the journal."] : line;
}
function relationshipLastMemory(s, p) {
  const m = relationshipMemory(s, p), d = relationshipProfiles[p];
  if (!d || !m.lastId) return;
  const labels2 = { meet: ["\u8BB0\u5F97\u4F60\u4EEC\u4E92\u76F8\u4ECB\u7ECD\u7684\u90A3\u6B21\u3002", "They remember your introductions."], "story-toolbag": ["\u8BB0\u5F97\u4F60\u4EB2\u624B\u4EA4\u8FD8\u4E86\u5DE5\u5177\u888B\u3002", "They remember you returning the tool bag."], "story-song": ["\u8BB0\u5F97\u4F60\u4EEC\u5728\u7801\u5934\u4E00\u8D77\u542C\u6B4C\u3001\u542C\u6C34\u58F0\u3002", "They remember sharing the tune and listening to the water on the pier."], "rg-greet": ["\u8BB0\u5F97\u4F60\u4E0A\u6B21\u8FC7\u6765\u6253\u62DB\u547C\u3002", "They remember your last hello."], "rg-personal": ["\u8BB0\u5F97\u4F60\u8BA4\u771F\u542C\u8FC7\u4ED6\u4EEC\u559C\u6B22\u7684\u5C0F\u4E8B\u3002", "They remember you listening to the little things they enjoy."], "rg-request": ["\u8BB0\u5F97\u4F60\u7B54\u5E94\u5148\u89C2\u5BDF\uFF0C\u518D\u56DE\u6765\u804A\u3002", "They remember your promise to look carefully and return."], observe: ["\u8BB0\u5F97\u4F60\u5DF2\u4EB2\u81EA\u89C2\u5BDF\uFF0C\u4ECD\u7B49\u4F60\u56DE\u6765\u804A\u3002", "Your observation is saved; they are waiting to hear it."], "rg-fulfill": ["\u8BB0\u5F97\u4F60\u56DE\u6765\u5151\u73B0\u4E86\u7EA6\u5B9A\u3002", "They remember you returning and following through."], "rg-invite": ["\u8BB0\u5F97\u4F60\u4EEC\u7EA6\u597D\u6539\u5929\u4E00\u8D77\u5F85\u4E00\u4F1A\u513F\u3002", "They remember your plan to spend some time together."], "rg-company": d.company, "rg-private": ["\u8BB0\u5F97\u4F60\u542C\u8FC7\u4ED6\u4EEC\u7684\u4E00\u6BB5\u5FC3\u4E8B\u3002", "They remember sharing something that was on their mind."], "rg-private-invite": ["\u8BB0\u5F97\u4F60\u4EEC\u613F\u610F\u518D\u7559\u70B9\u65F6\u95F4\u7ED9\u5F7C\u6B64\u3002", "They remember agreeing to make more time for each other."], "rg-private-event": d.privateEvent, "rg-recall": d.recall };
  return labels2[m.lastId];
}
function validRelationshipGrowth(s) {
  return validGrowthRoot(s, s.relationshipsV1, RELATIONSHIP_RULES, relationshipPilotIds) && validGrowthRoot(s, s.relationshipExpansionV1, RELATIONSHIP_EXPANSION_RULES, Object.keys(relationshipExpansionProfiles)) && validGrowthRoot(s, s.relationshipNextV1, RELATIONSHIP_NEXT_RULES, Object.keys(relationshipNextProfiles));
}
function validGrowthRoot(s, root, rules2, residents) {
  if (root === void 0) return true;
  const now2 = townMinutes(s), minute3 = (n) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= now2, keys4 = (o, allowed) => Object.keys(o).every((k) => allowed.includes(k));
  if (!root || typeof root !== "object" || !keys4(root, ["schema", "rules", "migratedAt", "residents"]) || root.schema !== 1 || root.rules !== rules2 || !minute3(root.migratedAt) || !root.residents || typeof root.residents !== "object" || Array.isArray(root.residents)) return false;
  return Object.entries(root.residents).every(([p, m]) => {
    if (!residents.includes(p) || !s.known.includes(p) || !m || typeof m !== "object" || !keys4(m, ["legacy", "days", "interactions", "lastId", "promise", "companyAt", "privateAt"]) || !m.legacy || !keys4(m.legacy, ["relation", "facts"]) || !Number.isFinite(m.legacy.relation) || m.legacy.relation < -100 || m.legacy.relation > 100 || !Array.isArray(m.legacy.facts) || m.legacy.facts.some((f2) => !legacyFacts(s, p).includes(f2)) || !Array.isArray(m.days) || !m.interactions || typeof m.interactions !== "object" || Array.isArray(m.interactions)) return false;
    const entries = Object.entries(m.interactions);
    if (entries.length > 14 || !entries.every(([id, i]) => ["meet", "observe", ...growthTopicIds, ...storyInteractionIds].includes(id) && !!i && keys4(i, ["kind", "minute"]) && i.kind === interactionKind(id) && minute3(i.minute) && i.minute >= root.migratedAt)) return false;
    if (m.interactions["story-toolbag"] && !legacyFacts(s, p).includes("bag-returned") || m.interactions["story-song"] && !legacyFacts(s, p).includes("residents:song-shared")) return false;
    if (m.days.some((d, i) => !Number.isSafeInteger(d) || d < Math.floor(root.migratedAt / 1440) || d > Math.floor(now2 / 1440) || i > 0 && d <= m.days[i - 1]) || m.days.length > Math.floor(now2 / 1440) - Math.floor(root.migratedAt / 1440) + 1 || m.lastId !== void 0 && !m.interactions[m.lastId]) return false;
    if (m.promise && (typeof m.promise !== "object" || Array.isArray(m.promise) || !keys4(m.promise, ["acceptedAt", "observedAt", "completedAt"]) || !minute3(m.promise.acceptedAt) || !m.interactions["rg-request"] || m.promise.observedAt !== void 0 && (!minute3(m.promise.observedAt) || m.promise.observedAt < m.promise.acceptedAt || !m.interactions.observe) || m.promise.completedAt !== void 0 && (m.promise.observedAt === void 0 || !minute3(m.promise.completedAt) || m.promise.completedAt < m.promise.observedAt || !m.interactions["rg-fulfill"]))) return false;
    if (m.companyAt !== void 0 && (!minute3(m.companyAt) || !m.interactions["rg-company"] || !m.interactions["rg-invite"] || !fulfilled(m) || m.promise?.completedAt !== void 0 && m.companyAt < m.promise.completedAt)) return false;
    if (m.privateAt !== void 0 && (!minute3(m.privateAt) || !shared(m) || m.companyAt !== void 0 && m.privateAt < m.companyAt || !m.interactions["rg-private-event"] || !m.interactions["rg-private-invite"] || !m.interactions["rg-private"])) return false;
    return true;
  });
}

// src/story/next-neighbors.ts
var seen3 = (s, p, id) => s.flags.includes(`talk:${p}:${id}`);
var heard = (s, id) => seen3(s, id, "n2-start");
var consulted2 = (s, id) => {
  const p = nextResidents.find((p2) => p2.id === id);
  return seen3(s, p.partner, `n2-${id}-consult`);
};
var done = (s, id) => s.flags.includes(`neighbors2:${id}:done`);
var t2 = (id, label, reply) => ({ id, label, reply, once: true });
function nextTopics(s, person) {
  if (!s.known.includes(person) || !residentHere(s, person, s.scene)) return [];
  const options = [], p = nextResidents.find((p2) => p2.id === person);
  if (p) {
    if (!heard(s, p.id)) options.push(t2("n2-start", p.question, p.request));
    else if (!done(s, p.id) && consulted2(s, p.id)) options.push(...p.choices.map((c) => t2("n2-" + c.id, c.label, c.reply)));
    else if (done(s, p.id)) options.push(t2("n2-recall", ["\u540E\u6765\uFF0C\u4F60\u8FD8\u8BB0\u5F97\u8FD9\u4EF6\u4E8B\u5417\uFF1F", "Has that little plan stayed with you?"], p.recall));
    options.push(t2("routine", ["\u5E73\u65F6\u5728\u54EA\u513F\u80FD\u627E\u5230\u4F60\uFF1F", "Where can I usually find you?"], routineReply(p.id)));
  }
  for (const n of nextResidents.filter((n2) => n2.partner === person && heard(s, n2.id) && !done(s, n2.id))) options.push(t2(`n2-${n.id}-consult`, n.partnerQuestion, n.partnerReply));
  return options.filter((x) => !seen3(s, person, x.id));
}
function applyNextTopic(s, person, id) {
  const p = nextResidents.find((p2) => p2.id === person);
  if (!p || !["n2-choice-a", "n2-choice-b"].includes(id) || done(s, person)) return;
  s.flags.push(`neighbors2:${person}:done`);
  for (const who of [person, p.partner]) if (s.known.includes(who)) s.relations[who] = Math.min(100, (s.relations[who] ?? 0) + 1);
}
function nextTopicIds(person) {
  return [...nextResidents.some((p) => p.id === person) ? ["n2-start", "n2-choice-a", "n2-choice-b", "n2-recall", "routine"] : [], ...nextResidents.filter((p) => p.partner === person).map((p) => "n2-" + p.id + "-consult")];
}

// src/story/news-edition.ts
function validNewsState(s) {
  const r = s.newsEdition;
  if (s.newsMode !== void 0 && s.newsMode !== "live") return false;
  if (!r) return true;
  return s.newsMode === "live" && /^rss-[a-f0-9]{24}$/.test(r.id) && Number.isSafeInteger(r.revision) && r.revision > 0 && r.revision <= 200 && r.sourceId === "fed-monetary" && r.source === "Federal Reserve Board" && r.template === "finance-budget-v1" && r.status === "admitted" && /^https:\/\/www\.federalreserve\.gov\/newsevents\/pressreleases\/monetary\d{8}[a-z]?\.htm$/.test(r.canonicalURL) && typeof r.title === "string" && r.title.length > 0 && r.title.length <= 200 && !/[<>\u0000-\u001f\u202a-\u202e\u2066-\u2069]/.test(r.title) && /^[a-f0-9]{64}$/.test(r.contentHash) && [r.publishedAt, r.fetchedAt, r.lastCheckedAt, r.expiresAt].every((t3) => typeof t3 === "string" && t3.length < 40 && Number.isFinite(Date.parse(t3))) && typeof r.publishedRaw === "string" && r.publishedRaw.length < 80 && r.publishedPrecision === "instant" && r.publishedTimezone === "UTC";
}
function editionSummary(r) {
  return [`\u7F8E\u8054\u50A8\u53D1\u5E03\u4E86\u4E00\u5219\u8D27\u5E01\u653F\u7B56\u516C\u544A\uFF0C\u5B98\u65B9\u6807\u9898\u4E3A\u201C${r.title}\u201D\u3002\u6B64\u5904\u53EA\u5F15\u7528\u6807\u9898\uFF1B\u5177\u4F53\u5185\u5BB9\u8BF7\u67E5\u770B\u5B98\u65B9\u539F\u6587\u3002`, `The Federal Reserve published a monetary-policy announcement titled \u201C${r.title}\u201D. Only its headline is quoted here; consult the original for its contents.`];
}

// src/story/town-news.ts
var newsRecord = { id: "academy-20261002-v1", revision: 1, canonicalURL: "https://www.anthropic.com/news/claude-frontier-academy", title: "Claude Frontier Academy", source: "Anthropic", publishedAt: "2026-10-02", publishedPrecision: "date", publishedTimezone: null, fetchedAt: "2026-10-04", expiresAt: "2026-10-11", status: "frozen-local-sample", summary: ["Anthropic\u4E8E2026\u5E7410\u67082\u65E5\u5BA3\u5E03\u6295\u51651\u4EBF\u7F8E\u5143\uFF0C\u76EE\u6807\u52302027\u5E74\u5E95\u57F9\u517B\u4E00\u4E07\u540D\u5DE5\u7A0B\u5E08\u3002\u8FD9\u662F\u5BA3\u5E03\u7684\u8BA1\u5212\uFF0C\u5C1A\u4E0D\u662F\u5B8C\u6210\u7684\u6210\u679C\u3002", "On October 2, 2026, Anthropic announced a $100 million commitment with a goal of training 10,000 engineers by the end of 2027. This is an announced plan, not a completed result."] };
var sourceFor = (s) => s.newsEdition ? { ...s.newsEdition, summary: editionSummary(s.newsEdition) } : newsRecord;
var newsTopicIds = ["visitor-news", "visitor-test", "visitor-needs", "visitor-later", "visitor-hours", "visitor-reminder", "visitor-private", "visitor-recall", "visitor-budget", "visitor-no-reserve"];
var f = (s, id) => s.flags.includes("news:" + id);
function newsTopics(s, p) {
  if (p !== "dani" || !s.known.includes(p)) return [];
  if (s.newsMode === "live") {
    if (!s.newsEdition || ["changed", "unavailable"].includes(s.newsAvailability ?? "") || s.newsAvailability === "expired" && !f(s, "heard")) return [];
    return financeTopics(s);
  }
  const t3 = (id, label, reply) => ({ id, label, reply, once: true });
  if (!f(s, "heard")) return [t3("visitor-news", ["\u6E38\u5BA2\u7559\u8A00\u91CC\u6709\u4EC0\u4E48\u65B0\u9C9C\u4E8B\uFF1F", "Anything new in the visitor notebook?"], ["\u4E39\u59AE\u7FFB\u51FA\u4E00\u5F20\u7559\u8A00\uFF1A\u201CCasey\u662F\u6765\u4F11\u5047\u7684\u8F6F\u4EF6\u5DE5\u7A0B\u5E08\u3002\u8BFB\u5230\u8FD9\u5219\u57F9\u8BAD\u65B0\u95FB\u540E\uFF0C\u5979\u60F3\u8BD5\u8BD5\uFF1A\u6280\u672F\u80FD\u4E0D\u80FD\u5E2E\u5C0F\u5E97\u5C11\u51FA\u9519\uFF1F\u4E0D\u662F\u5927\u9879\u76EE\uFF0C\u5148\u6838\u5BF9\u4E09\u6761\u8425\u4E1A\u63D0\u793A\u3002\u201D\u8FD9\u662F\u865A\u6784\u6E38\u5BA2\u7684\u63D0\u8BAE\uFF0C\u4E0D\u662F\u65B0\u95FB\u91CC\u516C\u53F8\u7684\u6D3B\u52A8\u3002", "Dani opens a note. \u201CCasey is a software engineer on holiday. That training announcement made her wonder: could technology help a small shop make fewer mistakes? She suggests checking three opening-hours notices.\u201D This fictional visitor\u2019s idea is not an activity run by the company in the news."])];
  if (!f(s, "test") && !f(s, "needs") && !f(s, "later")) return [t3("visitor-test", ["\u6211\u6765\u6838\u5BF9\u4E00\u4E2A\u5C0F\u4F8B\u5B50", "Try checking a small example"], ["\u201C\u5148\u770B\u4E8B\u5B9E\u3002\u201D\u7559\u8A00\u91CC\u7ED9\u51FA\u7684\u6742\u8D27\u94FA\u8425\u4E1A\u65F6\u95F4\u662F06:00\u201317:00\u3002\u4E09\u5F20\u8349\u7A3F\uFF0C\u54EA\u4E00\u5F20\u6CA1\u6709\u628A\u4F11\u606F\u65F6\u95F4\u8BF4\u9519\uFF1F", "\u201CStart with the facts.\u201D The grocer opens from 06:00 to 17:00. Which of the three drafts gets the closing time right?"]), t3("visitor-needs", ["\u5148\u95EE\u5E97\u4E3B\u7A76\u7ADF\u9700\u8981\u4EC0\u4E48", "Ask what the shopkeeper actually needs"], ["\u4F60\u5199\u4E0B\uFF1A\u5148\u5F81\u5F97\u5E97\u4E3B\u540C\u610F\uFF0C\u518D\u8BD5\u4E00\u9879\u5C0F\u6539\u8FDB\uFF0C\u4E0D\u62FF\u987E\u5BA2\u8D44\u6599\u7EC3\u4E60\u3002\u4E39\u59AE\u628A\u5B83\u7559\u5728\u7559\u8A00\u672C\u9996\u9875\uFF1A\u201C\u8FD9\u4E2A\u987A\u5E8F\u503C\u5F97\u8BB0\u4F4F\u3002\u201D\u8FD9\u662F\u4F60\u7ED9\u865A\u6784\u6545\u4E8B\u7559\u4E0B\u7684\u5EFA\u8BAE\uFF0C\u4E0D\u4EE3\u8868\u5E97\u4E3B\u5DF2\u7ECF\u7B54\u5E94\u3002", "You write: ask the shopkeeper first, try one small improvement, and leave customer information out of experiments. Dani keeps it at the front. \u201CWorth remembering that order.\u201D Your suggestion remains in this fictional story; it does not mean the shopkeeper has agreed."]), t3("visitor-later", ["\u4ECA\u5929\u5148\u4E0D\u53C2\u4E0E\uFF0C\u4FDD\u7559\u8FD9\u5219\u6D88\u606F", "Not today; keep the note"], ["\u4E39\u59AE\u628A\u7559\u8A00\u6536\u597D\u3002\u4F60\u53EF\u4EE5\u7EE7\u7EED\u5C0F\u9547\u7684\u5176\u4ED6\u4E8B\u60C5\uFF0C\u8FD9\u5219\u6D88\u606F\u4E5F\u7559\u5728\u624B\u8BB0\u91CC\u3002", "Dani saves the note. The rest of town is yours to explore; the source stays in your journal."])];
  if (f(s, "test") && !f(s, "checked")) return [t3("visitor-hours", ["06:00\u201317:00\u8425\u4E1A\uFF1B\u5173\u5E97\u540E\u8BF7\u660E\u5929\u518D\u6765", "Open 06:00\u201317:00; return tomorrow after closing"], ["\u4F60\u5212\u51FA\u8425\u4E1A\u65F6\u6BB5\uFF0C\u5E76\u7559\u4E0B\u5173\u5E97\u540E\u7684\u53BB\u5411\u3002\u4E39\u59AE\u5728\u4FBF\u6761\u4E0A\u5199\u4E86\u201C\u5DF2\u6838\u5BF9\u201D\uFF0C\u6CA1\u6709\u8BA9\u4E00\u53E5\u6F02\u4EAE\u4F46\u9519\u8BEF\u7684\u4ECB\u7ECD\u66FF\u4EE3\u4E8B\u5B9E\u3002", "You underline the opening hours and explain what to do after closing. Dani marks the note checked. A polished but wrong sentence does not get to replace the facts."]), t3("visitor-reminder", ["\u5199\u6210\u5168\u5929\u8425\u4E1A\u6BD4\u8F83\u65B9\u4FBF", "Call it open all day"], ["\u201C\u90A3\u4F1A\u8BA9\u4EBA\u767D\u8DD1\u4E00\u8D9F\u3002\u201D\u4E39\u59AE\u6307\u56DE06:00\u201317:00\u7684\u8BB0\u5F55\u3002\u4F60\u4EEC\u5148\u7559\u4E0B\u8349\u7A3F\uFF0C\u91CD\u65B0\u6838\u5BF9\u3002", "\u201CThat sends someone on a wasted trip.\u201D Dani points back to 06:00\u201317:00. You keep the draft and check again."]), t3("visitor-private", ["\u5148\u6536\u96C6\u987E\u5BA2\u8D44\u6599\uFF0C\u518D\u51B3\u5B9A", "Collect customer details first"], ["\u201C\u6838\u5BF9\u8425\u4E1A\u65F6\u95F4\u7528\u4E0D\u5230\u8FD9\u4E9B\u3002\u201D\u4E39\u59AE\u628A\u79C1\u4EBA\u8D44\u6599\u90A3\u4E00\u680F\u5212\u6389\uFF0C\u7559\u4E0B\u516C\u5F00\u7684\u8425\u4E1A\u8BB0\u5F55\u3002\u518D\u770B\u4E00\u6B21\u5427\u3002", "\u201CChecking opening hours does not need that.\u201D Dani crosses out the request for private details and leaves the public schedule. Have another look."])];
  return !s.flags.includes("talk:dani:visitor-recall") ? [t3("visitor-recall", ["\u90A3\u5F20\u6E38\u5BA2\u4FBF\u6761\u540E\u6765\u600E\u6837\u4E86\uFF1F", "What happened to the visitor note?"], f(s, "checked") ? ["\u201C\u4F60\u6838\u5BF9\u8FC7\u7684\u90A3\u5F20\u8FD8\u5728\u672C\u5B50\u91CC\u3002\u201D\u4E39\u59AE\u7FFB\u5230\u6253\u52FE\u7684\u4E00\u9875\uFF0C\u201C\u5148\u8BD5\u5C0F\u4F8B\u5B50\uFF0C\u628A\u4F11\u606F\u65F6\u95F4\u4E5F\u5199\u6E05\u695A\u3002\u201D", "\u201CYour checked note is still here.\u201D Dani turns to the marked page. \u201CA small test, with the closing time made clear.\u201D"] : f(s, "needs") ? ["\u201C\u5148\u95EE\u5E97\u4E3B\u9700\u8981\u4EC0\u4E48\uFF0C\u90A3\u53E5\u6211\u7559\u7740\u4E86\u3002\u201D\u4E39\u59AE\u6CA1\u6709\u628A\u5EFA\u8BAE\u5199\u6210\u5DF2\u7ECF\u5B9E\u73B0\u7684\u8BA1\u5212\u3002", "\u201CI kept your line about asking what the shopkeeper needs.\u201D Dani has not turned your suggestion into a claim that it already happened."] : ["\u201C\u6211\u7559\u7740\u4E86\u3002\u4F60\u4E0D\u5FC5\u53C2\u52A0\u6BCF\u4E00\u4EF6\u4E8B\u3002\u201D\u4E39\u59AE\u5408\u4E0A\u672C\u5B50\u3002", "\u201CStill here. You needn\u2019t join every activity.\u201D Dani closes the book."])] : [];
}
function applyNewsTopic(s, p, id) {
  if (p !== "dani" || !newsTopicIds.includes(id)) return;
  const names2 = { "visitor-news": "heard", "visitor-test": "test", "visitor-needs": "needs", "visitor-later": "later", "visitor-hours": "checked", "visitor-budget": "checked" };
  const key2 = names2[id];
  if (key2 && !f(s, key2)) s.flags.push("news:" + key2);
  if (key2 === "heard" && !s.flags.includes("news:record:" + sourceFor(s).id)) s.flags.push("news:record:" + sourceFor(s).id);
}
function financeTopics(s) {
  const t3 = (id, label, reply) => ({ id, label, reply, once: true });
  if (!f(s, "heard")) return [t3("visitor-news", ["\u6E38\u5BA2\u7559\u8A00\u91CC\u6709\u4EC0\u4E48\u65B0\u9C9C\u4E8B\uFF1F", "Anything new in the visitor notebook?"], ["\u4E39\u59AE\u8BF4\uFF1A\u201CAlex\u662F\u6765\u4F11\u5047\u7684\u91D1\u878D\u4ECE\u4E1A\u8005\uFF0C\u8BFB\u5230\u8FD9\u5219\u653F\u7B56\u516C\u544A\uFF0C\u53C8\u60F3\u8D77\u5DE5\u4F5C\u91CC\u6700\u5E38\u89C1\u7684\u9519\u8BEF\uFF1A\u628A\u4E0D\u786E\u5B9A\u7684\u4E8B\u5F53\u6210\u4FDD\u8BC1\u3002\u5979\u60F3\u5E2E\u5C0F\u96C6\u5E02\u5148\u7B97\u4E00\u4EFD\u8BD5\u9A8C\u9884\u7B97\uFF0C\u518D\u95EE\u644A\u4E3B\u613F\u4E0D\u613F\u610F\u505A\u3002\u201D\u8FD9\u662F\u865A\u6784\u6E38\u5BA2\u7684\u8054\u60F3\uFF0C\u4E0D\u662F\u7F8E\u8054\u50A8\u5BF9\u5C0F\u9547\u7684\u5B89\u6392\uFF0C\u4E5F\u6CA1\u6709\u63A8\u65AD\u65B0\u95FB\u4F1A\u6539\u53D8\u8FD9\u91CC\u7684\u7269\u4EF7\u3002", "Dani says, \u201CAlex works in finance and is here on holiday. This policy announcement reminded her of a familiar mistake at work: treating uncertainty as a promise. She suggests checking a small market trial budget before asking a stallholder whether they want to try it.\u201D This is a fictional visitor\u2019s reaction, not a Federal Reserve project or a claim that this news changes town prices."])];
  if (!f(s, "test") && !f(s, "needs") && !f(s, "later")) return [t3("visitor-test", ["\u6838\u5BF9\u5C0F\u96C6\u5E02\u7684\u8BD5\u9A8C\u9884\u7B97", "Check the market trial budget"], ["\u7EB8\u4E0A\u5199\u7740\uFF1A\u8BD5\u9A8C\u9884\u7B97$10\uFF0C\u7EB8\u677F$3\uFF0C\u5939\u5B50$4\uFF0C\u88C5\u9970$3\u3002\u4E0D\u5FC5\u5168\u82B1\u6389\u3002\u4F60\u4F1A\u7ED9\u644A\u4E3B\u54EA\u4E00\u4EFD\u5EFA\u8BAE\uFF1F\u8FD9\u91CC\u7684\u6570\u5B57\u53EA\u662F\u865A\u6784\u9884\u7B97\uFF0C\u4E0D\u6263\u4F60\u7684\u94B1\u5305\u3002", "The note lists a $10 trial budget: card $3, clips $4, decorations $3. There is no need to spend it all. What would you suggest? These are fictional planning figures; your wallet is not charged."]), t3("visitor-needs", ["\u5148\u95EE\u644A\u4E3B\u9700\u8981\u4EC0\u4E48", "Ask what the stallholder needs first"], ["\u4F60\u5199\u4E0B\uFF1A\u5148\u95EE\u8981\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u82B1\u94B1\u3002\u4E39\u59AE\u7559\u4E0B\u8FD9\u53E5\u5EFA\u8BAE\uFF0C\u6CA1\u6709\u66FF\u644A\u4E3B\u7B54\u5E94\u3002", "You write: first ask what problem needs solving, then decide whether to spend. Dani keeps the suggestion without agreeing on the stallholder\u2019s behalf."]), t3("visitor-later", ["\u4ECA\u5929\u5148\u4E0D\u53C2\u4E0E\uFF0C\u4FDD\u7559\u8FD9\u5219\u6D88\u606F", "Not today; keep the note"], ["\u4E39\u59AE\u6536\u597D\u6765\u6E90\u548C\u4FBF\u6761\u3002\u4F60\u53EF\u4EE5\u7EE7\u7EED\u81EA\u5DF1\u7684\u65C5\u7A0B\u3002", "Dani keeps the source and the note. Your own journey can continue."])];
  if (f(s, "test") && !f(s, "checked")) return [t3("visitor-budget", ["\u7EB8\u677F\u548C\u5939\u5B50$7\uFF0C\u7559\u4E0B$3\u5907\u7528", "Card and clips: $7; keep $3 in reserve"], ["\u4F60\u628A\u5FC5\u8981\u6750\u6599\u548C\u5907\u7528\u91D1\u5206\u5F00\u3002\u4E39\u59AE\u628A\u9884\u7B97\u4FBF\u6761\u7559\u5728\u82B1\u56ED\u544A\u793A\u5904\uFF1BAlex\u7684\u8BD5\u9A8C\u4ECD\u662F\u5EFA\u8BAE\uFF0C\u5C1A\u672A\u53D8\u6210\u627F\u8BFA\u6216\u91C7\u8D2D\u3002\u4F60\u7684\u94B1\u5305\u6CA1\u6709\u53D8\u5316\u3002", "You separate necessary materials from the reserve. Dani keeps the budget note at the garden noticeboard. Alex\u2019s trial remains a suggestion, not a promise or a purchase. Your wallet is unchanged."]), t3("visitor-no-reserve", ["\u82B1\u5B8C$10\uFF0C\u5E76\u4FDD\u8BC1\u4E0D\u4F1A\u6709\u610F\u5916", "Spend all $10 and promise no surprises"], ["\u4E39\u59AE\u6447\u5934\uFF1A\u201C\u9884\u7B97\u52A0\u8D77\u6765\u6CA1\u9519\uFF0C\u4F46\u8C01\u80FD\u4FDD\u8BC1\u6CA1\u6709\u610F\u5916\uFF1F\u201D\u4F60\u4EEC\u4FDD\u7559\u8349\u7A3F\uFF0C\u91CD\u65B0\u60F3\u60F3\u3002", "Dani shakes her head. \u201CThe sum works, but who can promise there will be no surprises?\u201D You keep the draft and reconsider."])];
  return !s.flags.includes("talk:dani:visitor-recall") ? [t3("visitor-recall", ["\u90A3\u5F20\u6E38\u5BA2\u4FBF\u6761\u540E\u6765\u600E\u6837\u4E86\uFF1F", "What happened to the visitor note?"], f(s, "checked") ? ["\u201C\u7559\u51FA$3\u5907\u7528\u7684\u5EFA\u8BAE\u8FD8\u5728\u3002\u201D\u4E39\u59AE\u6307\u5411\u9884\u7B97\u4FBF\u6761\u3002\u6CA1\u6709\u56E0\u6B64\u81EA\u52A8\u4E3E\u529E\u96C6\u5E02\u6216\u82B1\u6389\u4EFB\u4F55\u4EBA\u7684\u94B1\u3002", "\u201CYour suggestion to keep $3 in reserve is still here.\u201D Dani points to the budget note. No market was automatically arranged, and nobody\u2019s money was spent."] : f(s, "needs") ? ["\u201C\u5148\u95EE\u9700\u6C42\uFF0C\u90A3\u53E5\u6211\u7559\u7740\u4E86\u3002\u201D", "\u201CI kept your line about asking what is needed first.\u201D"] : ["\u201C\u4FBF\u6761\u8FD8\u5728\u3002\u4F60\u4E0D\u5FC5\u53C2\u4E0E\u6BCF\u4EF6\u4E8B\u3002\u201D", "\u201CStill here. You need not join every activity.\u201D"])] : [];
}

// src/story/progress.ts
function questProgress(s) {
  const has2 = (id) => s.flags.includes(id);
  return {
    arrival: has2("unpacked") ? "settled" : has2("key") ? "key-collected" : "awaiting-key",
    toolbag: has2("bag-returned") ? "returned" : (s.items.toolbag ?? 0) > 0 ? "carried" : has2("talk:theo:bag") ? "collected" : has2("talk:mara:settle") ? "requested" : "not-requested",
    terrace: has2("terrace-fixed") ? "repaired" : s.activeChallenge?.kind === "repair" ? "in-progress" : "unrepaired",
    bridge: has2("bridge-fixed") ? "repaired" : has2("bridge-seen") ? "inspected" : "uninspected",
    trail: has2("alternative-route") ? "mapped" : "unmapped",
    garden: has2("garden-agreed") ? "agreed-10-to-12" : "not-agreed",
    access: has2("route-open") ? "open" : has2("bridge-fixed") || has2("alternative-route") || has2("garden-agreed") ? "ready" : "not-ready",
    market: has2("market-open") ? "open" : has2("market-known") ? "notice-read" : "unknown"
  };
}

// src/story/relationships.ts
var roles = { ...nextRoles, ...techRoles, ...chapelPriestRoles, mara: ["\u4F60\u7684\u623F\u4E1C\uFF0C\u4F4F\u5728\u6D77\u6E7E\u591A\u5E74\u3002", "Your landlady, a longtime local."], theo: ["\u6F6E\u95F4\u5496\u5561\u9986\u7684\u5E97\u5458\u3002", "Works at Tide & Table."], june: ["\u7ECF\u8425\u4FEE\u7406\u94FA\uFF0C\u719F\u6089\u9547\u4E0A\u7684\u4FEE\u4FEE\u8865\u8865\u3002", "Runs the workshop and knows the town\u2019s repairs."], idris: ["\u6E2F\u53E3\u62F3\u9986\u7684\u6559\u7EC3\u3002", "Coach at Harbor Boxing Club."], ruth: ["\u5E38\u5728\u7801\u5934\u9493\u9C7C\u3002", "An angler at the pier."], luis: ["\u8857\u89D2\u6742\u8D27\u94FA\u7684\u5E97\u4E3B\u3002", "Runs the Corner Grocer."], nell: ["\u7ECF\u8425\u65E7\u7269\u5E97\uFF0C\u4FDD\u5B58\u8001\u7167\u7247\u3002", "Keeps old photographs at Second Chances."], elena: ["\u5EAD\u9662\u7684\u4F4F\u6237\uFF0C\u7167\u987E\u82B1\u8349\u548C\u5BB6\u4EBA\u3002", "A courtyard resident who cares for the garden and her family."], arthur: ["\u66FE\u5728\u6C14\u8C61\u7AD9\u5DE5\u4F5C\u3002", "Formerly worked at the weather station."], avery: ["\u9001\u5305\u88F9\u4E4B\u4F59\uFF0C\u559C\u6B22\u968F\u624B\u753B\u753B\u3002", "Delivers parcels and sketches in their spare time."], samira: ["\u5728\u5B66\u6821\u98DF\u5802\u5DE5\u4F5C\uFF0C\u559C\u6B22\u8F7B\u58F0\u54FC\u6B4C\u3002", "Works in the school kitchen and enjoys humming."], owen: ["\u9000\u4F11\u7684\u516C\u4EA4\u8F66\u4FEE\u7406\u5DE5\uFF0C\u559C\u6B22\u542C\u6D77\u9E1F\u3002", "A retired bus mechanic who listens for seabirds."], dani: ["\u5728\u56FE\u4E66\u9986\u5DE5\u4F5C\uFF0C\u8BB0\u5F55\u8857\u574A\u7684\u82B1\u56ED\u6545\u4E8B\u3002", "Works at the library and collects neighbors\u2019 garden stories."] };
function knownPeople(s, registry = people) {
  const ids = new Set(s.known);
  for (const entry of s.history) if (entry.person) ids.add(entry.person);
  for (const flag3 of s.flags) {
    const match = /^talk:([^:]+):/.exec(flag3);
    if (match) ids.add(match[1]);
  }
  if (s.flags.includes("key") || s.flags.includes("bag-returned")) ids.add("mara");
  if (s.items.toolkit > 0) ids.add("june");
  if (s.flags.includes("garden-agreed")) ids.add("elena");
  return Object.keys(registry).filter((id) => ids.has(id) && techNomadAdmitted(id));
}

// src/weather/ecology.ts
var mintRainCap = 60;
function createWeatherEcology(minute3) {
  if (!Number.isSafeInteger(minute3) || minute3 < 0) throw Error("INVALID_WEATHER_ECOLOGY_INPUT");
  return { schema: 1, ruleset: "harbor-weather-ecology-v1", activatedAt: minute3, settledThrough: minute3, rainDay: Math.floor(minute3 / 1440), mintRainUsed: 0 };
}
function validWeatherEcology(v, minute3, weather) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v;
  return Object.keys(s).sort().join(",") === "activatedAt,mintRainUsed,rainDay,ruleset,schema,settledThrough" && s.schema === 1 && s.ruleset === "harbor-weather-ecology-v1" && Number.isSafeInteger(s.activatedAt) && s.activatedAt >= 0 && s.activatedAt <= minute3 && s.settledThrough === minute3 && s.rainDay === Math.floor(minute3 / 1440) && Number.isSafeInteger(s.mintRainUsed) && s.mintRainUsed >= 0 && s.mintRainUsed <= mintRainCap && !!weather && s.activatedAt >= weather.activatedAt;
}

// src/weather/state.ts
var defaultWeatherParameters = Object.freeze({ slotMinutes: 180, rainMinutesPerDay: 60 });
var weatherKinds = ["clear", "cloudy", "light-rain", "cloudy"];
var int = (n) => Number.isSafeInteger(n) && n >= 0;
var object3 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var exact = (v, keys4) => Object.keys(v).sort().join(",") === [...keys4].sort().join(",");
function validWeatherParameters(v) {
  return object3(v) && exact(v, ["slotMinutes", "rainMinutesPerDay"]) && int(v.slotMinutes) && v.slotMinutes >= 60 && v.slotMinutes <= 720 && int(v.rainMinutesPerDay) && v.rainMinutesPerDay <= 120;
}
function weatherAt(minute3, parameters = defaultWeatherParameters) {
  if (!int(minute3) || !validWeatherParameters(parameters)) throw Error("INVALID_WEATHER_INPUT");
  const slot2 = Math.floor((minute3 - 540) / parameters.slotMinutes);
  return weatherKinds[(slot2 % 4 + 4) % 4];
}
function createWeatherState(minute3, parameters = defaultWeatherParameters) {
  if (!int(minute3) || !validWeatherParameters(parameters)) throw Error("INVALID_WEATHER_INPUT");
  return { schema: 1, ruleset: "harbor-weather-v1", parameters: { ...parameters }, activatedAt: minute3, settledThrough: minute3, kind: weatherAt(minute3, parameters), rainDay: Math.floor(minute3 / 1440), water: {} };
}
function validWeatherState(v, minute3, maximumBeds = 4) {
  if (!object3(v) || !exact(v, ["schema", "ruleset", "parameters", "activatedAt", "settledThrough", "kind", "rainDay", "water"]) || v.schema !== 1 || v.ruleset !== "harbor-weather-v1" || !validWeatherParameters(v.parameters) || !int(minute3) || !int(v.activatedAt) || !int(v.settledThrough) || v.activatedAt > v.settledThrough || v.settledThrough !== minute3 || v.kind !== weatherAt(minute3, v.parameters) || v.rainDay !== Math.floor(minute3 / 1440) || !object3(v.water) || ![2, 4].includes(maximumBeds) || Object.keys(v.water).length > 3 + maximumBeds) return false;
  return Object.entries(v.water).every(([id, n]) => /^(garden:crop-bed-[123]|land:life-bed-[1-4])$/.test(id) && (!id.startsWith("land:") || Number(id.slice(-1)) <= maximumBeds) && int(n) && n <= v.parameters.rainMinutesPerDay);
}
function assertWeatherReadable(s) {
  if (s.weatherV1 !== void 0 && !validWeatherState(s.weatherV1, s.townMinutes ?? 540, landMaximum(s.landV1))) throw Error("UNSUPPORTED_WEATHER_SAVE");
  if (s.weatherEcologyV1 !== void 0 && !validWeatherEcology(s.weatherEcologyV1, s.townMinutes ?? 540, s.weatherV1)) throw Error("UNSUPPORTED_WEATHER_ECOLOGY_SAVE");
}
function weatherForSave(s) {
  return s.weatherV1?.kind ?? weatherAt(s.townMinutes ?? 540);
}
function weatherPatch(before, next) {
  if (!next.weatherV1) return void 0;
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b), lifeBefore = before.lifeV1?.plots, lifeNext = next.lifeV1?.plots;
  const mintBefore = before.plantUsesV1?.mint, mintNext = next.plantUsesV1?.mint, mintChanged = !!mintNext && mintNext.recoverAt !== null && mintBefore?.recoverAt !== mintNext.recoverAt;
  if (equal(before.weatherV1, next.weatherV1) && equal(before.weatherEcologyV1, next.weatherEcologyV1) && equal(before.plots, next.plots) && equal(lifeBefore, lifeNext) && !mintChanged) return void 0;
  return { weatherV1: structuredClone(next.weatherV1), ...next.weatherEcologyV1 ? { weatherEcologyV1: structuredClone(next.weatherEcologyV1) } : {}, ...mintChanged ? { mintRecovery: { recoverAt: mintNext.recoverAt } } : {}, ...!equal(before.plots, next.plots) ? { plots: structuredClone(next.plots) } : {}, ...!equal(lifeBefore, lifeNext) ? { lifePlots: structuredClone(lifeNext) } : {} };
}
function applyWeatherPatch(head, patch, previous) {
  if (!patch) return head;
  const s = head, old = previous;
  if (!object3(patch) || Object.keys(patch).some((k) => !["weatherV1", "weatherEcologyV1", "mintRecovery", "plots", "lifePlots"].includes(k)) || !validWeatherState(patch.weatherV1, s.townMinutes ?? 540, landMaximum(s.landV1))) throw Error("WEATHER_REPLY_UNCONFIRMED");
  if (old.weatherV1 && (JSON.stringify(old.weatherV1.parameters) !== JSON.stringify(patch.weatherV1.parameters) || old.weatherV1.activatedAt !== patch.weatherV1.activatedAt)) throw Error("WEATHER_REPLY_UNCONFIRMED");
  if (!old.weatherV1 && patch.weatherV1.activatedAt !== (old.townMinutes ?? 540)) throw Error("WEATHER_REPLY_UNCONFIRMED");
  if ((s.townMinutes ?? 540) < (old.townMinutes ?? 540) || old.weatherV1?.rainDay === patch.weatherV1.rainDay && Object.entries(old.weatherV1.water).some(([id, n]) => (patch.weatherV1.water[id] ?? 0) < n)) throw Error("WEATHER_REPLY_UNCONFIRMED");
  const sameKeys = (a, b) => object3(a) && object3(b) && Object.keys(a).sort().join(",") === Object.keys(b).sort().join(",");
  const grows = (p, old2, max) => JSON.stringify(p) === JSON.stringify(old2) || p && old2 && Number.isSafeInteger(p.grown) && p.grown >= old2.grown && p.grown <= max && p.updatedAt === s.townMinutes && Number.isSafeInteger(p.wetUntil) && p.wetUntil >= old2.wetUntil && p.wetUntil <= p.updatedAt + 720;
  if (patch.plots !== void 0) {
    if (!sameKeys(patch.plots, old.plots) || !validPlots({ ...s, plots: patch.plots }) || Object.entries(patch.plots).some(([id, p]) => !object3(p) || !exact(p, ["crop", "grown", "updatedAt", "wetUntil"]) || p.crop !== old.plots[id].crop || !grows(p, old.plots[id], crops[p.crop].minutes))) throw Error("WEATHER_REPLY_UNCONFIRMED");
  }
  if (patch.lifePlots !== void 0) {
    if (!sameKeys(patch.lifePlots, old.lifeV1?.plots) || Object.entries(patch.lifePlots).some(([id, p]) => !object3(p) || !exact(p, ["ref", "grown", "updatedAt", "wetUntil"]) || JSON.stringify(p.ref) !== JSON.stringify(old.lifeV1.plots[id].ref) || !grows(p, old.lifeV1.plots[id], 4320))) throw Error("WEATHER_REPLY_UNCONFIRMED");
  }
  const e = patch.weatherEcologyV1, oldE = old.weatherEcologyV1, oldMint = old.plantUsesV1?.mint, mint = s.plantUsesV1?.mint;
  if (oldE && !e || e && (!validWeatherEcology(e, s.townMinutes ?? 540, patch.weatherV1) || oldE && e.activatedAt !== oldE.activatedAt || !oldE && e.activatedAt !== (old.townMinutes ?? 540) || oldE?.rainDay === e.rainDay && e.mintRainUsed < oldE.mintRainUsed)) throw Error("WEATHER_REPLY_UNCONFIRMED");
  if (e && oldE?.rainDay === e.rainDay && !patch.mintRecovery && e.mintRainUsed !== oldE.mintRainUsed) throw Error("WEATHER_REPLY_UNCONFIRMED");
  if (patch.mintRecovery !== void 0) {
    const r = patch.mintRecovery, d = oldMint?.recoverAt - r.recoverAt;
    if (!e || !object3(r) || !exact(r, ["recoverAt"]) || !mint || !oldMint || mint.stock !== 1 || oldMint.stock !== 1 || !int(r.recoverAt) || r.recoverAt < 720 || !Number.isSafeInteger(oldMint.recoverAt) || d < 0 || d > (s.townMinutes ?? 540) - (old.townMinutes ?? 540) || d > mintRainCap * (Math.floor((s.townMinutes ?? 540) / 1440) - Math.floor((old.townMinutes ?? 540) / 1440) + 1) || JSON.stringify({ ...mint, recoverAt: 0 }) !== JSON.stringify({ ...oldMint, recoverAt: 0 }) || oldE?.rainDay === e.rainDay && e.mintRainUsed - oldE.mintRainUsed !== d) throw Error("WEATHER_REPLY_UNCONFIRMED");
  }
  return { ...head, weatherV1: patch.weatherV1, ...e ? { weatherEcologyV1: e } : {}, ...patch.mintRecovery ? { plantUsesV1: { ...s.plantUsesV1, mint: { ...mint, recoverAt: patch.mintRecovery.recoverAt } } } : {}, ...patch.plots !== void 0 ? { plots: patch.plots } : {}, ...patch.lifePlots !== void 0 ? { lifeV1: { ...old.lifeV1, plots: patch.lifePlots } } : {} };
}

// src/story/neighbor-chapter.ts
var originalNeighborRoster = ["arthur", "avery", "casey", "dani", "elena", "grant", "harper", "idris", "jordan", "june", "leila", "luis", "mara", "mira", "nell", "noor", "owen", "rowan", "ruth", "samira", "tess", "theo"];
var publicPlaces = ["station", "harbor", "market", "coast", "hill", "dock", "bazaar", "beach", "path", "lighthouse", "camp", "garden", "chapel", "cafe", "grocery", "workshop", "gym", "secondhand", "weather"];
var newNeighborChapter = () => ({ schema: 1, rules: "neighbor-chapter-v1", roster: people.gabriel ? "harbor23-priest-v2" : "harbor22-v1", invited: [] });
var roster = (s) => s.neighborChapterV1?.roster === "harbor23-priest-v2" ? [...originalNeighborRoster, "gabriel"] : originalNeighborRoster;
function completedNeighborTask(s, p) {
  const m = relationshipMemory(s, p);
  return m.promise?.completedAt !== void 0 || m.legacy.facts.some((f2) => ["bag-returned", "residents:song-shared"].includes(f2)) || !!m.interactions["story-toolbag"] || !!m.interactions["story-song"];
}
function familiarNeighbors(s) {
  return gatheringResidents.filter((p) => s.known.includes(p) && stages.indexOf(relationshipStage(s, p)) >= stages.indexOf("familiar"));
}
function neighborProgress(s) {
  const known = knownPeople(s), places = [...new Set(s.visited.filter((id) => publicPlaces.includes(id)))], familiar = familiarNeighbors(s), ready = familiar.filter((p) => completedNeighborTask(s, p));
  return { known, places, familiar, ready, meetGoal: 4, placeGoal: 3, firstReady: known.length >= 4 && places.length >= 3 && ready.length >= 2, invitationUnlocked: s.neighborChapterV1?.gatheredAt !== void 0, allKnown: s.neighborChapterV1?.allKnownAt !== void 0 || roster(s).every((p) => known.includes(p)), rosterCount: roster(s).length };
}
var ensure = (s) => s.neighborChapterV1 ??= { schema: 1, rules: "neighbor-chapter-v1", roster: "harbor22-v1", invited: [] };
function recordNeighborProgress(s) {
  if (neighborProgress(s).allKnown && s.neighborChapterV1?.allKnownAt === void 0) ensure(s).allKnownAt = townMinutes(s);
}
var daylight = (s) => {
  const m = townMinutes(s) % 1440;
  return m >= 360 && m < 1260;
};
var eligible = (s) => {
  const p = neighborProgress(s);
  return p.invitationUnlocked ? p.familiar : p.ready;
};
function neighborActionAvailable(s, id) {
  if (!id.startsWith("neighbor-")) return true;
  const memory2 = s.neighborChapterV1, progress = neighborProgress(s), here = ["coast", "chapel"].includes(s.scene), venue = here && (s.scene !== "coast" || weatherForSave(s) !== "light-rain");
  if (id === "neighbor-recall") return here && memory2?.gatheredAt !== void 0;
  if (id === "neighbor-finish") return neighborPartyActive(s) && !!memory2?.party && memory2.party.people.every((p) => memory2.party.chatted.includes(p));
  if (id === "neighbor-move-inside") return !!memory2?.party && memory2.party.scene === "coast" && s.scene === "chapel" && daylight(s);
  if (memory2?.party) return false;
  if (id.startsWith("neighbor-select:")) return here && (progress.invitationUnlocked || progress.firstReady) && eligible(s).includes(id.slice(16));
  if (id === "neighbor-start") return venue && daylight(s) && (progress.invitationUnlocked || progress.firstReady) && (!memory2?.invited.length || memory2.invited.every((p) => eligible(s).includes(p))) && (progress.invitationUnlocked ? (memory2?.invited.length ?? 0) >= 1 : memory2?.invited.length === 2 || !memory2?.invited.length && progress.ready.length >= 2);
  return false;
}
var names = (ids) => [ids.map((id) => people[id].name[0]).join("\u3001"), ids.map((id) => people[id].name[1]).join(" and ")];
function applyNeighborAction(s, id) {
  if (!neighborActionAvailable(s, id)) throw Error("NEIGHBOR_ACTION_UNAVAILABLE");
  const m = ensure(s), now2 = townMinutes(s);
  if (id.startsWith("neighbor-select:")) {
    const person = id.slice(16);
    if (m.invited.includes(person)) m.invited = m.invited.filter((p) => p !== person);
    else {
      if (m.invited.length === 2) throw Error("NEIGHBOR_INVITATION_FULL");
      m.invited.push(person);
    }
    return m.invited.length ? [`\u8FD9\u6B21\u60F3\u9080\u7EA6\uFF1A${names(m.invited)[0]}\u3002\u53EF\u4EE5\u518D\u9009\u4E00\u4F4D\uFF0C\u6216\u53D6\u6D88\u5DF2\u9009\u7684\u4EBA\u3002`, `This invitation: ${names(m.invited)[1]}. Choose another, or remove someone already selected.`] : ["\u8FD9\u6B21\u6682\u672A\u9009\u62E9\u90BB\u5C45\uFF0C\u5DF2\u6709\u7EA6\u5B9A\u548C\u56DE\u5FC6\u4ECD\u4FDD\u7559\u3002", "No neighbor is selected for this visit. Earlier invitations and memories remain."];
  }
  if (id === "neighbor-move-inside") {
    m.party.scene = "chapel";
    return ["\u5927\u5BB6\u6765\u5230\u6559\u5802\u5BA4\u5185\uFF0C\u63A5\u7740\u804A\u521A\u624D\u7684\u4E8B\u3002\u5DF2\u804A\u8FC7\u7684\u5185\u5BB9\u4FDD\u7559\uFF0C\u4E0D\u5FC5\u91CD\u65B0\u5F00\u59CB\u3002", "Everyone comes inside the chapel and continues the conversation. Earlier conversations stay remembered; this is the same gathering."];
  }
  if (id === "neighbor-start") {
    const first = m.gatheredAt === void 0, chosen = m.invited.length ? [...m.invited] : neighborProgress(s).ready.slice(0, 2);
    if (first && chosen.length !== 2) throw Error("NEIGHBOR_TWO_REQUIRED");
    m.party = { scene: s.scene, people: chosen, chatted: [], startedAt: now2, first };
    m.invited = [];
    return [`${names(chosen)[0]}\u6765\u5230${rooms[s.scene].title[0]}\uFF0C\u7ED9\u5F7C\u6B64\u7559\u51FA\u4F4D\u7F6E\u3002\u8D70\u8FD1\u4ED6\u4EEC\uFF0C\u5206\u522B\u804A\u4E00\u5C0F\u6BB5\uFF1B\u968F\u65F6\u53EF\u4EE5\u79BB\u5F00\uFF0C\u6539\u65E5\u7EE7\u7EED\u3002`, `${names(chosen)[1]} join you at ${rooms[s.scene].title[1]}. Approach each neighbor for a short conversation. You can leave and continue another day.`];
  }
  if (id === "neighbor-finish") {
    const p = m.party;
    m.lastParty = { scene: p.scene, people: [...p.people], endedAt: now2 };
    if (m.gatheredAt === void 0) m.gatheredAt = now2;
    delete m.party;
    return ["\u4F60\u4EEC\u8BB0\u4E0B\u4E86\u8FD9\u6B21\u76F8\u805A\uFF0C\u5404\u81EA\u56DE\u5230\u4E00\u5929\u7684\u751F\u6D3B\u3002\u4EE5\u540E\u5728\u6D77\u5CB8\u6216\u6559\u5802\u90FD\u53EF\u4EE5\u201C\u9080\u7EA6\u5C0F\u805A\u201D\uFF0C\u9009\u4E00\u4E24\u4F4D\u719F\u6089\u7684\u90BB\u5C45\uFF0C\u804A\u804A\u518D\u5206\u522B\uFF1B\u65E0\u9700\u793C\u7269\u6216\u989D\u5916\u82B1\u8D39\u3002", "You remember this time together and return to your day. Small invitations are now always available at the coast or chapel: choose one or two familiar neighbors, talk, then part. No gifts or payment are needed."];
  }
  const n = names(m.lastParty.people);
  return [`\u4F60\u8BB0\u5F97\u4E0A\u6B21\u548C${n[0]}\u5728${rooms[m.lastParty.scene].title[0]}\u76F8\u805A\u3002\u60F3\u518D\u89C1\u9762\uFF0C\u53EF\u4EE5\u9009\u62E9\u719F\u6089\u7684\u90BB\u5C45\u53E6\u7EA6\u4E00\u6B21\u3002`, `You remember meeting ${n[1]} at ${rooms[m.lastParty.scene].title[1]}. Select familiar neighbors for another visit whenever you like.`];
}
var neighborTopicIds = (person) => gatheringResidents.includes(person) ? ["neighbor-chat"] : [];
var remarks = { mara: ["\u201C\u6211\u4ECA\u5929\u770B\u89C1\u4E00\u4E2A\u65E7\u8336\u676F\u91CC\u5192\u51FA\u65B0\u53F6\u3002\u5750\u4E0B\u6765\u8BB2\u7ED9\u4F60\u542C\uFF0C\u624D\u60F3\u8D77\u6211\u4E5F\u53EF\u4EE5\u53EA\u6765\u505A\u5BA2\u3002\u201D", "\u201CI saw a new leaf in an old teacup today. Sitting down to tell you reminds me that I can simply be a guest too.\u201D"], avery: ["\u201C\u8FD9\u4E00\u9875\u8FD8\u6CA1\u753B\u5B8C\u3002\u4ECA\u5929\u6211\u60F3\u7559\u4E00\u70B9\u7A7A\u767D\u7ED9\u6211\u4EEC\u5750\u7740\u7684\u8FD9\u4E00\u4F1A\u513F\u3002\u201D", "\u201CThis page is unfinished. Today I want to leave a little space for this time sitting together.\u201D"], samira: ["\u201C\u6211\u5E26\u4E86\u4E24\u53E5\u6CA1\u540D\u5B57\u7684\u5C0F\u8C03\u3002\u5531\u5230\u54EA\u91CC\u90FD\u53EF\u4EE5\u505C\uFF0C\u4F60\u4E5F\u53EF\u4EE5\u8BB2\u8BB2\u4ECA\u5929\u542C\u5230\u7684\u58F0\u97F3\u3002\u201D", "\u201CI brought two lines of an unnamed tune. I can stop anywhere. Tell me about a sound you heard today, if you like.\u201D"] };
function neighborTopics(s, p) {
  const party = s.neighborChapterV1?.party;
  return neighborPartyActive(s) && party?.people.includes(p) && !party.chatted.includes(p) ? [{ id: "neighbor-chat", label: ["\u804A\u804A\u4ECA\u5929\uFF0C\u7559\u4E0B\u4E00\u6BB5\u5171\u540C\u8BB0\u5FC6", "Talk about today and share a moment"], reply: remarks[p], once: false }] : [];
}
function applyNeighborTopic(s, p, id) {
  if (id !== "neighbor-chat") return;
  if (!neighborTopics(s, p).length) throw Error("NEIGHBOR_TOPIC_UNAVAILABLE");
  s.neighborChapterV1.party.chatted.push(p);
}
function validNeighborChapter(s) {
  const m = s.neighborChapterV1;
  if (m === void 0) return true;
  const number = (n) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= townMinutes(s), keys4 = (v, allowed) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every((k) => allowed.includes(k)), ids = (v) => Array.isArray(v) && v.length <= 2 && new Set(v).size === v.length && v.every((id) => gatheringResidents.includes(id) && s.known.includes(id));
  if (!keys4(m, ["schema", "rules", "roster", "invited", "party", "lastParty", "gatheredAt", "allKnownAt"]) || m.schema !== 1 || m.rules !== "neighbor-chapter-v1" || !["harbor22-v1", "harbor23-priest-v2"].includes(m.roster) || !ids(m.invited) || m.gatheredAt !== void 0 && !number(m.gatheredAt) || m.allKnownAt !== void 0 && !number(m.allKnownAt)) return false;
  if (m.party !== void 0 && (!keys4(m.party, ["scene", "people", "chatted", "startedAt", "first"]) || !["coast", "chapel"].includes(m.party.scene) || !ids(m.party.people) || m.party.people.length < (m.party.first ? 2 : 1) || !Array.isArray(m.party.chatted) || new Set(m.party.chatted).size !== m.party.chatted.length || m.party.chatted.some((id) => !m.party.people.includes(id)) || !number(m.party.startedAt) || typeof m.party.first !== "boolean" || m.party.first !== (m.gatheredAt === void 0) || m.invited.length)) return false;
  if (m.lastParty !== void 0 && (!keys4(m.lastParty, ["scene", "people", "endedAt"]) || !["coast", "chapel"].includes(m.lastParty.scene) || !ids(m.lastParty.people) || !m.lastParty.people.length || !number(m.lastParty.endedAt) || m.gatheredAt === void 0 || m.gatheredAt > m.lastParty.endedAt)) return false;
  return m.gatheredAt === void 0 ? m.lastParty === void 0 : !!m.lastParty;
}

// src/story/chapel.ts
var chapelTopicIds = ["chapel-welcome", "chapel-memory"];
var selected = (s) => s.flags.includes("chapel:participation:reading") ? "reading" : s.flags.includes("chapel:participation:listening") ? "listening" : void 0;
function validChapelState(s) {
  const f2 = s.flags;
  if (!Array.isArray(f2)) return false;
  const chapel = f2.filter((x) => x.startsWith("chapel:"));
  const allowed = ["chapel:visited", "chapel:notice-read", "chapel:participation:reading", "chapel:participation:listening", "chapel:completed", "chapel:meeting-clue"];
  if (chapel.some((x) => !allowed.includes(x)) || new Set(chapel).size !== chapel.length) return false;
  const choices = Number(f2.includes(allowed[2])) + Number(f2.includes(allowed[3]));
  return choices <= 1 && (!f2.includes("chapel:notice-read") || f2.includes("chapel:visited")) && (choices === 1 ? f2.includes("chapel:notice-read") && f2.includes("chapel:completed") && f2.includes("chapel:meeting-clue") : !f2.includes("chapel:completed") && !f2.includes("chapel:meeting-clue"));
}
var period = (s) => {
  const m = (s.townMinutes ?? 540) % 1440;
  return m >= 720 && m < 1020;
};
function chapelRead(s) {
  const joined = selected(s), time = ["\u6BCF\u5929\u5348\u540E12:00\u81F317:00\uFF0C\u56FE\u4E66\u9986\u5C45\u6C11\u6765\u6574\u7406\u9605\u8BFB\u89D2\uFF0C\u8F7B\u58F0\u54FC\u6B4C\u7684\u5C45\u6C11\u6765\u8BD5\u7740\u8854\u63A5\u53E5\u5B50\u3002\u5176\u4ED6\u65F6\u95F4\u53EF\u5B89\u9759\u770B\u4E66\uFF1B\u9519\u8FC7\u4E86\uFF0C\u53EF\u4EE5\u53E6\u4E00\u4E2A\u5348\u540E\u6765\u3002", "Every afternoon, 12:00\u201317:00, the library resident tends the reading corner and the resident who hums works on a few lines. At other times, you can read quietly. Another afternoon is fine if you miss this one."];
  const recall2 = joined === "reading" ? ["\u4F60\u4E0A\u6B21\u628A\u9605\u8BFB\u89D2\u7406\u597D\u4E86\u3002\u684C\u8FB9\u591A\u7559\u51FA\u4E00\u628A\u6905\u5B50\uFF0C\u7ED9\u4E0B\u4E00\u4E2A\u90BB\u5C45\u3002", "You arranged the reading corner. An extra chair waits by the table for the next neighbor."] : joined === "listening" ? ["\u4F60\u4E0A\u6B21\u7559\u4E0B\u542C\u4E86\u90A3\u51E0\u53E5\u3002\u9760\u8FC7\u9053\u7684\u6905\u5B50\u4ECD\u7559\u7740\uFF0C\u613F\u610F\u7684\u8BDD\u8FD8\u53EF\u4EE5\u6765\u5750\u3002", "You stayed to hear those few lines. The aisle-side chair is still there whenever you want to sit."] : ["\u9605\u8BFB\u89D2\u5F00\u653E\u3002\u5148\u8BFB\u8FD9\u5F20\u4FBF\u6761\uFF0C\u518D\u5230\u4E66\u684C\u65C1\u5E2E\u5FD9\uFF0C\u6216\u5348\u540E\u5728\u5EA7\u5E2D\u65C1\u542C\u4E00\u4F1A\u513F\u3002\u4E24\u79CD\u53C2\u4E0E\u4EFB\u9009\u4E00\u79CD\uFF1B\u4E0D\u82B1\u94B1\uFF0C\u4E0D\u8017\u7269\u54C1\u3002\u73B0\u5728\u79BB\u5F00\u4E5F\u6CA1\u5173\u7CFB\u3002", "The reading corner is open. Read this note, then help by the book table or listen beside the seats in the afternoon. Choose one kind of participation; neither costs money or items. You can also leave for now."];
  return [recall2[0] + " " + time[0], recall2[1] + " " + time[1]];
}
function applyChapelAction(s, id) {
  if (s.scene !== "chapel") throw Error("CHAPEL_WRONG_PLACE");
  const add = (f2) => {
    if (!s.flags.includes(f2)) s.flags.push(f2);
  };
  if (id === "chapel-read-notice") {
    add("chapel:visited");
    add("chapel:notice-read");
    return chapelRead(s);
  }
  if (id === "chapel-recall") {
    if (!selected(s)) throw Error("CHAPEL_NOT_JOINED");
    return chapelRead(s);
  }
  if (!s.flags.includes("chapel:notice-read")) throw Error("CHAPEL_READ_NOTE_FIRST");
  if (selected(s)) throw Error("CHAPEL_ALREADY_JOINED");
  if (id !== "chapel-help-reading" && id !== "chapel-listen") throw Error("CHAPEL_UNKNOWN_ACTION");
  if (id === "chapel-listen" && (!period(s) || !s.known.includes("samira"))) throw Error(!period(s) ? "CHAPEL_REHEARSAL_AWAY" : "INTRODUCE_FIRST");
  add("chapel:participation:" + (id === "chapel-help-reading" ? "reading" : "listening"));
  add("chapel:completed");
  add("chapel:meeting-clue");
  return id === "chapel-help-reading" ? ["\u4E66\u7559\u5728\u684C\u4E0A\uFF0C\u4F60\u7ED9\u4E0B\u4E00\u4F4D\u90BB\u5C45\u653E\u597D\u4E00\u628A\u6905\u5B50\uFF0C\u4E2D\u592E\u8FC7\u9053\u4ECD\u7136\u7545\u901A\u3002\u95E8\u8FB9\u7684\u4FBF\u6761\u8BB0\u7740\u5348\u540E\u4F1A\u5408\u5730\u70B9\u3002\u4E0B\u6B21\u56DE\u6765\uFF0C\u53EF\u4EE5\u770B\u770B\u8C01\u6B63\u5728\u8FD9\u91CC\u3002", "You leave the books on the table and set out a chair for the next neighbor, keeping the central aisle clear. The note gives the afternoon meeting place. Come back to see who is here."] : ["\u8428\u7C73\u62C9\u8F7B\u58F0\u63A5\u8D77\u4E24\u53E5\uFF0C\u53C8\u505C\u4E0B\u6765\u7422\u78E8\u4E0B\u4E00\u6BB5\u3002\u4F60\u5B89\u9759\u5730\u542C\uFF0C\u6CA1\u6709\u628A\u8FD9\u53D8\u6210\u4E00\u573A\u6F14\u51FA\u3002\u4E0B\u4E00\u4E2A\u5348\u540E\uFF0C\u5EA7\u5E2D\u65C1\u8FD8\u662F\u4F60\u4EEC\u4F1A\u5408\u7684\u5730\u65B9\u3002", "Samira softly joins two lines, then stops to think about the next. You listen without turning it into a performance. The seats are your meeting place another afternoon."];
}
function chapelTopics(s, person) {
  if (s.scene !== "chapel" || !period(s) || !s.known.includes(person) || !["dani", "samira"].includes(person)) return [];
  return [{ id: "chapel-welcome", once: true, label: ["\u8FD9\u91CC\u4ECA\u5929\u6709\u4EC0\u4E48\u6D3B\u52A8\uFF1F", "What happens here today?"], reply: person === "dani" ? ["\u201C\u6211\u662F\u6765\u6574\u7406\u9605\u8BFB\u89D2\u7684\u3002\u4E66\u7559\u5728\u684C\u4E0A\uFF0C\u6905\u5B50\u653E\u8FC7\u9053\u4E24\u4FA7\u3002\u95E8\u8FB9\u4FBF\u6761\u5199\u7740\u4ECA\u5929\u7684\u5B89\u6392\uFF1B\u4F60\u4E0D\u5FC5\u7559\u4E0B\u5E2E\u5FD9\uFF0C\u5750\u5750\u4E5F\u597D\u3002\u201D", "\u201CI\u2019m here to tend the reading corner. Books on the table, chairs beside the aisle. The note by the door has the arrangements. You needn\u2019t help; a quiet sit is welcome too.\u201D"] : ["\u201C\u8FD8\u662F\u90A3\u51E0\u53E5\u6CA1\u540D\u5B57\u7684\u5C0F\u8C03\u3002\u6211\u6765\u8BD5\u8BD5\u600E\u4E48\u63A5\u4E0B\u4E00\u6BB5\uFF0C\u4E0D\u60F3\u529E\u6210\u6F14\u51FA\u3002\u95E8\u8FB9\u6709\u4FBF\u6761\uFF0C\u613F\u610F\u7684\u8BDD\u53EF\u4EE5\u5750\u4E0B\u542C\u4E00\u4F1A\u513F\u3002\u201D", "\u201CStill those few lines without a name. I came to try the next part, not to put on a show. There\u2019s a note by the door. You can sit and listen if you like.\u201D"] }, ...selected(s) ? [{ id: "chapel-memory", label: ["\u8FD8\u8BB0\u5F97\u6211\u4E0A\u6B21\u6765\u5417\uFF1F", "Remember my last visit?"], reply: chapelRead(s) }] : []];
}

// server/candidate-clock.ts
import { randomUUID } from "node:crypto";
var fail4 = (ok3, code) => {
  if (!ok3) {
    if (code === "CLOCK_CHANGE_BUSY" || code === "INVALID_CLOCK_RATE") throw Error(code);
    throw new MotionRejection(code);
  }
};
var validTransport = (c) => {
  if (!c?.transport) return true;
  const t3 = c.transport, a = t3.last?.ack;
  return t3.version === 1 && typeof t3.last?.digest === "string" && /^[a-f0-9]{64}$/.test(t3.last.digest) && a?.schema === 1 && a.mapVersion === 1 && Number.isSafeInteger(a.ordinal) && a.ordinal > 0 && Number.isSafeInteger(a.version) && a.version === a.baseVersion + 1 && Number.isSafeInteger(a.cursor) && typeof a.actionId === "string" && typeof a.token === "string" && a.token.length === 36 && !!a.fields?.clock && !("transport" in a.fields.clock);
};
var validClock = (s) => !s.movingClock || s.movingClock.version === 2 && validTransport(s.movingClock) && (s.movingClock.fractionalMs === void 0 || Number.isFinite(s.movingClock.fractionalMs) && s.movingClock.fractionalMs >= 0 && s.movingClock.fractionalMs < 1) && [2e3, 4e3].includes(s.movingClock.millisecondsPerMinute) && Number.isSafeInteger(s.movingClock.remainderMs) && s.movingClock.remainderMs >= 0 && s.movingClock.remainderMs < s.movingClock.millisecondsPerMinute && (s.movingClock.speedSlackUnits === void 0 || Number.isFinite(s.movingClock.speedSlackUnits) && s.movingClock.speedSlackUnits >= 0 && s.movingClock.speedSlackUnits <= 4) && (!s.movingClock.lease || typeof s.movingClock.lease.id === "string" && typeof s.movingClock.lease.boot === "string" && Number.isSafeInteger(s.movingClock.lease.sequence) && s.movingClock.lease.sequence >= 0 && Number.isSafeInteger(s.movingClock.lease.lastAt) && s.movingClock.lease.lastAt >= 0);
function createMovingClock({ now: now2 = Date.now, boot = randomUUID(), worldForSave = (s) => worldWithFlags(s.flags) } = {}) {
  return (before, a) => {
    fail4(a.scene === before.scene && a.expected_version === before.version, "VERSION_CONFLICT");
    const s = structuredClone(before), payload = a.payload ?? {}, w = worldForSave(s);
    if (a.action === "candidate-clock-enable") {
      fail4(!s.activeChallenge && !battleLocksWorld(s), "CLOCK_CHANGE_BUSY");
      fail4([2e3, 4e3].includes(payload.millisecondsPerMinute), "INVALID_CLOCK_RATE");
      fail4(Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y) < 0.01, "UNVERIFIED_POSITION");
      const progress = ((s.movingClock?.remainderMs ?? 0) + (s.movingClock?.fractionalMs ?? 0)) * payload.millisecondsPerMinute / (s.movingClock?.millisecondsPerMinute ?? payload.millisecondsPerMinute);
      s.movingClock = { version: 2, millisecondsPerMinute: payload.millisecondsPerMinute, remainderMs: Math.floor(progress), fractionalMs: progress - Math.floor(progress), speedSlackUnits: s.movingClock?.speedSlackUnits ?? 4, ...s.movingClock?.transport ? { transport: s.movingClock.transport } : {} };
    } else {
      fail4(s.movingClock, "CLOCK_NOT_ENABLED");
      fail4(!s.activeChallenge && !battleLocksWorld(s), "CHALLENGE_ACTIVE");
      if (a.action === "candidate-motion-open") {
        fail4(Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y) < 0.01, "UNVERIFIED_POSITION");
        s.movingClock.lease = { id: randomUUID(), boot, sequence: 0, lastAt: now2() };
      } else {
        fail4(a.action === "candidate-motion-step", "INVALID_MOTION_ACTION");
        const lease = s.movingClock.lease, at = now2();
        fail4(lease && lease.boot === boot && lease.id === payload.lease, "MOTION_EXPIRED");
        fail4(payload.sequence === lease.sequence + 1, "MOTION_SEQUENCE");
        const elapsed = at - lease.lastAt;
        fail4(Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 3e3, "MOTION_EXPIRED");
        fail4(Array.isArray(payload.points) && payload.points.length <= 32, "INVALID_MOTION_PATH");
        const allowance = 112 * Math.min(elapsed, 1250) / 1e3 + (s.movingClock.speedSlackUnits ?? 4);
        let totalDistance = 0, from = isCluster(s.scene) ? globalPoint(s.scene, s.position) : s.position;
        for (const point3 of payload.points) {
          fail4(point3 && Number.isFinite(point3.x) && Number.isFinite(point3.y), "INVALID_MOTION_PATH");
          totalDistance += Math.hypot(point3.x - from.x, point3.y - from.y);
          from = point3;
        }
        if (totalDistance > allowance + 1e-7) {
          const needed = (totalDistance - (s.movingClock.speedSlackUnits ?? 4)) / 112 * 1e3;
          throw new MotionRejection("MOTION_TOO_FAST", needed <= 1250 ? Math.ceil(needed - elapsed) + 1 : void 0);
        }
        let previous = isCluster(s.scene) ? globalPoint(s.scene, s.position) : s.position, distance2 = 0, zone = s.scene;
        for (const point3 of payload.points) {
          fail4(point3 && Number.isFinite(point3.x) && Number.isFinite(point3.y), "INVALID_MOTION_PATH");
          const d = Math.hypot(point3.x - previous.x, point3.y - previous.y), n = Math.max(1, Math.ceil(d));
          fail4(distance2 + d <= allowance + 1e-7, "MOTION_TOO_FAST");
          let swept = previous;
          for (let i = 1; i <= n; i++) {
            const q = { x: previous.x + (point3.x - previous.x) * i / n, y: previous.y + (point3.y - previous.y) * i / n };
            fail4(isCluster(s.scene) ? clusterWalkable(w, q, zone, swept) : walkable(w, s.scene, q), "INVALID_MOTION_PATH");
            const next = isCluster(s.scene) ? pointZone(q, zone, swept) : zone;
            fail4(next === zone || s.flags.includes("unpacked"), "SETTLE_FIRST");
            zone = next;
            swept = q;
            if (!s.visited.includes(zone)) s.visited.push(zone);
          }
          distance2 += d;
          previous = point3;
        }
        fail4(distance2 <= allowance + 1e-7, "MOTION_TOO_FAST");
        s.movingClock.speedSlackUnits = Math.max(0, Math.min(4, allowance - distance2));
        fail4(zone === s.scene || sameCluster(zone, s.scene) && s.flags.includes("unpacked"), "SETTLE_FIRST");
        s.scene = zone;
        s.position = isCluster(zone) ? localPoint(zone, previous) : { ...previous };
        fail4(Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y) < 0.01, "MOTION_ENDPOINT");
        if (!s.visited.includes(zone)) s.visited.push(zone);
        const movedMs = Math.min(distance2 / 112 * 1e3, elapsed, 1250), total2 = s.movingClock.remainderMs + (s.movingClock.fractionalMs ?? 0) + movedMs, whole = Math.floor(total2 + 1e-7);
        const minutes = Math.floor(whole / s.movingClock.millisecondsPerMinute);
        s.movingClock.remainderMs = whole % s.movingClock.millisecondsPerMinute;
        s.movingClock.fractionalMs = Math.max(0, total2 - whole);
        if (!s.activePlayClock) {
          advanceTown(s, minutes);
          advanceAwake(s, minutes);
        } else {
          s.movingClock.remainderMs = 0;
          s.movingClock.fractionalMs = 0;
        }
        lease.sequence = payload.sequence;
        lease.lastAt = at;
      }
    }
    fail4(validClock(s) && townMinutes(s) >= townMinutes(before), "INVALID_CLOCK");
    s.version++;
    s.cursor++;
    return { head: s, text: ["\u79FB\u52A8\u8FDB\u5EA6\u5DF2\u4FDD\u5B58\u3002", "Walking progress saved."], kind: "action", accepted: true, actionId: a.action };
  };
}
function withMovingClock(base2, motion = createMovingClock()) {
  return {
    ...base2,
    spatialContext(s) {
      if (s.movingClock) throw Error("MOTION_CHECKPOINT_REQUIRED");
      return s;
    },
    async prepare(s, a, ...context) {
      if (a.action.startsWith("candidate-")) {
        if (a.action !== "candidate-clock-enable" && s.movingClock?.transport) throw Error("MOTION_CHANNEL_REQUIRED");
        const result = motion(s, a);
        base2.assertReadable(result.head);
        return result;
      }
      if (s.movingClock && Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y) > 4) throw Error("UNVERIFIED_POSITION");
      return base2.prepare(s, a, ...context);
    }
  };
}

// src/animals/memory.ts
function validAnimalSave(value, defs, minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) return false;
  if (value === void 0) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value;
  if (s.schema !== 1 || !s.individuals || typeof s.individuals !== "object" || Array.isArray(s.individuals)) return false;
  const ids = new Set(defs.filter((d) => d.species === "cat").map((d) => d.id));
  return Object.keys(s).every((k) => ["schema", "individuals"].includes(k)) && Object.entries(s.individuals).every(([id, m]) => ids.has(id) && !!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).every((k) => ["familiarity", "lastPetMinute"].includes(k)) && Number.isSafeInteger(m.familiarity) && m.familiarity >= 0 && m.familiarity <= 3 && (m.lastPetMinute === void 0 || Number.isSafeInteger(m.lastPetMinute) && m.lastPetMinute >= 0 && m.lastPetMinute <= minutes));
}
function animalSave(value, defs, minutes) {
  if (!validAnimalSave(value, defs, minutes)) throw Error("UNSUPPORTED_ANIMAL_SAVE");
  return value === void 0 ? { schema: 1, individuals: {} } : structuredClone(value);
}
function applyAnimalInteraction(previous, defs, ctx, a) {
  const memory2 = animalSave(previous, defs, ctx.townMinutes), def = defs.find((d) => d.id === a.target), slot2 = def && contextSlot(def, ctx);
  if (!def || def.species !== "cat" || !slot2 || slot2.scene !== ctx.scene) throw Error("ANIMAL_AWAY");
  if (slot2.activity === "sleep") throw Error("ANIMAL_RESTING");
  if (!["call", "pet"].includes(a.verb)) throw Error("ANIMAL_ACTION_UNAVAILABLE");
  if (!pointClear(a.foot, slot2, profiles[def.species], ctx, [], true)) throw Error("INVALID_ANIMAL_POSITION");
  if (Math.hypot(ctx.player.x + ctx.player.w / 2 - a.foot.x, ctx.player.y + ctx.player.h / 2 - a.foot.y) > 64) throw Error("TOO_FAR");
  const m = memory2.individuals[a.target] ?? { familiarity: 0 };
  let gained = false;
  if (a.verb === "pet" && (m.lastPetMinute === void 0 || Math.floor(m.lastPetMinute / 1440) < Math.floor(ctx.townMinutes / 1440))) {
    gained = m.familiarity < 3;
    m.familiarity = Math.min(3, m.familiarity + 1);
    m.lastPetMinute = ctx.townMinutes;
  }
  memory2.individuals[a.target] = m;
  return { memory: memory2, gained, text: a.verb === "call" ? ["\u732B\u8F6C\u8FC7\u5934\uFF0C\u9759\u9759\u770B\u7740\u4F60\u3002", "The cat turns and watches you."] : gained ? ["\u5B83\u9760\u8FD1\u4F60\u7684\u624B\uFF0C\u6162\u6162\u653E\u677E\u4E0B\u6765\u3002", "It leans toward your hand and relaxes."] : ["\u5B83\u5B89\u9759\u5730\u5F85\u4E86\u4E00\u4F1A\u513F\u3002", "It stays quietly for a moment."] };
}

// server/dynamic-assets/policy.mjs
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
var requestContext = new AsyncLocalStorage2();

// src/story/resident-life.ts
var seen4 = (s, p, id) => s.flags.includes(`talk:${p}:${id}`);
var topic2 = (id, label, reply) => ({ id, label, reply, once: true });
var interests = {
  avery: topic2("sketch", ["\u4F60\u559C\u6B22\u753B\u4EC0\u4E48\uFF1F", "What do you like drawing?"], ["\u201C\u5C0F\u8239\u3002\u5B83\u4EEC\u4E00\u76F4\u52A8\uFF0C\u6211\u5C31\u6709\u7406\u7531\u4E0D\u628A\u7EBF\u753B\u5F97\u592A\u6574\u9F50\u3002\u508D\u665A\u6211\u5E38\u53BB\u9493\u9C7C\u7801\u5934\uFF0C\u4ECA\u5929\u4E5F\u4F1A\u53BB\u3002\u4E0D\u7528\u6025\u7740\u753B\u5B8C\u3002\u201D", "\u201CLittle boats. They keep moving, which excuses my wobbly lines. I often go to the fishing pier in the evening. Today too. No need to finish.\u201D"]),
  samira: topic2("humming", ["\u521A\u624D\u54FC\u7684\u662F\u4EC0\u4E48\uFF1F", "What were you humming?"], ["\u201C\u81EA\u5DF1\u62FC\u7684\u4E00\u5C0F\u6BB5\uFF0C\u8FD8\u6CA1\u6709\u540D\u5B57\u3002\u508D\u665A\u6211\u53BB\u9493\u9C7C\u7801\u5934\u542C\u6C34\u58F0\u3002\u6709\u4EBA\u613F\u610F\u5B89\u9759\u542C\u5C31\u597D\u4E86\uFF0C\u4F46\u6211\u4E0D\u60F3\u529E\u6210\u6F14\u51FA\u3002\u201D", "\u201CA little tune I made up. No name yet. I go to the fishing pier in the evening to hear the water. A quiet listener would be nice. Not a performance.\u201D"]),
  owen: topic2("birds", ["\u4F60\u5728\u542C\u54EA\u4E00\u79CD\u58F0\u97F3\uFF1F", "Which sound are you listening for?"], ["\u201C\u77ED\u7684\u90A3\u4E00\u58F0\u3002\u5148\u522B\u731C\uFF0C\u548C\u6211\u542C\u4E00\u4F1A\u513F\u3002\u201D\u4F60\u4EEC\u7B49\u7740\u9E1F\u58F0\u518D\u6B21\u51FA\u73B0\u3002\u6B27\u6587\u7B11\u4E86\uFF1A\u201C\u542C\u89C1\u4E24\u6B21\uFF0C\u5C31\u4E0D\u5BB9\u6613\u5FD8\u4E86\u3002\u201D", "\u201CThe short call. Don\u2019t guess yet. Listen with me.\u201D You wait for it to return. Owen smiles. \u201CHear it twice and it tends to stay.\u201D"]),
  dani: topic2("leaves", ["\u8FD9\u7247\u53F6\u5B50\u503C\u5F97\u8BB0\u4E0B\u6765\u5417\uFF1F", "Is this leaf worth a page?"], ["\u201C\u503C\u5F97\u3002\u5B83\u6389\u5728\u6211\u521A\u542C\u5B8C\u4E00\u4E2A\u6545\u4E8B\u7684\u5730\u65B9\u3002\u522B\u4EBA\u7684\u79D8\u5BC6\u4E0D\u5199\uFF0C\u53EA\u5199\u90A3\u4E2A\u4EBA\u559C\u6B22\u4EC0\u4E48\u3002\u201D\u4E39\u59AE\u5728\u7A7A\u767D\u9875\u4E0A\u7559\u4E86\u4E00\u5C0F\u5757\u4F4D\u7F6E\u3002", "\u201CYes. It fell where I\u2019d just heard a story. No one\u2019s secrets go in the book. Just something they love.\u201D Dani leaves a little space on the page."])
};
var lifeTopicIds = (p) => residentPeople[p] ? ["routine", "sketch", "humming", "birds", "leaves", "company", "invite", "listen", "after-song", "remember", "boundaries"] : oldLife[p] ? ["life", "routine"] : [];
function lifeTopics(s, p) {
  if (!s.known.includes(p)) return [];
  if (!residentPeople[p]) return oldLife[p] ? [...!seen4(s, p, "life") ? [topic2("life", oldLife[p].label, oldLife[p].reply)] : [], ...!seen4(s, p, "routine") ? [topic2("routine", ["\u5E73\u65F6\u5728\u54EA\u513F\u80FD\u627E\u5230\u4F60\uFF1F", "Where can I usually find you?"], p === "mara" && !s.flags.includes("bag-returned") ? ["\u201C\u5DE5\u5177\u888B\u62FF\u56DE\u6765\u4E4B\u524D\uFF0C\u6211\u4F1A\u7559\u5728\u8F66\u7AD9\u8857\u7B49\u4F60\u3002\u5E73\u65F6\u4E0A\u5348\u5728\u8F66\u7AD9\u8857\uFF0C\u5348\u540E\u53BB\u4F4F\u6237\u5EAD\u9662\uFF0C\u508D\u665A\u901B\u65E7\u8857\u3002\u201D", "\u201CUntil my tool bag is back, I will wait on Station Street. Usually I spend mornings here, afternoons in the courtyard, and evenings on Market Lane.\u201D"] : routineReply(p))] : []] : [];
  if (!residentHere(s, p, s.scene)) return [];
  let options = [interests[p]];
  if (seen4(s, p, interests[p].id)) options.push(topic2("routine", ["\u5E73\u65F6\u5728\u54EA\u4E9B\u5730\u65B9\u80FD\u9047\u5230\u4F60\uFF1F", "Where do you usually spend your day?"], routineReply(p)));
  if (p === "avery" && seen4(s, p, "sketch")) options.push(topic2("company", ["\u753B\u753B\u65F6\u559C\u6B22\u6709\u4EBA\u966A\u5417\uFF1F", "Do you like company while drawing?"], ["\u201C\u559C\u6B22\u3002\u53EA\u8981\u4E0D\u7528\u4E00\u76F4\u8BF4\u8BDD\u3002\u5982\u679C\u6709\u4EBA\u54FC\u4E24\u53E5\uFF0C\u4E5F\u633A\u597D\u3002\u6211\u4EEC\u4E0D\u5FC5\u628A\u6BCF\u6B21\u5750\u4E0B\u90FD\u53D8\u6210\u4E00\u4EF6\u5927\u4E8B\u3002\u201D", "\u201CYes. As long as we needn\u2019t talk the whole time. A little humming would be nice too. Sitting down needn\u2019t become a big occasion.\u201D"]));
  if (p === "samira" && seen4(s, p, "humming") && seen4(s, "avery", "company") && s.known.includes("avery") && !s.flags.includes("residents:invited")) options.push(topic2("invite", ["Avery\u4E5F\u559C\u6B22\u5B89\u9759\u966A\u4F34\uFF0C\u508D\u665A\u4E00\u8D77\u5750\u5750\uFF1F", "Avery likes quiet company too. Sit together this evening?"], ["\u201C\u597D\u3002\u5728\u9493\u9C7C\u7801\u5934\u78B0\u89C1\u5C31\u4E00\u8D77\u5750\uFF0C\u4E0D\u7528\u8D76\u65F6\u95F4\u3002\u5341\u4E03\u70B9\u5230\u4E8C\u5341\u4E00\u70B9\uFF0C\u6211\u901A\u5E38\u90FD\u5728\u3002\u4ECA\u5929\u6CA1\u9047\u5230\uFF0C\u53E6\u4E00\u4E2A\u508D\u665A\u4E5F\u884C\u3002\u201D\u65F6\u95F4\u8FD8\u65E9\u7684\u8BDD\uFF0C\u4F60\u53EF\u4EE5\u5148\u56DE\u79DF\u5C4B\u5C0F\u7761\u4E09\u5C0F\u65F6\uFF0C\u6216\u8005\u505A\u70B9\u522B\u7684\u4E8B\u3002", "\u201CYes. If we meet at the fishing pier, let\u2019s sit together. No rush. I am usually there from 17:00 to 21:00. Another evening is fine if not today.\u201D If it is early, you could take a three-hour nap in your room or do something else first."]));
  if (p === "samira" && s.flags.includes("residents:invited") && !s.flags.includes("residents:song-shared") && s.scene === "dock" && townPeriod(s) === "evening") options.push(topic2("listen", ["\u7559\u4E0B\u6765\uFF0C\u5B89\u9759\u542C\u5B8C\u8FD9\u4E00\u5C0F\u6BB5", "Stay and listen to the little tune"], ["\u4F60\u5728\u7801\u5934\u505C\u4E0B\u3002\u8428\u7C73\u62C9\u6CA1\u6709\u62A5\u66F2\u540D\uFF0C\u827E\u5F17\u91CC\u4E5F\u6CA1\u6709\u6025\u7740\u753B\u5B8C\u3002\u6700\u540E\u4E00\u4E2A\u97F3\u843D\u4E0B\uFF0C\u4F60\u4EEC\u53C8\u542C\u4E86\u4E00\u4F1A\u513F\u6C34\u58F0\u3002\u201C\u8FD9\u6837\u5C31\u5F88\u597D\u3002\u201D\u8428\u7C73\u62C9\u8BF4\u3002", "You pause on the pier. Samira gives no title; Avery leaves the drawing unfinished. After the last note you listen to the water a little longer. \u201CThat was enough,\u201D Samira says."]));
  if (s.flags.includes("residents:song-shared") && ["avery", "samira"].includes(p)) options.push(topic2("after-song", ["\u8FD8\u8BB0\u5F97\u6211\u4EEC\u5728\u7801\u5934\u5750\u7684\u90A3\u4E00\u4F1A\u513F\u5417\uFF1F", "Remember that quiet moment on the pier?"], p === "avery" ? ["\u201C\u8BB0\u5F97\u3002\u6211\u628A\u90A3\u9875\u7A7A\u7740\u7684\u5730\u65B9\u7559\u4E0B\u4E86\u3002\u770B\u89C1\u5B83\u5C31\u4F1A\u60F3\u8D77\u6211\u4EEC\u542C\u6C34\u58F0\u7684\u65F6\u5019\u3002\u201D", "\u201CYes. I left that space on the page. It reminds me of listening to the water together.\u201D"] : ["\u201C\u8BB0\u5F97\u3002\u4E0B\u6B21\u89C1\u5230\u4F60\uFF0C\u6211\u5927\u6982\u4E0D\u7528\u5148\u628A\u58F0\u97F3\u54BD\u56DE\u53BB\u4E86\u3002\u4E0D\u662F\u6BCF\u6B21\u90FD\u8981\u5531\uFF0C\u77E5\u9053\u6709\u4EBA\u542C\u8FC7\u5C31\u5F88\u597D\u3002\u201D", "\u201CYes. Next time I see you, perhaps I won\u2019t swallow the tune. I needn\u2019t sing every time. It helps to know someone listened.\u201D"]));
  if (p === "owen" && seen4(s, p, "birds")) options.push(topic2("remember", ["\u6211\u8FD8\u8BB0\u5F97\u521A\u624D\u90A3\u4E00\u58F0", "I remember that call"], ["\u201C\u90A3\u4E0B\u6B21\u4F60\u5148\u542C\u3002\u6211\u53EF\u80FD\u4F1A\u8BA4\u9519\uFF0C\u9000\u4F11\u4E5F\u6CA1\u8BA9\u6211\u5FFD\u7136\u53D8\u6210\u4E13\u5BB6\u3002\u201D\u4ED6\u7ED9\u4F60\u7559\u51FA\u680F\u6746\u65C1\u7684\u4F4D\u7F6E\u3002", "\u201CYou listen first next time. I may get it wrong. Retirement didn\u2019t turn me into an expert.\u201D He leaves you space at the rail."]));
  if (p === "dani" && seen4(s, p, "leaves")) options.push(topic2("boundaries", ["\u4E5F\u53EF\u4EE5\u53EA\u628A\u6545\u4E8B\u7559\u7ED9\u81EA\u5DF1", "Some stories can stay just with you"], ["\u201C\u662F\u554A\u3002\u8C22\u8C22\u4F60\u8FD9\u6837\u8BF4\u3002\u6709\u4E9B\u9875\u4E0D\u516C\u5F00\uFF0C\u624D\u4F1A\u6709\u4EBA\u613F\u610F\u628A\u771F\u8BDD\u5199\u4E0A\u53BB\u3002\u201D", "\u201CYes. Thank you for saying so. Some pages stay private. That\u2019s what lets people be honest.\u201D"]));
  return options.filter((t3) => !seen4(s, p, t3.id));
}
function applyLifeTopic(s, p, id) {
  if (!residentPeople[p]) return;
  if (id === "invite" && !s.flags.includes("residents:invited")) s.flags.push("residents:invited");
  if (id === "listen" && !s.flags.includes("residents:song-shared")) {
    s.flags.push("residents:song-shared");
    for (const who of ["avery", "samira"]) s.relations[who] = Math.min(100, (s.relations[who] ?? 0) + 1);
  }
  if (id === interests[p].id) s.relations[p] = Math.min(100, (s.relations[p] ?? 0) + 1);
}

// src/engine/spatial-binding.ts
var SpatialBindingError = class extends Error {
  constructor(code, detail) {
    super(code + ": " + detail);
    this.code = code;
    this.detail = detail;
  }
  code;
  detail;
};
var fail5 = (code, detail) => {
  throw new SpatialBindingError(code, detail);
};
function unique(items2, kind) {
  const result = /* @__PURE__ */ new Map();
  for (const item of items2) {
    if (!item.id || result.has(item.id)) fail5("DUPLICATE_SPATIAL_ID", kind + "/" + item.id);
    result.set(item.id, item);
  }
  return result;
}
function compileSpatialBinding(story, input, isWalkable) {
  const world3 = structuredClone(input), scenes = unique(world3.scenes, "scene"), entities = unique(world3.entities, "entity"), characters2 = unique(world3.characters, "character"), rules2 = unique(story.domainRules?.rules ?? [], "rule");
  if (world3.version !== 1 || !world3.mapVersion || world3.cartridgeId !== story.id) fail5("SPATIAL_CARTRIDGE_MISMATCH", story.id);
  if (world3.actionScope !== void 0 && world3.actionScope !== "scene") fail5("INVALID_ACTION_SCOPE", story.id);
  if (!Number.isFinite(world3.interactionDistance) || world3.interactionDistance <= 0) fail5("INVALID_INTERACTION_DISTANCE", "distance");
  const checkPoint = (scene, p) => scenes.has(scene) && Number.isFinite(p.x) && Number.isFinite(p.y) && isWalkable(scene, { ...p });
  const storyScenes = unique(story.initialMap, "story-scene"), storyPeople = unique(story.characters, "story-character");
  const locationOf = (id) => {
    const s = scenes.get(id);
    return s?.storyLocationId ?? s?.id;
  };
  const roomsFor = (location2) => world3.scenes.filter((s) => locationOf(s.id) === location2).map((s) => s.id);
  if (story.initialMap.filter((n) => n.current).length !== 1) fail5("INVALID_INITIAL_SCENE", "current");
  for (const id of storyScenes.keys()) if (!roomsFor(id).length) fail5("UNBOUND_STORY_SCENE", id);
  for (const [id, s] of scenes) {
    if (!storyScenes.has(locationOf(id))) fail5("UNKNOWN_STORY_SCENE", id);
    if (!checkPoint(id, s.spawn)) fail5("INVALID_SPATIAL_SPAWN", id);
  }
  const actions = /* @__PURE__ */ new Map(), portals = /* @__PURE__ */ new Map();
  const portalKey = (id, scene) => JSON.stringify([id, scene]);
  for (const [id, e] of entities) {
    if (!scenes.has(e.scene) || !Number.isFinite(e.position.x) || !Number.isFinite(e.position.y)) fail5("INVALID_ENTITY_SCENE", id);
    if (!checkPoint(e.scene, e.approach) || Math.hypot(e.approach.x - e.position.x, e.approach.y - e.position.y) >= world3.interactionDistance) fail5("INVALID_ENTITY_APPROACH", id);
    if (!e.states.length || new Set(e.states).size !== e.states.length || e.states.some((s) => !s)) fail5("INVALID_ENTITY_STATES", id);
    for (const action of e.actions) {
      const prior = actions.get(action) ?? [];
      if (prior.length && (world3.actionScope !== "scene" || prior.some((p) => entities.get(p).scene === e.scene))) fail5("DUPLICATE_ACTION_BINDING", action);
      if (!rules2.has(action)) fail5("MISSING_STORY_RULE", action);
      actions.set(action, [...prior, id]);
    }
  }
  for (const p of world3.portals) {
    const sources = actions.get(p.actionId) ?? [], source6 = p.fromScene ?? (sources.length === 1 ? entities.get(sources[0]).scene : void 0);
    if (!source6 || !sources.some((id) => entities.get(id).scene === source6) || !checkPoint(p.scene, p.position)) fail5("INVALID_PORTAL_BINDING", p.actionId);
    const key2 = portalKey(p.actionId, source6);
    if (portals.has(key2)) fail5("DUPLICATE_PORTAL_BINDING", p.actionId);
    portals.set(key2, p);
  }
  for (const [id, rule] of rules2) {
    if (!actions.has(id)) fail5("UNBOUND_STORY_ACTION", id);
    for (const target of actions.get(id)) {
      const from = entities.get(target).scene, maps = rule.effects.filter((e) => e.type === "map"), portal2 = portals.get(portalKey(id, from));
      const sourceLocation = locationOf(from), destination = portal2 ? locationOf(portal2.scene) : sourceLocation;
      if (maps.length > 1 || maps.length > 0 && !portal2 || portal2 && maps.length === 0 && sourceLocation !== destination || maps.length === 1 && maps[0].nodeId !== destination) fail5("PORTAL_RULE_MISMATCH", id);
    }
  }
  for (const [id, c] of characters2) {
    if (!storyPeople.has(id)) fail5("UNKNOWN_STORY_CHARACTER", id);
    if (!["physical", "mediated"].includes(c.kind) || !c.entities.length || new Set(c.entities).size !== c.entities.length || c.entities.some((e) => !entities.has(e))) fail5("INVALID_CHARACTER_BINDING", id);
    if (c.kind === "physical" && (c.travels ? new Set(c.entities.map((e) => entities.get(e).scene)).size !== c.entities.length : c.entities.length !== 1)) fail5("AMBIGUOUS_PHYSICAL_CHARACTER", id);
  }
  for (const id of storyPeople.keys()) if (!characters2.has(id)) fail5("UNBOUND_STORY_CHARACTER", id);
  const current = (snapshot) => {
    if (snapshot.cartridgeId !== world3.cartridgeId) fail5("SPATIAL_SAVE_MISMATCH", snapshot.cartridgeId);
    unique(snapshot.map, "saved-scene");
    unique(snapshot.characters, "saved-character");
    if (snapshot.map.some((n) => !storyScenes.has(n.id))) fail5("UNREPRESENTABLE_SCENE", "unknown saved location");
    const active = snapshot.map.filter((n) => n.current);
    if (active.length !== 1) fail5("UNREPRESENTABLE_SCENE", "current scene");
    for (const c of snapshot.characters) if (!characters2.has(c.id)) fail5("UNREPRESENTABLE_CHARACTER", c.id);
    return active[0].id;
  };
  const locate = (snapshot, explicitScene) => {
    const location2 = current(snapshot), rooms3 = roomsFor(location2);
    if (explicitScene) {
      if (locationOf(explicitScene) !== location2) fail5("SPATIAL_LOCATION_MISMATCH", explicitScene);
      return explicitScene;
    }
    if (rooms3.length !== 1) fail5("AMBIGUOUS_SPATIAL_SCENE", location2);
    return rooms3[0];
  };
  return {
    cartridgeId: world3.cartridgeId,
    mapVersion: world3.mapVersion,
    actionIds: () => [...actions.keys()],
    storyLocationIds: () => [...storyScenes.keys()],
    characterIds: () => [...characters2.keys()],
    roomsFor,
    locate,
    validPosition: checkPoint,
    targetFor: (id, scene) => {
      const matches2 = (actions.get(id) ?? []).filter((e) => !scene || entities.get(e).scene === scene);
      if (matches2.length > 1) fail5("AMBIGUOUS_ACTION_TARGET", id);
      return matches2[0];
    },
    characterEntities: (id, scene) => characters2.get(id)?.entities.filter((e) => entities.get(e).scene === scene) ?? [],
    canInteract: (target, scene, p) => entities.get(target)?.scene === scene && checkPoint(scene, p) && Math.hypot(p.x - entities.get(target).position.x, p.y - entities.get(target).position.y) < world3.interactionDistance,
    admits: (actionId, target, scene, p) => (actions.get(actionId) ?? []).includes(target) && entities.get(target)?.scene === scene && checkPoint(scene, p) && Math.hypot(p.x - entities.get(target).position.x, p.y - entities.get(target).position.y) < world3.interactionDistance,
    assertTransition: (before, after, actionId, currentSceneId) => {
      const from = locate(before, currentSceneId), portal2 = actionId ? portals.get(portalKey(actionId, from)) : void 0;
      const to = portal2 ? portal2.scene : from, afterLocation = current(after);
      if (actionId && !(actions.get(actionId) ?? []).some((id) => entities.get(id).scene === from)) fail5("PORTAL_SOURCE_MISMATCH", actionId);
      if (locationOf(to) !== afterLocation) fail5(portal2 ? "PORTAL_STORY_MISMATCH" : "UNADMITTED_STORY_TRANSITION", from + " -> " + afterLocation);
      return portal2 ? { scene: portal2.scene, position: { ...portal2.position } } : void 0;
    }
  };
}

// src/world/map-navigation.ts
function entranceFailure(s, dest) {
  if (!rooms[dest]) return "UNKNOWN_TARGET";
  if (dest.startsWith("workshop-annex-") && !s.fieldNotes?.rooms.some((r) => r.id === dest)) return "NOTES_LOCKED";
  if (dest === "home" && !s.flags.includes("key")) return "KEY_NEEDED";
  if (!s.flags.includes("unpacked") && !["station", "home", "cafe", "grocery"].includes(dest)) return "SETTLE_FIRST";
}
function visiblePlaces(s) {
  return Object.keys(rooms).filter((id) => !id.startsWith("workshop-annex-") || s.fieldNotes?.rooms.some((r) => r.id === id));
}
function mapRoute(s, target, quick = false) {
  if (!visiblePlaces(s).includes(target)) return { places: [], portals: [], failure: "UNKNOWN_TARGET" };
  if (target === s.scene) return { places: [s.scene], portals: [], failure: "CURRENT_LOCATION" };
  if (s.activeChallenge) return { places: [], portals: [], failure: "CHALLENGE_ACTIVE" };
  const denied = entranceFailure(s, target);
  if (denied) return { places: [], portals: [], failure: denied };
  if (quick && !s.visited.includes(target)) return { places: [], portals: [], failure: "LOCATION_UNKNOWN" };
  const queue = [s.scene], came = /* @__PURE__ */ new Map(), seen5 = new Set(queue);
  for (const id2 of queue) {
    for (const portal2 of rooms[id2]?.entities ?? []) {
      const next = portal2.destination;
      if (portal2.kind !== "portal" || !next || seen5.has(next) || entranceFailure(s, next) || quick && !s.visited.includes(next)) continue;
      seen5.add(next);
      came.set(next, { from: id2, portal: portal2 });
      queue.push(next);
    }
  }
  if (!came.has(target)) return { places: [], portals: [], failure: quick ? "LOCATION_UNKNOWN" : "TRAVEL_ROUTE_UNAVAILABLE" };
  const places = [target], portals = [];
  let id = target;
  while (id !== s.scene) {
    const p = came.get(id);
    portals.unshift(p.portal);
    id = p.from;
    places.unshift(id);
  }
  return { places, portals };
}

// src/weather/animal-shelter.ts
var catRainCovers = {
  station: { prop: "tree-east", points: [{ x: 1155, y: 440 }, { x: 1215, y: 440 }, { x: 1185, y: 455 }] },
  market: { prop: "square-birch", points: [{ x: 699, y: 829 }, { x: 759, y: 829 }, { x: 729, y: 799 }] },
  courtyard: { prop: "shade-east", points: [{ x: 725, y: 535 }, { x: 784, y: 535 }, { x: 755, y: 555 }] }
};
function weatherAnimalSlot(def, s) {
  const base2 = def.schedule[periodAt(s.townMinutes ?? 540)];
  if (!base2) return null;
  const cover = catRainCovers[base2.scene];
  if (!s.weatherEcologyV1 || def.species !== "cat" || !cover || base2.activity === "sleep") return base2;
  const i = animals.findIndex((a) => a.id === def.id), point3 = cover.points[Math.max(0, i) % cover.points.length], rawHome = base2.points[Math.max(0, i) % base2.points.length], size = profiles.cat.collision, homePoint = { x: Math.max(base2.region.x + size.w / 2, Math.min(base2.region.x + base2.region.w - size.w / 2, rawHome.x)), y: Math.max(base2.region.y + size.h, Math.min(base2.region.y + base2.region.h, rawHome.y)) };
  const x = Math.min(base2.region.x, point3.x - 24), y = Math.min(base2.region.y, point3.y - 26), right = Math.max(base2.region.x + base2.region.w, point3.x + 24), bottom = Math.max(base2.region.y + base2.region.h, point3.y + 12);
  return { ...base2, region: { x, y, w: right - x, h: bottom - y }, ...weatherForSave(s) === "light-rain" ? { activity: "shelter", points: [point3] } : {}, shelter: { point: { ...point3 }, homeRegion: { ...base2.region }, homePoint: { ...homePoint } } };
}
function weatherAnimalSlots(s) {
  return Object.fromEntries(animals.flatMap((a) => {
    const slot2 = weatherAnimalSlot(a, s);
    return slot2?.shelter ? [[a.id, slot2]] : [];
  }));
}
function rainCatShelterActive(s, id) {
  const def = animals.find((a) => a.id === id);
  return !!def && weatherAnimalSlot(def, s)?.activity === "shelter";
}

// src/animals/game.ts
function animalPeople(save, positions) {
  const people2 = {};
  for (const room of Object.values(rooms)) for (const entity of room.entities) {
    if (!entity.person || !presentEntity({ ...save, neighborPartyEnabled: neighborPartyActive(save), scene: room.id }, entity)) continue;
    const foot = positions?.get(room.id + "/" + entity.id) ?? entity.at;
    const radius = patrolRadius(entity.person);
    people2[entity.person] = { scene: room.id, foot: { ...foot }, body: { x: entity.at.x - radius - 9, y: entity.at.y - 8, w: 18 + 2 * radius, h: 8 } };
  }
  return people2;
}
function gameAnimalContext(save, position, options = {}) {
  return { ...harborContext(save, options.world ?? dynamicWorld(save.flags, !!options.dynamic), rooms, position, animalPeople(save, options.positions), !!options.paused), catFamiliarities: catFamiliarities(save.animalsV1), ...save.weatherEcologyV1 && options.weatherShelter !== false ? { animalSlots: weatherAnimalSlots(save) } : {} };
}
function gameAnimalInteraction(save, action, spatialWorld) {
  const entity = rooms[save.scene]?.entities.find((e) => e.id === action.target);
  if (!entity?.animalId || !acceptedAnimals.some((def) => def.id === entity.animalId)) throw Error("ANIMAL_UNAVAILABLE");
  if (!["animal-call", "animal-pet"].includes(action.action)) throw Error("ANIMAL_ACTION_UNAVAILABLE");
  if (!action.actorPosition) throw Error("INVALID_ANIMAL_POSITION");
  return applyAnimalInteraction(save.animalsV1, acceptedAnimals, gameAnimalContext(save, action.position, { world: spatialWorld }), {
    target: entity.animalId,
    verb: action.action === "animal-call" ? "call" : "pet",
    foot: action.actorPosition
  });
}

// src/combat/presets.ts
var punch = { windup: 7, active: 6, recovery: 17, reach: 34, damage: 1, arc: Math.PI * 0.7 };
var base = { id: "harbor-sparring", version: 1, width: 320, height: 340, obstacles: [], player: { id: "player", position: { x: 160, y: 270 }, radius: 10, health: 5, speed: 110, attack: punch }, enemies: [{ id: "coach", position: { x: 160, y: 100 }, radius: 11, health: 4, speed: 60, attack: { ...punch, windup: 39, recovery: 40, reach: 37 }, thinkDelay: 28 }], objective: { kind: "defeat" }, maxTicks: 7200, dodge: { duration: 13, cooldown: 48, speed: 220, invulnerableStart: 1, invulnerableEnd: 11 } };
var sparring = base;
var footwork = { ...structuredClone(base), id: "harbor-footwork", enemies: [{ ...base.enemies[0], id: "coach-toss", speed: 0, health: 100, attack: { ...punch, windup: 50, active: 1, recovery: 52, projectileSpeed: 150 } }], obstacles: [{ x: 65, y: 154, w: 62, h: 22 }, { x: 205, y: 154, w: 48, h: 22 }], objective: { kind: "reach", zone: { x: 130, y: 12, w: 60, h: 30 } } };
var endurance = { ...structuredClone(base), id: "harbor-endurance", objective: { kind: "survive", ticks: 1200 }, enemies: [{ ...base.enemies[0], health: 100 }] };
var encounterPresets = { sparring, footwork, endurance };

// src/combat/core.ts
var clone = (v) => structuredClone(v);
var length = (a) => Math.hypot(a.x, a.y);
var unit = (a) => {
  const l = length(a);
  return l ? { x: a.x / l, y: a.y / l } : { x: 0, y: 1 };
};
var vector = (a, b) => ({ x: b.x - a.x, y: b.y - a.y });
var distance = (a, b) => length(vector(a, b));
var inBox = (p, b) => p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h;
var finite = (v) => Number.isFinite(v);
function validateEncounter(c) {
  if (!c.id || !Number.isSafeInteger(c.version) || c.version < 1 || ![c.width, c.height].every((v) => finite(v) && v >= 120 && v <= 4096) || !Number.isSafeInteger(c.maxTicks) || c.maxTicks < 60 || c.maxTicks > 18e3) throw Error("INVALID_ARENA");
  if (c.obstacles.length > 128 || c.enemies.length < 1 || c.enemies.length > 8) throw Error("INVALID_ENCOUNTER_SIZE");
  for (const r of c.obstacles) if (![r.x, r.y, r.w, r.h].every(finite) || r.w <= 0 || r.h <= 0 || r.x < 0 || r.y < 0 || r.x + r.w > c.width || r.y + r.h > c.height) throw Error("INVALID_OBSTACLE");
  const actors = [c.player, ...c.enemies];
  if (new Set(actors.map((a) => a.id)).size !== actors.length) throw Error("DUPLICATE_ACTOR");
  for (const a of actors) {
    if (!a.id || !finite(a.speed) || a.speed < 0 || a.speed > 300 || !finite(a.radius) || a.radius < 4 || a.radius > 48 || !Number.isInteger(a.health) || a.health < 1 || a.health > 100) throw Error("INVALID_ACTOR");
    const t3 = a.attack;
    if (![t3.windup, t3.active, t3.recovery].every((v) => Number.isSafeInteger(v) && v >= 1 && v <= 600) || !finite(t3.reach) || t3.reach < 4 || t3.reach > 400 || !Number.isInteger(t3.damage) || t3.damage < 1 || t3.damage > 25 || !finite(t3.arc) || t3.arc < 0.1 || t3.arc > Math.PI * 2 || t3.projectileSpeed !== void 0 && (!finite(t3.projectileSpeed) || t3.projectileSpeed < 1 || t3.projectileSpeed > 500)) throw Error("INVALID_ATTACK");
    if (!canOccupy(c, a.position, a.radius)) throw Error("BLOCKED_SPAWN");
  }
  for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) if (distance(actors[i].position, actors[j].position) < actors[i].radius + actors[j].radius) throw Error("OVERLAPPING_SPAWN");
  const d = c.dodge;
  if (![d.duration, d.cooldown, d.invulnerableStart, d.invulnerableEnd].every((v) => Number.isSafeInteger(v) && v >= 0) || d.duration < 1 || d.duration > 120 || d.cooldown < d.duration || d.cooldown > 600 || d.invulnerableStart > d.invulnerableEnd || d.invulnerableEnd > d.duration || !finite(d.speed) || d.speed < 1 || d.speed > 500) throw Error("INVALID_DODGE");
  if (c.objective.kind === "survive" && (!Number.isSafeInteger(c.objective.ticks) || c.objective.ticks < 1 || c.objective.ticks > c.maxTicks)) throw Error("INVALID_OBJECTIVE");
  if (c.objective.kind === "reach" && (![c.objective.zone.x, c.objective.zone.y, c.objective.zone.w, c.objective.zone.h].every(finite) || c.objective.zone.w < 16 || c.objective.zone.h < 16 || c.objective.zone.x < 0 || c.objective.zone.y < 0 || c.objective.zone.x + c.objective.zone.w > c.width || c.objective.zone.y + c.objective.zone.h > c.height)) throw Error("INVALID_OBJECTIVE");
  if (!["defeat", "survive", "reach"].includes(c.objective.kind)) throw Error("INVALID_OBJECTIVE");
}
function canOccupy(c, p, r) {
  if (!finite(p.x) || !finite(p.y) || p.x - r < 0 || p.y - r < 0 || p.x + r > c.width || p.y + r > c.height) return false;
  return !c.obstacles.some((b) => {
    const x = Math.max(b.x, Math.min(p.x, b.x + b.w)), y = Math.max(b.y, Math.min(p.y, b.y + b.h));
    return Math.hypot(p.x - x, p.y - y) < r;
  });
}
function clearLine(c, a, b) {
  const n = Math.ceil(distance(a, b) / 2);
  for (let i = 0; i <= n; i++) {
    const t3 = n ? i / n : 0, p = { x: a.x + (b.x - a.x) * t3, y: a.y + (b.y - a.y) * t3 };
    if (c.obstacles.some((r) => inBox(p, r))) return false;
  }
  return true;
}
function actor(spec) {
  return { ...clone(spec), hp: spec.health, facing: { x: 0, y: 1 }, phase: "idle", remaining: 0, attackId: 0, hitIds: [], dodgeTicks: 0, dodgeCooldown: 0, hurtTicks: 0, think: spec.thinkDelay ?? 30 };
}
function beginEncounter(config) {
  validateEncounter(config);
  const player = actor(config.player), enemies = config.enemies.map(actor);
  if (enemies[0]) player.facing = unit(vector(player.position, enemies[0].position));
  for (const enemy of enemies) enemy.facing = unit(vector(enemy.position, player.position));
  return { tick: 0, player, enemies, projectiles: [], result: "playing", events: [] };
}
function normalizeInput(i) {
  if (!i || !finite(i.x) || !finite(i.y) || Math.abs(i.x) > 1 || Math.abs(i.y) > 1 || typeof i.attack !== "boolean" || typeof i.defend !== "boolean") throw Error("INVALID_INPUT");
  const d = Math.max(1, Math.hypot(i.x, i.y));
  return { x: i.x / d, y: i.y / d, attack: i.attack, defend: i.defend };
}
function move(c, a, v, others) {
  const n = Math.max(1, Math.ceil(length(v) / 2)), clear = (p) => canOccupy(c, p, a.radius) && !others.some((o) => o.hp > 0 && distance(p, o.position) < a.radius + o.radius);
  for (let i = 0; i < n; i++) {
    const x = { x: a.position.x + v.x / n, y: a.position.y };
    if (clear(x)) a.position = x;
    const y = { x: a.position.x, y: a.position.y + v.y / n };
    if (clear(y)) a.position = y;
  }
}
function emit(s, type, actor2, target) {
  s.events.push({ tick: s.tick, type, actor: actor2, ...target ? { target } : {} });
}
function vulnerable(c, a) {
  const elapsed = c.dodge.duration - a.dodgeTicks;
  return !a.dodgeTicks || elapsed < c.dodge.invulnerableStart || elapsed >= c.dodge.invulnerableEnd;
}
function damage(c, s, from, to, amount) {
  if (to.hp <= 0 || !vulnerable(c, to)) return false;
  to.hp = Math.max(0, to.hp - amount);
  to.hurtTicks = 10;
  emit(s, "hit", from.id, to.id);
  if (!to.hp) {
    to.phase = "down";
    to.remaining = 0;
    emit(s, "down", to.id);
  }
  return true;
}
function startAttack(s, a) {
  a.phase = "windup";
  a.remaining = a.attack.windup;
  a.attackId++;
  a.hitIds = [];
  emit(s, "windup", a.id);
}
function attackTick(c, s, a, targets) {
  if (a.hp <= 0 || a.phase === "idle" || a.phase === "down") return;
  if (a.phase === "active" && !a.attack.projectileSpeed) {
    for (const t3 of targets) {
      const v = vector(a.position, t3.position), dist = length(v), u = unit(v), dot = u.x * a.facing.x + u.y * a.facing.y;
      if (t3.hp > 0 && !a.hitIds.includes(t3.id) && dist <= a.attack.reach + t3.radius && dot >= Math.cos(a.attack.arc / 2) && clearLine(c, a.position, t3.position)) {
        a.hitIds.push(t3.id);
        damage(c, s, a, t3, a.attack.damage);
      }
    }
  }
  a.remaining--;
  if (a.remaining > 0) return;
  if (a.phase === "windup") {
    a.phase = "active";
    a.remaining = a.attack.active;
    emit(s, "attack", a.id);
    if (a.attack.projectileSpeed) {
      s.projectiles.push({ id: `${a.id}-${a.attackId}`, source: a.id, position: { ...a.position }, velocity: { x: a.facing.x * a.attack.projectileSpeed, y: a.facing.y * a.attack.projectileSpeed }, radius: 4, damage: a.attack.damage, life: 180 });
    }
  } else if (a.phase === "active") {
    if (!a.hitIds.length && !a.attack.projectileSpeed) emit(s, "miss", a.id);
    a.phase = "recovery";
    a.remaining = a.attack.recovery;
  } else {
    a.phase = "idle";
    a.think = a.thinkDelay ?? 30;
  }
}
function stepEncounter(c, s, raw) {
  if (s.result !== "playing") return s;
  const input = normalizeInput(raw);
  s.events = [];
  s.tick++;
  const p = s.player, all = [p, ...s.enemies];
  for (const a of all) {
    a.hurtTicks = Math.max(0, a.hurtTicks - 1);
    a.dodgeCooldown = Math.max(0, a.dodgeCooldown - 1);
  }
  if (p.hp > 0) {
    if (p.phase === "idle" && !p.dodgeTicks) {
      if (input.x || input.y) p.facing = unit(input);
      if (input.defend && !p.dodgeCooldown) {
        p.dodgeTicks = c.dodge.duration;
        p.dodgeCooldown = c.dodge.cooldown;
        emit(s, "dodge", p.id);
      } else if (input.attack) startAttack(s, p);
    }
    const v = p.dodgeTicks ? p.facing : { x: input.x, y: input.y }, speed = p.dodgeTicks ? c.dodge.speed : p.phase === "idle" ? p.speed : p.speed * 0.3;
    move(c, p, { x: v.x * speed / 60, y: v.y * speed / 60 }, s.enemies);
    if (p.dodgeTicks) p.dodgeTicks--;
  }
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    if (e.phase === "idle") {
      const v = vector(e.position, p.position), d = length(v);
      e.facing = unit(v);
      e.think = Math.max(0, e.think - 1);
      const range = e.attack.projectileSpeed ? 220 : e.attack.reach + p.radius - 2;
      if (d > range || !clearLine(c, e.position, p.position)) move(c, e, { x: e.facing.x * e.speed / 60, y: e.facing.y * e.speed / 60 }, all.filter((a) => a !== e));
      else if (!e.think) startAttack(s, e);
    }
  }
  attackTick(c, s, p, s.enemies);
  for (const e of s.enemies) attackTick(c, s, e, [p]);
  for (const b of s.projectiles) {
    b.life--;
    const n = Math.max(1, Math.ceil(length(b.velocity) / 60 / 2)), source6 = all.find((a) => a.id === b.source);
    for (let i = 0; i < n && b.life > 0; i++) {
      b.position.x += b.velocity.x / 60 / n;
      b.position.y += b.velocity.y / 60 / n;
      if (!canOccupy(c, b.position, b.radius)) {
        b.life = 0;
        break;
      }
      const targets = b.source === p.id ? s.enemies : [p];
      const hit = targets.find((a) => a.hp > 0 && distance(a.position, b.position) <= a.radius + b.radius);
      if (hit) {
        damage(c, s, source6, hit, b.damage);
        b.life = 0;
      }
    }
  }
  s.projectiles = s.projectiles.filter((b) => b.life > 0);
  if (p.hp <= 0) s.result = "lost";
  else if (c.objective.kind === "defeat" && s.enemies.every((e) => e.hp <= 0) || c.objective.kind === "survive" && s.tick >= c.objective.ticks || c.objective.kind === "reach" && inBox(p.position, c.objective.zone)) s.result = "won";
  else if (s.tick >= c.maxTicks) s.result = "lost";
  if (s.result !== "playing") emit(s, "result", p.id);
  return s;
}
function replayEncounter(c, runs) {
  if (!Array.isArray(runs) || runs.length > c.maxTicks) throw Error("INVALID_RECORDING");
  const s = beginEncounter(c);
  let ticks = 0;
  for (const r of runs) {
    if (!Number.isSafeInteger(r.ticks) || r.ticks < 1 || (ticks += r.ticks) > c.maxTicks) throw Error("INVALID_RECORDING");
    normalizeInput(r.input);
    for (let i = 0; i < r.ticks; i++) {
      if (s.result !== "playing") throw Error("INPUT_AFTER_RESULT");
      stepEncounter(c, s, r.input);
    }
  }
  return s;
}

// src/story/state.ts
var has = (s, id) => s.flags.includes(id);
function initial2(locale, id) {
  return { neighborChapterV1: newNeighborChapter(), townMinutes: 540, id, version: 0, cursor: 0, mapVersion: 1, locale, scene: "station", position: { ...rooms.station.spawn }, flags: [], known: [], visited: ["station"], items: {}, energy: 100, cash: 25, standing: 0, relations: {}, history: [] };
}
var requireState = (value, code) => {
  if (!value) throw Error(code);
};
var flag2 = (s, id) => {
  if (!s.flags.includes(id)) s.flags.push(id);
};
var give = (s, id, n = 1) => s.items[id] = (s.items[id] ?? 0) + n;
function take(s, id, n = 1) {
  requireState(s.items[id] >= n, "MISSING_ITEM");
  s.items[id] -= n;
  if (!s.items[id]) delete s.items[id];
}
var relate = (s, id, n) => s.relations[id] = Math.max(-100, Math.min(100, (s.relations[id] ?? 0) + n));
var items = { ...battleItems, ...cropItems, [basicRod]: { name: ["\u57FA\u7840\u9493\u7AFF", "Basic fishing rod"], description: ["\u514D\u8D39\u7684\u57FA\u7840\u9493\u7AFF\u3002\u53EF\u5728\u53EF\u8FBE\u65E0\u906E\u6321\u7684\u6C34\u8FB9\u4F7F\u7528\u3002", "A free basic rod for reachable, clear water edges."], kind: "tools" }, [basicLure]: { name: ["\u8010\u7528\u62DF\u9975", "Reusable lure"], description: ["\u53EF\u91CD\u590D\u4F7F\u7528\uFF0C\u5931\u8D25\u6216\u6536\u7AFF\u4E0D\u4F1A\u635F\u8017\u3002", "Reusable; no loss on escape or withdrawal."], kind: "tools" }, key: { name: ["\u79DF\u5C4B\u94A5\u5319", "Room key"], description: ["\u739B\u62C9\u7ED9\u4F60\u7684\u94A5\u5319\uFF0C\u95E8\u5728\u8F66\u7AD9\u8857\u3002", "Mara\u2019s spare key. Your door is on Station Street."], kind: "tools" }, toolbag: { name: ["\u739B\u62C9\u7684\u5DE5\u5177\u888B", "Mara\u2019s tool bag"], description: ["\u897F\u5965\u66FF\u5979\u6536\u597D\u4E86\u3002", "Theo kept it safe behind the counter."], kind: "objects" }, toolkit: { name: ["\u501F\u6765\u7684\u5DE5\u5177", "Borrowed tools"], description: ["\u743C\u501F\u7ED9\u4F60\u7684\uFF0C\u53EF\u4EE5\u4FEE\u6865\uFF0C\u4E5F\u53EF\u4EE5\u7528\u4E8E\u5C0F\u4FEE\u7406\u3002", "June\u2019s tools for repairs around town."], kind: "tools" }, wood: { name: ["\u7ED3\u5B9E\u7684\u6728\u677F", "Sound timber"], description: ["\u6C99\u6EE9\u4E0A\u7684\u65E7\u6728\u677F\uFF0C\u4FEE\u6865\u9700\u8981\u4E24\u5757\u3002", "Salvaged at the beach. Two planks will mend the bridge."], kind: "objects" }, fish: { name: ["\u65B0\u9C9C\u7684\u9C7C", "Fresh fish"], description: ["\u53EF\u4EA4\u7ED9\u5496\u5561\u9986\u505A\u5F53\u65E5\u7279\u9910\u3002", "Theo can use it for the daily special."], kind: "objects" }, photo: { name: ["\u65E7\u6865\u7167\u7247", "Bridge photograph"], description: ["\u8FC7\u53BB\u7684\u6D77\u5CB8\u5C0F\u6865\u4E0E\u516C\u5171\u8DEF\u7EBF\u3002", "The old footbridge and its public approach."], kind: "notes" }, route: { name: ["\u5C71\u5761\u8DEF\u7EBF\u56FE", "Hillside route map"], description: ["\u4E00\u6761\u7ECF\u8FC7\u6C14\u8C61\u7AD9\u4E0B\u65B9\u7684\u516C\u5171\u5C0F\u8DEF\u3002", "A public trail below the weather station."], kind: "notes" } };
var hasCoastRoute = (s) => has(s, "bridge-fixed") || has(s, "alternative-route") || has(s, "garden-agreed");
var topics = {
  mara: [{ id: "key", label: ["\u9886\u53D6\u94A5\u5319", "Collect your key"], reply: ["\u201C\u697C\u4E0A\u7684\u5C0F\u623F\u95F4\u662F\u4F60\u7684\u3002\u5148\u53BB\u653E\u4E0B\u5305\uFF0C\u56DE\u6765\u518D\u8BF4\u522B\u7684\u3002\u201D\u5979\u628A\u94A5\u5319\u653E\u8FDB\u4F60\u624B\u91CC\u3002", "\u201CThe little room is yours. Put your bag down first. Everything else can wait.\u201D She places the key in your hand."], once: true }, { id: "settle", label: ["\u9644\u8FD1\u6709\u4EC0\u4E48\u53EF\u4EE5\u53BB\u7684\uFF1F", "Where should I start?"], reply: ["\u201C\u60F3\u8BA4\u8BC6\u4EBA\u5C31\u53BB\u5496\u5561\u9986\uFF0C\u60F3\u6E05\u9759\u5C31\u6CBF\u6D77\u8D70\u3002\u5496\u5561\u9986\u66FF\u6211\u4FDD\u7BA1\u7740\u5DE5\u5177\u888B\uFF0C\u8DEF\u8FC7\u65F6\u66FF\u6211\u5E26\u56DE\u6765\u5C31\u597D\u3002\u201D", "\u201CThe caf\xE9 for company, the coast for quiet. The caf\xE9 is keeping my tool bag. Bring it back if you pass that way.\u201D"], requires: "unpacked", once: true }, { id: "return-bag", label: ["\u4EA4\u8FD8\u5DE5\u5177\u888B", "Return the tool bag"], reply: ["\u5979\u62C9\u5F00\u888B\u5B50\uFF0C\u677E\u4E86\u53E3\u6C14\uFF1A\u201C\u6B63\u8981\u7528\u5462\u3002\u8C22\u8C22\u3002\u5F80\u540E\u4F60\u4E0D\u5FC5\u4E8B\u4E8B\u95EE\u6211\uFF0C\u8FD9\u4E2A\u590F\u5929\u662F\u4F60\u7684\u3002\u201D", "She opens the bag with relief. \u201CJust what I needed. Thank you. You don\u2019t need my permission for every outing. This summer is yours.\u201D"], once: true }, { id: "town", label: ["\u4F60\u5728\u8FD9\u91CC\u4F4F\u4E86\u591A\u4E45\uFF1F", "How long have you lived here?"], reply: ["\u201C\u4E09\u5341\u4E8C\u5E74\u3002\u8FD8\u662F\u4F1A\u53D1\u73B0\u6CA1\u8D70\u8FC7\u7684\u5DF7\u5B50\u3002\u6709\u4EBA\u8BF4\u8FD9\u91CC\u6CA1\u6709\u53D8\u5316\uFF0C\u6211\u60F3\u53EA\u662F\u4ED6\u4EEC\u4E0D\u518D\u51FA\u95E8\u4E86\u3002\u201D", "\u201CThirty-two years. I still find lanes I haven\u2019t walked. People say nothing changes here. Perhaps they\u2019ve stopped looking.\u201D"], once: true }],
  theo: [{ id: "bag", label: ["\u739B\u62C9\u843D\u4E0B\u4E86\u5DE5\u5177\u888B", "Mara left a tool bag"], reply: ["\u201C\u5C31\u5728\u8FD9\u91CC\u3002\u201D\u4ED6\u628A\u5E06\u5E03\u888B\u9012\u7ED9\u4F60\u3002\u201C\u522B\u6025\u7740\u8D70\uFF0C\u90A3\u76CF\u9732\u53F0\u706F\u9001\u8FDB\u6765\u68C0\u4FEE\uFF0C\u53EF\u4E00\u76F4\u6CA1\u65F6\u95F4\u5F04\u3002\u201D", "\u201CRight here.\u201D He hands you a canvas bag. \u201CNo rush. The terrace lantern came in for repairs, but I haven\u2019t had time to look at it.\u201D"], requires: "unpacked", once: true }, { id: "repair", label: ["\u4F60\u8FD9\u91CC\u6709\u4EC0\u4E48\u9700\u8981\u5E2E\u5FD9\u7684\u5417\uFF1F", "Is there anything I could help with?"], reply: ["\u201C\u90A3\u76CF\u9732\u53F0\u706F\u4E0D\u4EAE\u4E86\uFF0C\u6211\u4E00\u76F4\u62BD\u4E0D\u5F00\u8EAB\u3002\u63A5\u5934\u677E\u4E86\uFF0C\u96F6\u4EF6\u90FD\u5728\u65C1\u8FB9\u3002\u60F3\u8BD5\u5C31\u770B\u770B\uFF0C\u968F\u65F6\u53EF\u4EE5\u505C\u4E0B\u6765\u3002\u201D", "\u201CThe terrace lantern is out, and I haven\u2019t found a minute for it. The connectors are loose; the parts are beside it. Have a look if you like. You can stop whenever you want.\u201D"], once: true }, { id: "fish", label: ["\u628A\u4E00\u6761\u9C7C\u4EA4\u7ED9\u53A8\u623F", "Give the kitchen a fish"], reply: ["\u201C\u4ECA\u5929\u7684\u7279\u9910\u6709\u7740\u843D\u4E86\u3002\u201D\u4ED6\u4ED8\u7ED9\u4F60\u516D\u7F8E\u5143\u3002", "\u201CThat\u2019s today\u2019s special sorted.\u201D He pays you six dollars."] }, { id: "coast", label: ["\u4ECE\u8FD9\u91CC\u80FD\u8D70\u5230\u6D77\u8FB9\u5417\uFF1F", "Can I walk to the coast from here?"], reply: ["\u201C\u5C0F\u6865\u574F\u4E86\u3002\u8FD1\u8DEF\u7ECF\u8FC7\u4E00\u6237\u4EBA\u5BB6\u7684\u9662\u5B50\uFF0C\u4F46\u5BB6\u91CC\u6709\u4F4D\u8001\u4EBA\u9700\u8981\u5B89\u9759\u3002\u6211\u5E0C\u671B\u6709\u4E2A\u5927\u5BB6\u90FD\u8212\u670D\u7684\u529E\u6CD5\u3002\u201D", "\u201CThe bridge broke. The shortcut crosses someone\u2019s yard, where an older resident needs quiet. I hope there\u2019s a way that works for everyone.\u201D"], once: true }],
  june: [{ id: "tools", label: ["\u501F\u4E00\u5957\u5DE5\u5177", "Borrow a toolkit"], reply: ["\u5979\u9012\u6765\u4E00\u53EA\u5DE5\u5177\u7BB1\uFF1A\u201C\u8BB0\u5F97\u5E26\u56DE\u6765\u3002\u9547\u4E0A\u7684\u5C0F\u4FEE\u5C0F\u8865\u90FD\u7528\u5F97\u4E0A\u3002\u4F60\u5148\u770B\u770B\u8981\u4FEE\u7684\u4E1C\u897F\uFF0C\u522B\u6025\u7740\u62C6\u3002\u201D", "She hands you a toolkit. \u201CBring it back sometime. Good for little repairs around town. Have a look at what is broken before taking anything apart.\u201D"], once: true }, { id: "bridge", label: ["\u6211\u770B\u8FC7\u5C0F\u6865\u4E86\uFF0C\u8BE5\u600E\u4E48\u4FEE\uFF1F", "I inspected the bridge. How would you repair it?"], reply: ["\u201C\u6865\u57FA\u6CA1\u574F\uFF0C\u6362\u4E24\u5757\u7ED3\u5B9E\u7684\u6865\u677F\u5C31\u884C\u3002\u6C99\u6EE9\u4E0A\u6216\u8BB8\u80FD\u627E\u5230\u5408\u9002\u7684\u6728\u5934\u3002\u5148\u770B\u6709\u6CA1\u6709\u673D\u70C2\uFF0C\u518D\u52A8\u624B\u3002\u201D", "\u201CThe supports are sound. Two sturdy boards should do it. You may find timber at the beach. Check for rot before you start.\u201D"], requires: "bridge-seen", once: true }],
  idris: [{ id: "training", label: ["\u6211\u60F3\u8BD5\u8BD5\u5207\u78CB", "Try a friendly spar"], reply: ["\u201C\u5148\u770B\u6211\u80A9\u8180\uFF0C\u6211\u62AC\u624B\u624D\u4F1A\u51FA\u62F3\u3002\u95EA\u5F00\uFF0C\u7B49\u6211\u6536\u62F3\u65F6\u518D\u56DE\u6765\u3002\u51C6\u5907\u597D\u518D\u5F00\u59CB\u3002\u201D", "\u201CWatch my shoulders. I raise my hands before I punch. Move out, then come back while I recover. Start when you\u2019re ready.\u201D"] }, { id: "footwork", label: ["\u53EA\u7EC3\u8EB2\u907F\u548C\u8D70\u4F4D", "Practice footwork"], reply: ["\u201C\u7ED5\u8FC7\u7EC3\u4E60\u57AB\uFF0C\u5230\u53E6\u4E00\u5934\u53BB\u3002\u770B\u51C6\u7403\u7684\u65B9\u5411\uFF0C\u4E0D\u5FC5\u6253\u5012\u4EFB\u4F55\u4E1C\u897F\u3002\u201D", "\u201CGo around the pads and reach the far end. Read the ball\u2019s direction. You don\u2019t have to knock anything down.\u201D"] }, { id: "why", label: ["\u4F60\u4E3A\u4EC0\u4E48\u5F00\u62F3\u9986\uFF1F", "Why run this club?"], reply: ["\u201C\u56E0\u4E3A\u6709\u4E9B\u4EBA\u9700\u8981\u4E00\u4E2A\u5730\u65B9\uFF0C\u628A\u7D27\u5F20\u653E\u4E0B\u6765\u3002\u8D62\u4E0D\u8D62\u5012\u662F\u7B2C\u4E8C\u4F4D\u3002\u201D", "\u201CSome people need somewhere to put their nerves down. Winning comes after that.\u201D"], once: true }],
  ruth: [{ id: "fishing", label: ["\u9493\u9C7C\u600E\u4E48\u64CD\u4F5C\uFF1F", "How does fishing work?"], reply: ["\u201C\u9C7C\u5F80\u5916\u8DD1\u5C31\u677E\u4E00\u70B9\uFF0C\u5B89\u9759\u4E0B\u6765\u518D\u6536\u3002\u7EBF\u7EF7\u5F97\u592A\u7D27\u4F1A\u65AD\u3002\u4E34\u65F6\u501F\u7AFF\u514D\u8D39\uFF0C\u6536\u7AFF\u540E\u653E\u56DE\u8FD9\u91CC\u3002\u201D", "\u201CLet it run when it pulls. Reel when it settles. Too much tension breaks the line. Borrowing is free; put the rod back when you finish.\u201D"] }, { id: "ferry", label: ["\u90A3\u8258\u65E7\u6E21\u8F6E\u8FD8\u5F00\u5417\uFF1F", "Does the old ferry still run?"], reply: ["\u201C\u4E0D\u5F00\u4E86\u3002\u6211\u6709\u65F6\u8FD8\u662F\u4F1A\u6765\u7B49\uFF0C\u4E0D\u8FC7\u7B49\u7684\u662F\u508D\u665A\uFF0C\u4E0D\u662F\u8239\u3002\u201D", "\u201CNo. I still come to wait sometimes. For the evening, though, not the boat.\u201D"], once: true }],
  luis: [{ id: "packed-snack", label: ["\u4E70\u4E00\u4EFD\u6253\u5305\u70B9\u5FC3 \xB7 $4", "Buy a packed snack \xB7 $4"], reply: ["\u201C\u88C5\u597D\u4E86\u3002\u60F3\u5403\u65F6\u518D\u6253\u5F00\u3002\u201D", "\u201CWrapped up. Open it when you need it.\u201D"] }, { id: "snack", label: ["\u4E70\u4EFD\u70B9\u5FC3 \xB7 $4", "Buy a snack \xB7 $4"], reply: ["\u4ED6\u9012\u6765\u70ED\u4E4E\u7684\u9762\u5305\u3002\u201C\u5148\u5403\u4E86\u518D\u5F80\u5C71\u4E0A\u8D70\u3002\u201D", "He hands you warm bread. \u201CEat before you climb the hill.\u201D"] }, { id: "water", label: ["\u63A5\u676F\u6C34", "Have some water"], reply: ["\u51C9\u6C34\u4ECE\u6C34\u9F99\u5934\u6D41\u51FA\u3002\u4F60\u5750\u4E86\u4E00\u4F1A\u513F\uFF0C\u611F\u89C9\u7CBE\u795E\u597D\u591A\u4E86\u3002", "Cool water runs from the tap. A short sit leaves you feeling better."] }],
  nell: [{ id: "photo", label: ["\u4ED4\u7EC6\u770B\u770B\u65E7\u6865\u7167\u7247", "Look at the bridge photograph"], reply: ["\u7167\u7247\u91CC\uFF0C\u4E00\u6761\u516C\u5171\u5C0F\u8DEF\u4ECE\u5C71\u5761\u7ED5\u5230\u6865\u7684\u53E6\u4E00\u7AEF\u3002\u5185\u5C14\u628A\u7167\u7247\u9012\u7ED9\u4F60\uFF1A\u201C\u4E5F\u8BB8\u6C14\u8C61\u7AD9\u7684\u4EBA\u8FD8\u8BB0\u5F97\u3002\u201D", "In the photograph, a public trail winds down the hill to the far side of the bridge. Nell gives you the print. \u201CSomeone at the weather station may remember.\u201D"], once: true }],
  elena: [{ id: "quiet", label: ["\u4F60\u5E0C\u671B\u8DEF\u8FC7\u7684\u4EBA\u6CE8\u610F\u4E9B\u4EC0\u4E48\uFF1F", "What would you like people passing through to consider?"], reply: ["\u201C\u4E0D\u53EA\u662F\u58F0\u97F3\u3002\u90A3\u4E2A\u9662\u5B50\u662F\u6211\u4EEC\u7684\u5BB6\u3002\u5927\u5BB6\u9700\u8981\u53BB\u6D77\u8FB9\uFF0C\u6211\u7406\u89E3\uFF0C\u4F46\u4E0D\u80FD\u9ED8\u8BA4\u8FD9\u9053\u95E8\u6C38\u8FDC\u4E3A\u4ED6\u4EEC\u5F00\u7740\u3002\u201D", "\u201CIt isn\u2019t just noise. That courtyard is our home. I understand people need the coast, but that doesn\u2019t make our gate a public road.\u201D"], once: true }, { id: "hours", label: ["\u53EA\u5728\u4E0A\u5348\u501F\u9053\uFF0C\u53EF\u4EE5\u5417\uFF1F", "Could people pass in the morning?"], reply: ["\u201C\u4E0A\u5348\u5341\u70B9\u5230\u5341\u4E8C\u70B9\uFF0C\u8D34\u6E05\u695A\u65F6\u95F4\u3002\u6211\u613F\u610F\u8BD5\u4E00\u5929\uFF0C\u4E0D\u662F\u628A\u9662\u5B50\u4EA4\u51FA\u53BB\u3002\u201D", "\u201CTen to twelve, with a clear sign. I\u2019ll try it for one day. I\u2019m not giving the garden away.\u201D"], requires: "bridge-seen", all: ["talk:elena:quiet"], once: true }],
  arthur: [{ id: "trail", label: ["\u8FD8\u6709\u522B\u7684\u8DEF\u5230\u6D77\u8FB9\u5417\uFF1F", "Is there another way to the coast?"], reply: ["\u201C\u8425\u5730\u90A3\u5F20\u65E7\u56FE\u4E0A\u7684\u8DEF\u8FD8\u5728\u3002\u62FC\u597D\u5B83\uFF0C\u4F60\u5C31\u770B\u5F97\u51FA\u8F6C\u5F2F\u5904\u3002\u90A3\u662F\u516C\u5171\u5C0F\u8DEF\uFF0C\u4E0D\u5FC5\u7A7F\u8FC7\u522B\u4EBA\u7684\u9662\u5B50\u3002\u201D", "\u201CThe trail on the old camp map is still there. Put the pieces together and you\u2019ll see the turn. Public land. No need to cross anyone\u2019s garden.\u201D"], once: true }]
};
function currentTopic(s, p, t3) {
  const q = questProgress(s);
  let reply;
  switch (p + ":" + t3.id) {
    case "mara:settle":
      if (q.toolbag === "returned") reply = ["\u201C\u5DE5\u5177\u888B\u5DF2\u7ECF\u6536\u597D\u4E86\uFF0C\u8C22\u8C22\u4F60\u3002\u60F3\u70ED\u95F9\u5C31\u53BB\u5496\u5561\u9986\uFF0C\u60F3\u6E05\u9759\u5C31\u6CBF\u6D77\u8D70\u3002\u6162\u6162\u901B\uFF0C\u4E0D\u7528\u6025\u7740\u66FF\u8C01\u529E\u4E8B\u3002\u201D", "\u201CThe tool bag is safely back, thanks to you. The caf\xE9 for company, the coast for quiet. Take your time; you don\u2019t owe anyone an errand.\u201D"];
      else if (q.toolbag === "carried" || q.toolbag === "collected") reply = ["\u201C\u60F3\u8BA4\u8BC6\u4EBA\u5C31\u53BB\u5496\u5561\u9986\uFF0C\u60F3\u6E05\u9759\u5C31\u6CBF\u6D77\u8D70\u3002\u4F60\u5DF2\u7ECF\u66FF\u6211\u53D6\u5230\u5DE5\u5177\u888B\u4E86\uFF0C\u65B9\u4FBF\u65F6\u4EA4\u7ED9\u6211\u5C31\u597D\u3002\u201D", "\u201CThe caf\xE9 for company, the coast for quiet. You\u2019ve already collected my tool bag; hand it over when you\u2019re ready.\u201D"];
      break;
    case "theo:repair":
      if (q.terrace === "repaired") reply = ["\u201C\u706F\u5DF2\u7ECF\u4FEE\u597D\u4E86\uFF0C\u591A\u4E8F\u4F60\u3002\u4ECA\u665A\u9732\u53F0\u7EC8\u4E8E\u80FD\u4EAE\u8D77\u6765\u3002\u5148\u5750\u4F1A\u513F\u5427\uFF0C\u4E0D\u7528\u518D\u4FEE\u4E00\u6B21\u3002\u201D", "\u201CThe lantern is fixed, thanks to you. We\u2019ll have light on the terrace tonight. Take a seat; there\u2019s nothing to fix again.\u201D"];
      break;
    case "theo:bag":
      if (q.terrace === "repaired") reply = ["\u201C\u5C31\u5728\u8FD9\u91CC\u3002\u201D\u4ED6\u628A\u5E06\u5E03\u888B\u9012\u7ED9\u4F60\u3002\u201C\u706F\u4E5F\u591A\u4E8F\u4F60\u4FEE\u597D\u4E86\uFF0C\u66FF\u6211\u5411\u739B\u62C9\u95EE\u597D\u3002\u201D", "\u201CRight here.\u201D He hands you the canvas bag. \u201CAnd thanks for fixing the lantern. Give Mara my regards.\u201D"];
      break;
    case "theo:coast":
      if (q.access === "open") reply = ["\u201C\u6D77\u5CB8\u901A\u884C\u5B89\u6392\u5DF2\u7ECF\u8D34\u597D\u4E86\uFF0C\u6309\u6307\u8DEF\u724C\u8D70\u5C31\u884C\u3002\u8981\u662F\u9009\u4E86\u5EAD\u9662\u90A3\u6761\u8DEF\uFF0C\u522B\u5FD8\u4E86\u7EA6\u597D\u7684\u65F6\u6BB5\u3002\u201D", "\u201CThe coast access arrangements are posted. Follow the signs. If you take the garden route, keep to the agreed hours.\u201D"];
      else if (q.access === "ready") reply = ["\u201C\u4F60\u5DF2\u7ECF\u627E\u5230\u4E86\u53EF\u884C\u7684\u8DEF\u3002\u53BB\u706F\u5854\u786E\u8BA4\u901A\u884C\u5B89\u6392\uFF0C\u5C31\u80FD\u628A\u8DEF\u7EBF\u544A\u8BC9\u5927\u5BB6\u4E86\u3002\u201D", "\u201CYou\u2019ve found a workable route. Confirm the access arrangements at the lighthouse, then let everyone know.\u201D"];
      break;
    case "june:bridge":
      if (q.bridge === "repaired") reply = ["\u201C\u65B0\u6865\u677F\u5DF2\u7ECF\u56FA\u5B9A\u597D\u4E86\u3002\u505A\u5F97\u4E0D\u9519\u3002\u4EE5\u540E\u7559\u610F\u6728\u677F\u7684\u72B6\u51B5\u5C31\u884C\uFF0C\u4E0D\u7528\u518D\u627E\u4E24\u5757\u6765\u6362\u3002\u201D", "\u201CThe new boards are secure. Good work. Just keep an eye on them; you don\u2019t need another pair.\u201D"];
      break;
    case "arthur:trail":
      if (q.trail === "mapped") reply = ["\u201C\u4F60\u5DF2\u7ECF\u628A\u516C\u5171\u5C0F\u8DEF\u62FC\u51FA\u6765\u4E86\u3002\u6CBF\u6C14\u8C61\u7AD9\u4E0B\u9762\u8D70\uFF0C\u4E0D\u9700\u8981\u7ECF\u8FC7\u79C1\u4EBA\u9662\u5B50\u3002\u201D", "\u201CYou\u2019ve already pieced together the public trail. It runs below the weather station, clear of the private garden.\u201D"];
      break;
    case "nell:photo":
      if (q.trail === "mapped") reply = ["\u5185\u5C14\u628A\u7167\u7247\u9012\u7ED9\u4F60\uFF1A\u201C\u7559\u7740\u5427\u3002\u7167\u7247\u91CC\u5C31\u662F\u4F60\u627E\u5230\u7684\u90A3\u6761\u516C\u5171\u5C0F\u8DEF\uFF0C\u5F80\u540E\u4E5F\u80FD\u4F5C\u4E2A\u7EAA\u5FF5\u3002\u201D", "Nell gives you the photograph. \u201CKeep it. That\u2019s the public trail you found. A little memento, too.\u201D"];
      break;
  }
  return reply ? { ...t3, reply } : t3;
}
function availableTopics(s, p) {
  return [...topics[p] ?? [], ...neighborTopics(s, p), ...chapelTopics(s, p), ...priestTopics(s, p), ...lifeTopics(s, p), ...newsTopics(s, p), ...nextTopics(s, p), ...nomadTopics(s, p), ...battleTopics(s, p), ...growthTopics(s, p)].filter((t3) => (!t3.requires || has(s, t3.requires)) && (!t3.all || t3.all.every((f2) => has(s, f2))) && (!t3.once || !has(s, `talk:${p}:${t3.id}`)) && (t3.id !== "return-bag" || !!s.items.toolbag && !has(s, "bag-returned")) && (t3.id !== "fish" || !!s.items.fish) && (t3.id !== "key" || !has(s, "key")) && !(p === "theo" && t3.id === "bag" && (!!s.items.toolbag || has(s, "bag-returned"))) && !(p === "june" && t3.id === "tools" && !!s.items.toolkit) && !(p === "elena" && t3.id === "hours" && has(s, "garden-agreed"))).filter((t3) => !(p === "luis" && ["snack", "water", "packed-snack"].includes(t3.id) && s.scene !== "grocery") && !(p === "theo" && ["bag", "fish"].includes(t3.id) && s.scene !== "cafe")).map((t3) => currentTopic(s, p, t3));
}
function validateQuestion(s, a) {
  requireState(a.expected_version === s.version, "VERSION_CONFLICT");
  requireState(a.scene === s.scene && walkable(worldWithFlags(s.flags), s.scene, a.position), "INVALID_POSITION");
  requireState(!s.activeChallenge && !battleLocksWorld(s), "CHALLENGE_ACTIVE");
  const e = entityAt(s.scene, a.target);
  requireState(e?.person && s.known.includes(e.person), "INTRODUCE_FIRST");
  requireState(presentEntity(s, e), "PERSON_AWAY");
  requireState(Math.hypot(a.position.x + 8 - observedActor(e, a.actorPosition).x, a.position.y + 6 - observedActor(e, a.actorPosition).y) <= 75, "TOO_FAR");
  const text2 = a.payload?.text;
  requireState(typeof text2 === "string" && text2.trim().length > 0 && text2.length <= 400, "INVALID_QUESTION");
  return { person: e.person, question: text2.trim() };
}
function applyAction(before, a, resolution, spatialWorld = worldWithFlags(before.flags), relationshipClock = townMinutes) {
  requireState(a.expected_version === before.version, "VERSION_CONFLICT");
  requireState(a.scene === before.scene, "WRONG_SCENE");
  requireState(walkable(spatialWorld, before.scene, a.position), "INVALID_POSITION");
  if (!a.action.startsWith("battle-") && a.action !== "snack-eat") requireState(!battleLocksWorld(before), "BATTLE_ACTIVE");
  if (a.action === "ask") {
    const { person, question } = validateQuestion(before, a);
    requireState(resolution, "DIALOGUE_RESOLUTION_REQUIRED");
    if (resolution.topic) {
      requireState(!growthTopicIds.includes(resolution.topic) && resolution.topic !== "neighbor-chat" && !priestChoiceTopicIds.includes(resolution.topic), "RELATIONSHIP_EXPLICIT_ACTION_REQUIRED");
      const result = applyAction(before, { ...a, action: "talk:" + resolution.topic }, void 0, spatialWorld, relationshipClock);
      result.head.history.at(-1).question = question;
      flag2(result.head, "free-dialogue-experienced");
      return result;
    }
    const next = structuredClone(before);
    flag2(next, "free-dialogue-experienced");
    next.position = { ...a.position };
    next.version++;
    next.cursor++;
    next.history.push({ id: a.action_id, kind: "talk", person, question, text: resolution.reply });
    next.history = next.history.slice(-500);
    return { head: next, text: resolution.reply };
  }
  const s = structuredClone(before);
  const relationshipMinute = relationshipClock(s);
  requireState(relationshipMinute === townMinutes(s), "RELATIONSHIP_CLOCK_NOT_COMMITTED");
  s.position = { ...a.position };
  let text2 = ["\u5B8C\u6210\u4E86\u3002", "Done."];
  const e = entityAt(s.scene, a.target);
  if (a.action === "fishing-kit:claim") {
    text2 = claimFishingKit(s);
  } else if (a.action === "fishing:start") {
    requireState(!s.activeChallenge, "CHALLENGE_ACTIVE");
    const fishing = makeShoreEncounter(s, a, spatialWorld);
    s.activeChallenge = { id: a.action_id, kind: "fishing", scene: s.scene, fishing };
    text2 = ["\u9C7C\u7EBF\u843D\u5165\u6C34\u4E2D\uFF0C\u7559\u610F\u6D6E\u6F02\u3002", "Your line is in the water. Watch the float."];
  } else if (a.action === "fishing:land") {
    const active = s.activeChallenge;
    requireState(active?.id === a.target && active?.kind === "fishing", "CHALLENGE_MISMATCH");
    const pending = active.fishing ? pendingShoreResult(active.fishing, a.payload?.shore) : pendingLegacyResult(a.payload?.fishing);
    requireState(!active.fishingPending || JSON.stringify(active.fishingPending) === JSON.stringify(pending), "FISHING_RESULT_LOCKED");
    active.fishingPending = pending;
    text2 = ["\u9493\u9C7C\u7ED3\u679C\u5DF2\u4FDD\u5B58\uFF0C\u786E\u8BA4\u540E\u624D\u5165\u5305\u3002", "Fishing result saved. Confirm to put the catch in your bag."];
  } else if (a.action.startsWith("battle-") || a.action === "snack-eat") {
    text2 = applyBattle(s, a);
  } else if (a.action === "travel-map") {
    requireState(!s.activeChallenge, "CHALLENGE_ACTIVE");
    const route2 = mapRoute(s, a.target, true);
    requireState(!route2.failure, route2.failure ?? "TRAVEL_ROUTE_UNAVAILABLE");
    s.scene = a.target;
    s.position = { ...rooms[a.target].spawn };
    text2 = ["\u4F60\u6CBF\u719F\u6089\u7684\u8DEF\u62B5\u8FBE\u76EE\u7684\u5730\u3002", "You follow the familiar route back."];
  } else if (["challenge-finish", "fishing:confirm", "fishing:withdraw"].includes(a.action)) {
    if (a.action !== "challenge-finish") requireState(s.activeChallenge?.kind === "fishing", "CHALLENGE_MISMATCH");
    if (a.action === "fishing:confirm") requireState(s.activeChallenge?.fishingPending, "FISHING_CONFIRM_REQUIRED");
    requireState(s.activeChallenge?.id === a.target, "CHALLENGE_MISMATCH");
    const active = s.activeChallenge;
    const p = a.action === "fishing:withdraw" ? { withdraw: true } : a.action === "fishing:confirm" ? { confirmShore: true } : a.payload;
    requireState(p && typeof p === "object", "INVALID_RESULT");
    if (p.withdraw) {
      requireState(!active.fishingPending || active.fishingPending.result !== "caught", "FISHING_RESULT_AWAITING_CONFIRMATION");
      text2 = ["\u4F60\u505C\u4E86\u4E0B\u6765\uFF0C\u53EF\u4EE5\u51C6\u5907\u597D\u540E\u518D\u8BD5\u3002", "You stop for now. You can try again whenever you like."];
    } else if (["sparring", "footwork", "endurance"].includes(active.kind)) {
      const result = replayEncounter(encounterPresets[active.kind], p.runs);
      requireState(result.result !== "playing", "CHALLENGE_NOT_FINISHED");
      text2 = result.result === "won" ? ["\u7EC3\u4E60\u5B8C\u6210\u3002\u6559\u7EC3\u78B0\u4E86\u78B0\u4F60\u7684\u624B\u5957\uFF1A\u201C\u6BD4\u521A\u624D\u7A33\u591A\u4E86\u3002\u201D", "Practice complete. The coach taps your glove. \u201CSteadier already.\u201D"] : ["\u6559\u7EC3\u6536\u624B\uFF0C\u8BA9\u4F60\u5598\u53E3\u6C14\u3002\u201C\u5148\u770B\u52A8\u4F5C\uFF0C\u51C6\u5907\u597D\u4E86\u518D\u6765\u3002\u201D", "The coach steps back. \u201CTake a breath. Watch the movement next time.\u201D"];
      if (result.result === "won" && !has(s, "challenge:" + active.kind)) {
        flag2(s, "challenge:" + active.kind);
        s.standing += 2;
        relate(s, "idris", 2);
      }
    } else if (active.kind === "repair") {
      requireState(JSON.stringify(p.solution) === "[1,3,2]", "PUZZLE_NOT_SOLVED");
      flag2(s, "terrace-fixed");
      s.standing += 3;
      text2 = ["\u706F\u4EAE\u4E86\u3002\u897F\u5965\u628A\u4E00\u676F\u5496\u5561\u653E\u5728\u4F60\u9762\u524D\uFF0C\u51B2\u4F60\u4E3E\u8D77\u676F\u5B50\u3002", "The lantern lights up. Theo sets a coffee down for you and raises his own cup."];
    } else if (active.kind === "map") {
      requireState(JSON.stringify(p.solution) === "[0,1,2,3]", "PUZZLE_NOT_SOLVED");
      flag2(s, "alternative-route");
      give(s, "route");
      text2 = ["\u5C0F\u8DEF\u8FDE\u8D77\u6765\u4E86\u3002\u5B83\u4ECE\u6C14\u8C61\u7AD9\u4E0B\u65B9\u7ED5\u5230\u6D77\u8FB9\uFF0C\u4E0D\u7ECF\u8FC7\u79C1\u4EBA\u5EAD\u9662\u3002", "The trail comes together. It runs below the weather station to the coast, clear of the private garden."];
    } else if (active.kind === "fishing" && active.fishing) {
      requireState(!active.fishingPending || p.confirmShore === true, "FISHING_CONFIRM_REQUIRED");
      const result = active.fishingPending ?? replayShore(active.fishing, p.shore);
      if (result.result === "caught") {
        give(s, "fish");
        s.energy = Math.max(0, s.energy - 2);
        s.fishingV1 ??= { schema: 1, kit: true, caught: 0 };
        s.fishingV1.caught++;
        s.fishingV1.lastCatch = { action: a.action_id, species: active.fishing.species, water: active.fishing.water, minute: active.fishing.minute };
        const names2 = speciesNames[active.fishing.species];
        text2 = [`\u9493\u5230${names2[0]}\uFF0C\u5DF2\u653E\u8FDB\u884C\u56CA\u3002\u7CBE\u529B\u22122\uFF0C\u57FA\u7840\u62DF\u9975\u4FDD\u7559\u3002`, `Caught ${names2[1]}; saved in your bag. Energy \u22122; reusable lure kept.`];
      } else text2 = ["\u9C7C\u6E38\u8D70\u4E86\uFF0C\u7AFF\u548C\u62DF\u9975\u90FD\u4FDD\u7559\uFF0C\u53EF\u4EE5\u518D\u8BD5\u3002", "It got away. Your rod and lure are kept; try again."];
    } else if (active.kind === "fishing") {
      requireState(!active.fishingPending || p.confirmShore === true, "FISHING_CONFIRM_REQUIRED");
      const result = active.fishingPending ?? replayFishing(p.fishing);
      requireState(result.result !== "playing", "CHALLENGE_NOT_FINISHED");
      if (result.result === "caught") {
        give(s, "fish");
        s.energy = Math.max(0, s.energy - 2);
        relate(s, "ruth", 1);
        text2 = ["\u9C7C\u8FDB\u4E86\u6876\u3002\u9732\u4E1D\u70B9\u70B9\u5934\uFF1A\u53EF\u4EE5\u5148\u7559\u5728\u884C\u56CA\uFF0C\u518D\u9001\u5230\u5496\u5561\u9986\u53A8\u623F\u3002", "The fish lands in the bucket. Ruth nods. Keep it in your bag, or deliver it to the caf\xE9 kitchen."];
      } else text2 = ["\u9C7C\u6E38\u8D70\u4E86\u3002\u9732\u4E1D\u9012\u7ED9\u4F60\u4E00\u676F\u6C34\uFF0C\u4E0B\u6B21\u8FD8\u53EF\u4EE5\u518D\u8BD5\u3002", "The fish slips away. Ruth offers you water. There is always another try."];
    }
    delete s.activeChallenge;
  } else if (e?.animalId) {
    requireState(!s.activeChallenge, "CHALLENGE_ACTIVE");
    const result = gameAnimalInteraction(before, a, spatialWorld);
    s.animalsV1 = result.memory;
    text2 = result.text;
  } else {
    requireState(!s.activeChallenge, "CHALLENGE_ACTIVE");
    requireState(e, "UNKNOWN_TARGET");
    requireState(presentEntity(s, e), "PERSON_AWAY");
    requireState(Math.hypot(s.position.x + 8 - observedActor(e, a.actorPosition).x, s.position.y + 6 - observedActor(e, a.actorPosition).y) <= 75, "TOO_FAR");
    if (a.action === "travel") {
      requireState(e.kind === "portal", "NOT_A_DOOR");
      const dest = e.destination;
      const denied = entranceFailure(s, dest);
      requireState(!denied, denied ?? "TRAVEL_ROUTE_UNAVAILABLE");
      s.scene = dest;
      const returnEntrance = rooms[dest].entities.find((portal2) => portal2.kind === "portal" && portal2.destination === before.scene);
      s.position = { ...returnEntrance?.approach ?? rooms[dest].spawn };
      if (!s.visited.includes(dest)) s.visited.push(dest);
      if (dest === "chapel") flag2(s, "chapel:visited");
      text2 = [`\u4F60\u6765\u5230${s.fieldNotes?.rooms.find((r) => r.id === dest)?.title[0] ?? rooms[dest].title[0]}\u3002`, `You arrive at ${s.fieldNotes?.rooms.find((r) => r.id === dest)?.title[1] ?? rooms[dest].title[1]}.`];
    } else if (a.action === "introduce") {
      requireState(e.person, "NOT_A_PERSON");
      requireState(!s.known.includes(e.person), "ALREADY_INTRODUCED");
      s.known.push(e.person);
      recordRelationshipMeeting(s, e.person, relationshipMinute);
      text2 = people[e.person].intro;
    } else if (a.action.startsWith("talk:")) {
      const person = e.person;
      requireState(person && s.known.includes(person), "INTRODUCE_FIRST");
      const topic3 = availableTopics(s, person).find((t3) => t3.id === a.action.slice(5));
      requireState(topic3, "TOPIC_UNAVAILABLE");
      text2 = topic3.reply;
      switch (person + ":" + topic3.id) {
        case "mara:key":
          flag2(s, "key");
          give(s, "key");
          break;
        case "mara:return-bag":
          take(s, "toolbag");
          flag2(s, "bag-returned");
          relate(s, "mara", 3);
          break;
        case "theo:bag":
          give(s, "toolbag");
          break;
        case "theo:fish":
          take(s, "fish");
          s.cash += 6;
          break;
        case "june:tools":
          give(s, "toolkit");
          break;
        case "nell:photo":
          give(s, "photo");
          break;
        case "elena:hours":
          flag2(s, "garden-agreed");
          relate(s, "elena", 2);
          break;
        case "luis:packed-snack":
          requireState(s.cash >= 4, "NOT_ENOUGH_CASH");
          s.cash -= 4;
          give(s, "packed-snack");
          break;
        case "luis:snack":
          requireState(s.cash >= 4, "NOT_ENOUGH_CASH");
          s.cash -= 4;
          s.energy = Math.min(100, s.energy + 30);
          break;
        case "luis:water":
          s.energy = Math.min(100, s.energy + 10);
          break;
      }
      applyNeighborTopic(s, person, topic3.id);
      applyPriestTopic(s, person, topic3.id);
      applyGrowthTopic(s, person, topic3.id, relationshipMinute);
      applyBattleTopic(s, person, topic3.id);
      applyNextTopic(s, person, topic3.id);
      applyNomadTopic(s, person, topic3.id);
      applyLifeTopic(s, person, topic3.id);
      applyNewsTopic(s, person, topic3.id);
      if (topic3.once) flag2(s, `talk:${person}:${topic3.id}`);
    } else if (a.action.startsWith("relationship-observe:")) {
      text2 = applyGrowthObservation(s, e.id, a.action.slice("relationship-observe:".length), relationshipMinute);
    } else if ((cropVerbs.includes(a.action) || shopVerbs.includes(a.action)) && e.actions?.includes(a.action)) {
      text2 = applyCrop(s, e.id, a.action);
      if (a.action === "water-crop" || a.action === "harvest-crop" || a.action.startsWith("plant:")) {
        advanceAwake(s, 10);
        advanceTown(s, 10);
      }
    } else if (a.action.startsWith("neighbor-")) {
      requireState(e.actions?.includes(a.action), "ACTION_UNAVAILABLE");
      text2 = applyNeighborAction(s, a.action);
    } else if (a.action.startsWith("chapel-")) {
      requireState(e.actions?.includes(a.action), "ACTION_UNAVAILABLE");
      text2 = applyChapelAction(s, a.action);
    } else if (a.action.startsWith("challenge-start:")) {
      requireState(!s.turnBattle, "BATTLE_EXISTS");
      const kind = a.action.slice(16);
      requireState(e.person === "idris" && s.scene === "gym" && ["sparring", "footwork", "endurance"].includes(kind) || e.person === "ruth" && s.scene === "dock" && kind === "fishing" || e.id === "terrace" && kind === "repair" && !has(s, "terrace-fixed") || e.id === "old-map" && kind === "map" && !has(s, "alternative-route"), "CHALLENGE_UNAVAILABLE");
      if (["sparring", "footwork", "endurance", "fishing"].includes(kind)) requireState(s.energy >= 10, "REST_NEEDED");
      if (e.person) requireState(s.known.includes(e.person), "INTRODUCE_FIRST");
      s.activeChallenge = { id: a.action_id, kind, scene: s.scene };
      text2 = ["\u51C6\u5907\u597D\u4E86\u5C31\u5F00\u59CB\uFF0C\u4E5F\u53EF\u4EE5\u968F\u65F6\u9000\u51FA\u3002", "Start when you\u2019re ready. You can leave at any time."];
    } else {
      requireState(e.actions?.includes(a.action), "ACTION_UNAVAILABLE");
      requireState(!has(s, a.action), "ALREADY_DONE");
      switch (a.action) {
        case "unpack":
          requireState(has(s, "key"), "KEY_NEEDED");
          flag2(s, "unpacked");
          text2 = ["\u884C\u674E\u653E\u5230\u4E86\u5E8A\u8FB9\u3002\u7A97\u5916\u6709\u676F\u789F\u78B0\u54CD\u3002\u623F\u95F4\u662F\u4F60\u7684\u4E86\u2014\u2014\u53EF\u4EE5\u53BB\u770B\u770B\u5C0F\u9547\u3002", "Your bag rests beside the bed. Cups clink somewhere outside. The room is yours. Time to see a little of town."];
          break;
        case "sleep":
          s.energy = 100;
          s.awakeMinutes = 0;
          text2 = ["\u4E00\u89C9\u9192\u6765\uFF0C\u7A97\u5916\u53C8\u6709\u4E86\u6668\u5149\u3002\u4ECA\u5929\u53EF\u4EE5\u6162\u6162\u5F00\u59CB\u3002", "You wake to morning light. There is room to start slowly today."];
          break;
        case "water-fern":
          requireState(s.fernStartedAt === void 0, "ALREADY_DONE");
          s.fernStartedAt = townMinutes(s);
          text2 = ["\u6C34\u6E17\u8FDB\u571F\u91CC\uFF0C\u5C0F\u53F6\u8F7B\u8F7B\u6643\u4E86\u6643\u3002\u51E0\u4E2A\u5C0F\u65F6\u540E\u518D\u6765\u770B\uFF0C\u4E0D\u5FC5\u5B88\u7740\u5B83\u3002", "Water sinks into the soil. A small frond trembles. Come back in a few hours; you needn\u2019t stay and watch."];
          break;
        case "rest":
          s.energy = 100;
          s.awakeMinutes = Math.max(0, (s.awakeMinutes ?? 0) - 360);
          text2 = ["\u4F60\u7761\u4E86\u4E00\u5C0F\u89C9\u3002\u7A97\u5916\u7684\u5149\u53D8\u4E86\uFF0C\u4F53\u529B\u4E5F\u6062\u590D\u4E86\u3002", "You take a nap. The light outside has shifted, and your energy returns."];
          break;
        case "read-market":
          flag2(s, "market-known");
          text2 = has(s, "route-open") ? ["\u590F\u65E5\u96C6\u5E02\u6B63\u5728\u7B49\u901A\u884C\u5B89\u6392\u7684\u6D88\u606F\u3002\u8DEF\u7EBF\u5DF2\u7ECF\u51C6\u5907\u597D\u4E86\uFF0C\u53EF\u4EE5\u628A\u597D\u6D88\u606F\u544A\u8BC9\u5927\u5BB6\u3002", "The summer market is waiting for news of access. Your route is ready; you can share the good news."] : hasCoastRoute(s) ? ["\u96C6\u5E02\u9700\u8981\u5B89\u5168\u7684\u6D77\u5CB8\u901A\u8DEF\u3002\u4F60\u5DF2\u7ECF\u627E\u5230\u53EF\u884C\u7684\u8DEF\u7EBF\uFF0C\u53BB\u706F\u5854\u786E\u8BA4\u5B89\u6392\u540E\u5C31\u80FD\u6765\u62A5\u4FE1\u3002", "The market needs safe coast access. You already have a workable route; confirm the arrangements at the lighthouse, then bring the news."] : ["\u544A\u793A\u8BF4\u590F\u65E5\u96C6\u5E02\u7F3A\u5C11\u901A\u5F80\u6D77\u8FB9\u7684\u5B89\u5168\u8DEF\u7EBF\u3002\u6865\u574F\u4E86\uFF0C\u79C1\u4EBA\u5EAD\u9662\u4E5F\u4E0D\u80FD\u9ED8\u8BA4\u501F\u9053\u3002\u4F60\u51B3\u5B9A\u5148\u53BB\u770B\u770B\u3002", "The notice says the summer market needs safe access to the coast. The bridge is damaged, and the private garden isn\u2019t a public shortcut. Worth a look."];
          break;
        case "inspect-bridge":
          flag2(s, "bridge-seen");
          text2 = ["\u4E24\u5757\u6865\u677F\u65AD\u4E86\uFF0C\u4E0B\u9762\u7684\u652F\u6491\u8FD8\u5F88\u7262\u3002\u53EF\u4EE5\u4FEE\uFF0C\u4E5F\u53EF\u4EE5\u627E\u522B\u7684\u8DEF\u3002", "Two boards have split. The supports below are sound. You could repair it\u2014or find another route."];
          break;
        case "gather-wood":
          requireState(!has(s, "wood-collected"), "ALREADY_DONE");
          give(s, "wood", 2);
          flag2(s, "wood-collected");
          text2 = ["\u4F60\u6311\u51FA\u4E24\u5757\u7ED3\u5B9E\u7684\u6728\u677F\uFF0C\u907F\u5F00\u4E86\u5DF2\u7ECF\u673D\u70C2\u7684\u90E8\u5206\u3002", "You pick out two sound planks, leaving the rotten wood behind."];
          break;
        case "repair-bridge":
          requireState(has(s, "bridge-seen") && s.items.toolkit && s.items.wood >= 2, "BRIDGE_REQUIREMENTS");
          requireState(s.energy >= 10, "REST_NEEDED");
          take(s, "wood", 2);
          s.energy -= 10;
          flag2(s, "bridge-fixed");
          s.standing += 5;
          text2 = ["\u65B0\u6865\u677F\u56FA\u5B9A\u597D\u4E86\u3002\u4F60\u8BD5\u7740\u8E29\u4E0A\u53BB\uFF0C\u6728\u5934\u7A33\u7A33\u627F\u4F4F\u4F60\u7684\u91CD\u91CF\u3002", "The new boards hold. You test your weight on them; the bridge stays steady."];
          break;
        case "inspect-garden":
          text2 = has(s, "garden-agreed") ? ["\u4FBF\u6761\u5DF2\u7ECF\u5199\u4E0A\u7EA6\u5B9A\u7684\u4E0A\u5348\u5341\u70B9\u5230\u5341\u4E8C\u70B9\u3002\u9662\u5B50\u4ECD\u662F\u4F4F\u6237\u7684\u5BB6\uFF0C\u5176\u4ED6\u65F6\u95F4\u8BF7\u8D70\u516C\u5171\u8DEF\u7EBF\u3002", "The note now shows the agreed hours, ten until noon. The garden is still a home; use a public route outside those hours."] : ["\u4FBF\u6761\u5199\u7740\uFF1A\u8BF7\u5148\u6572\u95E8\u3002\u8FD9\u662F\u4F4F\u6237\u7684\u5BB6\uFF0C\u4E0D\u662F\u516C\u5171\u901A\u9053\u3002", "The note says: Please knock. This is someone\u2019s home, not a public passage."];
          break;
        case "read-weather":
          flag2(s, "weather-read");
          text2 = has(s, "alternative-route") ? ["\u8BB0\u5F55\u672C\u4E0A\u7684\u5C0F\u8DEF\u4E0E\u4F60\u5DF2\u7ECF\u62FC\u597D\u7684\u8DEF\u7EBF\u543B\u5408\uFF1A\u4ECE\u6C14\u8C61\u7AD9\u4E0B\u65B9\u901A\u5F80\u6D77\u8FB9\u3002", "The log matches the trail you already mapped: below the weather station and down to the coast."] : ["\u8BB0\u5F55\u672C\u6807\u7740\u4E00\u6761\u907F\u5F00\u79C1\u4EBA\u9662\u5B50\u7684\u65E7\u8DEF\u3002\u5B8C\u6574\u8DEF\u7EBF\u53EF\u80FD\u5728\u8425\u5730\u7684\u65E7\u56FE\u4E0A\u3002", "The log marks an old trail clear of the private garden. The camp map may show the rest."];
          break;
        case "open-route":
          requireState(has(s, "bridge-fixed") || has(s, "alternative-route") || has(s, "garden-agreed"), "ROUTE_NOT_READY");
          flag2(s, "route-open");
          flag2(s, has(s, "bridge-fixed") ? "route-choice:bridge" : has(s, "alternative-route") ? "route-choice:trail" : "route-choice:garden");
          s.standing += 4;
          text2 = has(s, "bridge-fixed") ? ["\u6865\u8FB9\u7684\u5C01\u95ED\u724C\u6458\u4E0B\u4E86\u3002\u65B0\u8DEF\u65E2\u65B9\u4FBF\uFF0C\u4E5F\u4FDD\u4F4F\u4E86\u4F4F\u6237\u7684\u5B89\u9759\u3002", "The closure sign comes down by the bridge. Access is restored, and the residents keep their quiet."] : has(s, "alternative-route") ? ["\u6307\u8DEF\u724C\u8F6C\u5411\u4E86\u5C71\u5761\u7684\u516C\u5171\u5C0F\u8DEF\u3002\u8FDC\u4E00\u70B9\uFF0C\u4F46\u5927\u5BB6\u90FD\u80FD\u81EA\u5728\u5730\u8D70\u3002", "The sign now points along the public hillside trail. A little longer, but open to everyone."] : ["\u5165\u53E3\u6E05\u695A\u5199\u4E0B\u4E0A\u5348\u5341\u70B9\u5230\u5341\u4E8C\u70B9\u7684\u501F\u9053\u65F6\u95F4\u3002\u5EAD\u9662\u7684\u8FB9\u754C\u4FDD\u7559\u7740\u3002", "The entrance clearly states the agreed hours: ten until noon. The garden remains a home."];
          break;
        case "open-market":
          requireState(has(s, "route-open") && has(s, "market-known"), "ROUTE_NOT_READY");
          flag2(s, "market-open");
          s.standing += 8;
          text2 = ["\u644A\u4F4D\u652F\u8D77\u6765\u4E86\uFF0C\u6D77\u5CB8\u90A3\u8FB9\u4F20\u6765\u7B11\u58F0\u3002\u4F60\u6CA1\u6709\u89E3\u51B3\u9547\u4E0A\u6240\u6709\u7684\u95EE\u9898\uFF0C\u5374\u5DF2\u7ECF\u5728\u8FD9\u91CC\u7559\u4E0B\u4E86\u81EA\u5DF1\u7684\u75D5\u8FF9\u3002\u8FD9\u4E2A\u590F\u5929\u8FD8\u957F\u3002", "Stalls unfold, and laughter carries up from the coast. You haven\u2019t solved every problem in town. But you\u2019ve left a mark. There\u2019s still a whole summer ahead."];
          break;
        default:
          throw Error("ACTION_UNAVAILABLE");
      }
      if (!["rest", "sleep"].includes(a.action)) flag2(s, a.action);
    }
  }
  recordRelationshipStory(before, s, relationshipMinute);
  if ((a.action === "travel" || a.action === "travel-map") && s.scene !== before.scene) {
    const minutes = before.movingClock ? a.action === "travel-map" ? longTravelMinutes(before.scene, s.scene) : 0 : 20;
    advanceAwake(s, minutes);
    advanceTown(s, minutes);
  }
  if (s.movingClock && a.action !== "ask") delete s.movingClock.lease;
  if (a.action === "rest") advanceTown(s, 180);
  if (a.action === "sleep") sleepToMorning(s);
  recordNeighborProgress(s);
  s.energy = Math.max(0, Math.min(100, s.energy));
  s.cash = Math.max(0, Math.min(999, s.cash));
  s.standing = Math.max(0, Math.min(100, s.standing));
  s.version++;
  s.cursor++;
  s.history.push({ id: a.action_id, kind: a.action.startsWith("talk:") || a.action === "introduce" ? "talk" : "action", ...e?.person ? { person: e.person } : {}, text: text2 });
  s.history = s.history.slice(-500);
  return { head: s, text: text2 };
}

// src/game-id.ts
var GAME_UUID = "e78df027-7ef4-4d49-82eb-ea91f03d9fb3";
if (typeof window !== "undefined") window.__GAME_UUID__ = "e78df027-7ef4-4d49-82eb-ea91f03d9fb3";

// src/story/binding.ts
var key = (scene, entity, verb) => scene + "/" + entity + "/" + verb;
var rpgChapelActor = (e) => rooms.chapel.entities.includes(e) && ["dani", "samira"].includes(e.person ?? "");
function verbs(e) {
  if (e.kind === "portal") return ["travel"];
  if (e.person) return ["introduce", "ask", ...e.person === "june" && rooms.workshop.entities.includes(e) ? ["notes-generate"] : [], ...(topics[e.person] ?? []).map((t3) => "talk:" + t3.id), ...[...relationshipProfiles[e.person] ? growthTopicIds : [], ...lifeTopicIds(e.person), ...priestTopicIds(e.person), ...rpgChapelActor(e) ? chapelTopicIds : [], ...nextTopicIds(e.person), ...nomadTopicIds(e.person), ...neighborTopicIds(e.person)].map((id) => "talk:" + id), ...e.person === "idris" ? ["talk:class-invite"] : [], ...e.person === "dani" ? newsTopicIds.map((id) => "talk:" + id) : [], ...(e.person === "idris" ? ["sparring", "footwork", "endurance"] : e.person === "ruth" ? ["fishing"] : []).map((id) => "challenge-start:" + id)];
  return [...growthObservationVerbs(e.id), ...e.actions ?? [], ...e.id === "terrace" ? ["challenge-start:repair"] : e.id === "old-map" ? ["challenge-start:map"] : []];
}
var entityDefs = Object.values(rooms).flatMap((r) => r.entities.map((e) => ({
  id: r.id + "/" + e.id,
  scene: r.id,
  position: { x: e.at.x - 8, y: e.at.y - 6 },
  approach: e.approach,
  states: ["present"],
  actions: verbs(e).map((v) => key(r.id, e.id, v))
})));
var rules = Object.values(rooms).flatMap((r) => r.entities.flatMap((e) => verbs(e).map((v) => ({ id: key(r.id, e.id, v), effects: e.destination ? [{ type: "map", nodeId: e.destination }] : [] }))));
var initialMap = Object.values(rooms).map((r) => ({ id: r.id, current: r.id === "station" }));
var characters = Object.keys(people).map((id) => ({ id }));
var spatialBinding = compileSpatialBinding({ id: GAME_UUID, initialMap, characters, domainRules: { rules } }, {
  version: 1,
  cartridgeId: GAME_UUID,
  mapVersion: "harbor-map-v1",
  actionScope: "scene",
  interactionDistance: 75,
  scenes: Object.values(rooms).map((r) => ({ id: r.id, spawn: r.spawn })),
  entities: entityDefs,
  characters: characters.map((p) => ({ id: p.id, kind: "physical", travels: !!residentRoutes[p.id], entities: Object.values(rooms).flatMap((r) => r.entities.filter((e) => e.person === p.id).map((e) => r.id + "/" + e.id)) })),
  portals: Object.values(rooms).flatMap((r) => r.entities.filter((e) => e.destination).map((e) => ({
    actionId: key(r.id, e.id, "travel"),
    fromScene: r.id,
    scene: e.destination,
    position: rooms[e.destination].entities.find((back) => back.destination === r.id)?.approach ?? rooms[e.destination].spawn
  })))
}, (scene, p) => walkable(world, scene, p));
var spatialSnapshot = (s) => ({ cartridgeId: GAME_UUID, map: initialMap.map((r) => ({ id: r.id, current: r.id === s.scene })), characters: s.known.filter((id) => people[id]).map((id) => ({ id })) });
function admitSpatialAction(s, a, spatialWorld) {
  if (a.action.startsWith("battle-") || a.action === "snack-eat" || ["travel-map", "challenge-finish", "fishing:confirm", "fishing:withdraw", "fishing-kit:claim", "fishing:start", "fishing:land"].includes(a.action)) return null;
  const e = rooms[s.scene].entities.find((e2) => e2.id === a.target);
  if (e && !presentEntity(s, e)) throw Error("PERSON_AWAY");
  const actionKey = key(s.scene, a.target, a.action);
  if (e?.animalId) gameAnimalInteraction(s, a, spatialWorld);
  const at = e?.animalId ? a.actorPosition : e ? observedActor(e, a.actorPosition) : null;
  const offset = e && at ? { x: at.x - e.at.x, y: at.y - e.at.y } : { x: 0, y: 0 };
  if (!spatialBinding.admits(actionKey, s.scene + "/" + a.target, s.scene, { x: a.position.x - offset.x, y: a.position.y - offset.y })) throw Error("SPATIAL_ACTION_NOT_ADMITTED");
  return actionKey;
}

// server/runtime.ts
var createRuntime = (resolveDialogue, notes, motion, options = {}) => ({
  initial: initial2,
  upgrade: (s) => s,
  scene: (s) => s.scene,
  assertReadable(s) {
    if (!s || !validFishingMemory(s) || !validNeighborChapter(s) || !validChapelState(s) || !validPriestState(s) || !validClock(s) || !validRelationshipGrowth(s) || !validNomadMemory(s) || !validAnimalSave(s.animalsV1, animals, s.townMinutes ?? 540) || !validTurnBattle(s) || !validNewsState(s) || !validPlots(s) || s.awakeMinutes !== void 0 && (!Number.isSafeInteger(s.awakeMinutes) || s.awakeMinutes < 0) || s.townMinutes !== void 0 && (!Number.isSafeInteger(s.townMinutes) || s.townMinutes < 0) || s.fernStartedAt !== void 0 && (!Number.isSafeInteger(s.fernStartedAt) || s.fernStartedAt < 0 || s.fernStartedAt > (s.townMinutes ?? 540)) || s.mapVersion !== 1 || !s.id || !Number.isSafeInteger(s.version) || !world.scenes[s.scene] || !Array.isArray(s.flags) || !Array.isArray(s.known) || !walkable(dynamicWorld(s.flags, !!requestContext.getStore()?.dynamicGeometry), s.scene, s.position)) throw Error("UNSUPPORTED_SAVE");
  },
  spatialContext(s) {
    if (s.movingClock) throw Error("MOTION_CHECKPOINT_REQUIRED");
    return s;
  },
  position(s, p) {
    if (!p || !walkable(dynamicWorld(s.flags, !!requestContext.getStore()?.dynamicGeometry), s.scene, p)) throw Error("INVALID_POSITION");
    return { x: p.x, y: p.y };
  },
  validateAction(a) {
    if (!a || typeof a.action !== "string" || a.action.length > 160 || typeof a.target !== "string" || a.target.length > 160 || !a.position || !Number.isFinite(a.position.x) || !Number.isFinite(a.position.y)) throw Error("INVALID_ACTION");
  },
  async prepare(s, a, _cancel, context) {
    if (a.action.startsWith("candidate-")) {
      if (!motion) throw Error("CANDIDATE_CLOSED");
      if (a.action !== "candidate-clock-enable" && s.movingClock?.transport) throw Error("MOTION_CHANNEL_REQUIRED");
      return motion(s, a);
    }
    if (s.movingClock && Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y) > 4) throw Error("UNVERIFIED_POSITION");
    if (!walkable(dynamicWorld(s.flags, !!requestContext.getStore()?.dynamicGeometry), s.scene, a.position)) throw Error("INVALID_POSITION");
    const actionWorld = dynamicWorld(s.flags, !!requestContext.getStore()?.dynamicGeometry);
    if (a.action === "weather-after-rain") {
      if (!options.afterRainResolve) throw Error("AFTER_RAIN_CLOSED");
      const gate2 = { ...a, action: "ask", payload: { text: "What changed after the recent rain?" } };
      const bound = admitSpatialAction(s, gate2, actionWorld), { person } = validateQuestion(s, gate2);
      const text2 = options.afterRainResolve(s, a, person), head = structuredClone(s);
      head.position = { ...a.position };
      head.version++;
      head.cursor++;
      head.history.push({ id: a.action_id, kind: "talk", person, text: text2 });
      head.history = head.history.slice(-500);
      spatialBinding.assertTransition(spatialSnapshot(s), spatialSnapshot(head), bound, s.scene);
      return { head, text: text2, kind: "action", accepted: true, actionId: a.action };
    }
    assertFishingStartAllowed(a.action, options.fishingNewStarts ?? FISHING_NEW_STARTS);
    const boundKey = admitSpatialAction(s, a, actionWorld);
    if (a.action === "notes-generate" || a.action === "notes-observe") {
      if (!notes) throw Error("NOTES_UNAVAILABLE");
      return a.action === "notes-generate" ? notes.generate(s, a, context.owner) : notes.observe(s, a, context.owner);
    }
    const question = a.action === "ask" ? validateQuestion(s, a) : void 0;
    const defer = question ? nomadDeferral(question.person, s) : void 0;
    const resolution = a.action === "ask" && !defer ? resolveDialogue ? await resolveDialogue(s, a, context.owner) : void 0 : void 0;
    const result = applyAction(s, defer ? { ...a, action: "talk:nomads-v1-defer" } : a, resolution, actionWorld, options.relationshipClock ?? townMinutes);
    if (defer) result.head.history.at(-1).question = question.question;
    if (notes && result.head.scene !== s.scene) await notes.travel(s, result.head, context.owner);
    if (a.action !== "travel-map" && !a.action.startsWith("battle-") && a.action !== "snack-eat") spatialBinding.assertTransition(spatialSnapshot(s), spatialSnapshot(result.head), boundKey, s.scene);
    return { ...result, kind: "action", accepted: true, actionId: a.action };
  },
  preserveConcurrent(next, _current) {
    return next;
  }
});
var runtime = createRuntime();

// _qa/in-process-http.ts
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
function inProcessHttp(handler, close) {
  const previous = globalThis.fetch, url = "http://127.0.0.1:49161";
  const fetchImpl = (async (input, init) => {
    const request2 = new Request(input, init), at = new URL(request2.url);
    if (at.origin !== url) throw Error("QA_EXTERNAL_NETWORK_DISABLED");
    const bytes = Buffer.from(await request2.arrayBuffer()), req = Readable.from(bytes.length ? [bytes] : []);
    req.url = at.pathname + at.search;
    req.method = request2.method;
    req.headers = Object.fromEntries(request2.headers);
    const res = new EventEmitter();
    let status = 200, body = Buffer.alloc(0);
    const headers = new Headers();
    res.writableEnded = false;
    res.headersSent = false;
    res.destroyed = false;
    res.setHeader = (k, v) => headers.set(k, v);
    res.getHeader = (k) => headers.get(k);
    res.writeHead = (code, h = {}) => {
      status = code;
      for (const [k, v] of Object.entries(h)) headers.set(k, v);
      res.headersSent = true;
    };
    res.end = (chunk) => {
      body = Buffer.from(chunk ?? "");
      res.writableEnded = true;
    };
    await handler(req, res);
    if (!res.writableEnded) throw Error("QA_HTTP_RESPONSE_NOT_ENDED");
    return new Response(body, { status, headers });
  });
  globalThis.fetch = fetchImpl;
  return { url, async close() {
    globalThis.fetch = previous;
    await close();
  } };
}

// _qa/temporary-account-server.ts
async function makeDemoServer({ directory, delayDialogue, media, port = 0, providedStore, providedRuntime, newsProject, lifeProject, landProject, dynamicAssets, decorateAuthority, accountOnly = false, gatewayFixture = false, mode = "temporary-unverified", verifyPlatformToken }) {
  mkdirSync(directory, { recursive: true });
  const store = providedStore ?? openAsyncSqliteAuthorityStore({ path: join(directory, "authority.sqlite"), worldId: GAME_UUID, gameId: GAME_UUID, environment: "test" });
  const runtime2 = providedRuntime ?? createRuntime(async () => {
    await delayDialogue?.();
    return { topic: null, reply: ["\u6D77\u98CE\u5F88\u8212\u670D\u3002", "The sea breeze feels good."] };
  });
  const usage = { status: async () => ({ resetAt: 0, dialogue: { remaining: 10, maximum: 10, pending: 0, retryAt: null } }), reserve: async () => {
  }, settle: async () => {
  } };
  const api = createTemporaryAccountTransport({ mode, verifyPlatformToken, accountOnly, gameId: GAME_UUID, store, runtime: runtime2, usage, decorateAuthority, newsProject, lifeProject, landProject, dynamicAssets, noteMedia: media ?? { status: async () => ({ status: "not-started" }), ensure: async () => ({ status: "not-started" }), image: async () => ({ bytes: Buffer.from("fixture only"), type: "text/plain" }) } });
  const handler = async (req, res) => {
    try {
      req.url = req.url?.replace("/" + GAME_UUID, "");
      const origin = req.headers.origin;
      if (origin && !(gatewayFixture && origin === "https://game.aiwaves.tech") && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return json(res, 403, { error: "ORIGIN_REJECTED" });
      if (gatewayFixture) {
        const owner2 = req.headers["x-harbor-owner"];
        if (typeof owner2 !== "string" || !/^[a-f0-9]{64}$/.test(owner2)) return json(res, 401, { error: "EDGE_IDENTITY_REQUIRED" });
        return await api(req, res, owner2);
      }
      let cap = req.headers.cookie?.match(/(?:^|;\s*)harbor_demo=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (req.url === "/api/bootstrap" && req.method === "POST" && !cap) {
        cap = randomBytes(32).toString("hex");
        res.setHeader("Set-Cookie", `harbor_demo=${cap}; HttpOnly; SameSite=Strict; Path=/`);
      }
      if (!cap) return json(res, 401, { error: "BROWSER_POSSESSION_REQUIRED" });
      if (!req.headers["x-harbor-game"]) req.headers["x-harbor-game"] = GAME_UUID;
      return await api(req, res, createHash3("sha256").update(cap).digest("hex"));
    } catch (e) {
      if (!res.headersSent && !res.destroyed) json(res, e.status ?? 400, { error: e.code ?? e.message, terminal: e.message !== "REQUEST_IDENTITY_CANCELLED" });
    }
  };
  if (process.env.HARBOR_QA_IN_PROCESS_HTTP === "1") return { ...inProcessHttp(handler, () => store.close()), store };
  const server = createServer(handler);
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const addr = server.address();
  return { url: `http://127.0.0.1:${addr.port}`, store, async close() {
    await new Promise((r) => server.close(() => r()));
    await store.close();
  } };
}
if (process.argv.includes("--serve")) {
  const server = await makeDemoServer({ directory: ".data/temporary-account-demo", port: 5260 });
  console.log(JSON.stringify({ url: server.url, syntheticOnly: true, identity: "temporary-unverified" }));
}

// src/life/ornamental-fern.ts
var ok = (v, e) => {
  if (!v) throw Error(e);
};
var obj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var exact2 = (v, keys4) => Object.keys(v).sort().join(",") === [...keys4].sort().join(",");
var integer2 = (v, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= 0 && v <= max;
var aid = (v) => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
var fernEligible = (s) => s.known.includes("mara") && ["key", "unpacked", "bag-returned"].every((f2) => s.flags.includes(f2)) && s.visited.includes("home");
function assertOrnamentalFernReadable(s) {
  const root = s.ornamentalFernV1, owned = s.flags.filter((f2) => f2 === fernOwnedFlag).length, displayed = s.flags.filter((f2) => f2 === fernDisplayFlag).length, bad = "UNSUPPORTED_ORNAMENTAL_FERN_SAVE", now2 = s.townMinutes ?? 540;
  if (root === void 0) {
    ok(!owned && !displayed, bad);
    return;
  }
  ok(obj(root) && exact2(root, root.plant === void 0 ? ["schema", "rules", "offer"] : ["schema", "rules", "offer", "plant"]) && root.schema === 1 && root.rules === fernRules && fernEligible(s), bad);
  ok(obj(root.offer) && exact2(root.offer, ["actionId", "minute"]) && aid(root.offer.actionId) && integer2(root.offer.minute, now2), bad);
  const p = root.plant;
  if (p === void 0) {
    ok(!owned && !displayed, bad);
    return;
  }
  ok(obj(p) && exact2(p, p.moveCount === 0 ? ["id", "ownerJourney", "source", "ageMinutesAtGrant", "holder", "moveCount"] : ["id", "ownerJourney", "source", "ageMinutesAtGrant", "holder", "moveCount", "lastMove"]), bad);
  ok(obj(p.source) && exact2(p.source, ["actionId", "minute", "event"]) && p.source.event === fernGiftEvent && aid(p.source.actionId) && p.source.actionId !== root.offer.actionId && integer2(p.source.minute, now2) && p.source.minute >= root.offer.minute && p.id === "potted-fern:" + p.source.actionId && p.ownerJourney === s.id && p.ageMinutesAtGrant === 1440 && integer2(p.moveCount) && p.moveCount <= Math.floor((now2 - p.source.minute) / 20) && p.holder === (p.moveCount % 2 ? fernSlot.id : "bag") && owned === 1 && displayed === (p.holder === fernSlot.id ? 1 : 0), bad);
  if (p.moveCount) {
    const m = p.lastMove;
    ok(obj(m) && exact2(m, ["actionId", "minute", "to"]) && aid(m.actionId) && ![root.offer.actionId, p.source.actionId].includes(m.actionId) && integer2(m.minute, now2) && m.minute >= p.source.minute + p.moveCount * 20 && m.to === p.holder, bad);
  }
}
var overlap3 = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function applyOrnamentalFern(previous, verb, actionId, world3, newStarts = true) {
  assertOrnamentalFernReadable(previous);
  ok(fernVerbs.includes(verb) && aid(actionId), "ORNAMENTAL_FERN_ACTION");
  ok(!previous.activeChallenge && !battleLocksWorld(previous), "CHALLENGE_ACTIVE");
  const s = structuredClone(previous), now2 = s.townMinutes ?? 540;
  let text2;
  if (verb === "read-offer") {
    ok(newStarts, "ORNAMENTAL_FERN_STARTS_CLOSED");
    ok(fernEligible(s), "ORNAMENTAL_FERN_SETTLE_FIRST");
    ok(!s.ornamentalFernV1, "ORNAMENTAL_FERN_OFFER_READ");
    s.ornamentalFernV1 = { schema: 1, rules: fernRules, offer: { actionId, minute: now2 } };
    text2 = ["\u201C\u6211\u53E6\u5907\u4E86\u4E00\u76C6\u5DF2\u7ECF\u957F\u597D\u7684\u5C0F\u8568\uFF0C\u60F3\u5E26\u56DE\u79DF\u5C4B\u5417\uFF1F\u8FD9\u662F\u7ED9\u4F60\u7684\uFF0C\u4E0D\u662F\u82B1\u56ED\u90A3\u682A\u3002\u623F\u95F4\u53F3\u4FA7\u6709\u4E2A\u4F4D\u7F6E\uFF1B\u4EE5\u540E\u653E\u4E0B\u6216\u6536\u56DE\uFF0C\u6BCF\u6B21\u89814\u7CBE\u529B\u300120\u6E38\u620F\u5206\u949F\uFF0C\u4E0D\u82B1\u94B1\uFF0C\u4E5F\u4E0D\u9700\u8981\u6D47\u6C34\u3002\u4F60\u53EF\u4EE5\u4EE5\u540E\u518D\u51B3\u5B9A\u3002\u201D", "\u201CI have a separate, fully grown potted fern for you, if you would like it. It is not the garden fern. There is a spot on the right side of your room. Placing it or taking it back costs 4 energy and 20 game minutes each time, with no cash cost or watering. You can decide later.\u201D"];
  } else if (verb === "accept") {
    ok(newStarts, "ORNAMENTAL_FERN_STARTS_CLOSED");
    ok(fernEligible(s), "ORNAMENTAL_FERN_SETTLE_FIRST");
    ok(s.ornamentalFernV1, "ORNAMENTAL_FERN_OFFER_FIRST");
    ok(!s.ornamentalFernV1.plant, "ORNAMENTAL_FERN_ALREADY_OWNED");
    ok(s.ornamentalFernV1.offer.actionId !== actionId, "ORNAMENTAL_FERN_ACTION");
    s.ornamentalFernV1.plant = { id: "potted-fern:" + actionId, ownerJourney: s.id, source: { event: fernGiftEvent, actionId, minute: now2 }, ageMinutesAtGrant: 1440, holder: "bag", moveCount: 0 };
    s.flags.push(fernOwnedFlag);
    text2 = ["\u739B\u62C9\u628A\u53E6\u5907\u7684\u76C6\u8568\u4EA4\u7ED9\u4F60\u3002\u5B83\u5DF2\u653E\u8FDB\u884C\u56CA\uFF0C\u5C5E\u4E8E\u8FD9\u4E2A\u65C5\u7A0B\uFF1B\u56DE\u79DF\u5C4B\u540E\u53EF\u8D70\u5230\u623F\u95F4\u53F3\u4FA7\u7684\u4F4D\u7F6E\u6446\u653E\u3002\u9886\u53D6\u4E0D\u989D\u5916\u8017\u7CBE\u529B\u3001\u65F6\u95F4\u6216\u73B0\u91D1\u3002", "Mara gives you the separate potted fern. It is now in your bag, yours for this journey. Back in Your Room, approach the spot on the right to place it. Accepting adds no energy, time or cash cost."];
  } else {
    const p = s.ornamentalFernV1?.plant;
    ok(p, "ORNAMENTAL_FERN_NOT_OWNED");
    ok(s.scene === fernSlot.scene && fernEligible(s), "ORNAMENTAL_FERN_ROOM");
    const to = verb === "place" ? fernSlot.id : "bag";
    ok(p.holder !== to, "ORNAMENTAL_FERN_ALREADY_THERE");
    ok(![s.ornamentalFernV1.offer.actionId, p.source.actionId, p.lastMove?.actionId].includes(actionId), "ORNAMENTAL_FERN_ACTION");
    ok(s.energy >= 4, "REST_NEEDED");
    ok(Number.isSafeInteger(now2 + 20), "ORNAMENTAL_FERN_TIME");
    if (verb === "place") {
      const scene = world3.scenes.home, foot = fernSlot.footprint;
      ok(!!scene && foot.x >= scene.interior.x && foot.y >= scene.interior.y && foot.x + foot.w <= scene.interior.x + scene.interior.w && foot.y + foot.h <= scene.interior.y + scene.interior.h, "ORNAMENTAL_FERN_SLOT");
      ok(!scene.obstacles.some((b) => overlap3(foot, b)), "ORNAMENTAL_FERN_OCCUPIED");
      ok(!overlap3(foot, { ...s.position, ...world3.actor }), "ORNAMENTAL_FERN_PLAYER_SPACE");
      const occupied = { ...world3, scenes: { ...world3.scenes, home: { ...scene, obstacles: [...scene.obstacles, foot] } } };
      ok(walkable(occupied, "home", fernSlot.approach) && findPath(occupied, "home", s.position, fernSlot.approach).length > 0, "ORNAMENTAL_FERN_UNREACHABLE");
    }
    s.energy -= fernMoveCost.energy;
    advanceAwake(s, fernMoveCost.minutes);
    s.townMinutes = now2 + fernMoveCost.minutes;
    p.holder = to;
    p.moveCount++;
    p.lastMove = { actionId, minute: s.townMinutes, to };
    s.flags = s.flags.filter((f2) => f2 !== fernDisplayFlag);
    if (to === fernSlot.id) s.flags.push(fernDisplayFlag);
    text2 = verb === "place" ? ["\u76C6\u8568\u5B89\u653E\u5728\u623F\u95F4\u53F3\u4FA7\u3002\u5B83\u4ECD\u662F\u739B\u62C9\u8D60\u4F60\u7684\u540C\u4E00\u682A\u3002\u6D88\u80174\u7CBE\u529B\u300120\u6E38\u620F\u5206\u949F\uFF0C\u73B0\u91D1\u4E0D\u53D8\uFF1B\u539F\u6709\u75B2\u52B3\u7167\u5E38\u7ED3\u7B97\u3002", "The fern is placed on the right side of your room, the same plant Mara gave you. Cost: 4 energy and 20 game minutes, no cash. Existing fatigue still applies."] : ["\u4F60\u628A\u540C\u4E00\u76C6\u8568\u6536\u56DE\u884C\u56CA\uFF0C\u623F\u5185\u4F4D\u7F6E\u7A7A\u51FA\u6765\u4E86\u3002\u6D88\u80174\u7CBE\u529B\u300120\u6E38\u620F\u5206\u949F\uFF0C\u73B0\u91D1\u4E0D\u53D8\uFF1B\u539F\u6709\u75B2\u52B3\u7167\u5E38\u7ED3\u7B97\u3002", "You return the same potted fern to your bag, leaving its room spot empty. Cost: 4 energy and 20 game minutes, no cash. Existing fatigue still applies."];
  }
  assertOrnamentalFernReadable(s);
  return { head: s, text: text2 };
}

// server/ornamental-fern.ts
import { AuthorityError as AuthorityError2 } from "../../vendor/dynamic-runtime/packages/authority-session/error.mjs";
var ornamentalFernFailures = ["ORNAMENTAL_FERN_ACTION", "ORNAMENTAL_FERN_STARTS_CLOSED", "ORNAMENTAL_FERN_SETTLE_FIRST", "ORNAMENTAL_FERN_OFFER_READ", "ORNAMENTAL_FERN_OFFER_FIRST", "ORNAMENTAL_FERN_ALREADY_OWNED", "ORNAMENTAL_FERN_NOT_OWNED", "ORNAMENTAL_FERN_ROOM", "ORNAMENTAL_FERN_ALREADY_THERE", "ORNAMENTAL_FERN_SLOT", "ORNAMENTAL_FERN_OCCUPIED", "ORNAMENTAL_FERN_PLAYER_SPACE", "ORNAMENTAL_FERN_UNREACHABLE", "ORNAMENTAL_FERN_TARGET"];
function withOrnamentalFern(assembly, { newStarts = true } = {}) {
  const parse = (a) => {
    const verb = a.action.slice(5);
    if (!fernVerbs.includes(verb) || a.payload !== void 0) throw Error("ORNAMENTAL_FERN_ACTION");
    return verb;
  };
  const runtime2 = {
    ...assembly.runtime,
    assertReadable(s) {
      assembly.runtime.assertReadable(s);
      try {
        assertOrnamentalFernReadable(s);
      } catch (error) {
        if (error.message === "UNSUPPORTED_ORNAMENTAL_FERN_SAVE") throw Object.assign(Error("UNSUPPORTED_ORNAMENTAL_FERN_SAVE"), { code: "UNSUPPORTED_ORNAMENTAL_FERN_SAVE", status: 503, terminal: false });
        throw error;
      }
    },
    validateAction(a) {
      assembly.runtime.validateAction(a);
      if (a.action.startsWith("fern:")) try {
        parse(a);
      } catch (e) {
        throw new AuthorityError2(e.message, 409);
      }
    },
    async prepare(s, a, ...args) {
      this.assertReadable(s);
      if (!a.action.startsWith("fern:")) {
        const result = await assembly.runtime.prepare(s, a, ...args);
        this.assertReadable(result.head);
        return result;
      }
      try {
        const verb = parse(a);
        if (a.expected_version !== s.version) throw Error("VERSION_CONFLICT");
        if (a.scene !== s.scene || !s.visited.includes(s.scene)) throw Error("SCENE_MISMATCH");
        if ((s.movingClock || s.activePlayClock) && Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y) > 4) throw Error("UNVERIFIED_POSITION");
        const world3 = landWorld(dynamicWorld(s.flags, !!s.dynamicAssetRooms), s.landV1);
        if (!walkable(world3, s.scene, a.position)) throw Error("INVALID_POSITION");
        const gifting = verb === "read-offer" || verb === "accept", entity = gifting ? rooms[s.scene].entities.find((e) => e.person === "mara") : rooms[s.scene].entities.find((e) => e.id === fernSlot.id);
        if (!entity || a.target !== entity.id || !gifting && s.scene !== fernSlot.scene) throw Error("ORNAMENTAL_FERN_TARGET");
        if (!presentEntity(s, entity)) throw Error("PERSON_AWAY");
        const at = observedActor(entity, a.actorPosition);
        if (Math.hypot(a.position.x + 8 - at.x, a.position.y + 6 - at.y) > 65) throw Error("TOO_FAR");
        const result = applyOrnamentalFern({ ...s, position: { ...a.position } }, verb, a.action_id, world3, newStarts);
        result.head.version = s.version + 1;
        result.head.cursor = s.cursor + 1;
        if (result.head.animalNotebookV1?.sample) delete result.head.animalNotebookV1.sample;
        result.head.history.push({ id: a.action_id, kind: gifting ? "talk" : "action", ...gifting ? { person: "mara" } : {}, text: result.text });
        result.head.history = result.head.history.slice(-500);
        this.assertReadable(result.head);
        return { ...result, kind: a.action, accepted: true, actionId: a.action };
      } catch (error) {
        if (error instanceof Error && (ornamentalFernFailures.includes(error.message) || ["REST_NEEDED", "VERSION_CONFLICT", "SCENE_MISMATCH", "UNVERIFIED_POSITION", "INVALID_POSITION", "PERSON_AWAY", "TOO_FAR", "CHALLENGE_ACTIVE"].includes(error.message))) throw new AuthorityError2(error.message, 409);
        throw error;
      }
    }
  };
  return { ...assembly, runtime: runtime2, lifeProject: (s) => {
    runtime2.assertReadable(s);
    return { ...assembly.lifeProject(s), ornamentalFern: { enabled: true, newStarts, eligible: fernEligible(s) } };
  } };
}

// src/life/registry.ts
import { createHash as createHash4 } from "node:crypto";
var KEYS = ["id", "revision", "capability", "name", "condition", "actions", "wetMinutes", "growMinutes", "seedCost", "yield", "salePrice", "output", "uses", "saleSink", "assets"].sort();
var integer3 = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
var canonical = (value) => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]" : value && typeof value === "object" ? "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}" : JSON.stringify(value);
var definitionHash = (def) => createHash4("sha256").update(canonical(def)).digest("hex");
var mechanicalSignature = ({ id: _id, revision: _revision, name: _name, assets: _assets, ...rules2 }) => canonical(rules2);
function validateCropDefinition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("CONTENT_SHAPE");
  const d = value;
  if (JSON.stringify(Object.keys(d).sort()) !== JSON.stringify(KEYS)) throw Error("CONTENT_FIELDS");
  if (!/^crop:[a-z][a-z0-9-]{1,39}$/.test(d.id) || !integer3(d.revision, 1, 100)) throw Error("CONTENT_ID");
  if (d.capability !== "watered-crop-v1" || d.condition !== "cultivated-bed-v1" || JSON.stringify(d.actions) !== '["plant","water","harvest"]' || d.output !== "produce" || JSON.stringify(d.uses) !== '["sell","save-seed","resident-order"]' || d.saleSink !== "crop-counter") throw Error("CAPABILITY_UNAVAILABLE");
  if (!Array.isArray(d.name) || d.name.length !== 2 || d.name.some((n) => typeof n !== "string" || !n.trim() || n.length > 64)) throw Error("CONTENT_NAME");
  if (!integer3(d.wetMinutes, 720, 720) || !integer3(d.growMinutes, 60, 4320) || !integer3(d.seedCost, 1, 25) || !integer3(d.yield, 1, 6) || !integer3(d.salePrice, 1, 10) || d.yield * d.salePrice - d.seedCost > 12) throw Error("ECONOMY_BOUND");
  if (!Array.isArray(d.assets) || d.assets.length > 8 || d.assets.some((a) => typeof a !== "string" || !/^asset:[a-zA-Z0-9_.:@-]{1,120}$/.test(a))) throw Error("ASSET_REF");
}
var legacyDefinitions = [
  { id: "crop:radish", name: ["\u841D\u535C", "Radish"], growMinutes: 360, seedCost: 3, yield: 2, salePrice: 3 },
  { id: "crop:basil", name: ["\u7F57\u52D2", "Basil"], growMinutes: 720, seedCost: 5, yield: 3, salePrice: 3 },
  { id: "crop:tomato", name: ["\u756A\u8304", "Tomato"], growMinutes: 1440, seedCost: 8, yield: 4, salePrice: 4 }
].map((d) => ({ ...d, name: d.name, revision: 1, capability: "watered-crop-v1", condition: "cultivated-bed-v1", actions: ["plant", "water", "harvest"], wetMinutes: 720, output: "produce", uses: ["sell", "save-seed", "resident-order"], saleSink: "crop-counter", assets: [] }));
var snapPeaDefinition = { id: "crop:snap-pea", revision: 1, capability: "watered-crop-v1", name: ["\u8106\u835A", "Snap peas"], condition: "cultivated-bed-v1", actions: ["plant", "water", "harvest"], wetMinutes: 720, growMinutes: 720, seedCost: 6, yield: 3, salePrice: 4, output: "produce", uses: ["sell", "save-seed", "resident-order"], saleSink: "crop-counter", assets: [] };
var ContentRegistry = class {
  constructor(defs = [], logicFixtureEnabled = /* @__PURE__ */ new Set()) {
    this.logicFixtureEnabled = logicFixtureEnabled;
    this.logicFixtureEnabled = new Set(logicFixtureEnabled);
    for (const d of legacyDefinitions) {
      const c = crops[d.id.slice(5)];
      if (!c || c.minutes !== d.growMinutes || c.cost !== d.seedCost || c.yield !== d.yield || c.price !== d.salePrice) throw Error("LEGACY_ENGINE_DRIFT");
    }
    for (const d of [...legacyDefinitions, ...defs]) this.add(d);
  }
  logicFixtureEnabled;
  entries = /* @__PURE__ */ new Map();
  add(value) {
    validateCropDefinition(value);
    const d = structuredClone(value), legacy = legacyDefinitions.find((l) => l.id === d.id);
    if (legacy && definitionHash(d) !== definitionHash(legacy)) throw Error("LEGACY_ID_LOCKED");
    const key2 = d.id + "@" + d.revision, hash2 = definitionHash(d), old = this.entries.get(key2);
    if (old && old.ref.hash !== hash2) throw Error("CONTENT_REVISION_CONFLICT");
    if ([...this.entries.values()].some((e) => e.def.id !== d.id && mechanicalSignature(e.def) === mechanicalSignature(d))) throw Error("COSMETIC_SPECIES_DUPLICATE");
    const freeze5 = (v) => {
      if (v && typeof v === "object") {
        Object.values(v).forEach(freeze5);
        Object.freeze(v);
      }
      return v;
    };
    this.entries.set(key2, freeze5({ ref: { id: d.id, revision: d.revision, hash: hash2, capability: d.capability }, def: d }));
  }
  ref(id, revision = 1) {
    const e = this.entries.get(id + "@" + revision);
    if (!e) throw Error("UNKNOWN_CONTENT");
    return { ...e.ref };
  }
  get(ref) {
    const e = ref && this.entries.get(ref.id + "@" + ref.revision);
    if (!e || e.ref.hash !== ref.hash || e.ref.capability !== ref.capability) throw Error("CONTENT_REF_MISMATCH");
    return e.def;
  }
  canStart(ref) {
    this.get(ref);
    return legacyDefinitions.some((d) => d.id === ref.id) || this.logicFixtureEnabled.has(ref.id + "@" + ref.revision);
  }
  isLegacy(ref) {
    return legacyDefinitions.some((d) => d.id === ref.id);
  }
  item(ref, kind) {
    this.get(ref);
    const id = ref.id.slice(5);
    return this.isLegacy(ref) ? (kind === "seed" ? "seed-" : "crop-") + id : "life-" + kind + ":" + id;
  }
};

// src/life/snap-pea-v2.json
var snap_pea_v2_default = {
  id: "crop:snap-pea",
  revision: 2,
  capability: "watered-crop-v1",
  name: [
    "\u8106\u835A",
    "Snap peas"
  ],
  condition: "cultivated-bed-v1",
  actions: [
    "plant",
    "water",
    "harvest"
  ],
  wetMinutes: 720,
  growMinutes: 720,
  seedCost: 6,
  yield: 3,
  salePrice: 4,
  output: "produce",
  uses: [
    "sell",
    "save-seed",
    "resident-order"
  ],
  saleSink: "crop-counter",
  assets: [
    "asset:harbor.snap-pea.young@2:99b994debb060388c944ad0da68f07ff5d8d6d46bc2027f18064dc6ea1b2aabf",
    "asset:harbor.snap-pea.growing@2:92fe64aab2d4fc4c81831855b775487121290f3451b3cfe884a953a20cbbe16e",
    "asset:harbor.snap-pea.ready@2:271c78eba7da67ca0ac7c81ee334758da0cfe756b599bc9db228bd06c2a56df4",
    "asset:harbor.snap-pea.seed@2:762521df0e329e0be610e1f4beec7d4f1d263fd204faf796f3825e0363dcd5d1",
    "asset:harbor.snap-pea.produce@2:86bc5b5f00f0b014ca97e93d7bc4efe8779d4e45e30776b85d0369caf194b985"
  ]
};

// src/world/snap-pea-art.json
var snap_pea_art_default = {
  ref: {
    id: "crop:snap-pea",
    revision: 2,
    hash: "e20563eeae219f3300c760f7af666cbfa01a52680ce469cddd6a96d3a97e5ccf",
    capability: "watered-crop-v1"
  },
  sourceManifestSha256: "62fb10c588bf22af21a9b0612201a6ee108597c2f5f476769d85e6da2ea29d1b",
  profile: {
    slot: [
      256,
      256
    ],
    root: [
      127.5,
      217
    ],
    scale: 0.1388888888888889,
    rootOffsetFromBed: [
      0,
      -12
    ],
    collision: "existing-land-48x24-only",
    itemHost: [
      64,
      64
    ]
  },
  files: {
    young: {
      image: "./art/life-snap-pea-v2/young.png",
      sha256: "99b994debb060388c944ad0da68f07ff5d8d6d46bc2027f18064dc6ea1b2aabf",
      alpha200Box: [
        90,
        145,
        166,
        217
      ],
      assetId: "asset:harbor.snap-pea.young@2:99b994debb060388c944ad0da68f07ff5d8d6d46bc2027f18064dc6ea1b2aabf"
    },
    growing: {
      image: "./art/life-snap-pea-v2/growing.png",
      sha256: "92fe64aab2d4fc4c81831855b775487121290f3451b3cfe884a953a20cbbe16e",
      alpha200Box: [
        76,
        24,
        192,
        217
      ],
      assetId: "asset:harbor.snap-pea.growing@2:92fe64aab2d4fc4c81831855b775487121290f3451b3cfe884a953a20cbbe16e"
    },
    ready: {
      image: "./art/life-snap-pea-v2/ready.png",
      sha256: "271c78eba7da67ca0ac7c81ee334758da0cfe756b599bc9db228bd06c2a56df4",
      alpha200Box: [
        62,
        24,
        206,
        217
      ],
      assetId: "asset:harbor.snap-pea.ready@2:271c78eba7da67ca0ac7c81ee334758da0cfe756b599bc9db228bd06c2a56df4"
    },
    seed: {
      image: "./art/life-snap-pea-v2/seed.png",
      sha256: "762521df0e329e0be610e1f4beec7d4f1d263fd204faf796f3825e0363dcd5d1",
      alpha200Box: [
        45,
        64,
        210,
        195
      ],
      assetId: "asset:harbor.snap-pea.seed@2:762521df0e329e0be610e1f4beec7d4f1d263fd204faf796f3825e0363dcd5d1"
    },
    produce: {
      image: "./art/life-snap-pea-v2/produce.png",
      sha256: "86bc5b5f00f0b014ca97e93d7bc4efe8779d4e45e30776b85d0369caf194b985",
      alpha200Box: [
        60,
        54,
        196,
        193
      ],
      assetId: "asset:harbor.snap-pea.produce@2:86bc5b5f00f0b014ca97e93d7bc4efe8779d4e45e30776b85d0369caf194b985"
    }
  }
};

// src/life/seed-quota.ts
var matches = (a, b) => a.id === b.id && a.revision === b.revision && a.hash === b.hash && a.capability === b.capability;
var source2 = (v) => typeof v === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(v);
var integer4 = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
var object4 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var keys2 = (v, s) => Object.keys(v).sort().join(",") === s;
function seedSources(s, ref, total2) {
  const harvests = (s.lifeV1?.seedQuotaV1?.harvests ?? []).filter((h) => matches(h.plant.ref, ref));
  return { legacyQuantity: total2 - harvests.reduce((n, h) => n + h.quantity, 0), harvests };
}
function pinSeedPlant(s, ref, plot2, actionId) {
  const q = s.lifeV1.seedQuotaV1 ??= { policy: "one-seed-per-plant-v1", plants: {}, harvests: [] };
  if (q.plants[plot2] || q.harvests.some((h) => h.plant.id === actionId)) throw Error("SEED_PLANT_CONFLICT");
  q.plants[plot2] = { id: actionId, ref: { ...ref }, plantedMinute: s.townMinutes ?? 540 };
}
function recordSeedHarvest(s, ref, plot2, actionId, quantity) {
  const q = s.lifeV1.seedQuotaV1, p = q?.plants[plot2];
  if (!p) return;
  if (!matches(p.ref, ref) || q.harvests.some((h) => h.id === actionId || h.plant.id === p.id)) throw Error("SEED_PLANT_CONFLICT");
  if (q.harvests.length >= 9999) throw Error("HARVEST_RECORD_CAPACITY");
  q.harvests.push({ id: actionId, plant: structuredClone(p), harvestMinute: s.townMinutes ?? 540, quantity, seedSpent: false });
  delete q.plants[plot2];
}
function consumeSeedHarvest(s, ref, total2, quantity, selected2) {
  const { legacyQuantity, harvests } = seedSources(s, ref, total2);
  let remaining = quantity;
  if (selected2 !== void 0) {
    const h = harvests.find((h2) => h2.id === selected2);
    if (!h || h.quantity < quantity) throw Error("HARVEST_BATCH_UNAVAILABLE");
    h.quantity -= quantity;
    remaining = 0;
  } else {
    remaining -= Math.min(remaining, legacyQuantity);
    for (const h of [...harvests.filter((h2) => h2.seedSpent), ...harvests.filter((h2) => !h2.seedSpent)]) {
      const used = Math.min(remaining, h.quantity);
      h.quantity -= used;
      remaining -= used;
    }
  }
  if (remaining) throw Error("ITEMS_MISSING");
  const q = s.lifeV1.seedQuotaV1;
  if (q) q.harvests = q.harvests.filter((h) => h.quantity > 0);
}
function assertSeedQuotaReadable(s, r) {
  const q = s.lifeV1?.seedQuotaV1;
  if (q === void 0) return;
  const bad = () => {
    throw Error("UNSUPPORTED_SEED_QUOTA_SAVE");
  };
  if (!object4(q) || !keys2(q, "harvests,plants,policy") || q.policy !== "one-seed-per-plant-v1" || !object4(q.plants) || Object.keys(q.plants).length > 3 + landMaximum(s.landV1) || !Array.isArray(q.harvests) || q.harvests.length > 9999) bad();
  const now2 = s.townMinutes ?? 540, ids = /* @__PURE__ */ new Set(), batches = /* @__PURE__ */ new Set();
  const plant = (p) => {
    if (!object4(p) || !keys2(p, "id,plantedMinute,ref") || !source2(p.id) || ids.has(p.id) || batches.has(p.id) || !integer4(p.plantedMinute, 0, now2)) bad();
    ids.add(p.id);
    if (!object4(p.ref) || !keys2(p.ref, "capability,hash,id,revision")) bad();
    try {
      r.get(p.ref);
    } catch {
      bad();
    }
  };
  for (const [id, p] of Object.entries(q.plants)) {
    plant(p);
    const pinned = s.lifeV1.plots[id]?.ref ?? s.lifeV1.legacyPlotRefs[id];
    if (!pinned || !matches(p.ref, pinned)) bad();
  }
  for (const h of q.harvests) {
    if (!object4(h) || !keys2(h, "harvestMinute,id,plant,quantity,seedSpent") || !source2(h.id) || batches.has(h.id) || typeof h.seedSpent !== "boolean") bad();
    batches.add(h.id);
    plant(h.plant);
    if (ids.has(h.id)) bad();
    ids.add(h.id);
    if (!integer4(h.harvestMinute, h.plant.plantedMinute, now2) || !integer4(h.quantity, 1, r.get(h.plant.ref).yield)) bad();
  }
  for (const l of s.lifeV1.lots.filter((l2) => l2.kind === "produce")) if (seedSources(s, l.ref, l.quantity).legacyQuantity < 0) bad();
  for (const h of q.harvests) if (!s.lifeV1.lots.some((l) => l.kind === "produce" && matches(l.ref, h.plant.ref))) bad();
}

// src/life/save.ts
var sameRef = (a, b) => a.id === b.id && a.revision === b.revision && a.hash === b.hash && a.capability === b.capability;
var int2 = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
var record2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var source3 = (s) => typeof s === "string" && s.length > 0 && s.length <= 120;
var giftItems = ["life-gift:theo-menu", "life-gift:dani-page"];
var displaySlots = ["home-shelf-1", "home-shelf-2"];
function addLot(s, r, ref, kind, quantity, actionId) {
  const maximum = r.isLegacy(ref) ? Number.MAX_SAFE_INTEGER : 9999;
  if (!int2(quantity, 1, maximum)) throw Error("INVALID_QUANTITY");
  const item = r.item(ref, kind), before = s.items[item] ?? 0;
  if (!int2(before + quantity, 0, maximum)) throw Error("INVENTORY_FULL");
  const life = s.lifeV1, old = life.lots.find((l) => l.kind === kind && sameRef(l.ref, ref));
  if (old) {
    old.quantity += quantity;
    old.lastSource = actionId;
  } else {
    if (life.lots.length >= 64) throw Error("LOT_CAPACITY");
    life.lots.push({ ref: { ...ref }, kind, quantity, firstSource: actionId, lastSource: actionId });
  }
  s.items[item] = before + quantity;
}
function consumeLot(s, r, ref, kind, quantity, harvestBatch) {
  if (!int2(quantity, 1, 9999)) throw Error("INVALID_QUANTITY");
  const life = s.lifeV1, lot = life.lots.find((l) => l.kind === kind && sameRef(l.ref, ref));
  if (!lot || lot.quantity < quantity) throw Error("ITEMS_MISSING");
  if (kind === "produce") consumeSeedHarvest(s, ref, lot.quantity, quantity, harvestBatch);
  lot.quantity -= quantity;
  const item = r.item(ref, kind);
  s.items[item] -= quantity;
  life.lots = life.lots.filter((l) => l.quantity > 0);
}
function consumeForSeed(s, r, ref, harvestBatch) {
  const lot = s.lifeV1.lots.find((l) => l.kind === "produce" && sameRef(l.ref, ref));
  if (!lot) throw Error("ITEMS_MISSING");
  const sources = seedSources(s, ref, lot.quantity);
  const h = harvestBatch !== void 0 ? sources.harvests.find((h2) => h2.id === harvestBatch) : sources.legacyQuantity > 0 ? void 0 : sources.harvests.find((h2) => !h2.seedSpent);
  if (harvestBatch !== void 0 && !h) throw Error("HARVEST_BATCH_UNAVAILABLE");
  if (h?.seedSpent || !h && sources.legacyQuantity <= 0) throw Error("SEED_QUOTA_SPENT");
  if (h) h.seedSpent = true;
  consumeLot(s, r, ref, "produce", 1, h?.id);
  return !!h;
}
function pinLegacy(previous, r) {
  assertLifeReadable(previous, r);
  const s = structuredClone(previous);
  if (s.lifeV1) return s;
  s.lifeV1 = { schema: 1, lots: [], legacyPlotRefs: {}, plots: {}, collections: {}, display: {}, firstRewards: [], cooldownUntil: 0, events: [] };
  for (const d of legacyDefinitions) {
    const ref = r.ref(d.id);
    for (const kind of ["seed", "produce"]) {
      const quantity = s.items[r.item(ref, kind)] ?? 0;
      if (quantity) {
        s.lifeV1.lots.push({ ref, kind, quantity, firstSource: "legacy-import:" + s.id, lastSource: "legacy-import:" + s.id });
      }
    }
  }
  for (const [id, p] of Object.entries(s.plots ?? {})) s.lifeV1.legacyPlotRefs[id] = r.ref("crop:" + p.crop);
  return s;
}
function reconcileAuthored(previous, next, r, actionId) {
  const planted = Object.entries(next.plots ?? {}).filter(([id]) => !previous.plots?.[id]);
  if (!previous.lifeV1 && !planted.length) return next;
  const before = pinLegacy(previous, r), s = structuredClone(next);
  s.lifeV1 = structuredClone(before.lifeV1);
  for (const d of legacyDefinitions) {
    const ref = r.ref(d.id);
    for (const kind of ["seed", "produce"]) {
      const key2 = r.item(ref, kind), delta = (next.items[key2] ?? 0) - (previous.items[key2] ?? 0);
      s.items[key2] = previous.items[key2] ?? 0;
      if (delta > 0) addLot(s, r, ref, kind, delta, actionId);
      if (delta < 0) consumeLot(s, r, ref, kind, -delta);
      if (next.items[key2] === void 0) delete s.items[key2];
    }
  }
  s.lifeV1.legacyPlotRefs = {};
  for (const [id, p] of Object.entries(s.plots ?? {})) s.lifeV1.legacyPlotRefs[id] = r.ref("crop:" + p.crop);
  for (const [id, p] of Object.entries(previous.plots ?? {})) if (!next.plots?.[id]) recordSeedHarvest(s, r.ref("crop:" + p.crop), id, actionId, r.get(r.ref("crop:" + p.crop)).yield);
  for (const [id, p] of planted) pinSeedPlant(s, r.ref("crop:" + p.crop), id, actionId);
  assertLifeReadable(s, r);
  return s;
}
function assertLifeReadable(s, r) {
  if (s.landV1?.schema === 2) assertLandReadable(s);
  const bad = () => {
    throw Error("UNSUPPORTED_LIFE_SAVE");
  };
  if (!int2(s.cash, 0, 999) || !int2(s.energy, 0, 100) || !int2(s.townMinutes ?? 540) || !int2(s.awakeMinutes ?? 0) || !record2(s.items) || Object.values(s.items).some((n) => !int2(n))) bad();
  const life = s.lifeV1;
  if (life === void 0) {
    if (Object.keys(s.items).some((k) => k.startsWith("life-") && (s.items[k] ?? 0) > 0)) bad();
    return;
  }
  if (!record2(life) || life.schema !== 1 || Object.keys(life).some((k) => !["schema", "lots", "legacyPlotRefs", "plots", "collections", "display", "firstRewards", "order", "cooldownUntil", "events", "seedQuotaV1"].includes(k)) || !Array.isArray(life.lots) || life.lots.length > 64 || !record2(life.legacyPlotRefs) || !record2(life.plots) || Object.keys(life.plots).length > landMaximum(s.landV1) || !record2(life.collections) || Object.keys(life.collections).length > 64 || !record2(life.display) || !Array.isArray(life.firstRewards) || !int2(life.cooldownUntil) || !Array.isArray(life.events) || life.events.length > 128) bad();
  const totals = {}, identities = /* @__PURE__ */ new Set(), now2 = s.townMinutes ?? 540;
  const ref = (v) => {
    try {
      if (!record2(v) || Object.keys(v).sort().join(",") !== "capability,hash,id,revision") bad();
      r.get(v);
    } catch {
      bad();
    }
  };
  for (const l of life.lots) {
    if (!record2(l) || Object.keys(l).sort().join(",") !== "firstSource,kind,lastSource,quantity,ref" || !["seed", "produce"].includes(l.kind) || !int2(l.quantity, 1) || !source3(l.firstSource) || !source3(l.lastSource)) bad();
    ref(l.ref);
    if (!r.isLegacy(l.ref) && l.quantity > 9999) bad();
    const identity = l.ref.id + "@" + l.ref.revision + ":" + l.kind;
    if (identities.has(identity)) bad();
    identities.add(identity);
    const item = r.item(l.ref, l.kind);
    totals[item] = (totals[item] ?? 0) + l.quantity;
    if (!int2(totals[item], 0, r.isLegacy(l.ref) ? Number.MAX_SAFE_INTEGER : 9999)) bad();
  }
  for (const d of legacyDefinitions) for (const kind of ["seed", "produce"]) {
    const key2 = r.item(r.ref(d.id), kind);
    if ((totals[key2] ?? 0) !== (s.items[key2] ?? 0)) bad();
  }
  for (const [key2, n] of Object.entries(totals)) if (n !== s.items[key2]) bad();
  for (const key2 of Object.keys(s.items)) if (key2.startsWith("life-seed:") || key2.startsWith("life-produce:")) {
    if ((totals[key2] ?? 0) !== s.items[key2]) bad();
  }
  for (const key2 of Object.keys(s.items)) if (key2.startsWith("life-") && !key2.startsWith("life-seed:") && !key2.startsWith("life-produce:") && !giftItems.includes(key2)) bad();
  for (const [id, p] of Object.entries(life.plots)) {
    if (!isLifeBed(id, s.landV1) || Number(id.slice(-1)) > 2 && !s.landV1?.plots.some((b) => b.id === id.replace("life-", "land-")) || !record2(p) || Object.keys(p).sort().join(",") !== "grown,ref,updatedAt,wetUntil") bad();
    ref(p.ref);
    const d = r.get(p.ref);
    if (r.isLegacy(p.ref) || !int2(p.grown, 0, d.growMinutes) || !int2(p.updatedAt, 0, now2) || !int2(p.wetUntil, p.updatedAt, p.updatedAt + d.wetMinutes)) bad();
  }
  if (Object.keys(life.legacyPlotRefs).sort().join(",") !== Object.keys(s.plots ?? {}).sort().join(",")) bad();
  for (const [id, v] of Object.entries(life.legacyPlotRefs)) {
    ref(v);
    if (!r.isLegacy(v) || v.id !== "crop:" + s.plots[id].crop) bad();
  }
  assertSeedQuotaReadable(s, r);
  for (const [id, d] of Object.entries(life.collections)) {
    if (!record2(d) || d.id !== id || !source3(d.sourceAction) || !int2(d.minute, 0, now2) || Object.keys(d).some((k) => !["id", "sourceAction", "minute", "ref", "source"].includes(k))) bad();
    if (id.startsWith("seed:crop:")) {
      if (!d.ref || id !== "seed:" + d.ref.id || d.source) bad();
      ref(d.ref);
    } else if (/^observe:harbor-cat-[123]:(sun-rest|sleep)$/.test(id) || /^observe:harbor-gull-[1-4]:shore-space$/.test(id)) {
      if (!d.source || d.source.kind !== "animal-schedule" || d.source.id !== id.split(":")[1] || !source3(d.source.visualVersion) || d.ref) bad();
    } else if (giftItems.some((g) => id === "gift:" + g)) {
      if (d.ref || d.source) bad();
    } else if (id === "news:first-experience") {
      if (!d.source || d.source.kind !== "frozen-news" || !source3(d.source.id) || !/^[a-f0-9]{64}$/.test(d.source.hash) || d.ref) bad();
    } else bad();
    if (d.source && Object.keys(d.source).sort().join(",") !== (d.source.kind === "animal-schedule" ? "id,kind,visualVersion" : "hash,id,kind")) bad();
  }
  for (const [slot2, gift] of Object.entries(life.display)) {
    if (!displaySlots.includes(slot2) || !giftItems.includes(gift) || (s.items[gift] ?? 0) < Object.values(life.display).filter((g) => g === gift).length) bad();
  }
  if (life.firstRewards.some((k) => !["theo-order-first", "dani-share-first"].includes(k)) || new Set(life.firstRewards).size !== life.firstRewards.length) bad();
  for (const [i, gift] of giftItems.entries()) {
    if (!int2(s.items[gift] ?? 0, 0, 1)) bad();
    const key2 = i === 0 ? "theo-order-first" : "dani-share-first", found = !!life.collections["gift:" + gift];
    if (found !== life.firstRewards.includes(key2) || (s.items[gift] ?? 0) > 0 && !found) bad();
  }
  if (life.order) {
    const o = life.order;
    ref(o.crop);
    if (Object.keys(o).sort().join(",") !== "acceptedMinute,crop,definition,dueMinute,id,quantity,reward" || o.definition !== "theo-peas-v1" || o.crop.id !== "crop:snap-pea" || o.quantity !== 2 || o.reward !== 10 || !source3(o.id) || !int2(o.acceptedMinute, 0, now2) || o.dueMinute !== (Math.floor(o.acceptedMinute / 1440) + 2) * 1440 + 1020) bad();
  }
  const eventIds = /* @__PURE__ */ new Set();
  let minute3 = -1;
  for (const e of life.events) {
    if (!record2(e) || Object.keys(e).sort().join(",") !== "cash,energy,facts,id,items,minute,relations,verb" || !source3(e.id) || eventIds.has(e.id) || !source3(e.verb) || !int2(e.minute, Math.max(0, minute3), now2) || !int2(e.cash, -999, 999) || !int2(e.energy, -100, 100) || !record2(e.items) || !record2(e.relations) || Object.keys(e.items).length > 20 || Object.values(e.items).some((n) => !int2(n, -9999, 9999)) || Object.keys(e.relations).some((k) => !["theo", "dani"].includes(k)) || Object.values(e.relations).some((n) => !int2(n, -200, 200)) || !Array.isArray(e.facts) || e.facts.length > 8 || e.facts.some((f2) => typeof f2 !== "string" || f2.length > 160)) bad();
    minute3 = e.minute;
    eventIds.add(e.id);
  }
}

// src/life/rules.ts
function requireRule(condition, code) {
  if (!condition) throw Error(code);
}
var minute = (s) => s.townMinutes ?? 540;
var shopOpen2 = (s) => minute(s) % 1440 >= 360 && minute(s) % 1440 < 1020;
function startAllowed(r, ref) {
  requireRule(r.canStart(ref), "CONTENT_NOT_ENABLED");
}
function labor(s) {
  requireRule(s.energy >= 2, "ENERGY_LOW");
  s.energy -= 2;
  advanceAwake(s, 10);
  s.townMinutes = minute(s) + 10;
}
function resident(s, a, id) {
  requireRule(a.resident === id, "RESIDENT_ADMISSION_REQUIRED");
  requireRule(s.known.includes(id), "INTRODUCE_FIRST");
  requireRule(residentHere(s, id, s.scene), "PERSON_AWAY");
}
function discover(s, id, action, extra = {}) {
  const life = s.lifeV1;
  if (life.collections[id]) return false;
  requireRule(Object.keys(life.collections).length < 64, "COLLECTION_CAPACITY");
  life.collections[id] = { id, sourceAction: action, minute: minute(s), ...extra };
  return true;
}
function rewardGift(s, key2, gift, person, amount, actionId, facts) {
  const life = s.lifeV1;
  if (life.firstRewards.includes(key2)) return;
  life.firstRewards.push(key2);
  s.relations[person] = Math.min(100, Math.max(-100, (s.relations[person] ?? 0) + amount));
  s.items[gift] = 1;
  discover(s, "gift:" + gift, actionId);
  facts.push(key2, "gift:" + gift);
}
function lifePlotStatus(s, id, r) {
  const p = s.lifeV1?.plots[id];
  if (!p) return null;
  const d = r.get(p.ref), now2 = minute(s), grown = Math.min(d.growMinutes, p.grown + Math.max(0, Math.min(now2, p.wetUntil) - p.updatedAt));
  return { grown, ready: grown >= d.growMinutes, needsWater: grown < d.growMinutes && now2 >= p.wetUntil, ref: { ...p.ref } };
}
function plot(s, a, id) {
  requireRule(a.plot === id && a.cultivated === true && isLifeBed(id, s.landV1), "PLOT_ADMISSION_REQUIRED");
  const p = s.lifeV1.plots[id];
  requireRule(p, "PLOT_EMPTY");
  return p;
}
function applyLife(previous, intent2, r, a) {
  requireRule(/^[a-zA-Z0-9-]{16,80}$/.test(intent2.actionId), "INVALID_ACTION_ID");
  requireRule(previous.version === intent2.expectedVersion, "VERSION_CONFLICT");
  requireRule(a.scene === previous.scene, "SCENE_MISMATCH");
  requireRule(!previous.activeChallenge && !battleLocksWorld(previous), "CHALLENGE_ACTIVE");
  const s = pinLegacy(previous, r), life = s.lifeV1, c = intent2.command, facts = [];
  requireRule(!life.events.some((e) => e.id === intent2.actionId), "ACTION_ALREADY_APPLIED");
  let text2;
  switch (c.verb) {
    case "buy-seed": {
      requireRule(a.target === "crop-counter", "SHOP_ADMISSION_REQUIRED");
      requireRule(shopOpen2(s), "SHOP_CLOSED");
      startAllowed(r, c.ref);
      const d = r.get(c.ref);
      requireRule(s.cash >= d.seedCost, "CASH_LOW");
      s.cash -= d.seedCost;
      addLot(s, r, c.ref, "seed", 1, intent2.actionId);
      text2 = ["\u4E70\u5230\u4E00\u5305\u79CD\u5B50\u3002", "You bought a packet of seeds."];
      break;
    }
    case "plant": {
      requireRule(a.plot === c.plot && a.cultivated === true && isLifeBed(c.plot, s.landV1), "PLOT_ADMISSION_REQUIRED");
      requireRule(!life.plots[c.plot], "PLOT_OCCUPIED");
      startAllowed(r, c.ref);
      requireRule(!r.isLegacy(c.ref), "USE_AUTHORED_PLOT");
      requireRule(s.energy >= 2, "ENERGY_LOW");
      consumeLot(s, r, c.ref, "seed", 1);
      const now2 = minute(s);
      life.plots[c.plot] = { ref: { ...c.ref }, grown: 0, updatedAt: now2, wetUntil: now2 };
      pinSeedPlant(s, c.ref, c.plot, intent2.actionId);
      labor(s);
      text2 = ["\u79CD\u5B50\u5DF2\u64AD\u4E0B\u3002\u6D47\u6C34\u540E\u624D\u5F00\u59CB\u751F\u957F\uFF1B\u8FD9\u682A\u6536\u6210\u6700\u591A\u7559\u4E00\u5305\u79CD\u3002", "The seed is planted. Water it to begin growth; this plant can provide one saved seed packet."];
      break;
    }
    case "water": {
      const p = plot(s, a, c.plot), status = lifePlotStatus(s, c.plot, r);
      requireRule(status.needsWater, "WATER_UNAVAILABLE");
      requireRule(s.energy >= 2, "ENERGY_LOW");
      p.grown = status.grown;
      p.updatedAt = minute(s);
      p.wetUntil = minute(s) + r.get(p.ref).wetMinutes;
      labor(s);
      text2 = ["\u571F\u5DF2\u6D47\u6E7F\uFF0C\u53EF\u4EE5\u5148\u53BB\u505A\u522B\u7684\u4E8B\u3002", "The soil is watered. You can leave it to grow."];
      break;
    }
    case "harvest": {
      const p = plot(s, a, c.plot);
      requireRule(lifePlotStatus(s, c.plot, r).ready, "CROP_NOT_READY");
      requireRule(s.energy >= 2, "ENERGY_LOW");
      addLot(s, r, p.ref, "produce", r.get(p.ref).yield, intent2.actionId);
      recordSeedHarvest(s, p.ref, c.plot, intent2.actionId, r.get(p.ref).yield);
      delete life.plots[c.plot];
      labor(s);
      text2 = ["\u6536\u6210\u5DF2\u653E\u8FDB\u884C\u56CA\uFF0C\u53EF\u4EE5\u5728\u6742\u8D27\u67DC\u53F0\u5356\u51FA\u6216\u7559\u79CD\u3002", "The harvest is in your bag: sell it at the grocer or save a seed."];
      break;
    }
    case "sell": {
      requireRule(a.target === "crop-counter", "SHOP_ADMISSION_REQUIRED");
      requireRule(shopOpen2(s), "SHOP_CLOSED");
      const d = r.get(c.ref);
      requireRule(s.cash + d.salePrice <= 999, "PURSE_FULL");
      consumeLot(s, r, c.ref, "produce", 1);
      s.cash += d.salePrice;
      text2 = ["\u4E00\u4EFD\u6536\u6210\u5DF2\u5356\u51FA\u3002", "You sold one portion."];
      break;
    }
    case "save-seed": {
      r.get(c.ref);
      const limited = consumeForSeed(s, r, c.ref, c.harvestBatch);
      addLot(s, r, c.ref, "seed", 1, intent2.actionId);
      if (discover(s, "seed:" + c.ref.id, intent2.actionId, { ref: { ...c.ref } })) facts.push("seed:" + c.ref.id);
      text2 = r.canStart(c.ref) ? limited ? ["\u5DF2\u75281\u4EFD\u6536\u6210\u7559\u4E0B\u4E00\u5305\u79CD\uFF1B\u8FD9\u682A\u4F59\u4E0B\u6536\u6210\u53EF\u51FA\u552E\u6216\u4EA4\u8D27\uFF0C\u4E0D\u80FD\u518D\u6B21\u7559\u79CD\u3002", "One portion became a seed packet. This plant\u2019s remaining harvest can be sold or delivered, but cannot provide another seed."] : ["\u7559\u4E0B\u4E00\u5305\u65E7\u89C4\u5219\u79CD\u5B50\uFF0C\u53EF\u4EE5\u518D\u79CD\uFF1B\u53D1\u73B0\u8BB0\u5F55\u4E0D\u4F1A\u968F\u79CD\u5B50\u6D88\u8017\u6D88\u5931\u3002", "You saved an old-rule seed packet to plant again. Its discovery record survives use."] : ["\u540C\u6279\u6B21\u79CD\u5B50\u4E0E\u53D1\u73B0\u5DF2\u4FDD\u7559\uFF1B\u6B64\u6279\u6B21\u76EE\u524D\u505C\u6B62\u65B0\u79CD\u690D\u3002", "Your seed and discovery are kept. New planting is currently closed for this batch."];
      break;
    }
    case "accept-order": {
      resident(s, a, "theo");
      requireRule(a.premiseRead === true, "ORDER_PREMISE_UNREAD");
      requireRule(shopOpen2(s), "SHOP_CLOSED");
      requireRule(!life.order, "ORDER_ACTIVE");
      requireRule(minute(s) >= life.cooldownUntil, "ORDER_COOLDOWN");
      startAllowed(r, c.ref);
      const d = r.get(c.ref);
      requireRule(c.ref.id === "crop:snap-pea" && 10 <= 2 * d.salePrice + 2, "ORDER_CONTENT_UNSUPPORTED");
      life.order = { id: intent2.actionId, definition: "theo-peas-v1", crop: { ...c.ref }, quantity: 2, reward: 10, acceptedMinute: minute(s), dueMinute: (Math.floor(minute(s) / 1440) + 2) * 1440 + 1020 };
      facts.push("order:accepted");
      text2 = ["\u63A5\u4E0B\u4E24\u4EFD\u8106\u835A\u7684\u8BA2\u5355\uFF1A\u540E\u592917:00\u524D\u4EA4\u7ED9\u897F\u5965\u3002", "You accepted an order for two portions of peas, due before 5pm the day after tomorrow."];
      break;
    }
    case "deliver-order": {
      const o = life.order;
      requireRule(o, "ORDER_MISSING");
      requireRule(minute(s) < o.dueMinute, "ORDER_EXPIRED");
      resident(s, a, "theo");
      requireRule(shopOpen2(s), "SHOP_CLOSED");
      requireRule(s.cash + o.reward <= 999, "PURSE_FULL");
      consumeLot(s, r, o.crop, "produce", o.quantity);
      s.cash += o.reward;
      delete life.order;
      life.cooldownUntil = minute(s) + 3 * 1440;
      facts.push("order:delivered");
      rewardGift(s, "theo-order-first", giftItems[0], "theo", 2, intent2.actionId, facts);
      text2 = ["\u897F\u5965\u6536\u4E0B\u8106\u835A\uFF0C\u4ED8\u4E86\u94B1\u3002", "Theo accepts the peas and pays you."];
      break;
    }
    case "close-order": {
      requireRule(life.order, "ORDER_MISSING");
      requireRule(minute(s) >= life.order.dueMinute, "ORDER_NOT_EXPIRED");
      delete life.order;
      life.cooldownUntil = minute(s) + 3 * 1440;
      facts.push("order:expired-without-loss");
      text2 = ["\u8BA2\u5355\u5DF2\u8FC7\u671F\uFF0C\u6536\u6210\u8FD8\u5728\u884C\u56CA\u91CC\uFF0C\u53EF\u4EE5\u53E6\u4F5C\u5B89\u6392\u3002", "The order expired. Your harvest is still in your bag."];
      break;
    }
    case "observe-animal": {
      const def = acceptedAnimals.find((d) => d.id === c.animal);
      requireRule(a.animal && def && a.animal.id === c.animal && a.animal.behavior === c.behavior && /^harbor-cat-[123]$/.test(c.animal) && a.animal.visualVersion === def.visualVersion, "ANIMAL_PROOF_REQUIRED");
      const slot2 = slotAt(def, minute(s));
      requireRule(slot2?.scene === s.scene && slot2.activity === c.behavior, "ANIMAL_SCHEDULE_MISMATCH");
      const id = "observe:" + c.animal + ":" + c.behavior;
      if (discover(s, id, intent2.actionId, { source: { id: c.animal, visualVersion: a.animal.visualVersion, kind: "animal-schedule" } })) facts.push(id);
      text2 = ["\u8FD9\u6B21\u89C2\u5BDF\u5DF2\u8BB0\u5728\u751F\u6D3B\u518C\u4E2D\u3002", "This observation is in your notebook."];
      break;
    }
    case "share-dani": {
      resident(s, a, "dani");
      requireRule(a.premiseRead === true, "SHARE_PREMISE_UNREAD");
      requireRule(life.collections["seed:crop:snap-pea"] && life.collections["observe:harbor-cat-1:sun-rest"] && life.collections["observe:harbor-cat-1:sleep"], "DISCOVERIES_MISSING");
      requireRule(!life.firstRewards.includes("dani-share-first"), "SHARE_ALREADY_DONE");
      rewardGift(s, "dani-share-first", giftItems[1], "dani", 1, intent2.actionId, facts);
      text2 = ["\u4E39\u59AE\u542C\u8FC7\u4F60\u7684\u7559\u79CD\u4E0E\u732B\u7684\u89C2\u5BDF\uFF0C\u6DFB\u4E86\u4E00\u9875\u751F\u6D3B\u518C\u3002", "Dani adds a notebook page about your saved seeds and the cat."];
      break;
    }
    case "display-gift": {
      requireRule(a.displaySlot === c.slot && displaySlots.includes(c.slot), "DISPLAY_ADMISSION_REQUIRED");
      if (c.gift) {
        requireRule(giftItems.includes(c.gift) && (s.items[c.gift] ?? 0) > 0, "GIFT_MISSING");
        requireRule(Object.entries(life.display).filter(([slot2, g]) => slot2 !== c.slot && g === c.gift).length < (s.items[c.gift] ?? 0), "GIFT_ALREADY_DISPLAYED");
        life.display[c.slot] = c.gift;
      } else delete life.display[c.slot];
      facts.push("display:" + c.slot);
      text2 = ["\u5C55\u793A\u4F4D\u7F6E\u5DF2\u66F4\u65B0\uFF0C\u7269\u4EF6\u4ECD\u5C5E\u4E8E\u4F60\u3002", "The display is updated. You still own the keepsake."];
      break;
    }
    case "news-memento": {
      requireRule(a.news && a.news.id === c.edition && a.news.read && a.news.fictionComplete && /^[a-f0-9]{64}$/.test(a.news.hash), "NEWS_PROOF_REQUIRED");
      if (discover(s, "news:first-experience", intent2.actionId, { source: { id: a.news.id, hash: a.news.hash, kind: "frozen-news" } })) facts.push("news:first-experience");
      text2 = ["\u7B2C\u4E00\u6B21\u65B0\u95FB\u7ECF\u5386\u5DF2\u7559\u4F5C\u7EAA\u5FF5\uFF0C\u6765\u6E90\u4E0E\u865A\u6784\u6545\u4E8B\u5206\u5F00\u4FDD\u7559\u3002", "Your first news experience is saved, with its source separate from the fictional story."];
      break;
    }
    default:
      throw Error("UNKNOWN_LIFE_ACTION");
  }
  const delta = (before, after) => Object.fromEntries([.../* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)])].map((k) => [k, (after[k] ?? 0) - (before[k] ?? 0)]).filter(([, v]) => v !== 0));
  const event3 = { id: intent2.actionId, verb: c.verb, minute: minute(s), cash: s.cash - previous.cash, energy: s.energy - previous.energy, items: delta(previous.items, s.items), relations: delta(previous.relations, s.relations), facts };
  life.events.push(event3);
  life.events = life.events.slice(-128);
  assertLifeReadable(s, r);
  return { head: s, text: text2, event: structuredClone(event3) };
}

// server/life-runtime.ts
var fields = {
  "permit-land": ["verb", "region"],
  "expand-land": ["verb", "region"],
  "clear-bed": ["verb", "plot"],
  cultivate: ["verb", "region", "at"],
  "buy-seed": ["verb", "ref"],
  plant: ["verb", "ref", "plot"],
  water: ["verb", "plot"],
  harvest: ["verb", "plot"],
  sell: ["verb", "ref"],
  "save-seed": ["verb", "ref", "harvestBatch"],
  "accept-order": ["verb", "ref"],
  "deliver-order": ["verb"],
  "close-order": ["verb"],
  "share-dani": ["verb"],
  "observe-animal": ["verb", "animal", "behavior"],
  "display-gift": ["verb", "slot", "gift"],
  "news-memento": ["verb", "edition"]
};
function parseLifeCommand(a) {
  const p = a.payload, c = p?.command;
  if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).join(",") !== "command" || !c || typeof c !== "object" || Array.isArray(c) || !Object.hasOwn(fields, c.verb)) throw Error("INVALID_LIFE_COMMAND");
  const allowed = fields[c.verb];
  if (a.action !== "life:" + c.verb || Object.keys(c).some((k) => !allowed.includes(k)) || allowed.some((k) => !["gift", "harvestBatch"].includes(k) && c[k] === void 0)) throw Error("INVALID_LIFE_COMMAND");
  for (const k of ["plot", "animal", "behavior", "slot", "gift", "edition", "region", "harvestBatch"]) if (c[k] !== void 0 && (typeof c[k] !== "string" || c[k].length > 80 || !c[k])) throw Error("INVALID_LIFE_COMMAND");
  if (c.ref !== void 0 && (!c.ref || typeof c.ref !== "object" || Array.isArray(c.ref) || Object.keys(c.ref).sort().join(",") !== "capability,hash,id,revision")) throw Error("INVALID_LIFE_COMMAND");
  if (c.verb === "observe-animal" && !["sun-rest", "sleep"].includes(c.behavior)) throw Error("INVALID_LIFE_COMMAND");
  if (c.at !== void 0 && !landPoint(c.at)) throw Error("INVALID_LIFE_COMMAND");
  return structuredClone(c);
}
function createLifeRuntime(base2, registry, host) {
  if (typeof host?.admit !== "function") throw Error("LIFE_HOST_REQUIRED");
  return {
    ...base2,
    upgrade: (s) => s,
    assertReadable(s) {
      base2.assertReadable(s);
      assertLifeReadable(s, registry);
      assertLandReadable(s);
      this.position(s, s.position);
    },
    position(s, p) {
      base2.position(s, p);
      if (!walkable(landWorld(dynamicWorld(s.flags, false), s.landV1), s.scene, p)) throw Error("INVALID_POSITION");
      return { ...p };
    },
    validateAction(a) {
      base2.validateAction(a);
      if (a.action.startsWith("life:")) parseLifeCommand(a);
    },
    async prepare(s, a, cancel, context) {
      if (!a.action.startsWith("life:")) {
        assertLandReadable(s);
        this.position(s, a.position);
        assertLifeReadable(s, registry);
        const result2 = await base2.prepare(s, a, cancel, context);
        this.position(result2.head, result2.head.position);
        return { ...result2, head: reconcileAuthored(s, result2.head, registry, a.action_id) };
      }
      assertLandReadable(s);
      this.position(s, a.position);
      if (a.scene !== s.scene) throw Error("SCENE_MISMATCH");
      const command = parseLifeCommand(a);
      const admission = await host.admit(structuredClone(s), structuredClone(a), structuredClone(command));
      if (!admission || admission.scene !== s.scene || admission.target !== a.target) throw Error("LIFE_ADMISSION_MISMATCH");
      const intent2 = { actionId: a.action_id, expectedVersion: a.expected_version, command };
      const result = ["permit-land", "cultivate", "expand-land", "clear-bed"].includes(command.verb) ? applyLand(s, intent2, admission) : applyLife(s, intent2, registry, admission);
      result.head.position = { ...a.position };
      result.head.version = s.version + 1;
      result.head.cursor = s.cursor + 1;
      result.head.history.push({ id: a.action_id, kind: "action", ...admission.resident ? { person: admission.resident } : {}, text: result.text });
      result.head.history = result.head.history.slice(-500);
      return { ...result, kind: "life:" + command.verb, accepted: true, actionId: a.action };
    },
    preserveConcurrent(next, current) {
      return base2.preserveConcurrent(next, current);
    }
  };
}

// server/life-inventory-host.ts
var lifeBagTarget = "life-bag";
var inventoryLifeActions = Object.freeze(["life:save-seed", "life:close-order"]);
function createInventoryLifeHost() {
  return { admit: (s, a, c) => {
    if (a.scene !== s.scene) throw Error("SCENE_MISMATCH");
    if (a.target !== lifeBagTarget || !inventoryLifeActions.includes(a.action) || a.action !== "life:" + c.verb) throw Error("LIFE_INVENTORY_NOT_ADMITTED");
    if (c.verb !== "save-seed" && c.verb !== "close-order") throw Error("LIFE_INVENTORY_NOT_ADMITTED");
    return { scene: s.scene, target: lifeBagTarget };
  } };
}

// server/life-view.ts
function lifeView(s, r, plants) {
  assertLifeReadable(s, r);
  const life = s.lifeV1, minute3 = s.townMinutes ?? 540, blocked = !!s.activeChallenge || battleLocksWorld(s);
  const lots = life ? life.lots : legacyDefinitions.flatMap((d) => {
    const ref = r.ref(d.id);
    return ["seed", "produce"].flatMap((kind) => {
      const quantity2 = s.items[r.item(ref, kind)] ?? 0;
      return quantity2 ? [{ ref, kind, quantity: quantity2 }] : [];
    });
  });
  const quantity = (ref, kind) => lots.filter((l) => l.kind === kind && sameRef(l.ref, ref)).reduce((n, l) => n + l.quantity, 0);
  const order = life?.order;
  const result = {
    schema: 1,
    snapshotVersion: s.version,
    snapshotCursor: s.cursor,
    gameMinute: minute3,
    persistence: life ? "pinned" : "legacy-unpinned",
    batches: lots.flatMap((l) => {
      const sources = seedSources(s, l.ref, l.quantity);
      const rows = l.kind === "seed" ? [{ quantity: l.quantity, harvestBatch: void 0, seedRule: "seed", seedSpent: false }] : [
        ...sources.legacyQuantity > 0 ? [{ quantity: sources.legacyQuantity, harvestBatch: void 0, seedRule: "legacy", seedSpent: false }] : [],
        ...sources.harvests.map((h) => ({ quantity: h.quantity, harvestBatch: h.id, seedRule: "one-per-plant", seedSpent: h.seedSpent }))
      ];
      return rows.map((row) => ({
        id: l.ref.id + "@" + l.ref.revision + ":" + l.kind + (row.harvestBatch ? ":" + row.harvestBatch : ""),
        ref: l.ref,
        name: r.get(l.ref).name,
        kind: l.kind,
        ...row,
        ...life ? { origin: life.lots.find((o) => o.kind === l.kind && sameRef(o.ref, l.ref)) } : {},
        startAvailable: r.canStart(l.ref),
        salePrice: r.get(l.ref).salePrice,
        saveSeedAvailable: l.kind === "produce" && row.quantity > 0 && !row.seedSpent && !blocked
      }));
    }),
    collections: Object.values(life?.collections ?? {}).map((d) => ({
      record: d,
      ...d.ref ? { name: r.get(d.ref).name, physicalSeedQuantity: quantity(d.ref, "seed") } : {},
      ...d.id.startsWith("gift:") ? { physicalGiftQuantity: s.items[d.id.slice(5)] ?? 0 } : {},
      isRecord: true
    })),
    gifts: giftItems.map((id) => ({ id, quantity: s.items[id] ?? 0 })),
    display: displaySlots.map((id) => ({ id, gift: life?.display[id] ?? null })),
    order: order ? {
      definition: order,
      availablePinnedProduce: quantity(order.crop, "produce"),
      status: minute3 < order.dueMinute ? "active" : "expired",
      remainingGameMinutes: Math.max(0, order.dueMinute - minute3),
      closeAvailable: minute3 >= order.dueMinute && !blocked,
      deliverySpatialAdmission: "not-implemented"
    } : null,
    spatialActions: "not-enabled-by-this-view",
    plants: plants ? {
      landPhase2: { version: 1, clearEmptyBeds: true },
      ref: { ...plants.ref },
      definition: structuredClone(r.get(plants.ref)),
      newStarts: plants.newStarts,
      shopOpen: minute3 % 1440 >= 360 && minute3 % 1440 < 1020,
      blocked,
      plots: (s.landV1?.plots ?? []).map((b) => {
        const id = b.id.replace("land-", "life-"), status = lifePlotStatus(s, id, r);
        return {
          id,
          target: b.id,
          scene: landRegion(b.region).scene,
          at: { ...b.at },
          status: status ? { ...status, growMinutes: r.get(status.ref).growMinutes, name: r.get(status.ref).name } : null
        };
      }),
      unboundPlotIds: Object.keys(life?.plots ?? {}).filter((id) => !s.landV1?.plots.some((b) => b.id === id.replace("life-", "land-")))
    } : null
  };
  return structuredClone(result);
}

// server/life-b2.ts
function createLifeB2(base2, registry = new ContentRegistry(), plants, plantHost, options = { expansionStarts: true }) {
  const inventory = createInventoryLifeHost();
  const host = { admit(s, a, c) {
    if (inventoryLifeActions.includes(a.action)) return inventory.admit(s, a, c);
    if (c.verb !== "permit-land" && c.verb !== "cultivate" && c.verb !== "expand-land" && c.verb !== "clear-bed") {
      if (plants && plantHost) return plantHost.admit(s, a, c);
      throw Error("LIFE_SPATIAL_NOT_ADMITTED");
    }
    const bed = c.verb === "clear-bed" ? s.landV1?.plots.find((p) => p.id === c.plot) : void 0;
    if (c.verb === "clear-bed" && !bed) throw Error("LAND_BED_MISSING");
    const region = c.verb === "clear-bed" ? bed.region : c.region;
    const r = landRegion(region);
    if (!r || r.scene !== s.scene || !s.visited.includes(s.scene)) throw Error("LAND_SCENE");
    if (plants && c.verb === "cultivate") {
      const next = landBedIds(s.landV1).map((id) => id.slice(-1)).find((n) => !s.landV1?.plots.some((p) => p.id === "land-bed-" + n));
      if (next && s.lifeV1?.plots["life-bed-" + next]) throw Error("ARCHIVED_PLOT_NEEDS_BINDING");
    }
    if (c.verb === "cultivate") {
      const error = landGeometry(s, c.region, c.at, a.position);
      if (error) throw Error(error);
    }
    const e = c.verb === "clear-bed" ? { ...landEntity(r.id, bed.at), id: bed.id } : landEntity(r.id, c.verb === "cultivate" ? c.at : void 0);
    if (a.target !== e.id) throw Error("LAND_TARGET");
    const w = landWorld(dynamicWorld(s.flags, true), s.landV1), rule = s.scene + "/" + e.id + "/" + a.action;
    const binding = compileSpatialBinding({ id: GAME_UUID, initialMap: [{ id: s.scene, current: true }], characters: [], domainRules: { rules: [{ id: rule, effects: [] }] } }, { version: 1, cartridgeId: GAME_UUID, mapVersion: "harbor-land-v1", actionScope: "scene", interactionDistance: 75, scenes: [{ id: s.scene, spawn: rooms[s.scene].spawn }], entities: [{ id: e.id, scene: s.scene, position: { x: e.at.x - 8, y: e.at.y - 6 }, approach: e.approach, states: ["present"], actions: [rule] }], characters: [], portals: [] }, (scene, p) => walkable(w, scene, p));
    if (!binding.admits(rule, e.id, s.scene, a.position)) throw Error("TOO_FAR");
    binding.assertTransition({ cartridgeId: GAME_UUID, map: [{ id: s.scene, current: true }], characters: [] }, { cartridgeId: GAME_UUID, map: [{ id: s.scene, current: true }], characters: [] }, rule, s.scene);
    return { scene: s.scene, target: e.id, land: { region: r.id, geometryRevision: 1, position: { ...a.position }, expansionAllowed: options.expansionStarts !== false } };
  } };
  const lifeRuntime = createLifeRuntime(base2, registry, host);
  const assembledRuntime = plants ? { ...lifeRuntime, async prepare(...args) {
    const result = await lifeRuntime.prepare(...args);
    if (args[1].action === "life:cultivate") {
      result.text = ["\u83DC\u7566\u5DF2\u7ECF\u5F00\u597D\u3002\u5E26\u4E00\u5305\u53EF\u7528\u79CD\u5B50\u6765\u64AD\u79CD\uFF0C\u7136\u540E\u6D47\u6C34\u3002", "Your bed is ready. Bring an available seed packet, plant it, then water it."];
      result.head.history.at(-1).text = result.text;
    }
    return result;
  } } : lifeRuntime;
  return { runtime: assembledRuntime, lifeProject: (s) => lifeView(s, registry, plants), landProject: (s, q) => {
    const region = q.get("region") ?? "", x = q.get("x"), y = q.get("y");
    if ([...q.keys()].some((k) => !["region", "x", "y"].includes(k)) || x === null !== (y === null)) throw Error("INVALID_LAND_PREVIEW");
    const at = x === null ? void 0 : { x: Number(x), y: Number(y) };
    if (at && !landPoint(at)) throw Error("INVALID_LAND_PREVIEW");
    const preview = landPreview(s, region, at, options.expansionStarts !== false);
    const next = landBedIds(s.landV1).map((id) => id.slice(-1)).find((n) => !s.landV1?.plots.some((p) => p.id === "land-bed-" + n));
    if (plants && next && s.lifeV1?.plots["life-bed-" + next]) return { ...preview, reason: "ARCHIVED_PLOT_NEEDS_BINDING", canConfirm: false };
    return preview;
  } };
}

// server/life-plants-b2.ts
var snapPeaV2 = snap_pea_v2_default;
var snapPeaV2Ref = snap_pea_art_default.ref;
if (definitionHash(snapPeaV2) !== snapPeaV2Ref.hash) throw Error("PLANT_ADMISSION_HASH");
function createPlantsRegistry(newStarts = true) {
  class PlantsRegistry extends ContentRegistry {
    canStart(ref) {
      this.get(ref);
      return this.isLegacy(ref) || newStarts && sameRef(ref, snapPeaV2Ref);
    }
  }
  return new PlantsRegistry([snapPeaDefinition, snapPeaV2]);
}
function createLifePlantsB2(base2, newStarts = true, landOptions) {
  const registry = createPlantsRegistry(newStarts);
  return createLifeB2(base2, registry, { ref: snapPeaV2Ref, newStarts }, { admit(s, a, c) {
    let entity;
    let plot2;
    if (c.verb === "buy-seed" || c.verb === "sell") {
      registry.get(c.ref);
      if (c.ref.id !== "crop:snap-pea") throw Error("USE_AUTHORED_COUNTER");
      entity = rooms[s.scene].entities.find((e) => e.id === "crop-counter");
      if (!entity) throw Error("SHOP_ADMISSION_REQUIRED");
    } else if (c.verb === "plant" || c.verb === "water" || c.verb === "harvest") {
      plot2 = c.plot;
      if (!isLifeBed(plot2, s.landV1)) throw Error("PLOT_ADMISSION_REQUIRED");
      const id = plot2.replace("life-", "land-");
      const bed = s.landV1?.plots.find((p) => p.id === id);
      if (!bed || landRegion(bed.region)?.scene !== s.scene) throw Error("PLOT_ADMISSION_REQUIRED");
      entity = landEntities(s).find((e) => e.id === id);
    } else throw Error("LIFE_SPATIAL_NOT_ADMITTED");
    if (!entity || a.target !== entity.id || !s.visited.includes(s.scene)) throw Error("LIFE_TARGET");
    const rule = s.scene + "/" + entity.id + "/" + a.action, w = landWorld(dynamicWorld(s.flags, true), s.landV1);
    const binding = compileSpatialBinding({ id: GAME_UUID, initialMap: [{ id: s.scene, current: true }], characters: [], domainRules: { rules: [{ id: rule, effects: [] }] } }, { version: 1, cartridgeId: GAME_UUID, mapVersion: "harbor-plants-b2-v1", actionScope: "scene", interactionDistance: 75, scenes: [{ id: s.scene, spawn: rooms[s.scene].spawn }], entities: [{ id: entity.id, scene: s.scene, position: { x: entity.at.x - 8, y: entity.at.y - 6 }, approach: entity.approach, states: ["present"], actions: [rule] }], characters: [], portals: [] }, (scene, p) => walkable(w, scene, p));
    if (!binding.admits(rule, entity.id, s.scene, a.position)) throw Error("TOO_FAR");
    binding.assertTransition({ cartridgeId: GAME_UUID, map: [{ id: s.scene, current: true }], characters: [] }, { cartridgeId: GAME_UUID, map: [{ id: s.scene, current: true }], characters: [] }, rule, s.scene);
    return { scene: s.scene, target: entity.id, ...plot2 ? { plot: plot2, cultivated: true } : {} };
  } }, landOptions);
}

// server/after-rain-evidence.ts
import { createHash as createHash6 } from "node:crypto";

// src/life/plant-uses.ts
var basilTemplate = Object.freeze({ id: "theo-basil-v1", revision: 1, quantity: 2, reward: 7, cooldownMinutes: 2880 });
var legacyMintNode = Object.freeze({ id: "harbor-mint-hill-1", species: "plant:harbor-mint", revision: 1, scene: "hill", at: { x: 640, y: 790 }, approach: { x: 632, y: 808 }, stockCap: 2, stockFloor: 1, recoveryMinutes: 720 });
var mintNode = Object.freeze({ ...legacyMintNode, revision: 2, at: { x: 550, y: 690 }, approach: { x: 542, y: 708 } });
var mintItem = "wild:harbor-mint-leaf";
var plantUseVerbs = ["read-offer", "accept-basil", "deliver-basil", "close-basil", "recall-delivery", "observe-mint", "collect-mint", "archive-mint", "share-mint"];
var dueMinute = (accepted) => (Math.floor(accepted / 1440) + 2) * 1440 + 1020;
function mintStatus(s) {
  const m = s.plantUsesV1?.mint, now2 = s.townMinutes ?? 540;
  return { stock: m?.recoverAt !== null && m?.recoverAt !== void 0 && now2 >= m.recoverAt ? 2 : m?.stock ?? 2, remaining: Math.max(0, (m?.recoverAt ?? now2) - now2), observed: m?.observedAt !== void 0, leaves: m?.leaves ?? 0, archived: m?.archivedAt !== void 0, shared: m?.sharedAt !== void 0 };
}

// server/plant-uses-rules.ts
import { createHash as createHash5 } from "node:crypto";
var hash = (v) => createHash5("sha256").update(JSON.stringify(v)).digest("hex");
var basilTemplateHash = hash(basilTemplate);
var mintDefinitionHash = hash(mintNode);
var legacyMintDefinitionHash = hash(legacyMintNode);
var ok2 = (c, e) => {
  if (!c) throw Error(e);
};
var int3 = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
var obj2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var keys3 = (v, allowed) => Object.keys(v).every((k) => allowed.includes(k));
var source4 = (v) => typeof v === "string" && v.length > 0 && v.length <= 120;
function assertPlantUsesReadable(s, r) {
  assertLifeReadable(s, r);
  const p = s.plantUsesV1, now2 = s.townMinutes ?? 540;
  if (p === void 0) {
    ok2(!(s.items[mintItem] ?? 0), "UNSUPPORTED_PLANT_USES_SAVE");
    return;
  }
  const bad = "UNSUPPORTED_PLANT_USES_SAVE";
  ok2(obj2(p) && keys3(p, ["schema", "offerReadAt", "offerReadSource", "order", "deliveries", "mint"]) && p.schema === 1 && int3(p.deliveries), bad);
  ok2(p.offerReadAt === void 0 && p.offerReadSource === void 0 || int3(p.offerReadAt, 0, now2) && source4(p.offerReadSource), bad);
  if (p.order !== void 0) {
    const o = p.order;
    ok2(obj2(o) && Object.keys(o).sort().join(",") === "acceptedMinute,crop,dueMinute,id,quantity,reward,template,templateHash" && source4(o.id) && o.template === basilTemplate.id && o.templateHash === basilTemplateHash && o.quantity === 2 && o.reward === 7 && int3(o.acceptedMinute, 0, now2) && o.dueMinute === dueMinute(o.acceptedMinute) && !s.lifeV1?.order, bad);
    ok2(obj2(o.crop) && Object.keys(o.crop).sort().join(",") === "capability,hash,id,revision" && sameRef(o.crop, r.ref("crop:basil")), bad);
  }
  const m = p.mint;
  if (m === void 0) {
    ok2(!(s.items[mintItem] ?? 0), bad);
    return;
  }
  ok2(obj2(m) && keys3(m, ["node", "definitionHash", "stock", "recoverAt", "observedAt", "observationSource", "leaves", "firstLeafSource", "lastLeafSource", "archivedAt", "archiveSource", "sharedAt", "shareSource"]) && m.node === mintNode.id && [mintDefinitionHash, legacyMintDefinitionHash].includes(m.definitionHash) && int3(m.stock, 1, 2) && (m.stock === 2 && m.recoverAt === null || m.stock === 1 && int3(m.recoverAt, 720, now2 + 720)) && int3(m.leaves, 0, 99) && m.leaves === (s.items[mintItem] ?? 0), bad);
  for (const [t3, k] of [["observedAt", "observationSource"], ["archivedAt", "archiveSource"], ["sharedAt", "shareSource"]]) ok2(m[t3] === void 0 && m[k] === void 0 || int3(m[t3], 0, now2) && source4(m[k]), bad);
  ok2(m.firstLeafSource === void 0 && m.lastLeafSource === void 0 && m.leaves === 0 || source4(m.firstLeafSource) && source4(m.lastLeafSource), bad);
  ok2(m.archivedAt === void 0 || m.firstLeafSource !== void 0, bad);
  ok2(m.sharedAt === void 0 || m.observedAt !== void 0, bad);
}
function applyPlantUse(previous, verb, actionId, r, newStarts) {
  ok2(plantUseVerbs.includes(verb), "INVALID_PLANT_USE_COMMAND");
  ok2(source4(actionId), "INVALID_ACTION_ID");
  assertPlantUsesReadable(previous, r);
  ok2(!previous.activeChallenge && !battleLocksWorld(previous), "CHALLENGE_ACTIVE");
  const s = pinLegacy(previous, r);
  s.plantUsesV1 ??= { schema: 1, deliveries: 0 };
  const p = s.plantUsesV1, life = s.lifeV1, now2 = s.townMinutes ?? 540;
  let text2;
  if (verb === "read-offer") {
    ok2(newStarts, "PLANT_USES_STARTS_CLOSED");
    p.offerReadAt ??= now2;
    p.offerReadSource ??= actionId;
    text2 = ["\u897F\u5965\u7684\u53A8\u623F\u9700\u8981\u4E24\u4EFD\u7F57\u52D2\uFF0C\u4ED8$7\u3002\u63A5\u5355\u540E\u622A\u6B62\u540E\u592917:00\uFF1B\u4E5F\u53EF\u4EE5\u4E0D\u63A5\uFF0C\u53BB\u6742\u8D27\u94FA\u6BCF\u4EFD\u5356$3\u3002", "Theo needs two basil portions for $7. Accepting makes them due by 17:00 the day after tomorrow. You can decline and sell at the grocer for $3 each."];
  } else if (verb === "accept-basil") {
    ok2(newStarts, "PLANT_USES_STARTS_CLOSED");
    ok2(p.offerReadAt !== void 0, "ORDER_PREMISE_UNREAD");
    ok2(!life.order && !p.order, "ORDER_ACTIVE");
    ok2(now2 >= life.cooldownUntil, "ORDER_COOLDOWN");
    p.order = { id: actionId, template: "theo-basil-v1", templateHash: basilTemplateHash, crop: r.ref("crop:basil"), quantity: 2, reward: 7, acceptedMinute: now2, dueMinute: dueMinute(now2) };
    text2 = ["\u63A5\u4E0B\u4E24\u4EFD\u7F57\u52D2\u7684\u8BA2\u5355\u3002\u540E\u592917:00\u524D\uFF0C\u6765\u5496\u5561\u9986\u5F53\u9762\u4EA4\u7ED9\u897F\u5965\u3002", "You accept the order for two basil portions. Deliver them to Theo at the caf\xE9 before 17:00 the day after tomorrow."];
  } else if (verb === "deliver-basil") {
    const o = p.order;
    ok2(o, "ORDER_MISSING");
    ok2(now2 < o.dueMinute, "ORDER_EXPIRED");
    ok2(s.cash + o.reward <= 999, "PURSE_FULL");
    consumeLot(s, r, o.crop, "produce", o.quantity);
    s.cash += o.reward;
    delete p.order;
    p.deliveries++;
    life.cooldownUntil = now2 + basilTemplate.cooldownMinutes;
    if (!life.firstRewards.includes("theo-order-first")) {
      ok2(Object.keys(life.collections).length < 64, "COLLECTION_CAPACITY");
      life.firstRewards.push("theo-order-first");
      s.relations.theo = Math.min(100, Math.max(-100, (s.relations.theo ?? 0) + 2));
      s.items[giftItems[0]] = 1;
      life.collections["gift:" + giftItems[0]] = { id: "gift:" + giftItems[0], sourceAction: actionId, minute: now2 };
    }
    text2 = ["\u897F\u5965\u6536\u4E0B\u4E24\u4EFD\u7F57\u52D2\uFF0C\u4ED8\u4E86$7\u3002\u4ED6\u628A\u8FD9\u6B21\u4F9B\u8D27\u8BB0\u5728\u53A8\u623F\u4FBF\u6761\u4E0A\uFF0C\u4F59\u4E0B\u7684\u6536\u6210\u7531\u4F60\u5B89\u6392\u3002", "Theo takes two basil portions and pays $7. He notes the delivery for the kitchen. The rest of your harvest is yours to use."];
  } else if (verb === "close-basil") {
    ok2(p.order, "ORDER_MISSING");
    ok2(now2 >= p.order.dueMinute, "ORDER_NOT_EXPIRED");
    delete p.order;
    life.cooldownUntil = now2 + basilTemplate.cooldownMinutes;
    text2 = ["\u8BA2\u5355\u5DF2\u7ECF\u8FC7\u671F\u3002\u7F57\u52D2\u4ECD\u5728\u884C\u56CA\uFF0C\u53EF\u4EE5\u51FA\u552E\u6216\u7559\u79CD\u3002", "The order expired. Your basil stays in your bag to sell or save for seed."];
  } else if (verb === "recall-delivery") {
    ok2(p.deliveries > 0, "DELIVERY_MEMORY_MISSING");
    text2 = ["\u201C\u4E0A\u6B21\u7684\u7F57\u52D2\u5DF2\u7ECF\u7528\u5728\u53A8\u623F\u91CC\u4E86\uFF0C\u8C22\u8C22\u3002\u79CD\u4E0B\u4E00\u8F6E\u4E4B\u524D\uFF0C\u5148\u60F3\u597D\u81EA\u5DF1\u8981\u7559\u591A\u5C11\u3002\u201D", "\u201CYour last basil delivery went into the kitchen. Thank you. Before planting again, think about how much you want to keep.\u201D"];
  } else {
    p.mint ??= { node: "harbor-mint-hill-1", definitionHash: mintDefinitionHash, stock: 2, recoverAt: null, leaves: 0 };
    const m = p.mint, status = mintStatus(s);
    if (verb === "observe-mint") {
      ok2(m.definitionHash === mintDefinitionHash && newStarts, "PLANT_USES_STARTS_CLOSED");
      m.observedAt ??= now2;
      m.observationSource ??= actionId;
      text2 = ["\u89C2\u5BDF\u5DF2\u8BB0\u4E0B\uFF1A\u8FD9\u91CC\u53EA\u8BB8\u5C11\u91CF\u91C7\u53F6\uFF0C\u4FDD\u7559\u682A\u4E1B\u3002\u91C7\u8FC7\u540E\u63A8\u8FDB\u5341\u4E8C\u5C0F\u65F6\u6E38\u620F\u65F6\u95F4\uFF0C\u518D\u56DE\u6765\u770B\u770B\u3002", "You record the observation: take only a small amount of leaves and keep the clump. After collecting, return after twelve game hours."];
    } else if (verb === "collect-mint") {
      ok2(m.definitionHash === mintDefinitionHash && newStarts, "PLANT_USES_STARTS_CLOSED");
      ok2(status.stock > mintNode.stockFloor, "WILD_PLANT_RECOVERING");
      ok2(m.leaves < 99, "INVENTORY_FULL");
      ok2(s.energy >= 2, "REST_NEEDED");
      s.energy -= 2;
      advanceAwake(s, 10);
      s.townMinutes = now2 + 10;
      m.stock = 1;
      m.recoverAt = s.townMinutes + 720;
      m.leaves++;
      m.firstLeafSource ??= actionId;
      m.lastLeafSource = actionId;
      m.observedAt ??= now2;
      m.observationSource ??= actionId;
      s.items[mintItem] = m.leaves;
      text2 = ["\u91C7\u4E0B\u4E00\u4EFD\u53F6\uFF0C\u682A\u4E1B\u4FDD\u7559\u7740\u3002\u53F6\u7247\u653E\u8FDB\u884C\u56CA\uFF1B\u5341\u4E8C\u4E2A\u6E38\u620F\u5C0F\u65F6\u540E\u53EF\u518D\u91C7\u3002", "You take one portion of leaves and leave the clump. The leaves go into your bag. Collect again after twelve game hours."];
    } else if (verb === "archive-mint") {
      ok2(m.leaves > 0, "ITEMS_MISSING");
      ok2(m.archivedAt === void 0, "MINT_ALREADY_ARCHIVED");
      m.leaves--;
      if (m.leaves) s.items[mintItem] = m.leaves;
      else delete s.items[mintItem];
      m.archivedAt = now2;
      m.archiveSource = actionId;
      text2 = ["\u4E00\u4EFD\u53F6\u7247\u6536\u5165\u4F60\u7684\u751F\u6D3B\u8BB0\u5F55\uFF0C\u4E0D\u518D\u4F5C\u4E3A\u884C\u56CA\u5B9E\u7269\uFF1B\u6765\u6E90\u548C\u89C2\u5BDF\u4F1A\u4FDD\u7559\u3002", "One portion of leaves goes into your notebook and leaves your bag. Its source and your observation remain."];
    } else {
      ok2(m.observedAt !== void 0, "DISCOVERIES_MISSING");
      ok2(m.sharedAt === void 0, "MINT_ALREADY_SHARED");
      m.sharedAt = now2;
      m.shareSource = actionId;
      s.relations.dani = Math.min(100, Math.max(-100, (s.relations.dani ?? 0) + 1));
      text2 = ["\u4E39\u59AE\u542C\u4F60\u8BB2\u8FC7\u682A\u4E1B\u548C\u91C7\u96C6\u8FB9\u754C\uFF0C\u7ED9\u4F60\u7684\u89C2\u5BDF\u6DFB\u4E86\u6CE8\u91CA\u3002\u5979\u4ECD\u53EA\u6536\u843D\u53F6\uFF0C\u4E0D\u5411\u4F60\u7D22\u53D6\u6D3B\u682A\u3002", "Dani adds a note about the clump and its collection limits. She still saves fallen leaves and does not ask for a living plant."];
    }
  }
  assertPlantUsesReadable(s, r);
  return { head: s, text: text2 };
}

// server/after-rain-evidence.ts
var digest = (value) => createHash6("sha256").update(JSON.stringify(value)).digest("hex");
var freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
var integer5 = (n) => Number.isSafeInteger(n) && n >= 0;
function afterRainFacts(s, registry) {
  assertWeatherReadable(s);
  if (!s.weatherV1 || !s.weatherEcologyV1 || !rooms[s.scene]?.outdoor) return null;
  if (typeof s.id !== "string" || !s.id.length || s.id.length > 160 || !integer5(s.version)) throw Error("INVALID_AFTER_RAIN_HEAD");
  const now2 = s.townMinutes ?? 540, w = s.weatherV1, e = s.weatherEcologyV1, slot2 = w.parameters.slotMinutes;
  if (w.kind !== "cloudy") return null;
  const firstEnd = 540 + 3 * slot2, cycle = 4 * slot2, k = Math.floor((now2 - firstEnd) / cycle), end = firstEnd + k * cycle, start = end - slot2;
  if (!integer5(start) || !integer5(end) || now2 < end || now2 - end >= slot2) return null;
  if (weatherAt(start, w.parameters) !== "light-rain" || weatherAt(end, w.parameters) !== "cloudy") throw Error("AFTER_RAIN_RULESET_DRIFT");
  const from = Math.max(start, w.activatedAt, e.activatedAt);
  if (from >= end) return null;
  const parametersHash = digest([w.ruleset, w.parameters, weatherKinds, e.ruleset]);
  const scope = digest([s.id, parametersHash, e.activatedAt]);
  const factId = "after-rain:" + digest([scope, start, from, end]);
  const clues = [], plant = s, m = plant.plantUsesV1?.mint;
  if (m) {
    assertPlantUsesReadable(plant, registry);
    if (m.definitionHash === mintDefinitionHash && m.observedAt !== void 0 && m.observationSource && mintStatus(plant).stock === 2) {
      clues.push({ kind: "revisit-known-mint", node: mintNode.id, definitionHash: m.definitionHash, scene: mintNode.scene, at: { ...mintNode.at } });
    }
  }
  return freeze({ schema: 1, kind: "confirmed-after-rain", factId, scope, snapshotVersion: s.version, currentMinute: now2, scene: s.scene, weatherNow: "cloudy", source: { kind: "confirmed-game-weather", ruleset: e.ruleset, parametersHash, policyActivatedAt: e.activatedAt }, rain: { scheduledFrom: start, confirmedFrom: from, endedAt: end }, clues });
}
function admitAfterRainDraft(s, registry, input) {
  const f2 = afterRainFacts(s, registry);
  if (!f2) throw Error("AFTER_RAIN_UNAVAILABLE");
  const d = input;
  if (!d || typeof d !== "object" || Array.isArray(d) || Object.keys(d).sort().join(",") !== "effects,expected_version,factId,schema,tone,topic" || d.schema !== 1 || !Array.isArray(d.effects) || d.effects.length || !["rain-ended", "known-mint-ready"].includes(d.topic) || !["practical", "reflective"].includes(d.tone)) throw Error("UNSUPPORTED_AFTER_RAIN_DRAFT");
  if (d.expected_version !== s.version) throw Error("AFTER_RAIN_VERSION_CONFLICT");
  if (d.factId !== f2.factId) throw Error("AFTER_RAIN_FACT_MISMATCH");
  if (d.topic === "known-mint-ready" && !f2.clues.length) throw Error("AFTER_RAIN_TOPIC_NOT_GROUNDED");
  const text2 = d.topic === "known-mint-ready" ? ["\u5C0F\u96E8\u5DF2\u7ECF\u7ED3\u675F\u3002\u4F60\u89C2\u5BDF\u8FC7\u7684\u539F\u91CE\u8584\u8377\u5DF2\u53EF\u518D\u8BBF\uFF1B\u91C7\u53F6\u4ECD\u6309\u539F\u89C4\u5219\u3002", "The light rain has ended. The mint clump you observed is ready to revisit; the original collection rules still apply."] : d.tone === "reflective" ? ["\u8FD9\u4E00\u9635\u5C0F\u96E8\u5DF2\u7ECF\u8FC7\u53BB\uFF1B\u5148\u8BB0\u4E0B\u5DF2\u7ECF\u53D1\u751F\u7684\u4E8B\uFF0C\u4E0B\u4E00\u9635\u5929\u6C14\u4ECD\u9700\u89C2\u5BDF\u3002", "This spell of light rain has passed. Keep a record of what happened; the next spell still needs watching."] : ["\u8FD9\u4E00\u9635\u5C0F\u96E8\u5DF2\u7ECF\u7ED3\u675F\uFF0C\u76EE\u524D\u662F\u9634\u5929\u3002", "This spell of light rain has ended. It is cloudy now."];
  return freeze({ kind: "deterministic-weather-topic", factId: f2.factId, snapshotVersion: s.version, topic: d.topic, tone: d.tone, source: f2.source, text: text2, effects: [] });
}

// server/after-rain-runtime.ts
var perspectives = {
  mara: ["\u201C\u96E8\u505C\u4E86\uFF0C\u53EF\u4EE5\u6162\u6162\u518D\u8D70\u4E00\u6BB5\uFF1B\u7D2F\u4E86\u4ECD\u53EF\u4EE5\u56DE\u5BB6\u4F11\u606F\u3002\u201D", "\u201CThe rain has stopped. There is time for another stroll, or to head home and rest.\u201D"],
  elena: ["\u201C\u5148\u770B\u770B\u539F\u6765\u7684\u6D3B\u682A\uFF0C\u522B\u6025\u7740\u591A\u6458\uFF1B\u7559\u7ED9\u5B83\u6062\u590D\u7684\u4F59\u5730\u3002\u201D", "\u201CLook at the living clump first. Leave it room to recover before taking more.\u201D"],
  arthur: ["\u201C\u8BB0\u4E0B\u5DF2\u7ECF\u770B\u89C1\u7684\u4E8B\uFF0C\u4E0B\u4E00\u9635\u5929\u6C14\u8FD8\u5F97\u7EE7\u7EED\u89C2\u5BDF\u3002\u201D", "\u201CNote what you have seen. The next spell of weather still needs watching.\u201D"],
  dani: ["\u201C\u8FD9\u662F\u4F60\u5728\u9547\u4E0A\u786E\u8BA4\u7684\u5929\u6C14\u7ECF\u5386\uFF0C\u548C\u6709\u51FA\u5904\u3001\u6709\u65E5\u671F\u7684\u65B0\u95FB\u5206\u5F00\u8BB0\u3002\u201D", "\u201CThis is weather you confirmed in town. Keep it separate from news with a source and date.\u201D"],
  owen: ["\u201C\u539F\u6765\u7684\u91C7\u96C6\u89C4\u5219\u7167\u65E7\uFF0C\u96E8\u540E\u4E5F\u4E0D\u7528\u6025\u7740\u628A\u682A\u4E1B\u6458\u7A7A\u3002\u201D", "\u201CThe collection rules still apply. No need to strip a clump after the rain.\u201D"],
  avery: ["\u201C\u8D70\u719F\u6089\u7684\u8DEF\uFF0C\u518D\u770B\u4E00\u773C\u5DF2\u7ECF\u8BA4\u8BC6\u7684\u5730\u65B9\u5C31\u597D\u3002\u201D", "\u201CFollow a familiar route and look again at a place you already know.\u201D"]
};
function createAfterRainIntegration() {
  const registry = createPlantsRegistry();
  return {
    project(s) {
      const facts = afterRainFacts(s, registry);
      const speakers = facts ? rooms[s.scene].entities.filter((e) => e.person && perspectives[e.person] && s.known.includes(e.person) && presentEntity(s, e)).map((e) => e.person) : [];
      return { schema: 1, enabled: true, modelCallsEnabled: false, facts, speakers: [...new Set(speakers)] };
    },
    resolve(s, a, person) {
      if (!perspectives[person]) throw Error("AFTER_RAIN_PERSON_UNAVAILABLE");
      const p = a.payload;
      if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join(",") !== "effects,factId,schema,tone,topic") throw Error("UNSUPPORTED_AFTER_RAIN_DRAFT");
      const admitted = admitAfterRainDraft(s, registry, { ...p, expected_version: a.expected_version });
      return [admitted.text[0] + " " + perspectives[person][0], admitted.text[1] + " " + perspectives[person][1]];
    }
  };
}

// server/weather-ecology.ts
function initializeWeatherEcology(s, enabled) {
  if (enabled && s.weatherV1 && !s.weatherEcologyV1) s.weatherEcologyV1 = createWeatherEcology(s.townMinutes ?? 540);
}
function settleWeatherEcology(before, next) {
  const e = next.weatherEcologyV1;
  if (!e) return;
  const to = next.townMinutes ?? 540, from = e.settledThrough;
  if (!validWeatherEcology(e, from, next.weatherV1)) throw Error("UNSUPPORTED_WEATHER_ECOLOGY_SAVE");
  if (!Number.isSafeInteger(to) || to < from) throw Error("WEATHER_ECOLOGY_TIME_REVERSED");
  const old = before.plantUsesV1?.mint, m = next.plantUsesV1?.mint;
  const recovering = m?.definitionHash === mintDefinitionHash && m.stock === 1 && m.recoverAt !== null && old?.recoverAt === m.recoverAt && old.definitionHash === m.definitionHash;
  if (recovering) {
    let at = from;
    while (at < to && m.recoverAt > at && m.recoverAt > 720) {
      const day2 = Math.floor(at / 1440);
      if (e.rainDay !== day2) {
        e.rainDay = day2;
        e.mintRainUsed = 0;
      }
      const parameters = next.weatherV1.parameters, slotEnd = 540 + (Math.floor((at - 540) / parameters.slotMinutes) + 1) * parameters.slotMinutes, end = Math.min(to, (day2 + 1) * 1440, slotEnd, m.recoverAt);
      if (weatherAt(at, parameters) === "light-rain") {
        const grant = Math.min(end - at, mintRainCap - e.mintRainUsed, Math.ceil((m.recoverAt - at) / 2), m.recoverAt - 720);
        m.recoverAt -= grant;
        e.mintRainUsed += grant;
      }
      at = end;
    }
  }
  const day = Math.floor(to / 1440);
  if (e.rainDay !== day) {
    e.rainDay = day;
    e.mintRainUsed = 0;
  }
  e.settledThrough = to;
}

// server/weather.ts
function createWeatherSettlement(options = {}) {
  const enabled = options.enabled === true, newStarts = options.newStarts !== false, parameters = options.parameters ?? defaultWeatherParameters, registry = createPlantsRegistry();
  if (!validWeatherParameters(parameters)) throw Error("INVALID_WEATHER_INPUT");
  const initialize = (s) => {
    if (enabled && newStarts && !s.weatherV1) s.weatherV1 = createWeatherState(s.townMinutes ?? 540, parameters);
    initializeWeatherEcology(s, options.ecology === true && newStarts);
    return s;
  };
  const settle = (before, next) => {
    if (!next.weatherV1) {
      if (!enabled || !newStarts) return;
      next.weatherV1 = createWeatherState(before.townMinutes ?? 540, parameters);
    }
    if (!next.weatherEcologyV1 && options.ecology === true && newStarts) {
      const pin = initialize(structuredClone(before)).weatherEcologyV1;
      if (pin) next.weatherEcologyV1 = pin;
    }
    settleWeatherEcology(before, next);
    const w = next.weatherV1, from = w.settledThrough, to = next.townMinutes ?? 540;
    if (to < from) throw Error("WEATHER_TIME_REVERSED");
    if (to === from) {
      assertWeatherReadable(next);
      return;
    }
    const plots = [];
    if (rooms.garden.outdoor) for (const id of plotIds) {
      const p = next.plots?.[id];
      if (p) plots.push({ key: "garden:" + id, p, maximum: crops[p.crop].minutes, start: Math.max(from, p.updatedAt) });
    }
    const s = next;
    for (const [id, p] of Object.entries(s.lifeV1?.plots ?? {})) {
      const bed = s.landV1?.plots.find((b) => b.id === id.replace("life-", "land-")), region = bed && landRegion(bed.region);
      if (region && rooms[region.scene]?.outdoor) plots.push({ key: "land:" + id, p, maximum: registry.get(p.ref).growMinutes, start: Math.max(from, p.updatedAt) });
    }
    for (const q of plots) {
      q.p.grown = Math.min(q.maximum, q.p.grown + Math.max(0, Math.min(q.start, q.p.wetUntil) - q.p.updatedAt));
      q.p.updatedAt = q.start;
    }
    const active = plots.filter((q) => q.p.grown < q.maximum), cap = w.parameters.rainMinutesPerDay;
    let at = from;
    while (cap > 0 && at < to && active.some((q) => q.p.grown < q.maximum)) {
      const day2 = Math.floor(at / 1440);
      if (w.rainDay !== day2) {
        w.rainDay = day2;
        w.water = {};
      }
      const slotEnd = 540 + (Math.floor((at - 540) / w.parameters.slotMinutes) + 1) * w.parameters.slotMinutes, end = Math.min(to, (day2 + 1) * 1440, slotEnd);
      const rain = weatherAt(at, w.parameters) === "light-rain";
      for (const q of active) {
        const begin = Math.max(at, q.start), p = q.p;
        if (begin >= end || p.grown >= q.maximum) continue;
        const wet = Math.max(0, Math.min(end, p.wetUntil) - begin);
        p.grown = Math.min(q.maximum, p.grown + wet);
        const dry = Math.max(begin, p.wetUntil), grant = rain ? Math.min(Math.max(0, end - dry), Math.max(0, cap - (w.water[q.key] ?? 0)), q.maximum - p.grown) : 0;
        if (grant > 0) {
          p.grown += grant;
          p.wetUntil = Math.max(p.wetUntil, dry + grant);
          w.water[q.key] = (w.water[q.key] ?? 0) + grant;
        }
      }
      at = end;
    }
    for (const q of plots) {
      if (at < to && q.p.grown < q.maximum) q.p.grown = Math.min(q.maximum, q.p.grown + Math.max(0, Math.min(to, q.p.wetUntil) - Math.max(at, q.start)));
      q.p.updatedAt = to;
      q.p.wetUntil = Math.max(q.p.wetUntil, to);
    }
    const day = Math.floor(to / 1440);
    if (w.rainDay !== day) {
      w.rainDay = day;
      w.water = {};
    }
    w.settledThrough = to;
    w.kind = weatherAt(to, w.parameters);
    assertWeatherReadable(next);
  };
  return { initialize, settle };
}
function withWeatherRuntime(base2, weather) {
  return {
    ...base2,
    initial(...args) {
      return weather.initialize(base2.initial(...args));
    },
    assertReadable(s) {
      base2.assertReadable(s);
      assertWeatherReadable(s);
    },
    finalizeMotion(before, next) {
      base2.finalizeMotion?.(before, next);
      weather.settle(before, next);
    },
    async prepare(s, a, ...args) {
      const before = weather.initialize(structuredClone(s));
      const result = await base2.prepare(before, a, ...args);
      weather.settle(before, result.head);
      this.assertReadable(result.head);
      return result;
    }
  };
}

// src/animals/native-crab-profile.ts
var nativeCrabProfile = Object.freeze({
  id: "shore-crab-native-c1-v2",
  revision: 2,
  ground: Object.freeze({
    down: Object.freeze({ x: -15, y: -20, w: 30, h: 20 }),
    left: Object.freeze({ x: -8, y: -26, w: 23, h: 26 }),
    right: Object.freeze({ x: -15, y: -26, w: 23, h: 26 }),
    up: Object.freeze({ x: -15, y: -20, w: 30, h: 20 })
  }),
  speed: 18,
  retreatSpeed: 26,
  stride: 16,
  stopDistance: 68,
  resumeDistance: 92,
  targetDistance: 104,
  maxRetreat: 64,
  endPause: 0.8,
  quietTime: 0.4,
  productionEnabled: false,
  saveRegistration: false
});

// src/animals/native-crab.ts
var inside5 = (r, b) => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
var nativeCrabBody = (p, d) => {
  const b = nativeCrabProfile.ground[d];
  return { ...b, x: b.x + p.x, y: b.y + p.y };
};
function nativeCrabClear(p, d, id, r, c, occupied = []) {
  const s = c.world.scenes[id], b = nativeCrabBody(p, d);
  return !!s && finitePoint(p) && inside5(s.interior, b) && inside5(r, b) && ![...s.obstacles, ...c.forbidden[id] ?? [], ...occupied, ...Object.values(c.people).filter((p2) => p2.scene === id).map((p2) => p2.body), ...c.scene === id ? [c.player] : []].some((t3) => overlaps(b, t3));
}
var EPS = 1e-7;
var P = nativeCrabProfile;
var axis = (facing) => facing === "down" || facing === "up" ? "x" : "y";
var other = (a) => a === "x" ? "y" : "x";
var validRect = (r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
var freeze2 = (v) => {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze2);
    Object.freeze(v);
  }
  return v;
};
var initial3 = (d) => ({ id: d.id, species: "crab", visualVersion: d.visualVersion, profileRevision: 2, scene: null, lane: null, foot: { x: 0, y: 0 }, direction: "down", pose: "stand", phase: "hidden", visible: false, distance: 0, quiet: 0, wait: 0, waypoint: 0, route: [] });
function createNativeCrab(input, previewGuard) {
  if (!input.length || input.length > 3 || new Set(input.map((d) => d.id)).size !== input.length) throw Error("CRAB_DEFINITIONS");
  for (const d of input) {
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(d.id) || d.visualVersion !== "shore-crab-native-c1-v2" || !d.schedule || !Object.keys(d.schedule).length) throw Error("CRAB_DEFINITIONS");
    for (const [period2, lane] of Object.entries(d.schedule)) {
      if (!["morning", "afternoon", "evening", "night"].includes(period2) || !lane || !lane.scene || !validRect(lane.region) || lane.region.w > 2048 || lane.region.h > 2048 || !["down", "left", "right", "up"].includes(lane.facing) || lane.ends?.length !== 2 || !lane.ends.every(finitePoint)) throw Error("CRAB_LANE");
      const a = axis(lane.facing), b = other(a);
      if (Math.abs(lane.ends[0][b] - lane.ends[1][b]) > EPS || Math.abs(lane.ends[0][a] - lane.ends[1][a]) < (a === "x" ? P.ground[lane.facing].w : P.ground[lane.facing].h) + 8) throw Error("CRAB_SIDE_AXIS");
    }
  }
  const defs = freeze2(structuredClone(input)), states = new Map(defs.map((d) => [d.id, initial3(d)]));
  let signature = "", minutes = -1;
  const occupied = (s, ctx, reserved) => [...reserved, ...[...states.values()].filter((t3) => t3.id !== s.id && t3.visible && t3.scene === ctx.scene).map((t3) => nativeCrabBody(t3.foot, t3.direction))];
  const clear = (p, s, ctx, reserved) => !!s.lane && nativeCrabClear(p, s.direction, s.lane.scene, s.lane.region, ctx, occupied(s, ctx, reserved)) && (!previewGuard || previewGuard.displayClear(p, s.lane.scene, s.lane.region, ctx) === true);
  const clamp = (p, lane) => {
    const a = axis(lane.facing), b = other(a), q = { ...p };
    q[a] = Math.max(Math.min(...lane.ends.map((e) => e[a])), Math.min(Math.max(...lane.ends.map((e) => e[a])), q[a]));
    q[b] = lane.ends[0][b];
    return q;
  };
  const line = (from, to, s, ctx, reserved, structural = false) => {
    const a = axis(s.direction), b = other(a);
    if (Math.abs(from[b] - to[b]) > EPS) return false;
    const count = Math.max(1, Math.ceil(Math.abs(from[a] - to[a])));
    for (let i = 1; i <= count; i++) {
      const q = { ...from, [a]: from[a] + (to[a] - from[a]) * i / count };
      if (structural) {
        const c = { ...ctx, people: {}, player: { x: -1e4, y: -1e4, w: 1, h: 1 } };
        if (!nativeCrabClear(q, s.direction, s.lane.scene, s.lane.region, c) || previewGuard && previewGuard.displayClear(q, s.lane.scene, s.lane.region, c) !== true) return false;
      } else if (!clear(q, s, ctx, reserved)) return false;
    }
    return true;
  };
  const spawn = (preferred, s, ctx, reserved, rescue = false) => {
    const lane = s.lane, a = axis(lane.facing), lo = Math.min(...lane.ends.map((e) => e[a])), hi = Math.max(...lane.ends.map((e) => e[a]));
    const options = [clamp(preferred, lane)];
    for (let t3 = lo; t3 <= hi; t3 += 4) options.push({ ...lane.ends[0], [a]: t3 });
    options.push({ ...lane.ends[1] });
    return options.filter((q) => clear(q, s, ctx, reserved) && (!rescue || Math.abs(q[a] - preferred[a]) <= 24 && line(preferred, q, s, ctx, reserved, true))).sort((x, y) => Math.abs(x[a] - preferred[a]) - Math.abs(y[a] - preferred[a]))[0];
  };
  const reconcile = (ctx, reserved) => {
    periodAt(ctx.townMinutes);
    if (!validRect(ctx.player) || reserved.some((r) => !validRect(r))) throw Error("CRAB_CONTEXT");
    const sig = ctx.scene + ":" + ctx.townMinutes;
    if (sig === signature) return;
    const consecutive = minutes >= 0 && ctx.townMinutes === minutes + 1 && periodAt(minutes) === periodAt(ctx.townMinutes), preserved = new Set(defs.filter((d) => {
      const s = states.get(d.id), lane = d.schedule[periodAt(ctx.townMinutes)];
      return consecutive && s.scene === ctx.scene && lane?.scene === ctx.scene && JSON.stringify(s.lane) === JSON.stringify(lane);
    }).map((d) => d.id));
    signature = sig;
    minutes = ctx.townMinutes;
    for (const d of defs) if (!preserved.has(d.id)) states.set(d.id, initial3(d));
    defs.forEach((d, index) => {
      if (preserved.has(d.id)) return;
      const s = states.get(d.id), lane = d.schedule[periodAt(ctx.townMinutes)];
      s.lane = lane ?? null;
      s.scene = lane?.scene ?? null;
      s.reason = lane ? "other-scene" : "schedule-away";
      if (!lane || lane.scene !== ctx.scene) return;
      s.direction = lane.facing;
      const a = axis(lane.facing), start = { ...lane.ends[0], [a]: lane.ends[0][a] + Math.sign(lane.ends[1][a] - lane.ends[0][a]) * index * 24 };
      const q = spawn(start, s, ctx, reserved);
      if (!q) {
        s.reason = "no-safe-position";
        return;
      }
      s.visible = true;
      s.foot = { ...q };
      s.phase = "idle";
      s.wait = P.endPause;
      s.reason = void 0;
    });
  };
  const snapshot = () => structuredClone([...states.values()]);
  const tick = (elapsed, ctx, reserved = []) => {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw Error("INVALID_FRAME_TIME");
    reconcile(ctx, reserved);
    const dt = ctx.paused ? 0 : Math.min(elapsed, 0.04), player = { x: ctx.player.x + ctx.player.w / 2, y: ctx.player.y + ctx.player.h / 2 };
    for (const s of states.values()) {
      if (!s.lane || s.scene !== ctx.scene) continue;
      if (!s.visible || !clear(s.foot, s, ctx, reserved)) {
        const rescue = s.reason === "blocked-safety" || s.visible, q = spawn(s.foot, s, ctx, reserved, rescue);
        s.route = [];
        s.pose = "stand";
        s.quiet = 0;
        s.distance = 0;
        if (!q) {
          s.visible = false;
          s.phase = "hidden";
          s.reason = rescue ? "blocked-safety" : "no-safe-position";
          continue;
        }
        s.visible = true;
        s.foot = { ...q };
        s.phase = "idle";
        s.wait = P.endPause;
        s.reason = void 0;
      }
      if (!dt) continue;
      const near = Math.hypot(player.x - s.foot.x, player.y - s.foot.y), a = axis(s.direction);
      let motionDt = dt;
      if (near < P.stopDistance && s.phase !== "retreat") {
        const sign = Math.sign(s.foot[a] - player[a]) || 1, perpendicular = s.foot[other(a)] - player[other(a)], offset = Math.sqrt(Math.max(0, P.targetDistance ** 2 - perpendicular ** 2));
        const wanted = clamp({ ...s.foot, [a]: s.foot[a] + sign * Math.min(P.maxRetreat, Math.max(0, offset - Math.abs(s.foot[a] - player[a]))) }, s.lane);
        if (Math.abs(wanted[a] - s.foot[a]) > EPS && clear(wanted, s, ctx, reserved) && line(s.foot, wanted, s, ctx, reserved)) {
          s.phase = "retreat";
          s.route = [wanted];
          s.wait = 0;
          s.reason = void 0;
        } else {
          s.phase = "alert";
          s.pose = "stand";
          s.route = [];
          s.quiet += dt;
          s.reason = "no-safe-side-retreat";
          continue;
        }
      }
      if (s.phase === "retreat" && near >= P.resumeDistance) {
        s.phase = "idle";
        s.pose = "stand";
        s.route = [];
        s.wait = P.endPause;
        s.quiet = 0;
        continue;
      }
      if (s.phase === "alert" && near >= P.resumeDistance) {
        s.phase = "idle";
        s.wait = P.endPause;
        s.reason = void 0;
      }
      if (s.phase === "alert") {
        s.pose = "stand";
        s.quiet += dt;
        continue;
      }
      if (s.wait > 0) {
        const spent = Math.min(s.wait, motionDt);
        s.wait = Math.max(0, s.wait - spent);
        motionDt -= spent;
        s.quiet += spent;
        if (motionDt <= EPS) {
          s.pose = "stand";
          continue;
        }
      }
      if (!s.route.length) {
        const to = s.lane.ends[s.waypoint === 0 ? 1 : 0];
        if (!clear(to, s, ctx, reserved) || !line(s.foot, to, s, ctx, reserved)) {
          s.phase = "idle";
          s.pose = "stand";
          s.quiet += motionDt;
          s.reason = "side-lane-blocked";
          continue;
        }
        s.route = [{ ...to }];
        s.phase = "sidewalk";
        s.reason = void 0;
      }
      const retreat = s.phase === "retreat", speed = retreat ? P.retreatSpeed : P.speed, result = advanceRoute(s.foot, s.route, speed * motionDt, (q) => clear(q, s, ctx, reserved));
      s.foot = result.position;
      s.route.splice(0, result.consumed);
      if (result.distance > EPS) {
        s.distance += result.distance;
        s.quiet = 0;
        s.pose = Math.floor(s.distance / P.stride * 2) % 2 ? "walkB" : "walkA";
      } else {
        s.pose = "stand";
        s.quiet += motionDt;
      }
      if (result.arrived || result.blocked) {
        s.route = [];
        s.phase = retreat ? "alert" : "idle";
        s.pose = "stand";
        const unused = Math.max(0, motionDt - result.distance / speed);
        s.wait = Math.max(0, P.endPause - unused);
        if (result.distance > EPS) s.quiet = unused;
        if (!retreat && !result.blocked) s.waypoint = s.waypoint === 0 ? 1 : 0;
        s.reason = result.blocked ? "side-lane-blocked" : retreat ? "retreat-limit" : void 0;
      }
    }
    return snapshot();
  };
  return { tick, snapshot, committedMinute: () => minutes, restore: (frames, ctx) => {
    reconcile(ctx, []);
    if (frames.length !== defs.length) throw Error("CRAB_RESTORE");
    for (const d of defs) {
      const s = frames.find((f2) => f2.id === d.id);
      if (!s || s.species !== "crab" || s.visualVersion !== d.visualVersion || s.profileRevision !== 2 || JSON.stringify(s.lane) !== JSON.stringify(d.schedule[periodAt(ctx.townMinutes)] ?? null)) throw Error("CRAB_RESTORE");
      states.set(d.id, structuredClone(s));
    }
  }, reset: () => {
    signature = "";
    minutes = -1;
    for (const d of defs) states.set(d.id, initial3(d));
  }, observe: (id, ctx, reserved = []) => {
    tick(0, ctx, reserved);
    const s = states.get(id);
    if (!s?.visible || s.scene !== ctx.scene) throw Error("CRAB_AWAY");
    const distance2 = Math.hypot(ctx.player.x + ctx.player.w / 2 - s.foot.x, ctx.player.y + ctx.player.h / 2 - s.foot.y);
    if (distance2 < 72 || distance2 > 112) throw Error("CRAB_OBSERVATION_DISTANCE");
    if (s.phase !== "idle" || s.pose !== "stand" || s.quiet < P.quietTime) throw Error("CRAB_NEEDS_QUIET_MOMENT");
    return { fixtureOnly: true, activationAllowed: false, profile: P.id, profileRevision: P.revision, minute: ctx.townMinutes, scene: ctx.scene, behavior: "shore-space", frame: structuredClone(s) };
  } };
}

// src/animals/display-space.ts
var previewPolicy = Object.freeze({ gap: 8, maxOffset: 96, step: 8, purpose: "static display envelopes, not ground colliders", activationAllowed: false });
var valid = (r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
var inside6 = (r, b) => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
var translated = (r, p) => ({ ...r, x: r.x + p.x, y: r.y + p.y });
var padded = (r) => ({ x: r.x - previewPolicy.gap, y: r.y - previewPolicy.gap, w: r.w + 2 * previewPolicy.gap, h: r.h + 2 * previewPolicy.gap });
function envelope(measured) {
  if (!measured || !/^[a-f0-9]{64}$/.test(measured.sha256)) throw Error("UNPINNED_GEOMETRY");
  const frames = Object.values(measured.frames ?? {}).map((f2) => f2.relative);
  if (!frames.length || frames.some((r) => !valid(r))) throw Error("INVALID_GEOMETRY");
  const x = Math.min(...frames.map((r) => r.x)), y = Math.min(...frames.map((r) => r.y));
  return { x, y, w: Math.max(...frames.map((r) => r.x + r.w)) - x, h: Math.max(...frames.map((r) => r.y + r.h)) - y };
}
function previewReservations(scene, { context: ctx, states, geometry: geometry2, extraVisual = [] }) {
  if (geometry2.schema !== 2 || geometry2.activationAllowed !== false) throw Error("PREVIEW_GEOMETRY_ONLY");
  const visual = [...extraVisual.map((r) => ({ ...r }))], ground = [];
  for (const prop of Object.values(geometry2.props)) if (prop.scene === scene) visual.push(translated(envelope(prop), prop.foot));
  for (const [id, p] of Object.entries(ctx.people)) if (p.scene === scene) {
    if (!valid(p.body)) throw Error("INVALID_OCCUPANCY");
    ground.push({ ...p.body });
    const box = translated(envelope(geometry2.people["npc-" + id]), p.foot), radius = Math.max(0, (p.body.w - 18) / 2);
    visual.push({ ...box, x: box.x - radius, w: box.w + 2 * radius });
  }
  for (const animal of states) if (animal.slot?.scene === scene) {
    const slot2 = animal.slot.region, v = envelope(geometry2.animals[animal.visualVersion]), lift = profiles[animal.species].flightHeight;
    visual.push({ x: slot2.x + v.x, y: slot2.y + v.y - lift, w: slot2.w + v.w, h: slot2.h + v.h + lift });
  }
  for (const animal of states) if (animal.visible && animal.scene === scene) {
    ground.push(bodyAt(animal.foot, profiles[animal.species]));
    visual.push(translated(envelope(geometry2.animals[animal.visualVersion]), { x: animal.foot.x, y: animal.foot.y - animal.elevation }));
  }
  if (ctx.scene === scene) {
    ground.push({ ...ctx.player });
    visual.push(translated(envelope(geometry2.people["harbor-hero"]), { x: ctx.player.x + 8, y: ctx.player.y + 12 }));
  }
  if ([...visual, ...ground].some((r) => !valid(r))) throw Error("INVALID_OCCUPANCY");
  return { visual, ground };
}
var reservationCache = /* @__PURE__ */ new WeakMap();
function previewClear(foot, scene, region, relative2, input) {
  const ctx = input.context, s = ctx.world.scenes[scene];
  if (ctx.scene !== scene || !s || !valid(relative2) || !valid(region) || !Number.isFinite(foot.x) || !Number.isFinite(foot.y)) return false;
  const box = translated(relative2, foot), protectedBox = padded(box), reserved = reservationCache.get(input) ?? previewReservations(scene, input);
  reservationCache.set(input, reserved);
  return bodyClear(foot, scene, region, { collision: { w: 1, h: 1 } }, ctx, reserved.ground) && inside6(s.interior, protectedBox) && inside6(region, protectedBox) && ![...s.obstacles, ...ctx.forbidden[scene] ?? [], ...reserved.ground, ...reserved.visual].some((r) => overlaps(protectedBox, r));
}

// src/animals/native-crab-lanes.ts
function chooseNativeCrabLane(preferred, scene, region, relative2, input, facing) {
  const a = facing === "down" || facing === "up" ? "x" : "y", points = [];
  for (let dy = -96; dy <= 96; dy += 8) for (let dx = -96; dx <= 96; dx += 8) if (Math.hypot(dx, dy) <= 96) points.push({ x: preferred.x + dx, y: preferred.y + dy });
  points.sort((p, q) => Math.hypot(p.x - preferred.x, p.y - preferred.y) - Math.hypot(q.x - preferred.x, q.y - preferred.y) || p.y - q.y || p.x - q.x);
  let fallback = null;
  for (const p of points) {
    if (!previewClear(p, scene, region, relative2, input)) continue;
    for (const sign of [1, -1]) {
      let distance2 = 0;
      for (let n = 1; n <= 64; n++) {
        if (!previewClear({ ...p, [a]: p[a] + n * sign }, scene, region, relative2, input)) break;
        distance2 = n;
      }
      if (distance2 < (a === "x" ? nativeCrabProfile.ground[facing].w : nativeCrabProfile.ground[facing].h) + 8) continue;
      const lane = { scene, region: { ...region }, ends: [{ ...p }, { ...p, [a]: p[a] + distance2 * sign }], facing };
      if (distance2 >= 48) return lane;
      if (!fallback) fallback = lane;
    }
  }
  return fallback;
}
var nativeCrabPreviewPolicy = Object.freeze({ gap: previewPolicy.gap, maximumPreferredOffset: 96, maximumLaneLength: 64, minimumLaneLength: 34, fullPoseEnvelope: true, groundColliderAdmitted: true, activationAllowed: false });

// src/animals/display-space-geometry.json
var display_space_geometry_default = {
  schema: 2,
  purpose: "static display envelopes, not ground colliders",
  activationAllowed: false,
  sourceCommit: "ce6944b756efe8ed0ff0f7453673d5c82141cbbd",
  candidates: {},
  people: {
    "harbor-hero": {
      source: "public/art/hero.png",
      sha256: "e88b33780048b721bbd697d8b9eb3b885754e4078893315c615d9fc9ade3b337",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            38,
            14,
            90,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.962962962962962,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            38,
            14,
            90,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.962962962962962,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        }
      }
    },
    "npc-avery": {
      source: "public/art/npc-avery.png",
      sha256: "07a3aca148d727b68c098e885985dd98eaeb32d77952be344fc90fc15ac27138",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            36,
            15,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -55.48148148148148,
            w: 29.037037037037035,
            h: 55.48148148148148
          }
        },
        "2": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            39,
            14,
            90,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            37,
            15,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -55.48148148148148,
            w: 28,
            h: 55.48148148148148
          }
        },
        "6": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            37,
            15,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -55.48148148148148,
            w: 28,
            h: 55.48148148148148
          }
        },
        "9": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            41,
            15,
            88,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -55.48148148148148,
            w: 24.37037037037037,
            h: 55.48148148148148
          }
        },
        "11": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        }
      }
    },
    "npc-samira": {
      source: "public/art/npc-samira.png",
      sha256: "90f641147e9b30a3cd1ea8d2ef377e73895afc3df60e567efa08b1c40968d1f4",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            38,
            14,
            90,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.962962962962962,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            37,
            17,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -54.44444444444444,
            w: 28,
            h: 54.44444444444444
          }
        },
        "2": {
          alphaBounds: [
            38,
            14,
            90,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.962962962962962,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            39,
            14,
            90,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            39,
            15,
            90,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -55.48148148148148,
            w: 26.444444444444443,
            h: 55.48148148148148
          }
        },
        "11": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        }
      }
    },
    "npc-owen": {
      source: "public/art/npc-owen.png",
      sha256: "f5e1594c83069bd1c3ea6b1654f5c3354edc5ef64c347f1fbc79a4dcbf806448",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            36,
            14,
            93,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.555555555555554,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            35,
            16,
            94,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -54.96296296296296,
            w: 30.59259259259259,
            h: 54.96296296296296
          }
        },
        "2": {
          alphaBounds: [
            36,
            14,
            93,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.555555555555554,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            37,
            14,
            92,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            45,
            14,
            84,
            122
          ],
          relative: {
            x: -9.851851851851851,
            y: -56,
            w: 20.22222222222222,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            44,
            14,
            83,
            122
          ],
          relative: {
            x: -10.37037037037037,
            y: -56,
            w: 20.22222222222222,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            38,
            16,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -54.96296296296296,
            w: 27.48148148148148,
            h: 54.96296296296296
          }
        },
        "11": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        }
      }
    },
    "npc-dani": {
      source: "public/art/npc-dani.png",
      sha256: "3ba4d2d6337546c10e71954b1821d8cde90df5783d0b15d3ac98981f1c9a832c",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            38,
            15,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -55.48148148148148,
            w: 27.48148148148148,
            h: 55.48148148148148
          }
        },
        "4": {
          alphaBounds: [
            42,
            14,
            87,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            38,
            15,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -55.48148148148148,
            w: 27.48148148148148,
            h: 55.48148148148148
          }
        },
        "6": {
          alphaBounds: [
            37,
            15,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -55.48148148148148,
            w: 27.48148148148148,
            h: 55.48148148148148
          }
        },
        "7": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            37,
            15,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -55.48148148148148,
            w: 27.48148148148148,
            h: 55.48148148148148
          }
        },
        "9": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            41,
            15,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -55.48148148148148,
            w: 23.85185185185185,
            h: 55.48148148148148
          }
        },
        "11": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        }
      }
    },
    "npc-rowan": {
      source: "public/art/npc-rowan.png",
      sha256: "fc57b296b829e43a4d2d52d925d263e0d093ea882cba77911b814b0767e85b28",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            39,
            14,
            90,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        }
      }
    },
    "npc-mira": {
      source: "public/art/npc-mira.png",
      sha256: "0b2335174d87a01bcec9c83a780263a90863b92bc57f272ffca7df87babd419f",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            42,
            14,
            85,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.296296296296294,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            43,
            14,
            86,
            122
          ],
          relative: {
            x: -10.888888888888888,
            y: -56,
            w: 22.296296296296294,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            42,
            14,
            86,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.814814814814813,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            42,
            14,
            86,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.814814814814813,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            42,
            14,
            86,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.814814814814813,
            h: 56
          }
        }
      }
    },
    "npc-jordan": {
      source: "public/art/npc-jordan.png",
      sha256: "8beef34c8b406b7dc61ecea550acbb46f95edbd8c325c14d921c3e6685e50b6c",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            33,
            14,
            95,
            122
          ],
          relative: {
            x: -16.074074074074073,
            y: -56,
            w: 32.148148148148145,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            42,
            14,
            87,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            33,
            14,
            94,
            122
          ],
          relative: {
            x: -16.074074074074073,
            y: -56,
            w: 31.629629629629626,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        }
      }
    },
    "npc-leila": {
      source: "public/art/npc-leila.png",
      sha256: "d9f514c3b986d8458b1ea3952f56766cd1c0aef13229285aa4f344c7bd47e3d4",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            42,
            14,
            86,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.814814814814813,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            42,
            14,
            85,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.296296296296294,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            42,
            14,
            85,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.296296296296294,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            41,
            14,
            88,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            43,
            14,
            86,
            122
          ],
          relative: {
            x: -10.888888888888888,
            y: -56,
            w: 22.296296296296294,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            40,
            14,
            89,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        }
      }
    },
    "npc-casey": {
      source: "public/art/npc-casey.png",
      sha256: "63b66e28d3854c7b23d473552a68f34c42300eef17d5fb981fd4dd85dafcef13",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        }
      }
    },
    "npc-grant": {
      source: "public/art/npc-grant.png",
      sha256: "21acdf3db06a7aff9968feb95732793e2ccb62736bd5ffac66884d690c017044",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            35,
            14,
            92,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 29.555555555555554,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            34,
            14,
            93,
            122
          ],
          relative: {
            x: -15.555555555555555,
            y: -56,
            w: 30.59259259259259,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            42,
            14,
            86,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.814814814814813,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            35,
            14,
            94,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.59259259259259,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            42,
            14,
            86,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.814814814814813,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        }
      }
    },
    "npc-harper": {
      source: "public/art/npc-harper.png",
      sha256: "fdaa1f360e9776ce7dc9ae2d65e5d4a439f9ef3f6166aa819fd07827dda950db",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            44,
            14,
            84,
            122
          ],
          relative: {
            x: -10.37037037037037,
            y: -56,
            w: 20.74074074074074,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            41,
            14,
            88,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            44,
            14,
            84,
            122
          ],
          relative: {
            x: -10.37037037037037,
            y: -56,
            w: 20.74074074074074,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            40,
            14,
            89,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        }
      }
    },
    "npc-tess": {
      source: "public/art/npc-tess.png",
      sha256: "c70515c7d5332b33f7e8f557878509f3f6b8065d181f7956c6b980d552f770cc",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            42,
            14,
            85,
            122
          ],
          relative: {
            x: -11.407407407407407,
            y: -56,
            w: 22.296296296296294,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            43,
            14,
            86,
            122
          ],
          relative: {
            x: -10.888888888888888,
            y: -56,
            w: 22.296296296296294,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            38,
            14,
            91,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        }
      }
    },
    "npc-noor": {
      source: "public/art/npc-noor.png",
      sha256: "f6a7709b666a2862eaca5cc5e3116c208a63a57386c064e8ecf84109f6c19753",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            44,
            14,
            84,
            122
          ],
          relative: {
            x: -10.37037037037037,
            y: -56,
            w: 20.74074074074074,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            44,
            14,
            84,
            122
          ],
          relative: {
            x: -10.37037037037037,
            y: -56,
            w: 20.74074074074074,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            45,
            14,
            83,
            122
          ],
          relative: {
            x: -9.851851851851851,
            y: -56,
            w: 19.703703703703702,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            43,
            14,
            85,
            122
          ],
          relative: {
            x: -10.888888888888888,
            y: -56,
            w: 21.777777777777775,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            44,
            14,
            83,
            122
          ],
          relative: {
            x: -10.37037037037037,
            y: -56,
            w: 20.22222222222222,
            h: 56
          }
        }
      }
    },
    "npc-mara": {
      source: "public/art/npc-mara.png",
      sha256: "28e0a4eb1a1361f8b19e57c5b5470accc77e7b3b22c0d3e14d11e4091214e1b8",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            35,
            14,
            93,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 30.074074074074073,
            h: 56
          }
        }
      }
    },
    "npc-theo": {
      source: "public/art/npc-theo.png",
      sha256: "b8df02514811562175085b5b9b1cd701f98511cded8132097f97db50a13769d0",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            40,
            14,
            87,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.37037037037037,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        }
      }
    },
    "npc-june": {
      source: "public/art/npc-june.png",
      sha256: "4beb05b777eae1526e15b8eb779b01d82ed26fb01f7c79a19573c3df537b247e",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            38,
            14,
            89,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.444444444444443,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        }
      }
    },
    "npc-idris": {
      source: "public/art/npc-idris.png",
      sha256: "1a92036ed34844502d04589d1dbf4205332d0b1d44280874873d47ec1d2f53dd",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            34,
            14,
            94,
            122
          ],
          relative: {
            x: -15.555555555555555,
            y: -56,
            w: 31.11111111111111,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            34,
            14,
            94,
            122
          ],
          relative: {
            x: -15.555555555555555,
            y: -56,
            w: 31.11111111111111,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            34,
            14,
            94,
            122
          ],
          relative: {
            x: -15.555555555555555,
            y: -56,
            w: 31.11111111111111,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            44,
            14,
            83,
            122
          ],
          relative: {
            x: -10.37037037037037,
            y: -56,
            w: 20.22222222222222,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            44,
            14,
            83,
            122
          ],
          relative: {
            x: -10.37037037037037,
            y: -56,
            w: 20.22222222222222,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            32,
            14,
            95,
            122
          ],
          relative: {
            x: -16.59259259259259,
            y: -56,
            w: 32.666666666666664,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            32,
            14,
            95,
            122
          ],
          relative: {
            x: -16.59259259259259,
            y: -56,
            w: 32.666666666666664,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            32,
            14,
            95,
            122
          ],
          relative: {
            x: -16.59259259259259,
            y: -56,
            w: 32.666666666666664,
            h: 56
          }
        }
      }
    },
    "npc-ruth": {
      source: "public/art/npc-ruth.png",
      sha256: "296a1b9afffa1fd2bdc3fbc94b741d3d615650578ed068f3368077fe7072ca7e",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            31,
            14,
            97,
            122
          ],
          relative: {
            x: -17.11111111111111,
            y: -56,
            w: 34.22222222222222,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            31,
            14,
            97,
            122
          ],
          relative: {
            x: -17.11111111111111,
            y: -56,
            w: 34.22222222222222,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            31,
            14,
            97,
            122
          ],
          relative: {
            x: -17.11111111111111,
            y: -56,
            w: 34.22222222222222,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            34,
            14,
            94,
            122
          ],
          relative: {
            x: -15.555555555555555,
            y: -56,
            w: 31.11111111111111,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            34,
            14,
            94,
            122
          ],
          relative: {
            x: -15.555555555555555,
            y: -56,
            w: 31.11111111111111,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            34,
            14,
            94,
            122
          ],
          relative: {
            x: -15.555555555555555,
            y: -56,
            w: 31.11111111111111,
            h: 56
          }
        }
      }
    },
    "npc-luis": {
      source: "public/art/npc-luis.png",
      sha256: "4a557db3b250cde3ab5433d62b4aca8b224bac37404e78b40115f5be69ee704e",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            35,
            14,
            92,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 29.555555555555554,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            35,
            14,
            92,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 29.555555555555554,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            35,
            14,
            92,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 29.555555555555554,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            39,
            14,
            89,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.925925925925924,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            36,
            14,
            91,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 28.518518518518515,
            h: 56
          }
        }
      }
    },
    "npc-nell": {
      source: "public/art/npc-nell.png",
      sha256: "4eb847a8d3d29c44b8ffb65fa33dd6b548dcbcb0964be86a9b872f97928983a3",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            36,
            14,
            92,
            122
          ],
          relative: {
            x: -14.518518518518517,
            y: -56,
            w: 29.037037037037035,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        }
      }
    },
    "npc-elena": {
      source: "public/art/npc-elena.png",
      sha256: "8ef32aa87faddc3282b698d041d058cf086c2858c75571c08f2b90a9e0ee36ac",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        }
      }
    },
    "npc-arthur": {
      source: "public/art/npc-arthur.png",
      sha256: "4a9d73594f53014448d709d2e1a4d4de6c727b677082cf13764d2f8131bd6669",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            35,
            14,
            92,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 29.555555555555554,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            35,
            14,
            92,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 29.555555555555554,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            35,
            14,
            92,
            122
          ],
          relative: {
            x: -15.037037037037036,
            y: -56,
            w: 29.555555555555554,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            41,
            14,
            86,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.333333333333332,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            37,
            14,
            90,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 27.48148148148148,
            h: 56
          }
        }
      }
    },
    "npc-gabriel": {
      source: "public/art/npc-gabriel.png",
      sha256: "190e58e02560858d0a1c5c70b3397d010e957771bf1ea46ffb75619e5df91e4f",
      size: [
        384,
        512
      ],
      frames: {
        "0": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "1": {
          alphaBounds: [
            34,
            14,
            93,
            122
          ],
          relative: {
            x: -15.555555555555555,
            y: -56,
            w: 30.59259259259259,
            h: 56
          }
        },
        "2": {
          alphaBounds: [
            38,
            14,
            90,
            122
          ],
          relative: {
            x: -13.481481481481481,
            y: -56,
            w: 26.962962962962962,
            h: 56
          }
        },
        "3": {
          alphaBounds: [
            40,
            14,
            89,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "4": {
          alphaBounds: [
            37,
            14,
            91,
            122
          ],
          relative: {
            x: -14,
            y: -56,
            w: 28,
            h: 56
          }
        },
        "5": {
          alphaBounds: [
            40,
            14,
            89,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "6": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "7": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "8": {
          alphaBounds: [
            40,
            14,
            89,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        },
        "9": {
          alphaBounds: [
            40,
            14,
            88,
            122
          ],
          relative: {
            x: -12.444444444444443,
            y: -56,
            w: 24.888888888888886,
            h: 56
          }
        },
        "10": {
          alphaBounds: [
            41,
            14,
            87,
            122
          ],
          relative: {
            x: -11.925925925925926,
            y: -56,
            w: 23.85185185185185,
            h: 56
          }
        },
        "11": {
          alphaBounds: [
            39,
            14,
            88,
            122
          ],
          relative: {
            x: -12.962962962962962,
            y: -56,
            w: 25.407407407407405,
            h: 56
          }
        }
      }
    }
  },
  animals: {
    "domestic-cat-v1": {
      source: "public/animals/cat-atlas.png",
      sha256: "7b298237af7be8ec95635f9b0b55fe7e4880aad4df0751b46730ab7fb493972a",
      size: [
        800,
        576
      ],
      frames: {
        "stand-down": {
          alphaBounds: [
            62,
            48,
            107,
            104
          ],
          relative: {
            x: -9,
            y: -28,
            w: 22.5,
            h: 28
          }
        },
        "stand-left": {
          alphaBounds: [
            46,
            56,
            112,
            104
          ],
          relative: {
            x: -17,
            y: -24,
            w: 33,
            h: 24
          }
        },
        "stand-right": {
          alphaBounds: [
            48,
            56,
            114,
            104
          ],
          relative: {
            x: -15.5,
            y: -24,
            w: 33,
            h: 24
          }
        },
        "stand-up": {
          alphaBounds: [
            68,
            48,
            102,
            105
          ],
          relative: {
            x: -6,
            y: -28,
            w: 17,
            h: 28.5
          }
        },
        "walkA-down": {
          alphaBounds: [
            62,
            46,
            106,
            104
          ],
          relative: {
            x: -9,
            y: -29,
            w: 22,
            h: 29
          }
        },
        "walkA-left": {
          alphaBounds: [
            48,
            59,
            114,
            105
          ],
          relative: {
            x: -16,
            y: -22.5,
            w: 33,
            h: 23
          }
        },
        "walkA-right": {
          alphaBounds: [
            46,
            59,
            112,
            105
          ],
          relative: {
            x: -16.5,
            y: -22.5,
            w: 33,
            h: 23
          }
        },
        "walkA-up": {
          alphaBounds: [
            68,
            48,
            102,
            104
          ],
          relative: {
            x: -6,
            y: -28,
            w: 17,
            h: 28
          }
        },
        "walkB-down": {
          alphaBounds: [
            62,
            46,
            106,
            104
          ],
          relative: {
            x: -9,
            y: -29,
            w: 22,
            h: 29
          }
        },
        "walkB-left": {
          alphaBounds: [
            48,
            56,
            114,
            104
          ],
          relative: {
            x: -16,
            y: -24,
            w: 33,
            h: 24
          }
        },
        "walkB-right": {
          alphaBounds: [
            46,
            56,
            112,
            104
          ],
          relative: {
            x: -16.5,
            y: -24,
            w: 33,
            h: 24
          }
        },
        "walkB-up": {
          alphaBounds: [
            68,
            47,
            102,
            105
          ],
          relative: {
            x: -6,
            y: -28.5,
            w: 17,
            h: 29
          }
        },
        "sun-rest-down": {
          alphaBounds: [
            64,
            58,
            106,
            104
          ],
          relative: {
            x: -8,
            y: -23,
            w: 21,
            h: 23
          }
        },
        "sun-rest-left": {
          alphaBounds: [
            48,
            68,
            117,
            104
          ],
          relative: {
            x: -16,
            y: -18,
            w: 34.5,
            h: 18
          }
        },
        "sun-rest-right": {
          alphaBounds: [
            43,
            68,
            112,
            104
          ],
          relative: {
            x: -18,
            y: -18,
            w: 34.5,
            h: 18
          }
        },
        "sun-rest-up": {
          alphaBounds: [
            67,
            56,
            102,
            111
          ],
          relative: {
            x: -6.5,
            y: -24,
            w: 17.5,
            h: 27.5
          }
        },
        "sleep-down": {
          alphaBounds: [
            60,
            66,
            105,
            105
          ],
          relative: {
            x: -10,
            y: -19,
            w: 22.5,
            h: 19.5
          }
        },
        "sleep-left": {
          alphaBounds: [
            49,
            72,
            112,
            105
          ],
          relative: {
            x: -15.5,
            y: -16,
            w: 31.5,
            h: 16.5
          }
        },
        "sleep-right": {
          alphaBounds: [
            48,
            72,
            111,
            105
          ],
          relative: {
            x: -15.5,
            y: -16,
            w: 31.5,
            h: 16.5
          }
        },
        "sleep-up": {
          alphaBounds: [
            61,
            67,
            97,
            104
          ],
          relative: {
            x: -9.5,
            y: -18.5,
            w: 18,
            h: 18.5
          }
        }
      }
    },
    "coastal-gull-v1": {
      source: "public/animals/gull-atlas.png",
      sha256: "0c3e6577e769eb26edcb42fccee17a11a58641e39c27299b8e7e7975df704802",
      size: [
        1120,
        640
      ],
      frames: {
        "stand-down": {
          alphaBounds: [
            99,
            52,
            125,
            104
          ],
          relative: {
            x: -6.5,
            y: -26,
            w: 13,
            h: 26
          }
        },
        "stand-left": {
          alphaBounds: [
            91,
            69,
            144,
            104
          ],
          relative: {
            x: -10.5,
            y: -17.5,
            w: 26.5,
            h: 17.5
          }
        },
        "stand-right": {
          alphaBounds: [
            80,
            69,
            133,
            104
          ],
          relative: {
            x: -15.5,
            y: -17.5,
            w: 26.5,
            h: 17.5
          }
        },
        "stand-up": {
          alphaBounds: [
            100,
            61,
            123,
            112
          ],
          relative: {
            x: -6,
            y: -21.5,
            w: 11.5,
            h: 25.5
          }
        },
        "walkA-down": {
          alphaBounds: [
            102,
            52,
            128,
            104
          ],
          relative: {
            x: -5,
            y: -26,
            w: 13,
            h: 26
          }
        },
        "walkA-left": {
          alphaBounds: [
            92,
            70,
            146,
            104
          ],
          relative: {
            x: -10,
            y: -17,
            w: 27,
            h: 17
          }
        },
        "walkA-right": {
          alphaBounds: [
            78,
            70,
            132,
            104
          ],
          relative: {
            x: -16.5,
            y: -17,
            w: 27,
            h: 17
          }
        },
        "walkA-up": {
          alphaBounds: [
            101,
            55,
            123,
            107
          ],
          relative: {
            x: -5.5,
            y: -24.5,
            w: 11,
            h: 26
          }
        },
        "walkB-down": {
          alphaBounds: [
            98,
            52,
            124,
            105
          ],
          relative: {
            x: -7,
            y: -26,
            w: 13,
            h: 26.5
          }
        },
        "walkB-left": {
          alphaBounds: [
            89,
            70,
            143,
            104
          ],
          relative: {
            x: -11.5,
            y: -17,
            w: 27,
            h: 17
          }
        },
        "walkB-right": {
          alphaBounds: [
            81,
            70,
            135,
            104
          ],
          relative: {
            x: -15,
            y: -17,
            w: 27,
            h: 17
          }
        },
        "walkB-up": {
          alphaBounds: [
            101,
            58,
            124,
            109
          ],
          relative: {
            x: -5.5,
            y: -23,
            w: 11.5,
            h: 25.5
          }
        },
        "wing-up-down": {
          alphaBounds: [
            84,
            53,
            141,
            105
          ],
          relative: {
            x: -14,
            y: -25.5,
            w: 28.5,
            h: 26
          }
        },
        "wing-up-left": {
          alphaBounds: [
            78,
            57,
            130,
            105
          ],
          relative: {
            x: -17,
            y: -23.5,
            w: 26,
            h: 24
          }
        },
        "wing-up-right": {
          alphaBounds: [
            94,
            57,
            146,
            105
          ],
          relative: {
            x: -8.5,
            y: -23.5,
            w: 26,
            h: 24
          }
        },
        "wing-up-up": {
          alphaBounds: [
            84,
            62,
            139,
            113
          ],
          relative: {
            x: -14,
            y: -21,
            w: 27.5,
            h: 25.5
          }
        },
        "wing-down-down": {
          alphaBounds: [
            83,
            65,
            140,
            106
          ],
          relative: {
            x: -14.5,
            y: -19.5,
            w: 28.5,
            h: 20.5
          }
        },
        "wing-down-left": {
          alphaBounds: [
            73,
            85,
            126,
            123
          ],
          relative: {
            x: -19.5,
            y: -9.5,
            w: 26.5,
            h: 19
          }
        },
        "wing-down-right": {
          alphaBounds: [
            98,
            85,
            151,
            123
          ],
          relative: {
            x: -6.5,
            y: -9.5,
            w: 26.5,
            h: 19
          }
        },
        "wing-down-up": {
          alphaBounds: [
            85,
            69,
            140,
            113
          ],
          relative: {
            x: -13.5,
            y: -17.5,
            w: 27.5,
            h: 22
          }
        }
      }
    }
  },
  props: {
    "prop-courtyard-flowers": {
      source: "public/art/flower-planter.png",
      sha256: "5b0e41ff2b185d9fdf7fc18c3bd6afd91c4873ddbd46d5cba470944d0dae4e93",
      size: [
        198,
        81
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            198,
            81
          ],
          relative: {
            x: -33,
            y: -27,
            w: 66,
            h: 27
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 650,
        y: 366
      }
    },
    "prop-courtyard-bench": {
      source: "public/art/bench-side-v3.png",
      sha256: "7b6d60371268e1eaa47f194662445e13d0b4d7352912eededc0bf47bf7476f50",
      size: [
        81,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            81,
            240
          ],
          relative: {
            x: -13,
            y: -77.03703703703704,
            w: 26,
            h: 77.03703703703704
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 624,
        y: 442
      }
    },
    "prop-courtyard-shade-west": {
      source: "public/art/tree-coastal-v3.png",
      sha256: "b020b528b0bc4b2c21d8c71cde488571f68890fbd0e8efa6078a599a29dd52eb",
      size: [
        420,
        311
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            420,
            311
          ],
          relative: {
            x: -77.5,
            y: -114.77380952380953,
            w: 155,
            h: 114.77380952380953
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 220,
        y: 360
      }
    },
    "prop-courtyard-shade-east": {
      source: "public/art/tree-birch-v3.png",
      sha256: "b42c72f70404012a34661f643003642e4fb24d037aeaa9a2a783d1664f88c340",
      size: [
        293,
        420
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            293,
            420
          ],
          relative: {
            x: -47.5,
            y: -136.17747440273038,
            w: 95,
            h: 136.17747440273038
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 755,
        y: 535
      }
    },
    "prop-courtyard-flowers-north": {
      source: "public/art/flower-planter.png",
      sha256: "5b0e41ff2b185d9fdf7fc18c3bd6afd91c4873ddbd46d5cba470944d0dae4e93",
      size: [
        198,
        81
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            198,
            81
          ],
          relative: {
            x: -27.5,
            y: -22.5,
            w: 55,
            h: 22.5
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 620,
        y: 265
      }
    },
    "prop-courtyard-route-sign-exit": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 555,
        y: 605
      }
    },
    "prop-courtyard-life-juniper-0": {
      source: "public/art/nature-juniper-v1.png",
      sha256: "8a7eb551d6a3eece35bee391d9757bd34526013125599b2fc8cd9858efc0c674",
      size: [
        240,
        108
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            108
          ],
          relative: {
            x: -27,
            y: -24.3,
            w: 54,
            h: 24.3
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 175,
        y: 590
      }
    },
    "prop-courtyard-life-juniper-1": {
      source: "public/art/nature-juniper-v1.png",
      sha256: "8a7eb551d6a3eece35bee391d9757bd34526013125599b2fc8cd9858efc0c674",
      size: [
        240,
        108
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            108
          ],
          relative: {
            x: -24.5,
            y: -22.05,
            w: 49,
            h: 22.05
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 805,
        y: 625
      }
    },
    "prop-courtyard-life-hydrangea-0": {
      source: "public/art/nature-hydrangea-v1.png",
      sha256: "6afa9b372d74aed95accbdc729317f878e292967adece72c4d99df31546d1873",
      size: [
        240,
        171
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            171
          ],
          relative: {
            x: -23.5,
            y: -33.4875,
            w: 47,
            h: 33.4875
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 595,
        y: 522
      }
    },
    "prop-courtyard-life-hydrangea-1": {
      source: "public/art/nature-hydrangea-v1.png",
      sha256: "6afa9b372d74aed95accbdc729317f878e292967adece72c4d99df31546d1873",
      size: [
        240,
        171
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            171
          ],
          relative: {
            x: -22.5,
            y: -32.0625,
            w: 45,
            h: 32.0625
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 685,
        y: 280
      }
    },
    "prop-courtyard-life-sapling-0": {
      source: "public/art/nature-sapling-v1.png",
      sha256: "e1ce9dec25e23abf053964ac380cb5bc5c5fab620c724450178b9ff14ba7c5f3",
      size: [
        216,
        420
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            216,
            420
          ],
          relative: {
            x: -19,
            y: -73.88888888888889,
            w: 38,
            h: 73.88888888888889
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 310,
        y: 260
      }
    },
    "prop-courtyard-life-wildflowers-0": {
      source: "public/art/nature-wildflowers-v1.png",
      sha256: "806673b5bbbc859c7006efe9f14b09200148cb50d3257b7d031e807a2d58a580",
      size: [
        229,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            229,
            240
          ],
          relative: {
            x: -12,
            y: -25.152838427947597,
            w: 24,
            h: 25.152838427947597
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 710,
        y: 585
      }
    },
    "prop-courtyard-life-wildflowers-1": {
      source: "public/art/nature-wildflowers-v1.png",
      sha256: "806673b5bbbc859c7006efe9f14b09200148cb50d3257b7d031e807a2d58a580",
      size: [
        229,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            229,
            240
          ],
          relative: {
            x: -11.5,
            y: -24.104803493449783,
            w: 23,
            h: 24.104803493449783
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 280,
        y: 458
      }
    },
    "prop-courtyard-life-garden-cycle": {
      source: "public/art/town-bicycle-front-v1.png",
      sha256: "daea27ac1d2da78c33916d36faaba378ee96678785e9c7884385d177d8123364",
      size: [
        122,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            122,
            240
          ],
          relative: {
            x: -12.5,
            y: -49.18032786885246,
            w: 25,
            h: 49.18032786885246
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 698,
        y: 475
      }
    },
    "prop-courtyard-use-shared-seat": {
      source: "public/art/bench.png",
      sha256: "9ff042bdc3b8d9add1ac90f1385c50c2629a0c269413e965981c8155456d8f14",
      size: [
        204,
        148
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            148
          ],
          relative: {
            x: -34,
            y: -49.33333333333333,
            w: 68,
            h: 49.33333333333333
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 572,
        y: 351
      }
    },
    "prop-courtyard-flora-15": {
      source: "public/art/flora-rose-v1.png",
      sha256: "9a171742e1f6023db1280234c15d015e4e37a026630eb6aa9212f460550e0a23",
      size: [
        240,
        166
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            166
          ],
          relative: {
            x: -23.5,
            y: -32.50833333333333,
            w: 47,
            h: 32.50833333333333
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 736,
        y: 576
      }
    },
    "prop-courtyard-flora-16": {
      source: "public/art/flora-fern-v1.png",
      sha256: "9c1671282b0317237a20270c694e59b5e11b0bee188e2693e19e5a65cbb32815",
      size: [
        240,
        210
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            210
          ],
          relative: {
            x: -18.5,
            y: -32.375,
            w: 37,
            h: 32.375
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 221,
        y: 402
      }
    },
    "prop-courtyard-flora-18": {
      source: "public/art/flora-herbs-v1.png",
      sha256: "efdd6eda4830a99d3f9c759b74b2fbaa67e5f8179169e0269b79f686eeafd2af",
      size: [
        240,
        148
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            148
          ],
          relative: {
            x: -17.5,
            y: -21.583333333333336,
            w: 35,
            h: 21.583333333333336
          }
        }
      },
      scene: "courtyard",
      foot: {
        x: 632,
        y: 294
      }
    },
    "prop-station-rental": {
      source: "public/art/house-rental.png",
      sha256: "20fab5bfce4ad20fc9a22a69b728c1c396a5f36b1ee7b3031e6875201676624a",
      size: [
        732,
        846
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            732,
            846
          ],
          relative: {
            x: -135,
            y: -312.0491803278689,
            w: 270,
            h: 312.0491803278689
          }
        }
      },
      scene: "station",
      foot: {
        x: 247,
        y: 350
      }
    },
    "prop-station-cafe-building": {
      source: "public/art/house-cafe.png",
      sha256: "92f6d237278834cf110dd27c0c3cd701a325161c07d3548041e1690c9c489149",
      size: [
        900,
        719
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            900,
            719
          ],
          relative: {
            x: -150,
            y: -239.66666666666666,
            w: 300,
            h: 239.66666666666666
          }
        }
      },
      scene: "station",
      foot: {
        x: 920,
        y: 320
      }
    },
    "prop-station-grocer-building": {
      source: "public/art/house-grocery.png",
      sha256: "01f438f9b5392a8be44e7b394b2268b28388d90c68e1f8852411cbe3732446e6",
      size: [
        784,
        721
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            784,
            721
          ],
          relative: {
            x: -125,
            y: -229.91071428571428,
            w: 250,
            h: 229.91071428571428
          }
        }
      },
      scene: "station",
      foot: {
        x: 1080,
        y: 880
      }
    },
    "prop-station-bench-square": {
      source: "public/art/bench.png",
      sha256: "9ff042bdc3b8d9add1ac90f1385c50c2629a0c269413e965981c8155456d8f14",
      size: [
        204,
        148
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            148
          ],
          relative: {
            x: -34,
            y: -49.33333333333333,
            w: 68,
            h: 49.33333333333333
          }
        }
      },
      scene: "station",
      foot: {
        x: 920,
        y: 690
      }
    },
    "prop-station-arrival-bench": {
      source: "public/art/bench-side-v3.png",
      sha256: "7b6d60371268e1eaa47f194662445e13d0b4d7352912eededc0bf47bf7476f50",
      size: [
        81,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            81,
            240
          ],
          relative: {
            x: -13,
            y: -77.03703703703704,
            w: 26,
            h: 77.03703703703704
          }
        }
      },
      scene: "station",
      foot: {
        x: 439,
        y: 774
      }
    },
    "prop-station-wayfinding": {
      source: "public/art/street-sign.png",
      sha256: "75c232360b509c896b2790796fa9abfe1779df7373f795c1d558baf33ebb0c8f",
      size: [
        168,
        184
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            168,
            184
          ],
          relative: {
            x: -28,
            y: -61.33333333333333,
            w: 56,
            h: 61.33333333333333
          }
        }
      },
      scene: "station",
      foot: {
        x: 730,
        y: 520
      }
    },
    "prop-station-tree-south": {
      source: "public/art/tree-coastal-v3.png",
      sha256: "b020b528b0bc4b2c21d8c71cde488571f68890fbd0e8efa6078a599a29dd52eb",
      size: [
        420,
        311
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            420,
            311
          ],
          relative: {
            x: -77.5,
            y: -114.77380952380953,
            w: 155,
            h: 114.77380952380953
          }
        }
      },
      scene: "station",
      foot: {
        x: 341,
        y: 830
      }
    },
    "prop-station-tree-west": {
      source: "public/art/flora-maple-v1.png",
      sha256: "f1a67bef8ade8e200606af6afcbc5b69ef9e6ae8b2e05a35d7391ec91fecc330",
      size: [
        420,
        346
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            420,
            346
          ],
          relative: {
            x: -79,
            y: -130.16190476190476,
            w: 158,
            h: 130.16190476190476
          }
        }
      },
      scene: "station",
      foot: {
        x: 105,
        y: 685
      }
    },
    "prop-station-tree-east": {
      source: "public/art/tree-coastal-v3.png",
      sha256: "b020b528b0bc4b2c21d8c71cde488571f68890fbd0e8efa6078a599a29dd52eb",
      size: [
        420,
        311
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            420,
            311
          ],
          relative: {
            x: -77.5,
            y: -114.77380952380953,
            w: 155,
            h: 114.77380952380953
          }
        }
      },
      scene: "station",
      foot: {
        x: 1185,
        y: 435
      }
    },
    "prop-station-tree-garden": {
      source: "public/art/tree-birch-v3.png",
      sha256: "b42c72f70404012a34661f643003642e4fb24d037aeaa9a2a783d1664f88c340",
      size: [
        293,
        420
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            293,
            420
          ],
          relative: {
            x: -47.5,
            y: -136.17747440273038,
            w: 95,
            h: 136.17747440273038
          }
        }
      },
      scene: "station",
      foot: {
        x: 1040,
        y: 705
      }
    },
    "prop-station-route-sign-road-harbor": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "station",
      foot: {
        x: 1240,
        y: 610
      }
    },
    "prop-station-route-sign-road-market": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "station",
      foot: {
        x: 670,
        y: 160
      }
    },
    "prop-station-arrival-flowers": {
      source: "public/art/flower-planter.png",
      sha256: "5b0e41ff2b185d9fdf7fc18c3bd6afd91c4873ddbd46d5cba470944d0dae4e93",
      size: [
        198,
        81
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            198,
            81
          ],
          relative: {
            x: -21,
            y: -17.181818181818183,
            w: 42,
            h: 17.181818181818183
          }
        }
      },
      scene: "station",
      foot: {
        x: 470,
        y: 815
      }
    },
    "prop-station-birch-arrival": {
      source: "public/art/tree-birch-v3.png",
      sha256: "b42c72f70404012a34661f643003642e4fb24d037aeaa9a2a783d1664f88c340",
      size: [
        293,
        420
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            293,
            420
          ],
          relative: {
            x: -45,
            y: -129.01023890784984,
            w: 90,
            h: 129.01023890784984
          }
        }
      },
      scene: "station",
      foot: {
        x: 350,
        y: 735
      }
    },
    "prop-station-life-sapling-0": {
      source: "public/art/nature-sapling-v1.png",
      sha256: "e1ce9dec25e23abf053964ac380cb5bc5c5fab620c724450178b9ff14ba7c5f3",
      size: [
        216,
        420
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            216,
            420
          ],
          relative: {
            x: -18.5,
            y: -71.94444444444444,
            w: 37,
            h: 71.94444444444444
          }
        }
      },
      scene: "station",
      foot: {
        x: 395,
        y: 375
      }
    },
    "prop-station-life-sapling-1": {
      source: "public/art/nature-sapling-v1.png",
      sha256: "e1ce9dec25e23abf053964ac380cb5bc5c5fab620c724450178b9ff14ba7c5f3",
      size: [
        216,
        420
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            216,
            420
          ],
          relative: {
            x: -20,
            y: -77.77777777777777,
            w: 40,
            h: 77.77777777777777
          }
        }
      },
      scene: "station",
      foot: {
        x: 850,
        y: 850
      }
    },
    "prop-station-life-sapling-2": {
      source: "public/art/nature-sapling-v1.png",
      sha256: "e1ce9dec25e23abf053964ac380cb5bc5c5fab620c724450178b9ff14ba7c5f3",
      size: [
        216,
        420
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            216,
            420
          ],
          relative: {
            x: -20,
            y: -77.77777777777777,
            w: 40,
            h: 77.77777777777777
          }
        }
      },
      scene: "station",
      foot: {
        x: 1162,
        y: 742
      }
    },
    "prop-station-life-hydrangea-0": {
      source: "public/art/nature-hydrangea-v1.png",
      sha256: "6afa9b372d74aed95accbdc729317f878e292967adece72c4d99df31546d1873",
      size: [
        240,
        171
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            171
          ],
          relative: {
            x: -24,
            y: -34.2,
            w: 48,
            h: 34.2
          }
        }
      },
      scene: "station",
      foot: {
        x: 158,
        y: 389
      }
    },
    "prop-station-life-hydrangea-1": {
      source: "public/art/nature-hydrangea-v1.png",
      sha256: "6afa9b372d74aed95accbdc729317f878e292967adece72c4d99df31546d1873",
      size: [
        240,
        171
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            171
          ],
          relative: {
            x: -21.5,
            y: -30.6375,
            w: 43,
            h: 30.6375
          }
        }
      },
      scene: "station",
      foot: {
        x: 336,
        y: 380
      }
    },
    "prop-station-life-hydrangea-2": {
      source: "public/art/nature-hydrangea-v1.png",
      sha256: "6afa9b372d74aed95accbdc729317f878e292967adece72c4d99df31546d1873",
      size: [
        240,
        171
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            171
          ],
          relative: {
            x: -22.5,
            y: -32.0625,
            w: 45,
            h: 32.0625
          }
        }
      },
      scene: "station",
      foot: {
        x: 945,
        y: 745
      }
    },
    "prop-station-life-hydrangea-3": {
      source: "public/art/nature-hydrangea-v1.png",
      sha256: "6afa9b372d74aed95accbdc729317f878e292967adece72c4d99df31546d1873",
      size: [
        240,
        171
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            171
          ],
          relative: {
            x: -22,
            y: -31.349999999999998,
            w: 44,
            h: 31.349999999999998
          }
        }
      },
      scene: "station",
      foot: {
        x: 963,
        y: 912
      }
    },
    "prop-station-life-wildflowers-0": {
      source: "public/art/nature-wildflowers-v1.png",
      sha256: "806673b5bbbc859c7006efe9f14b09200148cb50d3257b7d031e807a2d58a580",
      size: [
        229,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            229,
            240
          ],
          relative: {
            x: -11.5,
            y: -24.104803493449783,
            w: 23,
            h: 24.104803493449783
          }
        }
      },
      scene: "station",
      foot: {
        x: 355,
        y: 816
      }
    },
    "prop-station-life-wildflowers-1": {
      source: "public/art/nature-wildflowers-v1.png",
      sha256: "806673b5bbbc859c7006efe9f14b09200148cb50d3257b7d031e807a2d58a580",
      size: [
        229,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            229,
            240
          ],
          relative: {
            x: -12.5,
            y: -26.200873362445417,
            w: 25,
            h: 26.200873362445417
          }
        }
      },
      scene: "station",
      foot: {
        x: 320,
        y: 784
      }
    },
    "prop-station-life-wildflowers-2": {
      source: "public/art/nature-wildflowers-v1.png",
      sha256: "806673b5bbbc859c7006efe9f14b09200148cb50d3257b7d031e807a2d58a580",
      size: [
        229,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            229,
            240
          ],
          relative: {
            x: -13,
            y: -27.24890829694323,
            w: 26,
            h: 27.24890829694323
          }
        }
      },
      scene: "station",
      foot: {
        x: 1066,
        y: 699
      }
    },
    "prop-station-life-wildflowers-3": {
      source: "public/art/nature-wildflowers-v1.png",
      sha256: "806673b5bbbc859c7006efe9f14b09200148cb50d3257b7d031e807a2d58a580",
      size: [
        229,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            229,
            240
          ],
          relative: {
            x: -12,
            y: -25.152838427947597,
            w: 24,
            h: 25.152838427947597
          }
        }
      },
      scene: "station",
      foot: {
        x: 1110,
        y: 955
      }
    },
    "prop-station-life-parked-bicycle": {
      source: "public/art/town-bicycle-v1.png",
      sha256: "a12f8e49ea8205f54d7b2a207ceab93c59d8fcb3f8876fcbec39d9bc51040acb",
      size: [
        240,
        153
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            153
          ],
          relative: {
            x: -34.5,
            y: -43.9875,
            w: 69,
            h: 43.9875
          }
        }
      },
      scene: "station",
      foot: {
        x: 843,
        y: 368
      }
    },
    "prop-station-flora-29": {
      source: "public/art/flora-rose-v1.png",
      sha256: "9a171742e1f6023db1280234c15d015e4e37a026630eb6aa9212f460550e0a23",
      size: [
        240,
        166
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            166
          ],
          relative: {
            x: -24.5,
            y: -33.891666666666666,
            w: 49,
            h: 33.891666666666666
          }
        }
      },
      scene: "station",
      foot: {
        x: 267,
        y: 793
      }
    },
    "prop-station-flora-30": {
      source: "public/art/flora-fern-v1.png",
      sha256: "9c1671282b0317237a20270c694e59b5e11b0bee188e2693e19e5a65cbb32815",
      size: [
        240,
        210
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            210
          ],
          relative: {
            x: -17,
            y: -29.75,
            w: 34,
            h: 29.75
          }
        }
      },
      scene: "station",
      foot: {
        x: 367,
        y: 866
      }
    },
    "prop-station-flora-31": {
      source: "public/art/flora-rose-v1.png",
      sha256: "9a171742e1f6023db1280234c15d015e4e37a026630eb6aa9212f460550e0a23",
      size: [
        240,
        166
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            166
          ],
          relative: {
            x: -21.5,
            y: -29.741666666666667,
            w: 43,
            h: 29.741666666666667
          }
        }
      },
      scene: "station",
      foot: {
        x: 1190,
        y: 890
      }
    },
    "prop-harbor-workshop-front": {
      source: "public/art/house-workshop.png",
      sha256: "d60d09cd2e45810bc8c09a182af4660c2dedebe479a3647c7523178cce33b5fb",
      size: [
        787,
        677
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            787,
            677
          ],
          relative: {
            x: -135,
            y: -232.2617534942821,
            w: 270,
            h: 232.2617534942821
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 300,
        y: 290
      }
    },
    "prop-harbor-club-front": {
      source: "public/art/house-gym.png",
      sha256: "4f3422776224f52ff1b1060fc233891fd13ca17d153946004aebbfdb536a73af",
      size: [
        840,
        636
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            840,
            636
          ],
          relative: {
            x: -140,
            y: -212,
            w: 280,
            h: 212
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 802,
        y: 305
      }
    },
    "prop-harbor-crates-a": {
      source: "public/art/harbor-crates.png",
      sha256: "af969e0172d4eee0dd611ec44f6cdbde5e9bee1eee835e53d03dc5ae7bc8df85",
      size: [
        138,
        130
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            138,
            130
          ],
          relative: {
            x: -23,
            y: -43.33333333333333,
            w: 46,
            h: 43.33333333333333
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 202,
        y: 610
      }
    },
    "prop-harbor-crates-b": {
      source: "public/art/harbor-crates.png",
      sha256: "af969e0172d4eee0dd611ec44f6cdbde5e9bee1eee835e53d03dc5ae7bc8df85",
      size: [
        138,
        130
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            138,
            130
          ],
          relative: {
            x: -21.999999999999996,
            y: -41.449275362318836,
            w: 43.99999999999999,
            h: 41.449275362318836
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 505,
        y: 729
      }
    },
    "prop-harbor-quay-bench": {
      source: "public/art/bench.png",
      sha256: "9ff042bdc3b8d9add1ac90f1385c50c2629a0c269413e965981c8155456d8f14",
      size: [
        204,
        148
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            148
          ],
          relative: {
            x: -34,
            y: -49.33333333333333,
            w: 68,
            h: 49.33333333333333
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 945,
        y: 555
      }
    },
    "prop-harbor-pier-sign": {
      source: "public/art/street-sign.png",
      sha256: "75c232360b509c896b2790796fa9abfe1779df7373f795c1d558baf33ebb0c8f",
      size: [
        168,
        184
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            168,
            184
          ],
          relative: {
            x: -23.000000000000004,
            y: -50.38095238095239,
            w: 46.00000000000001,
            h: 50.38095238095239
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 728,
        y: 590
      }
    },
    "prop-harbor-route-sign-to-dock": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 835,
        y: 585
      }
    },
    "prop-harbor-route-sign-road-station": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 120,
        y: 520
      }
    },
    "prop-harbor-route-sign-road-coast": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 1235,
        y: 535
      }
    },
    "prop-harbor-route-sign-road-hill": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 625,
        y: 160
      }
    },
    "prop-harbor-quay-planter": {
      source: "public/art/flower-planter.png",
      sha256: "5b0e41ff2b185d9fdf7fc18c3bd6afd91c4873ddbd46d5cba470944d0dae4e93",
      size: [
        198,
        81
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            198,
            81
          ],
          relative: {
            x: -26.000000000000004,
            y: -21.272727272727273,
            w: 52.00000000000001,
            h: 21.272727272727273
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 992,
        y: 573
      }
    },
    "prop-harbor-life-mooring-west": {
      source: "public/art/harbor-bollard-v1.png",
      sha256: "3e0ae2b583085840283ae435afded7278f1d6d1c89a02a99a78b56558f9a9847",
      size: [
        239,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            239,
            240
          ],
          relative: {
            x: -12,
            y: -24.10041841004184,
            w: 24,
            h: 24.10041841004184
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 680,
        y: 565
      }
    },
    "prop-harbor-life-mooring-east": {
      source: "public/art/harbor-bollard-v1.png",
      sha256: "3e0ae2b583085840283ae435afded7278f1d6d1c89a02a99a78b56558f9a9847",
      size: [
        239,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            239,
            240
          ],
          relative: {
            x: -12,
            y: -24.10041841004184,
            w: 24,
            h: 24.10041841004184
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 1065,
        y: 565
      }
    },
    "prop-harbor-life-stored-boat": {
      source: "public/art/coast-rowboat-v1.png",
      sha256: "f1d76876e24e9d6924edc3c4cbe4c9c6f0bf4dd1de1662d000098cf2a5f56d74",
      size: [
        240,
        90
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            90
          ],
          relative: {
            x: -66,
            y: -49.50000000000001,
            w: 132,
            h: 49.50000000000001
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 385,
        y: 725
      }
    },
    "prop-harbor-life-repair-cycle": {
      source: "public/art/town-bicycle-v1.png",
      sha256: "a12f8e49ea8205f54d7b2a207ceab93c59d8fcb3f8876fcbec39d9bc51040acb",
      size: [
        240,
        153
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            153
          ],
          relative: {
            x: -33,
            y: -42.075,
            w: 66,
            h: 42.075
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 398,
        y: 322
      }
    },
    "prop-harbor-life-juniper-0": {
      source: "public/art/nature-juniper-v1.png",
      sha256: "8a7eb551d6a3eece35bee391d9757bd34526013125599b2fc8cd9858efc0c674",
      size: [
        240,
        108
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            108
          ],
          relative: {
            x: -24,
            y: -21.6,
            w: 48,
            h: 21.6
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 1094,
        y: 349
      }
    },
    "prop-harbor-use-nets": {
      source: "public/art/life-net-rack-v1.png",
      sha256: "e0db779564b90ba218df27fc4bd3ba8362298a42fd34e420711a28b4092220ff",
      size: [
        240,
        136
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            136
          ],
          relative: {
            x: -45,
            y: -51,
            w: 90,
            h: 51
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 258,
        y: 699
      }
    },
    "prop-harbor-flora-17": {
      source: "public/art/flora-pot-rubber-v1.png",
      sha256: "6999105ef2b070da65d0c0a0182da06f7f841c93abe7f30ec2959948ef52e744",
      size: [
        148,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            148,
            240
          ],
          relative: {
            x: -14.5,
            y: -47.027027027027025,
            w: 29,
            h: 47.027027027027025
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 1102,
        y: 380
      }
    },
    "prop-harbor-flora-18": {
      source: "public/art/flora-herbs-v1.png",
      sha256: "efdd6eda4830a99d3f9c759b74b2fbaa67e5f8179169e0269b79f686eeafd2af",
      size: [
        240,
        148
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            148
          ],
          relative: {
            x: -15.500000000000002,
            y: -19.116666666666667,
            w: 31.000000000000004,
            h: 19.116666666666667
          }
        }
      },
      scene: "harbor",
      foot: {
        x: 1020,
        y: 548
      }
    },
    "prop-coast-tower": {
      source: "public/art/lighthouse-building.png",
      sha256: "50ef16c3625e639ba3bf3b9f20eacaf817ad3e993406d5e8e9f268d9d4478e31",
      size: [
        570,
        859
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            570,
            859
          ],
          relative: {
            x: -95,
            y: -286.3333333333333,
            w: 190,
            h: 286.3333333333333
          }
        }
      },
      scene: "coast",
      foot: {
        x: 1080,
        y: 320
      }
    },
    "prop-coast-rock-west": {
      source: "public/art/coastal-rocks.png",
      sha256: "4e7ccefa0ba382f452265f99f9656f2025a7ddbfa1306d4fdabb091cdcf0a020",
      size: [
        315,
        268
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            315,
            268
          ],
          relative: {
            x: -52.5,
            y: -89.33333333333333,
            w: 105,
            h: 89.33333333333333
          }
        }
      },
      scene: "coast",
      foot: {
        x: 275,
        y: 315
      }
    },
    "prop-coast-rock-shore": {
      source: "public/art/coastal-rocks.png",
      sha256: "4e7ccefa0ba382f452265f99f9656f2025a7ddbfa1306d4fdabb091cdcf0a020",
      size: [
        315,
        268
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            315,
            268
          ],
          relative: {
            x: -45,
            y: -76.57142857142857,
            w: 90,
            h: 76.57142857142857
          }
        }
      },
      scene: "coast",
      foot: {
        x: 820,
        y: 820
      }
    },
    "prop-coast-view-bench": {
      source: "public/art/bench.png",
      sha256: "9ff042bdc3b8d9add1ac90f1385c50c2629a0c269413e965981c8155456d8f14",
      size: [
        204,
        148
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            148
          ],
          relative: {
            x: -34,
            y: -49.33333333333333,
            w: 68,
            h: 49.33333333333333
          }
        }
      },
      scene: "coast",
      foot: {
        x: 695,
        y: 565
      }
    },
    "prop-coast-route-sign-to-beach": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "coast",
      foot: {
        x: 625,
        y: 765
      }
    },
    "prop-coast-route-sign-to-path": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "coast",
      foot: {
        x: 1235,
        y: 550
      }
    },
    "prop-coast-route-sign-road-harbor": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "coast",
      foot: {
        x: 130,
        y: 550
      }
    },
    "prop-coast-route-sign-road-hill": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "coast",
      foot: {
        x: 620,
        y: 170
      }
    },
    "prop-coast-wind-tree": {
      source: "public/art/tree-coastal-v3.png",
      sha256: "b020b528b0bc4b2c21d8c71cde488571f68890fbd0e8efa6078a599a29dd52eb",
      size: [
        420,
        311
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            420,
            311
          ],
          relative: {
            x: -74,
            y: -109.5904761904762,
            w: 148,
            h: 109.5904761904762
          }
        }
      },
      scene: "coast",
      foot: {
        x: 700,
        y: 680
      }
    },
    "prop-coast-young-birch": {
      source: "public/art/tree-birch-v3.png",
      sha256: "b42c72f70404012a34661f643003642e4fb24d037aeaa9a2a783d1664f88c340",
      size: [
        293,
        420
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            293,
            420
          ],
          relative: {
            x: -41,
            y: -117.54266211604096,
            w: 82,
            h: 117.54266211604096
          }
        }
      },
      scene: "coast",
      foot: {
        x: 390,
        y: 360
      }
    },
    "prop-coast-life-juniper-0": {
      source: "public/art/nature-juniper-v1.png",
      sha256: "8a7eb551d6a3eece35bee391d9757bd34526013125599b2fc8cd9858efc0c674",
      size: [
        240,
        108
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            108
          ],
          relative: {
            x: -29,
            y: -26.1,
            w: 58,
            h: 26.1
          }
        }
      },
      scene: "coast",
      foot: {
        x: 326,
        y: 351
      }
    },
    "prop-coast-life-juniper-1": {
      source: "public/art/nature-juniper-v1.png",
      sha256: "8a7eb551d6a3eece35bee391d9757bd34526013125599b2fc8cd9858efc0c674",
      size: [
        240,
        108
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            108
          ],
          relative: {
            x: -27,
            y: -24.3,
            w: 54,
            h: 24.3
          }
        }
      },
      scene: "coast",
      foot: {
        x: 840,
        y: 802
      }
    },
    "prop-coast-life-juniper-2": {
      source: "public/art/nature-juniper-v1.png",
      sha256: "8a7eb551d6a3eece35bee391d9757bd34526013125599b2fc8cd9858efc0c674",
      size: [
        240,
        108
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            108
          ],
          relative: {
            x: -23.5,
            y: -21.15,
            w: 47,
            h: 21.15
          }
        }
      },
      scene: "coast",
      foot: {
        x: 980,
        y: 390
      }
    },
    "prop-coast-life-beachgrass-0": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -12,
            y: -28.235294117647058,
            w: 24,
            h: 28.235294117647058
          }
        }
      },
      scene: "coast",
      foot: {
        x: 244,
        y: 772
      }
    },
    "prop-coast-life-beachgrass-1": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -11,
            y: -25.88235294117647,
            w: 22,
            h: 25.88235294117647
          }
        }
      },
      scene: "coast",
      foot: {
        x: 377,
        y: 792
      }
    },
    "prop-coast-life-beachgrass-2": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -13.5,
            y: -31.764705882352942,
            w: 27,
            h: 31.764705882352942
          }
        }
      },
      scene: "coast",
      foot: {
        x: 670,
        y: 761
      }
    },
    "prop-coast-life-beachgrass-3": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -12.5,
            y: -29.41176470588235,
            w: 25,
            h: 29.41176470588235
          }
        }
      },
      scene: "coast",
      foot: {
        x: 860,
        y: 744
      }
    },
    "prop-coast-life-beachgrass-4": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -11.5,
            y: -27.058823529411764,
            w: 23,
            h: 27.058823529411764
          }
        }
      },
      scene: "coast",
      foot: {
        x: 905,
        y: 829
      }
    },
    "prop-coast-life-sapling-0": {
      source: "public/art/nature-sapling-v1.png",
      sha256: "e1ce9dec25e23abf053964ac380cb5bc5c5fab620c724450178b9ff14ba7c5f3",
      size: [
        216,
        420
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            216,
            420
          ],
          relative: {
            x: -18.5,
            y: -71.94444444444444,
            w: 37,
            h: 71.94444444444444
          }
        }
      },
      scene: "coast",
      foot: {
        x: 1030,
        y: 379
      }
    },
    "prop-coast-life-pulled-up-boat": {
      source: "public/art/coast-rowboat-v1.png",
      sha256: "f1d76876e24e9d6924edc3c4cbe4c9c6f0bf4dd1de1662d000098cf2a5f56d74",
      size: [
        240,
        90
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            90
          ],
          relative: {
            x: -68,
            y: -51,
            w: 136,
            h: 51
          }
        }
      },
      scene: "coast",
      foot: {
        x: 292,
        y: 725
      }
    },
    "prop-coast-use-rope-kit": {
      source: "public/art/fishing-kit.png",
      sha256: "1810c8aa068a86a5cd77ca361076344c76d80b40baf35ff42916e00a328098d1",
      size: [
        129,
        99
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            129,
            99
          ],
          relative: {
            x: -18.5,
            y: -28.395348837209305,
            w: 37,
            h: 28.395348837209305
          }
        }
      },
      scene: "coast",
      foot: {
        x: 395,
        y: 743
      }
    },
    "prop-coast-flora-21": {
      source: "public/art/flora-rose-v1.png",
      sha256: "9a171742e1f6023db1280234c15d015e4e37a026630eb6aa9212f460550e0a23",
      size: [
        240,
        166
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            166
          ],
          relative: {
            x: -25,
            y: -34.583333333333336,
            w: 50,
            h: 34.583333333333336
          }
        }
      },
      scene: "coast",
      foot: {
        x: 858,
        y: 839
      }
    },
    "prop-coast-flora-23": {
      source: "public/art/flora-fern-v1.png",
      sha256: "9c1671282b0317237a20270c694e59b5e11b0bee188e2693e19e5a65cbb32815",
      size: [
        240,
        210
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            210
          ],
          relative: {
            x: -16.5,
            y: -28.875000000000004,
            w: 33,
            h: 28.875000000000004
          }
        }
      },
      scene: "coast",
      foot: {
        x: 348,
        y: 386
      }
    },
    "prop-coast-flora-24": {
      source: "public/art/flora-rose-v1.png",
      sha256: "9a171742e1f6023db1280234c15d015e4e37a026630eb6aa9212f460550e0a23",
      size: [
        240,
        166
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            166
          ],
          relative: {
            x: -21.5,
            y: -29.741666666666667,
            w: 43,
            h: 29.741666666666667
          }
        }
      },
      scene: "coast",
      foot: {
        x: 963,
        y: 386
      }
    },
    "prop-beach-timber": {
      source: "public/art/driftwood.png",
      sha256: "8d54a6a04fe6345900d6eff722edfc5a6121c144fdabcb4cc28ac08c87a28810",
      size: [
        192,
        94
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            192,
            94
          ],
          relative: {
            x: -31,
            y: -30.354166666666668,
            w: 62,
            h: 30.354166666666668
          }
        }
      },
      scene: "beach",
      foot: {
        x: 385,
        y: 370
      }
    },
    "prop-beach-rocks": {
      source: "public/art/coastal-rocks.png",
      sha256: "4e7ccefa0ba382f452265f99f9656f2025a7ddbfa1306d4fdabb091cdcf0a020",
      size: [
        315,
        268
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            315,
            268
          ],
          relative: {
            x: -47.5,
            y: -80.82539682539682,
            w: 95,
            h: 80.82539682539682
          }
        }
      },
      scene: "beach",
      foot: {
        x: 720,
        y: 475
      }
    },
    "prop-beach-route-sign-exit": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "beach",
      foot: {
        x: 555,
        y: 205
      }
    },
    "prop-beach-dune-tree": {
      source: "public/art/tree-coastal-v3.png",
      sha256: "b020b528b0bc4b2c21d8c71cde488571f68890fbd0e8efa6078a599a29dd52eb",
      size: [
        420,
        311
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            420,
            311
          ],
          relative: {
            x: -65,
            y: -96.26190476190476,
            w: 130,
            h: 96.26190476190476
          }
        }
      },
      scene: "beach",
      foot: {
        x: 235,
        y: 290
      }
    },
    "prop-beach-shore-seat": {
      source: "public/art/bench.png",
      sha256: "9ff042bdc3b8d9add1ac90f1385c50c2629a0c269413e965981c8155456d8f14",
      size: [
        204,
        148
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            148
          ],
          relative: {
            x: -34,
            y: -49.33333333333333,
            w: 68,
            h: 49.33333333333333
          }
        }
      },
      scene: "beach",
      foot: {
        x: 650,
        y: 570
      }
    },
    "prop-beach-life-beachgrass-0": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -11.5,
            y: -27.058823529411764,
            w: 23,
            h: 27.058823529411764
          }
        }
      },
      scene: "beach",
      foot: {
        x: 186,
        y: 327
      }
    },
    "prop-beach-life-beachgrass-1": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -14.5,
            y: -34.11764705882353,
            w: 29,
            h: 34.11764705882353
          }
        }
      },
      scene: "beach",
      foot: {
        x: 212,
        y: 368
      }
    },
    "prop-beach-life-beachgrass-2": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -11,
            y: -25.88235294117647,
            w: 22,
            h: 25.88235294117647
          }
        }
      },
      scene: "beach",
      foot: {
        x: 695,
        y: 530
      }
    },
    "prop-beach-life-beachgrass-3": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -13,
            y: -30.588235294117645,
            w: 26,
            h: 30.588235294117645
          }
        }
      },
      scene: "beach",
      foot: {
        x: 749,
        y: 536
      }
    },
    "prop-beach-life-beachgrass-4": {
      source: "public/art/nature-beachgrass-v1.png",
      sha256: "fa127b0f77034f5915725e59fc7558abad1116d612834816e9db213e2dd0e5b7",
      size: [
        204,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            204,
            240
          ],
          relative: {
            x: -12,
            y: -28.235294117647058,
            w: 24,
            h: 28.235294117647058
          }
        }
      },
      scene: "beach",
      foot: {
        x: 700,
        y: 285
      }
    },
    "prop-beach-life-juniper-0": {
      source: "public/art/nature-juniper-v1.png",
      sha256: "8a7eb551d6a3eece35bee391d9757bd34526013125599b2fc8cd9858efc0c674",
      size: [
        240,
        108
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            108
          ],
          relative: {
            x: -27,
            y: -24.3,
            w: 54,
            h: 24.3
          }
        }
      },
      scene: "beach",
      foot: {
        x: 620,
        y: 255
      }
    },
    "prop-beach-life-juniper-1": {
      source: "public/art/nature-juniper-v1.png",
      sha256: "8a7eb551d6a3eece35bee391d9757bd34526013125599b2fc8cd9858efc0c674",
      size: [
        240,
        108
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            108
          ],
          relative: {
            x: -28,
            y: -25.2,
            w: 56,
            h: 25.2
          }
        }
      },
      scene: "beach",
      foot: {
        x: 200,
        y: 240
      }
    },
    "prop-beach-life-rowboat": {
      source: "public/art/coast-rowboat-v1.png",
      sha256: "f1d76876e24e9d6924edc3c4cbe4c9c6f0bf4dd1de1662d000098cf2a5f56d74",
      size: [
        240,
        90
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            90
          ],
          relative: {
            x: -68.5,
            y: -51.375,
            w: 137,
            h: 51.375
          }
        }
      },
      scene: "beach",
      foot: {
        x: 610,
        y: 440
      }
    },
    "prop-beach-use-drying-net": {
      source: "public/art/life-net-rack-v1.png",
      sha256: "e0db779564b90ba218df27fc4bd3ba8362298a42fd34e420711a28b4092220ff",
      size: [
        240,
        136
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            136
          ],
          relative: {
            x: -46.5,
            y: -52.7,
            w: 93,
            h: 52.7
          }
        }
      },
      scene: "beach",
      foot: {
        x: 515,
        y: 364
      }
    },
    "prop-beach-flora-14": {
      source: "public/art/flora-rose-v1.png",
      sha256: "9a171742e1f6023db1280234c15d015e4e37a026630eb6aa9212f460550e0a23",
      size: [
        240,
        166
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            166
          ],
          relative: {
            x: -22.5,
            y: -31.125,
            w: 45,
            h: 31.125
          }
        }
      },
      scene: "beach",
      foot: {
        x: 273,
        y: 305
      }
    },
    "prop-dock-tackle": {
      source: "public/art/fishing-kit.png",
      sha256: "1810c8aa068a86a5cd77ca361076344c76d80b40baf35ff42916e00a328098d1",
      size: [
        129,
        99
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            129,
            99
          ],
          relative: {
            x: -21.5,
            y: -33,
            w: 43,
            h: 33
          }
        }
      },
      scene: "dock",
      foot: {
        x: 451,
        y: 350
      }
    },
    "prop-dock-bench": {
      source: "public/art/bench-back-v3.png",
      sha256: "420488b2d5cfcb756d4f65844194b840f42e4ca227e21d7baab6802d46790071",
      size: [
        240,
        102
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            102
          ],
          relative: {
            x: -38,
            y: -32.3,
            w: 76,
            h: 32.3
          }
        }
      },
      scene: "dock",
      foot: {
        x: 587,
        y: 390
      }
    },
    "prop-dock-rope-crates": {
      source: "public/art/harbor-crates.png",
      sha256: "af969e0172d4eee0dd611ec44f6cdbde5e9bee1eee835e53d03dc5ae7bc8df85",
      size: [
        138,
        130
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            138,
            130
          ],
          relative: {
            x: -21.5,
            y: -40.507246376811594,
            w: 43,
            h: 40.507246376811594
          }
        }
      },
      scene: "dock",
      foot: {
        x: 608,
        y: 294
      }
    },
    "prop-dock-route-sign-exit": {
      source: "public/art/trail-sign-v3.png",
      sha256: "9c930efe4fb95b729f8e07f992a5dd0039f529beb1a701bdf1fdc50954514414",
      size: [
        143,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            143,
            240
          ],
          relative: {
            x: -14.5,
            y: -48.671328671328666,
            w: 29,
            h: 48.671328671328666
          }
        }
      },
      scene: "dock",
      foot: {
        x: 555,
        y: 605
      }
    },
    "prop-dock-life-mooring-left": {
      source: "public/art/harbor-bollard-v1.png",
      sha256: "3e0ae2b583085840283ae435afded7278f1d6d1c89a02a99a78b56558f9a9847",
      size: [
        239,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            239,
            240
          ],
          relative: {
            x: -12,
            y: -24.10041841004184,
            w: 24,
            h: 24.10041841004184
          }
        }
      },
      scene: "dock",
      foot: {
        x: 343,
        y: 285
      }
    },
    "prop-dock-life-mooring-right": {
      source: "public/art/harbor-bollard-v1.png",
      sha256: "3e0ae2b583085840283ae435afded7278f1d6d1c89a02a99a78b56558f9a9847",
      size: [
        239,
        240
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            239,
            240
          ],
          relative: {
            x: -12,
            y: -24.10041841004184,
            w: 24,
            h: 24.10041841004184
          }
        }
      },
      scene: "dock",
      foot: {
        x: 635,
        y: 486
      }
    },
    "prop-dock-flora-6": {
      source: "public/art/flora-herbs-v1.png",
      sha256: "efdd6eda4830a99d3f9c759b74b2fbaa67e5f8179169e0269b79f686eeafd2af",
      size: [
        240,
        148
      ],
      frames: {
        stand: {
          alphaBounds: [
            0,
            0,
            240,
            148
          ],
          relative: {
            x: -16.5,
            y: -20.35,
            w: 33,
            h: 20.35
          }
        }
      },
      scene: "dock",
      foot: {
        x: 632,
        y: 329
      }
    }
  }
};

// src/animals/native-crab-manifest.json
var native_crab_manifest_default = {
  schema: 2,
  id: "shore-crab-native-c1-v2",
  width: 512,
  height: 384,
  image: "crab-c1.png",
  atlasSHA256: "6447970fcf81c94f4c12e0d516b3d39081be955afeaa3d3323f33c16567cca46",
  nativeSources: 9,
  directionFrames: 12,
  uniformNearestScale: 0.056,
  worldScale: 0.5,
  localLimbEditing: false,
  wholeFrameMirrorDirections: [
    "right"
  ],
  frames: {
    "down-stand": {
      column: 0,
      row: 0,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13.5,
        y: -16,
        w: 27,
        h: 16
      },
      source: {
        taskId: "mt_d24bcd33687bb7f1b873a855e2d844a6",
        requestId: "ed2022bd-c0a4-4505-a4ad-9b027d05a21d",
        url: "https://images.aiwaves.tech/uploads/1791312801113-p4dey5jryx.webp",
        sha256: "05cd42da5b676129dcb3d86e1e4865fe0fd50fb530511fe9a89a50bcb6e51bfa",
        references: []
      },
      sourceRoot: [
        512,
        804
      ],
      consumerFrameSHA256: "eb23eea2b0112b7109e4e25f5e47697f49fb1162ea9f84233096f95bd1dfebab",
      mirror: false
    },
    "down-walkA": {
      column: 0,
      row: 1,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13,
        y: -17.5,
        w: 27,
        h: 17.5
      },
      source: {
        taskId: "mt_48899b9d0939762e380eeb184ecd6539",
        requestId: "7bdf100d-9467-4623-9f24-ec3d9c1a6774",
        url: "https://images.aiwaves.tech/uploads/1791356635752-zi4i22xlbsa.webp",
        sha256: "32f8f4097b8c6279411d984b474ec0504439b5d6be565296719bd8fcc48f27bb",
        references: [
          "down-stand"
        ]
      },
      sourceRoot: [
        512,
        804
      ],
      consumerFrameSHA256: "6c8adcb6a2ac1b93553255f8735cf479d913d4fa64e5be36573ec97c5d47d00a",
      mirror: false
    },
    "down-walkB": {
      column: 0,
      row: 2,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13.5,
        y: -17,
        w: 27,
        h: 17.5
      },
      source: {
        taskId: "mt_544098f2a02d007e4b7ecce77f4cecaa",
        requestId: "693b80de-ed57-44a7-ba6e-26d51219d2c7",
        url: "https://images.aiwaves.tech/uploads/1791356861425-snzdzu08p8.webp",
        sha256: "4d67346106b8bae2d614eb72f7f2616341a0bed24c589f2095e4e89f4789abcb",
        references: [
          "crab-down-walkA-v2"
        ]
      },
      sourceRoot: [
        512,
        804
      ],
      consumerFrameSHA256: "b2140a37b6c6feda4ac617139c5c4c07b104ebf729ba946482e301c6a348b3fb",
      mirror: false
    },
    "left-stand": {
      column: 1,
      row: 0,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13.5,
        y: -20,
        w: 26.5,
        h: 18.5
      },
      source: {
        taskId: "mt_a946eb2dc375459495946b72e0cb46cb",
        requestId: "e371d11e-05dd-4d32-9851-2f52969b9f85",
        url: "https://images.aiwaves.tech/uploads/1791312995375-ry0aswh2i7n.webp",
        sha256: "b903f1f6b1afba814c2ada0a83950e85c91ca922c06ca9766f16816397b94abc",
        references: [
          "down-stand"
        ]
      },
      sourceRoot: [
        512,
        900
      ],
      consumerFrameSHA256: "9b57f5f5a2151a5ef1e2a22d0e8beff276aef7730a174982413a47930f62aa6a",
      mirror: false
    },
    "right-stand": {
      column: 2,
      row: 0,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -12.5,
        y: -20,
        w: 26.5,
        h: 18.5
      },
      source: {
        taskId: "mt_a946eb2dc375459495946b72e0cb46cb",
        requestId: "e371d11e-05dd-4d32-9851-2f52969b9f85",
        url: "https://images.aiwaves.tech/uploads/1791312995375-ry0aswh2i7n.webp",
        sha256: "b903f1f6b1afba814c2ada0a83950e85c91ca922c06ca9766f16816397b94abc",
        references: [
          "down-stand"
        ]
      },
      sourceRoot: [
        512,
        900
      ],
      consumerFrameSHA256: "9efd4880c5be6a3047425ae55e3b4929ae6917168254f30066e5eee163ab8c21",
      mirror: true,
      mirrorFrom: "left-stand",
      wholeMirrorRootTranslationPixels: [
        1,
        0
      ]
    },
    "left-walkA": {
      column: 1,
      row: 1,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13.5,
        y: -23,
        w: 27,
        h: 22.5
      },
      source: {
        taskId: "mt_3e496f5b5218c141d72ce570400ea77c",
        requestId: "9a79c362-3b41-4a11-8564-614fe6a4cdbf",
        url: "https://images.aiwaves.tech/uploads/1791357217743-y4klj4xsalh.webp",
        sha256: "f0d9ee14e4aab8a336441494ae6797cebcec1fc72ba9f6fe65b76abc38556d99",
        references: [
          "left-stand"
        ]
      },
      sourceRoot: [
        512,
        900
      ],
      consumerFrameSHA256: "8a094846eccfc2f8296851e99bfb01bb40f2d5a493814568230ff35850b043d8",
      mirror: false
    },
    "right-walkA": {
      column: 2,
      row: 1,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13,
        y: -23,
        w: 27,
        h: 22.5
      },
      source: {
        taskId: "mt_3e496f5b5218c141d72ce570400ea77c",
        requestId: "9a79c362-3b41-4a11-8564-614fe6a4cdbf",
        url: "https://images.aiwaves.tech/uploads/1791357217743-y4klj4xsalh.webp",
        sha256: "f0d9ee14e4aab8a336441494ae6797cebcec1fc72ba9f6fe65b76abc38556d99",
        references: [
          "left-stand"
        ]
      },
      sourceRoot: [
        512,
        900
      ],
      consumerFrameSHA256: "1303c3abcb7224ac4a4cc3523cd865fbf084fe08db5972536b1cded2ce1234af",
      mirror: true,
      mirrorFrom: "left-walkA",
      wholeMirrorRootTranslationPixels: [
        1,
        0
      ]
    },
    "left-walkB": {
      column: 1,
      row: 2,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -14,
        y: -24,
        w: 28,
        h: 24
      },
      source: {
        taskId: "mt_3c22f71584a804f129ea46d8b188efaa",
        requestId: "d5a5a7ef-2b3a-42f7-b016-d6b0bc7a31bc",
        url: "https://images.aiwaves.tech/uploads/1791357346513-xqzp6uye8g.webp",
        sha256: "e792c68bb49a12107f5d92c0a74e31b72f3d828666373c4366039b0cf0f17660",
        references: [
          "crab-left-walkA-v1"
        ]
      },
      sourceRoot: [
        512,
        900
      ],
      consumerFrameSHA256: "5cb5972e3aa7e10e48c853ffbcd605d630e13a1e684017d7db828ebcc6b6863d",
      mirror: false
    },
    "right-walkB": {
      column: 2,
      row: 2,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13.5,
        y: -24,
        w: 28,
        h: 24
      },
      source: {
        taskId: "mt_3c22f71584a804f129ea46d8b188efaa",
        requestId: "d5a5a7ef-2b3a-42f7-b016-d6b0bc7a31bc",
        url: "https://images.aiwaves.tech/uploads/1791357346513-xqzp6uye8g.webp",
        sha256: "e792c68bb49a12107f5d92c0a74e31b72f3d828666373c4366039b0cf0f17660",
        references: [
          "crab-left-walkA-v1"
        ]
      },
      sourceRoot: [
        512,
        900
      ],
      consumerFrameSHA256: "118136b41dca5fe5e0531fbedcefab224f742e4f8a6e2c49d9a37349542849c8",
      mirror: true,
      mirrorFrom: "left-walkB",
      wholeMirrorRootTranslationPixels: [
        1,
        0
      ]
    },
    "up-stand": {
      column: 3,
      row: 0,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13,
        y: -18,
        w: 25.5,
        h: 17.5
      },
      source: {
        taskId: "mt_e8739753c38e2f05915eb84765197ba4",
        requestId: "1274aa9b-43ba-47e3-b7da-c8395afd99e8",
        url: "https://images.aiwaves.tech/uploads/1791313278432-dfvl3w49avv.webp",
        sha256: "38a82519f2095ac721ac44a3b5aff3bcdd014b495886bc91ab9050971904475e",
        references: [
          "down-stand"
        ]
      },
      sourceRoot: [
        512,
        860
      ],
      consumerFrameSHA256: "848da2b824afa7e2f636f00f3732741c3315e0f67e965fe8794cbbc55fe52948",
      mirror: false
    },
    "up-walkA": {
      column: 3,
      row: 1,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13,
        y: -19,
        w: 26.5,
        h: 18.5
      },
      source: {
        taskId: "mt_776bae819753cd4e2ab9dc0ee330eff4",
        requestId: "8d7b3f97-8656-47ba-813b-cf24ade32490",
        url: "https://images.aiwaves.tech/uploads/1791357442520-de5k9zrocg.webp",
        sha256: "cd47829aa3b54486ade28fc7616e098e95f697bb4cc0a03ed4d6a17b2842f881",
        references: [
          "up-stand"
        ]
      },
      sourceRoot: [
        512,
        860
      ],
      consumerFrameSHA256: "0ed20c6e3808ca6a602e5ac4d55bf716e3e3934e0cae843775fcd715d040a43b",
      mirror: false
    },
    "up-walkB": {
      column: 3,
      row: 2,
      anchor: [
        0.5,
        0.6875
      ],
      relative: {
        x: -13,
        y: -19,
        w: 26,
        h: 18.5
      },
      source: {
        taskId: "mt_6935d6ae6d6f08ca35f192147aed07f4",
        requestId: "7b93195d-6def-4ab1-898c-5188b629ba10",
        url: "https://images.aiwaves.tech/uploads/1791357559652-gu0tilw9476.webp",
        sha256: "6b60ea0e62ec6361d6fdf10aef28a89473c46af16256e6d3f28ec7c0c5d79fd5",
        references: [
          "crab-up-walkA-v1"
        ]
      },
      sourceRoot: [
        512,
        860
      ],
      consumerFrameSHA256: "a06814856397603bf4b9ee8d76ffd4d3378ff596cee354fde218c13789a1b94f",
      mirror: false
    }
  },
  displayEnvelope: {
    x: -14,
    y: -24,
    w: 28.5,
    h: 24.5
  },
  displayGap: 8,
  rootContract: "fixed manually supported back-edge source root for all stand/A/B; world/event/depth foot same anchor",
  groundProfile: "shore-crab-native-c1-v2@2",
  ground: {
    down: [
      -15,
      -20,
      30,
      20
    ],
    left: [
      -8,
      -26,
      23,
      26
    ],
    right: [
      -15,
      -26,
      23,
      26
    ],
    up: [
      -15,
      -20,
      30,
      20
    ]
  },
  rights: "alteru-project-use-confirmed-20261003: same project/service scope applicability; no universal MIT/CC image license",
  productionEnabled: false,
  libraryWrite: false
};

// src/animals/native-crab-game.ts
var geometry = display_space_geometry_default;
var minute2 = (s) => s.townMinutes ?? 540;
var relative = native_crab_manifest_default.displayEnvelope;
var pixel = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
var record3 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var integer6 = (v, lo = 0, hi = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= lo && v <= hi;
var point = (p) => record3(p) && Object.keys(p).sort().join(",") === "x,y" && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e4 && Math.abs(p.y) <= 1e4;
var event = (e, m) => record3(e) && Object.keys(e).sort().join(",") === "minute,sourceAction" && integer6(e.minute, 0, m) && typeof e.sourceAction === "string" && /^[-a-zA-Z0-9]{16,80}$/.test(e.sourceAction);
function nativeCrabEngine(s, p, paused = false) {
  const world3 = landWorld(dynamicWorld(s.flags, false), s.landV1), ctx = gameAnimalContext(s, p, { world: world3, paused });
  const oldEngine = createAnimalRuntime(acceptedAnimals), old = oldEngine.tick(0, ctx);
  const schedule = {};
  const periods = { morning: { scene: "coast", facing: "down" }, afternoon: { scene: "beach", facing: "left" }, evening: { scene: "dock", facing: "up" }, night: { scene: "coast", facing: "right" } };
  const period2 = periodAt(minute2(s)), slot2 = periods[period2];
  const planning = { ...ctx, scene: slot2.scene, paused: true, player: { x: -1e4, y: -1e4, w: 16, h: 12 } };
  const plannedOld = createAnimalRuntime(acceptedAnimals).tick(0, planning);
  const lane = chooseNativeCrabLane(nativeCrabPlaces[slot2.scene], slot2.scene, world3.scenes[slot2.scene].interior, relative, { context: planning, states: plannedOld, geometry }, slot2.facing);
  if (lane) schedule[period2] = lane;
  const fallback = { scene: slot2.scene, region: { ...world3.scenes[slot2.scene].interior }, ends: [nativeCrabPlaces[slot2.scene], { ...nativeCrabPlaces[slot2.scene], ...slot2.facing === "down" || slot2.facing === "up" ? { x: nativeCrabPlaces[slot2.scene].x + 64 } : { y: nativeCrabPlaces[slot2.scene].y + 64 } }], facing: slot2.facing };
  const contexts = /* @__PURE__ */ new WeakMap();
  const display = (foot, id, r, c) => {
    let input = contexts.get(c);
    if (!input) {
      input = { context: c, states: old, geometry };
      contexts.set(c, input);
    }
    return !!lane && previewClear(pixel(foot), id, r, relative, input);
  };
  const runtime2 = createNativeCrab([{ id: nativeCrabId, visualVersion: "shore-crab-native-c1-v2", schedule: lane ? schedule : { [period2]: fallback } }], { displayClear: display });
  return { runtime: runtime2, context: ctx, old, definitionLane: lane };
}
function nativeCrabFrame(s, p, paused = false) {
  const e = nativeCrabEngine(s, p, paused), n = s.nativeCrabV1, m = minute2(s);
  const consecutive = n && n.minute + 1 === m && periodAt(n.minute) === periodAt(m) && n.frame.scene === s.scene && !!e.definitionLane && JSON.stringify(n.frame.lane) === JSON.stringify(e.definitionLane);
  if (n && n.scene === s.scene && (n.minute === m || consecutive)) {
    try {
      e.runtime.restore([n.frame], e.context);
    } catch {
      throw Error("UNSUPPORTED_NATIVE_CRAB");
    }
  }
  return { engine: e, frame: e.runtime.tick(0, e.context)[0] };
}
function validNativeCrabField(n, version, m) {
  if (n === void 0) return true;
  if (!record3(n) || n.schema !== 1 || !record3(n.pin) || Object.keys(n.pin).sort().join(",") !== Object.keys(nativeCrabPin).sort().join(",") || Object.entries(nativeCrabPin).some(([k, v]) => n.pin[k] !== v) || !integer6(n.minute, 0, m) || !rooms[n.scene] || Object.keys(n).some((k) => !["schema", "pin", "minute", "scene", "frame", "sample", "observation", "brief", "plan", "page"].includes(k)) || JSON.stringify(n).length > 8192) return false;
  const validFrame = (f2) => record3(f2) && f2.id === nativeCrabId && f2.species === "crab" && f2.visualVersion === "shore-crab-native-c1-v2" && f2.profileRevision === 2 && ["down", "left", "right", "up"].includes(f2.direction) && ["stand", "walkA", "walkB"].includes(f2.pose) && ["hidden", "idle", "sidewalk", "retreat", "alert"].includes(f2.phase) && typeof f2.visible === "boolean" && point(f2.foot) && [f2.distance, f2.quiet, f2.wait].every((v) => Number.isFinite(v) && v >= 0 && v <= 1e7) && [0, 1].includes(f2.waypoint) && Array.isArray(f2.route) && f2.route.length <= 1 && f2.route.every(point) && Object.keys(f2).every((k) => ["id", "species", "visualVersion", "profileRevision", "scene", "lane", "foot", "direction", "pose", "phase", "visible", "distance", "quiet", "wait", "waypoint", "route", "reason"].includes(k)) && (!f2.visible || !!f2.lane && f2.scene === f2.lane.scene) && (!f2.reason || typeof f2.reason === "string" && f2.reason.length <= 80) && (!f2.lane || record3(f2.lane) && rooms[f2.lane.scene] && ["down", "left", "right", "up"].includes(f2.lane.facing) && Array.isArray(f2.lane.ends) && f2.lane.ends.length === 2 && f2.lane.ends.every(point) && record3(f2.lane.region) && ["x", "y", "w", "h"].every((k) => Number.isFinite(f2.lane.region[k])) && f2.lane.region.w > 0 && f2.lane.region.h > 0);
  if (!validFrame(n.frame) || ["observation", "brief", "plan", "page"].some((k) => n[k] !== void 0 && !event(n[k], m)) || n.plan && !n.brief || n.page && (!n.plan || !n.observation)) return false;
  if (n.sample) {
    const q = n.sample;
    if (!record3(q) || Object.keys(q).sort().join(",") !== "behavior,frame,minute,player,quietMs,scene,sourceAction,version" || !event({ minute: q.minute, sourceAction: q.sourceAction }, m) || !integer6(q.version, 0, version) || !rooms[q.scene] || !point(q.player) || q.behavior !== "shore-space" || q.quietMs !== 400 || !validFrame(q.frame) || q.frame.scene !== q.scene || !q.frame.visible || q.frame.phase !== "idle" || q.frame.pose !== "stand") return false;
  }
  return true;
}
function assertNativeCrab(s) {
  if (!validNativeCrabField(s.nativeCrabV1, s.version, minute2(s))) throw Error("UNSUPPORTED_NATIVE_CRAB");
}
function advanceNativeCrab(s, seconds, enabled) {
  assertNativeCrab(s);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3) throw Error("INVALID_NATIVE_BUDGET");
  if (!s.nativeCrabV1 && (!enabled || !["coast", "beach", "dock"].includes(s.scene))) return;
  const { engine, frame } = nativeCrabFrame(s, s.position), old = s.nativeCrabV1;
  let current = frame, remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(0.04, remaining);
    current = engine.runtime.tick(dt, engine.context)[0];
    remaining -= dt;
  }
  s.nativeCrabV1 = { ...old ?? {}, schema: 1, pin: { ...nativeCrabPin }, minute: minute2(s), scene: s.scene, frame: current };
  if (seconds > 0 || !old || old.minute !== minute2(s) || JSON.stringify(old.frame) !== JSON.stringify(current)) delete s.nativeCrabV1.sample;
  assertNativeCrab(s);
}
function nativeCrabCollision(s) {
  const n = s.nativeCrabV1;
  return n && n.minute === minute2(s) && n.scene === s.scene && n.frame.visible && n.frame.scene === s.scene ? [nativeCrabBody(pixel(n.frame.foot), n.frame.direction)] : [];
}
function currentNativeSample(s, p = s.position) {
  const q = s.nativeCrabV1?.sample;
  return q && q.version === s.version && q.minute === minute2(s) && q.scene === s.scene && Math.hypot(p.x - q.player.x, p.y - q.player.y) <= 2 ? q : void 0;
}
var nativeQuietSeconds = nativeCrabProfile.quietTime;

// server/animal-content.ts
import { createHash as createHash7 } from "node:crypto";

// server/animal-contract-schema.ts
var freeze3 = (v) => {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze3);
    Object.freeze(v);
  }
  return v;
};
var text = (min, max, extra = {}) => ({ type: "string", minCodeUnits: min, maxCodeUnits: max, ...extra });
var enumeration = (values) => text(Math.min(...values.map((s) => s.length)), Math.max(...values.map((s) => s.length)), { enum: values });
var animalContractLimits = freeze3({
  draftBytes: 8e3,
  reviewBytes: 8e3,
  minimumObservations: 2,
  maximumObservations: 4,
  maximumFindings: 8,
  legacyFindingCodeUnits: 300,
  compiledTextCodeUnits: { title: 80, brief: 500, page: 500 },
  maximumAdoptions: 4
});
var animalResidents = freeze3(["mara", "ruth", "owen", "dani"]);
var animalThemes = freeze3(["compare-routines", "leave-space"]);
var animalBehaviors = freeze3(["sun-rest", "sleep", "shore-space"]);
var animalPeriods = freeze3(["morning", "afternoon", "evening", "night"]);
var animalIdSchema = text(11, 49, { pattern: "^animals:[a-z][a-z0-9-]{2,40}$" });
var animalObservationSceneIds = freeze3([
  "station",
  "home",
  "cafe",
  "grocery",
  "harbor",
  "dock",
  "workshop",
  "gym",
  "market",
  "bazaar",
  "secondhand",
  "courtyard",
  "coast",
  "beach",
  "path",
  "lighthouse",
  "hill",
  "garden",
  "camp",
  "weather",
  "workshop-annex-1",
  "workshop-annex-2"
]);
var animalObservationSchema = freeze3({ type: "object", properties: {
  animal: enumeration(acceptedAnimals.map((a) => a.id)),
  behavior: enumeration(animalBehaviors),
  period: enumeration(animalPeriods),
  scene: enumeration(animalObservationSceneIds)
} });
var animalChoiceSchema = freeze3({ type: "object", properties: {
  schema: { type: "literal", value: 1 },
  id: animalIdSchema,
  revision: { type: "literal", value: 1 },
  resident: enumeration(animalResidents),
  theme: enumeration(animalThemes),
  observations: { type: "array", minItems: animalContractLimits.minimumObservations, maxItems: animalContractLimits.maximumObservations, items: animalObservationSchema }
} });
var animalReviewRuleIds = freeze3([
  "ANIMAL_GROUNDED_FIELDS",
  "ANIMAL_OBSERVATION_FIELDS",
  "ANIMAL_OBSERVATION_COUNT",
  "ANIMAL_KNOWN_ANIMAL",
  "ANIMAL_SCHEDULE_MISMATCH",
  "ANIMAL_DUPLICATE_REQUIREMENT",
  "ANIMAL_UNKNOWN_RESIDENT",
  "ANIMAL_THEME_MISMATCH",
  "ANIMAL_COSMETIC_DUPLICATE"
]);
var animalChoiceConstraints = freeze3([
  { ruleId: "ANIMAL_SCHEDULE_MISMATCH", description: "Each cat sun-rest/sleep must match its own registered period, scene and activity; shore-space requires a registered gull slot. A group does not move or co-locate individuals." },
  { ruleId: "ANIMAL_DUPLICATE_REQUIREMENT", description: "Each individual+behavior pair occurs once, even if different periods are named." },
  { ruleId: "ANIMAL_UNKNOWN_RESIDENT", description: "The resident must be in the introduced knownResidents list." },
  { ruleId: "ANIMAL_THEME_MISMATCH", description: "leave-space requires at least one shore-space gull observation." },
  { ruleId: "ANIMAL_COSMETIC_DUPLICATE", description: "The id and sorted individual+behavior requirements must not duplicate an existing commission." }
]);
var animalBoundReviewFormat = "harbor-animal-review-v2";
var animalFindingSchema = freeze3({ type: "object", properties: {
  observationId: text(5, 5, { pattern: "^obs-[1-4]$", nullable: true }),
  factId: text(69, 69, { pattern: "^fact:[a-f0-9]{64}$", nullable: true }),
  ruleId: enumeration(animalReviewRuleIds)
} });
var animalBoundReviewSchema = freeze3({ type: "object", properties: {
  format: { type: "literal", value: animalBoundReviewFormat },
  passed: { type: "boolean" },
  findings: { type: "array", minItems: 0, maxItems: animalContractLimits.maximumFindings, items: animalFindingSchema }
} });
function contractViolations(value, schema, path = "$") {
  const fail7 = (constraint) => [{ path, constraint }];
  if (schema.type === "literal") return value === schema.value ? [] : fail7("literal");
  if (schema.type === "boolean") return typeof value === "boolean" ? [] : fail7("boolean");
  if (schema.type === "integer") return Number.isSafeInteger(value) && Number(value) >= schema.minimum && Number(value) <= schema.maximum ? [] : fail7("integer");
  if (schema.type === "string") {
    if (value === null && schema.nullable) return [];
    if (typeof value !== "string") return fail7("string");
    if (value.length < schema.minCodeUnits || value.length > schema.maxCodeUnits) return fail7("length");
    if (schema.enum && !schema.enum.includes(value)) return fail7("enum");
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return fail7("pattern");
    return [];
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return fail7("array");
    const violations2 = value.length < schema.minItems || value.length > schema.maxItems ? fail7("count") : [];
    return violations2.concat(value.flatMap((v2, i) => contractViolations(v2, schema.items, `${path}[${i}]`)));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail7("object");
  const v = value, expected = Object.keys(schema.properties).sort(), actual = Object.keys(v).sort();
  const violations = actual.join(",") !== expected.join(",") ? fail7("exact-fields") : [];
  return violations.concat(expected.flatMap((k) => contractViolations(v[k], schema.properties[k], `${path}.${k}`)));
}
function describeContractFields(schema, path = "$") {
  if (schema.type === "object") return [`${path}: exactly ${Object.keys(schema.properties).join(", ")}; all required; extra keys forbidden`, ...Object.entries(schema.properties).flatMap(([k, v]) => describeContractFields(v, `${path}.${k}`))];
  if (schema.type === "array") return [`${path}: ${schema.minItems}..${schema.maxItems} elements (inclusive)`, ...describeContractFields(schema.items, `${path}[]`)];
  if (schema.type === "string") return [`${path}: ${schema.minCodeUnits}..${schema.maxCodeUnits} UTF-16 code units${schema.nullable ? "; or null" : ""}${schema.enum ? "; enum=" + JSON.stringify(schema.enum) : ""}${schema.pattern ? "; pattern=" + schema.pattern : ""}`];
  if (schema.type === "literal") return [`${path}: exactly ${JSON.stringify(schema.value)}`];
  if (schema.type === "integer") return [`${path}: safe integer ${schema.minimum}..${schema.maximum}`];
  return [`${path}: boolean`];
}

// server/content/authored-courtyard-sun-turns.json
var authored_courtyard_sun_turns_default = {
  schema: 1,
  id: "animals:courtyard-sun-turns",
  revision: 1,
  capability: "animal-notebook-v1",
  resident: "dani",
  title: ["\u540C\u4E00\u7247\u9633\u5149\uFF0C\u8F6E\u6D41\u7684\u5EA7\u4F4D", "Taking turns in the sun"],
  brief: [
    "\u201C\u6211\u603B\u4EE5\u4E3A\u5EAD\u9662\u91CC\u90A3\u7247\u9633\u5149\u53EA\u5C5E\u4E8E\u4E00\u53EA\u732B\u3002\u5E2E\u6211\u5206\u522B\u8BB0\u4E0B\u5EAD\u9662\u732B2\u4E0A\u5348\u6652\u592A\u9633\u3001\u5EAD\u9662\u732B3\u4E0B\u5348\u6652\u592A\u9633\uFF0C\u518D\u56DE\u6765\u804A\u804A\u3002\u4E0D\u7528\u62DB\u547C\u5B83\u4EEC\uFF0C\u4E5F\u4E0D\u7528\u5582\u98DF\uFF1B\u6CA1\u6709\u671F\u9650\u3002\u201D",
    "\u201CI thought that sunny corner in the courtyard belonged to one cat. Record courtyard cat 2 sunning in the morning and courtyard cat 3 sunning in the afternoon, then tell me. No calling, feeding, or deadline.\u201D"
  ],
  page: [
    "\u6211\u628A\u4E24\u6B21\u89C2\u5BDF\u8BB2\u7ED9Dani Costa\u542C\uFF1A\u5EAD\u9662\u732B2\u4E0A\u5348\u6652\u592A\u9633\uFF0C\u5EAD\u9662\u732B3\u4E0B\u5348\u6652\u592A\u9633\u3002Dani\u7B11\u4E86\uFF1A\u201C\u539F\u6765\u4E0D\u662F\u4E00\u53EA\u732B\u5B88\u7740\u5EA7\u4F4D\uFF0C\u662F\u4E24\u53EA\u732B\u5404\u6709\u81EA\u5DF1\u7684\u65F6\u5019\u3002\u201D\u6211\u4EEC\u7ED9\u8FD9\u4E2A\u5C0F\u89D2\u843D\u7559\u4E86\u540D\u5B57\uFF1A\u8F6E\u6D41\u7684\u9633\u5149\u3002",
    "I told Dani Costa about two visits: courtyard cat 2 sunning in the morning, courtyard cat 3 in the afternoon. Dani smiled. \u201COne cat isn't guarding the seat. Each has its own time.\u201D We named that little corner: taking turns in the sun."
  ],
  requirements: [
    { animal: "harbor-cat-2", behavior: "sun-rest" },
    { animal: "harbor-cat-3", behavior: "sun-rest" }
  ]
};

// server/animal-content.ts
var canonical2 = (v) => Array.isArray(v) ? "[" + v.map(canonical2).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).filter((k) => v[k] !== void 0).sort().map((k) => JSON.stringify(k) + ":" + canonical2(v[k])).join(",") + "}" : JSON.stringify(v);
var contentHash = (v) => createHash7("sha256").update(canonical2(v)).digest("hex");
var sameAnimalRef = (a, b) => canonical2(a) === canonical2(b);
var builtInCommissions = [
  { schema: 1, id: "animals:station-cat", revision: 1, capability: "animal-notebook-v1", resident: "mara", title: ["\u8F66\u7AD9\u732B\u7684\u4E00\u5929", "A day with the station cat"], brief: ["\u201C\u522B\u53EB\u9192\u5B83\u3002\u4E0A\u5348\u5728\u8F66\u7AD9\u770B\u5B83\u6652\u592A\u9633\uFF0C\u591C\u91CC\u53BB\u5EAD\u9662\u770B\u770B\u5B83\u7761\u5728\u54EA\u513F\uFF0C\u518D\u56DE\u6765\u8BB2\u7ED9\u6211\u542C\u3002\u6CA1\u6709\u671F\u9650\u3002\u201D", "\u201CLet it rest. Watch it sunning on Station Street in the morning and sleeping in the courtyard at night, then tell me. No deadline.\u201D"], page: ["\u6211\u4E0EMara\u4EA4\u6362\u4E86\u8F66\u7AD9\u732B\u7684\u4E24\u79CD\u65E5\u5E38\u3002\u5B83\u6709\u81EA\u5DF1\u7684\u4F5C\u606F\uFF0C\u4E0D\u9700\u8981\u8DDF\u7740\u6211\u3002", "Mara and I compared two moments in the station cat\u2019s day. It has its own routine; it needn\u2019t follow me."], requirements: [{ animal: "harbor-cat-1", behavior: "sun-rest" }, { animal: "harbor-cat-1", behavior: "sleep" }] },
  { schema: 1, id: "animals:shore-space", revision: 1, capability: "animal-notebook-v1", resident: "ruth", title: ["\u7ED9\u5CB8\u8FB9\u7684\u6D77\u9E25\u7559\u70B9\u7A7A\u95F4", "Room for the shore gulls"], brief: ["\u201C\u627E\u4E24\u53EA\u4E0D\u540C\u7684\u6D77\u9E25\uFF0C\u9000\u5F00\u4E00\u70B9\uFF0C\u9759\u9759\u770B\u3002\u4E0D\u8981\u7528\u98DF\u7269\u5F15\u5B83\u4EEC\u3002\u613F\u610F\u7684\u8BDD\uFF0C\u56DE\u6765\u8BB2\u8BB2\u3002\u6CA1\u6709\u671F\u9650\u3002\u201D", "\u201CFind two different gulls, leave them some space, and watch quietly. Don\u2019t lure them with food. Tell me if you like. No deadline.\u201D"], page: ["\u6211\u4E0ERuth\u7559\u4E0B\u4E00\u9875\u5CB8\u8FB9\u7B14\u8BB0\uFF1A\u770B\u89C1\u4E24\u53EA\u6D77\u9E25\uFF0C\u4E5F\u5B66\u4F1A\u4E0D\u8FFD\u7740\u5B83\u4EEC\u8D70\u3002", "Ruth and I kept a shore note: two gulls observed, with room left for them to move."], requirements: [{ animal: "harbor-gull-1", behavior: "shore-space" }, { animal: "harbor-gull-2", behavior: "shore-space" }] },
  // Locally authored fixed story, not a Game Chat proposal or model-reviewed pack.
  // It uses only existing cat schedules and the original knowledge/+1 contract.
  authored_courtyard_sun_turns_default
];
function validateCommission(v) {
  const d = v;
  if (!d || typeof d !== "object" || Array.isArray(d) || Object.keys(d).sort().join(",") !== "brief,capability,id,page,requirements,resident,revision,schema,title") throw Error("ANIMAL_CONTENT_FIELDS");
  if (d.schema !== 1 || contractViolations(d.id, animalIdSchema).length || !Number.isSafeInteger(d.revision) || d.revision < 1 || d.revision > 100 || d.capability !== "animal-notebook-v1" || !["mara", "ruth", "owen", "dani"].includes(d.resident)) throw Error("ANIMAL_CAPABILITY_UNAVAILABLE");
  for (const [k, max] of Object.entries(animalContractLimits.compiledTextCodeUnits)) {
    const w = d[k];
    if (!Array.isArray(w) || w.length !== 2 || w.some((t3) => typeof t3 !== "string" || !t3.trim() || t3.length > max || /[<>]|https?:|javascript:|\b(eval|fetch|script)\s*\(/i.test(t3))) throw Error("ANIMAL_TEXT");
  }
  if (!Array.isArray(d.requirements) || d.requirements.length < animalContractLimits.minimumObservations || d.requirements.length > animalContractLimits.maximumObservations) throw Error("ANIMAL_REQUIREMENTS");
  const identities = /* @__PURE__ */ new Set();
  for (const r of d.requirements) {
    if (!r || Object.keys(r).sort().join(",") !== "animal,behavior") throw Error("ANIMAL_REQUIREMENTS");
    const a = acceptedAnimals.find((a2) => a2.id === r.animal), key2 = r.animal + ":" + r.behavior;
    if (!a || identities.has(key2)) throw Error("ANIMAL_REQUIREMENTS");
    identities.add(key2);
    if (r.behavior === "shore-space") {
      if (a.species !== "gull") throw Error("ANIMAL_BEHAVIOR_UNAVAILABLE");
    } else if (!["sun-rest", "sleep"].includes(r.behavior) || a.species !== "cat" || ![540, 780, 1080, 1300].some((m) => slotAt(a, m)?.activity === r.behavior)) throw Error("ANIMAL_BEHAVIOR_UNAVAILABLE");
  }
}
var freeze4 = (v) => {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze4);
    Object.freeze(v);
  }
  return v;
};
var AnimalContentRegistry = class {
  entries = /* @__PURE__ */ new Map();
  enabled;
  prerequisites;
  bridges;
  constructor(defs = builtInCommissions, enabled = defs.map((d) => d.id + "@" + d.revision), prerequisites = {}, bridges = {}) {
    this.enabled = new Set(enabled);
    for (const d of defs) {
      validateCommission(d);
      const key2 = d.id + "@" + d.revision, hash2 = contentHash(d), old = this.entries.get(key2);
      if (old && old.ref.hash !== hash2) throw Error("ANIMAL_REVISION_CONFLICT");
      this.entries.set(key2, freeze4({ ref: { id: d.id, revision: d.revision, hash: hash2, capability: d.capability }, definition: structuredClone(d) }));
    }
    for (const [key2, required] of Object.entries(prerequisites)) {
      const target = this.entries.get(key2), source6 = this.entries.get(required.id + "@" + required.revision);
      if (!target || !source6 || key2 === required.id + "@" + required.revision || !sameAnimalRef(source6.ref, required)) throw Error("ANIMAL_STORY_PREREQUISITE_INVALID");
    }
    for (const [key2, words] of Object.entries(bridges)) if (!prerequisites[key2] || !Array.isArray(words) || words.length !== 2 || words.some((w) => typeof w !== "string" || !w.trim() || w.length > 200 || /[<>]/.test(w))) throw Error("ANIMAL_STORY_BRIDGE_INVALID");
    this.prerequisites = structuredClone(prerequisites);
    this.bridges = structuredClone(bridges);
  }
  ref(id, revision = 1) {
    const e = this.entries.get(id + "@" + revision);
    if (!e) throw Error("ANIMAL_CONTENT_UNKNOWN");
    return { ...e.ref };
  }
  get(ref) {
    if (!ref || Object.keys(ref).sort().join(",") !== "capability,hash,id,revision") throw Error("ANIMAL_REF_MISMATCH");
    const e = this.entries.get(ref.id + "@" + ref.revision);
    if (!e || !sameAnimalRef(e.ref, ref)) throw Error("ANIMAL_REF_MISMATCH");
    return e.definition;
  }
  isVisible(ref, s) {
    this.get(ref);
    const required = this.prerequisites[ref.id + "@" + ref.revision];
    return !required || !!s?.animalNotebookV1?.pages.some((p) => sameAnimalRef(p.ref, required));
  }
  canStart(ref, s) {
    return this.isVisible(ref, s) && this.enabled.has(ref.id + "@" + ref.revision);
  }
  continuation(ref) {
    this.get(ref);
    const words = this.bridges[ref.id + "@" + ref.revision];
    return words ? [...words] : null;
  }
  assertSavedContinuity(s) {
    const pages = s.animalNotebookV1?.pages ?? [];
    for (const [key2, required] of Object.entries(this.prerequisites)) {
      const index = pages.findIndex((p) => p.ref.id + "@" + p.ref.revision === key2);
      if (index >= 0 && !pages.slice(0, index).some((p) => sameAnimalRef(p.ref, required))) throw Error("ANIMAL_STORY_SEQUENCE_INVALID");
      const active = s.animalNotebookV1?.active;
      if (active && active.ref.id + "@" + active.ref.revision === key2 && !pages.some((p) => sameAnimalRef(p.ref, required))) throw Error("ANIMAL_STORY_SEQUENCE_INVALID");
    }
  }
  list() {
    return [...this.entries.values()].map((e) => ({ ref: { ...e.ref }, definition: structuredClone(e.definition) }));
  }
};

// src/animal-life/types.ts
var observationId = (animal, behavior) => "observe:" + animal + ":" + behavior;

// src/animal-life/presentation.ts
function currentAnimalSample(head, sample = head.animalNotebookV1?.sample, player = head.position) {
  return sample && sample.version === head.version && sample.scene === head.scene && sample.minute === (head.townMinutes ?? 540) && Math.hypot(player.x - sample.player.x, player.y - sample.player.y) <= 2 ? sample : void 0;
}

// server/animal-life.ts
var now = (s) => s.townMinutes ?? 540;
var int4 = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
var record4 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var source5 = (v) => typeof v === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(v);
var point2 = (v) => record4(v) && Object.keys(v).sort().join(",") === "x,y" && Number.isFinite(v.x) && Number.isFinite(v.y);
var notebook = (s) => s.animalNotebookV1 ?? { schema: 1, briefs: [], pages: [] };
function sampleAnimal(s, target, p) {
  const engine = createAnimalRuntime(acceptedAnimals), ctx = gameAnimalContext(s, p, { world: landWorld(dynamicWorld(s.flags, false), s.landV1), paused: true, weatherShelter: false });
  const frame = engine.tick(0, ctx).find((a) => a.id === target);
  if (!frame?.visible || frame.scene !== s.scene) throw Error("ANIMAL_AWAY");
  const behavior = frame.species === "gull" ? "shore-space" : frame.phase === "sun-rest" ? "sun-rest" : frame.phase === "sleep" ? "sleep" : void 0;
  if (!behavior) throw Error("OBSERVATION_NOT_AVAILABLE");
  const distance2 = Math.hypot(p.x + 8 - frame.foot.x, p.y + 6 - frame.foot.y);
  if (behavior === "shore-space" && distance2 < 72) throw Error("LEAVE_GULL_SPACE");
  if (distance2 > (behavior === "shore-space" ? 112 : 64)) throw Error("TOO_FAR");
  return { frame, behavior };
}
function assertAnimalNotebook(s, content) {
  const n = s.animalNotebookV1;
  if (n === void 0) return;
  const bad = () => {
    throw Error("UNSUPPORTED_ANIMAL_NOTEBOOK");
  };
  if (!record4(n) || n.schema !== 1 || Object.keys(n).some((k) => !["schema", "sample", "briefs", "active", "pages", "adopted"].includes(k)) || !Array.isArray(n.briefs) || !Array.isArray(n.pages) || n.briefs.length > 16 || n.pages.length > 16) bad();
  if (n.adopted !== void 0) {
    if (!Array.isArray(n.adopted) || n.adopted.length > 4) bad();
    const adoptedIds = /* @__PURE__ */ new Set();
    for (const e of n.adopted) {
      if (!e || Object.keys(e).sort().join(",") !== "artifactHash,definition,ref" || !/^[a-f0-9]{64}$/.test(e.artifactHash) || adoptedIds.has(e.ref?.id)) bad();
      if (contentHash(content.get(e.ref)) !== contentHash(e.definition)) bad();
      adoptedIds.add(e.ref.id);
    }
  }
  const ids = /* @__PURE__ */ new Set();
  for (const ref of n.briefs) {
    content.get(ref);
    const k = canonical2(ref);
    if (ids.has(k)) bad();
    ids.add(k);
  }
  const pages = /* @__PURE__ */ new Set();
  for (const page of n.pages) {
    if (!record4(page) || Object.keys(page).sort().join(",") !== "minute,ref,sourceAction" || !source5(page.sourceAction) || !int4(page.minute, 0, now(s))) bad();
    content.get(page.ref);
    if (pages.has(page.ref.id)) bad();
    pages.add(page.ref.id);
  }
  if (n.active) {
    const a = n.active;
    if (!record4(a) || Object.keys(a).sort().join(",") !== "minute,ref,sourceAction" || !source5(a.sourceAction) || !int4(a.minute, 0, now(s)) || !n.briefs.some((r) => sameAnimalRef(r, a.ref)) || pages.has(a.ref.id)) bad();
    content.get(a.ref);
  }
  if (n.sample) {
    const a = n.sample;
    if (!record4(a) || Object.keys(a).sort().join(",") !== "behavior,frame,minute,player,scene,sourceAction,version" || !source5(a.sourceAction) || !int4(a.version, 0, s.version) || !int4(a.minute, 0, now(s)) || !point2(a.player) || !rooms[a.scene] || !record4(a.frame)) bad();
    const projected = { ...s, scene: a.scene, townMinutes: a.minute };
    try {
      const derived = sampleAnimal(projected, a.frame.id, a.player);
      if (canonical2(derived.frame) !== canonical2(a.frame) || derived.behavior !== a.behavior) bad();
    } catch {
      bad();
    }
  }
  content.assertSavedContinuity(s);
}
function parseAnimalCommand(a) {
  const p = a.payload, c = p?.command;
  if (!record4(p) || Object.keys(p).join(",") !== "command" || !record4(c) || !["sample", "record", "brief", "accept", "share", "cancel"].includes(c.verb) || a.action !== "animal-life:" + c.verb || Object.keys(c).sort().join(",") !== (["sample", "record"].includes(c.verb) ? "verb" : "ref,verb")) throw Error("INVALID_ANIMAL_COMMAND");
  return structuredClone(c);
}
function residentAdmission(s, a, resident2) {
  if (!s.known.includes(resident2)) throw Error("INTRODUCE_FIRST");
  const e = rooms[s.scene].entities.find((e2) => e2.person === resident2 && e2.id === a.target);
  if (!e || !presentEntity(s, e)) throw Error("PERSON_AWAY");
  const foot = observedActor(e, a.actorPosition);
  if (!foot || Math.hypot(a.position.x + 8 - foot.x, a.position.y + 6 - foot.y) > 75) throw Error("TOO_FAR");
}
function createAnimalLife(base2, content = new AnimalContentRegistry(), plantStarts = true) {
  const plants = createLifePlantsB2(base2, plantStarts), crops2 = createPlantsRegistry();
  const runtime2 = {
    ...plants.runtime,
    assertReadable(s) {
      plants.runtime.assertReadable(s);
      assertAnimalNotebook(s, content);
    },
    validateAction(a) {
      plants.runtime.validateAction(a);
      if (a.action.startsWith("animal-life:")) parseAnimalCommand(a);
    },
    async prepare(previous, a, cancel, context) {
      assertAnimalNotebook(previous, content);
      if (!a.action.startsWith("animal-life:")) {
        const r = await plants.runtime.prepare(previous, a, cancel, context), head2 = r.head;
        if (head2.animalNotebookV1?.sample) delete head2.animalNotebookV1.sample;
        return { ...r, head: head2 };
      }
      plants.runtime.position(previous, a.position);
      assertLifeReadable(previous, crops2);
      if (previous.scene !== a.scene) throw Error("SCENE_MISMATCH");
      if (previous.version !== a.expected_version) throw Error("VERSION_CONFLICT");
      if (!source5(a.action_id)) throw Error("INVALID_ACTION_ID");
      if (previous.activeChallenge || battleLocksWorld(previous)) throw Error("CHALLENGE_ACTIVE");
      const c = parseAnimalCommand(a);
      let head = structuredClone(previous), text2, person;
      head.animalNotebookV1 = structuredClone(notebook(previous));
      const n = head.animalNotebookV1;
      if (c.verb === "sample") {
        if (rainCatShelterActive(head, a.target)) throw Error("OBSERVATION_NOT_AVAILABLE");
        const v = sampleAnimal(head, a.target, a.position);
        n.sample = { ...v, sourceAction: a.action_id, version: head.version + 1, scene: head.scene, minute: now(head), player: { ...a.position } };
        text2 = v.behavior === "shore-space" ? ["\u4F60\u7559\u51FA\u4E00\u70B9\u8DDD\u79BB\u3002\u6D77\u9E25\u4ECD\u6709\u81EA\u5DF1\u7684\u7A7A\u95F4\uFF0C\u53EF\u4EE5\u8BB0\u4E0B\u8FD9\u6B21\u89C2\u5BDF\u3002", "You leave room for the gull. You can record this quiet observation."] : v.behavior === "sleep" ? ["\u5B83\u8737\u7740\u7761\u89C9\u3002\u6CA1\u6709\u53EB\u9192\u5B83\uFF0C\u53EF\u4EE5\u628A\u8FD9\u4E00\u523B\u8BB0\u4E0B\u6765\u3002", "It is curled up asleep. You let it rest; this moment can go in your notebook."] : ["\u5B83\u5728\u9633\u5149\u91CC\u5B89\u9759\u5F85\u7740\u3002\u53EF\u4EE5\u628A\u8FD9\u4E00\u523B\u8BB0\u4E0B\u6765\u3002", "It rests in the sunlight. This moment can go in your notebook."];
      } else if (c.verb === "record") {
        const q = n.sample;
        if (!q || q.version !== previous.version || q.scene !== head.scene || q.minute !== now(head) || q.frame.id !== a.target || Math.hypot(a.position.x - q.player.x, a.position.y - q.player.y) > 2) throw Error("OBSERVATION_STALE");
        const v = sampleAnimal(head, a.target, a.position);
        if (v.behavior !== q.behavior || canonical2(v.frame) !== canonical2(q.frame)) throw Error("OBSERVATION_STALE");
        if (q.behavior !== "shore-space") {
          head = applyLife(head, { actionId: a.action_id, expectedVersion: head.version, command: { verb: "observe-animal", animal: a.target, behavior: q.behavior } }, crops2, { scene: head.scene, target: a.target, animal: { id: a.target, behavior: q.behavior, visualVersion: q.frame.visualVersion } }).head;
        } else {
          head = pinLegacy(head, crops2);
          const collections = head.lifeV1.collections, id = observationId(a.target, q.behavior);
          if (!collections[id]) {
            if (Object.keys(collections).length >= 64) throw Error("COLLECTION_CAPACITY");
            collections[id] = { id, sourceAction: a.action_id, minute: now(head), source: { kind: "animal-schedule", id: a.target, visualVersion: q.frame.visualVersion } };
          }
        }
        delete head.animalNotebookV1.sample;
        text2 = ["\u89C2\u5BDF\u5DF2\u767B\u8BB0\u3002\u5B83\u662F\u4E00\u4E2A\u53D1\u73B0\uFF0C\u4E0D\u662F\u884C\u56CA\u91CC\u7684\u52A8\u7269\u6216\u7269\u54C1\u3002", "Recorded. This is a discovery, not an animal or item in your bag."];
      } else {
        const def = content.get(c.ref);
        if (c.verb !== "cancel") {
          residentAdmission(head, a, def.resident);
          person = def.resident;
        }
        if (c.verb === "brief") {
          if (!content.canStart(c.ref, head)) throw Error("ANIMAL_CONTENT_CLOSED");
          if (!n.briefs.some((r) => sameAnimalRef(r, c.ref))) {
            if (n.briefs.length >= 16) throw Error("ANIMAL_NOTEBOOK_CAPACITY");
            n.briefs.push({ ...c.ref });
          }
          text2 = [...def.brief];
        } else if (c.verb === "accept") {
          if (!content.canStart(c.ref, head)) throw Error("ANIMAL_CONTENT_CLOSED");
          if (!n.briefs.some((r) => sameAnimalRef(r, c.ref))) throw Error("COMMISSION_PREMISE_UNREAD");
          if (n.active || n.pages.some((p) => p.ref.id === c.ref.id)) throw Error("COMMISSION_UNAVAILABLE");
          n.active = { ref: { ...c.ref }, sourceAction: a.action_id, minute: now(head) };
          text2 = ["\u8FD9\u4EFD\u89C2\u5BDF\u7EA6\u5B9A\u5DF2\u8BB0\u4E0B\u3002\u4F60\u4E5F\u53EF\u4EE5\u5148\u505A\u522B\u7684\u4E8B\uFF0C\u6CA1\u6709\u671F\u9650\u3002", "Your observation plan is saved. There is no deadline; other things can come first."];
        } else if (c.verb === "cancel") {
          if (a.target !== "animal-notebook" || !n.active || !sameAnimalRef(n.active.ref, c.ref)) throw Error("COMMISSION_MISMATCH");
          delete n.active;
          text2 = ["\u7EA6\u5B9A\u5DF2\u6536\u8D77\uFF0C\u5DF2\u7ECF\u53D1\u73B0\u7684\u65E5\u5E38\u4ECD\u5728\u6536\u85CF\u91CC\u3002", "The plan is set aside. Your observations remain in Collections."];
        } else {
          if (!n.active || !sameAnimalRef(n.active.ref, c.ref)) throw Error("COMMISSION_MISMATCH");
          if (!def.requirements.every((r) => head.lifeV1?.collections[observationId(r.animal, r.behavior)])) throw Error("OBSERVATIONS_MISSING");
          if (n.pages.length >= 16) throw Error("ANIMAL_NOTEBOOK_CAPACITY");
          if ((head.relations[def.resident] ?? 0) >= 100) throw Error("RELATION_FULL");
          n.pages.push({ ref: { ...c.ref }, minute: now(head), sourceAction: a.action_id });
          delete n.active;
          head.relations[def.resident] = (head.relations[def.resident] ?? 0) + 1;
          text2 = [...def.page];
        }
        delete n.sample;
      }
      head.position = { ...a.position };
      head.version = previous.version + 1;
      head.cursor = previous.cursor + 1;
      head.history.push({ id: a.action_id, kind: person ? "talk" : "action", ...person ? { person } : {}, text: text2 });
      head.history = head.history.slice(-500);
      this.assertReadable(head);
      return { head, text: text2, kind: a.action, accepted: true, actionId: a.action };
    }
  };
  const animalProject = (s) => {
    assertAnimalNotebook(s, content);
    const n = notebook(s);
    return { schema: 1, snapshotVersion: s.version, commissions: content.list().filter((e) => s.known.includes(e.definition.resident) && content.isVisible(e.ref, s)).map((e) => ({ ...e, ...content.continuation(e.ref) ? { continuation: content.continuation(e.ref) } : {}, enabled: content.canStart(e.ref, s), briefed: n.briefs.some((r) => sameAnimalRef(r, e.ref)), completed: n.pages.some((p) => p.ref.id === e.ref.id), active: !!n.active && sameAnimalRef(n.active.ref, e.ref), missing: e.definition.requirements.filter((r) => !s.lifeV1?.collections[observationId(r.animal, r.behavior)]) })), pages: n.pages.map((p) => ({ ...p, title: content.get(p.ref).title, text: content.get(p.ref).page })), sample: currentAnimalSample(s) ?? null };
  };
  return { ...plants, runtime: runtime2, animalProject, lifeProject: (s) => ({ ...plants.lifeProject(s), animals: animalProject(s) }) };
}

// server/native-crab-life.ts
var crabCommission = { schema: 1, id: "animals:native-quiet-shore", revision: 1, capability: "animal-notebook-v1", resident: "ruth", title: ["\u505C\u4E0B\u6765\uFF0C\u770B\u770B\u5CB8\u8FB9", "Pause and watch the shore"], brief: ["\u201C\u90A3\u53EA\u87F9\u4F1A\u6A2A\u7740\u9000\u5F00\u3002\u522B\u8FFD\u5B83\uFF0C\u7559\u4E00\u70B9\u8DDD\u79BB\uFF0C\u7B49\u5B83\u5B89\u9759\u505C\u4E0B\u518D\u770B\u3002\u613F\u610F\u7684\u8BDD\u56DE\u6765\u8BB2\u8BB2\uFF0C\u6CA1\u6709\u671F\u9650\u3002\u201D", "\u201CThat crab steps sideways to leave room. Don\u2019t chase it. Keep a little distance and watch when it settles. Tell me if you like. No deadline.\u201D"], page: ["\u6211\u548CRuth\u804A\u8D77\u87F9\u7684\u6A2A\u6B65\u3002\u5CB8\u8FB9\u4E0D\u53EA\u662F\u901A\u5F80\u522B\u5904\u7684\u8DEF\uFF1A\u505C\u4E0B\u6765\uFF0C\u4E5F\u80FD\u770B\u89C1\u53E6\u4E00\u4E2A\u751F\u547D\u600E\u6837\u7ED9\u81EA\u5DF1\u7559\u7A7A\u95F4\u3002", "Ruth and I talked about the crab\u2019s sidestep. The shore is more than a route somewhere else: pausing lets us notice another life making room for itself."], requirements: [{ animal: nativeCrabId, behavior: "shore-space" }] };
var crabCommissionRef = { id: crabCommission.id, revision: 1, capability: "animal-notebook-v1", hash: contentHash(crabCommission) };
var event2 = (a, s) => ({ sourceAction: a.action_id, minute: s.townMinutes ?? 540 });
var total = (s) => (s.townMinutes ?? 540) * (s.activePlayClock?.millisecondsPerMinute ?? 4e3) + (s.activePlayClock?.remainderMs ?? 0);
function nativeForegroundBudget(before, next) {
  if (!before.activePlayClock) return 0;
  if (before.activePlayClock.millisecondsPerMinute !== next.activePlayClock?.millisecondsPerMinute) throw Error("INVALID_NATIVE_BUDGET");
  const ms = total(next) - total(before);
  if (!Number.isSafeInteger(ms) || ms < 0 || ms > 3e3) throw Error("INVALID_NATIVE_BUDGET");
  return ms / 1e3;
}
function withNativeCrabLife(base2, { enabled = false, now: now2 = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const runtime2 = {
    ...base2.runtime,
    validateAction(a) {
      try {
        base2.runtime.validateAction(a);
      } catch (error) {
        throw a.activePlay ? brandActivePrepareFailure(error) : error;
      }
    },
    assertReadable(s) {
      base2.runtime.assertReadable(s);
      assertNativeCrab(s);
    },
    finalizeMotion(_before, next) {
      advanceNativeCrab(next, 0, enabled);
    },
    async prepare(s, a, cancel, context) {
      this.assertReadable(s);
      const payload = a.payload, ref = payload?.command?.ref;
      const native = a.action.startsWith("animal-life:") && (a.target === nativeCrabId || ref?.id === crabCommission.id);
      if (!native) {
        if (a.action === "animal-life:accept" && s.nativeCrabV1?.plan && !s.nativeCrabV1.page) throw Error("COMMISSION_UNAVAILABLE");
        const r = await base2.runtime.prepare(s, a, cancel, context);
        advanceNativeCrab(r.head, 0, enabled);
        this.assertReadable(r.head);
        return r;
      }
      const command = parseAnimalCommand(a);
      if (a.expected_version !== s.version) throw Error("VERSION_CONFLICT");
      if (a.scene !== s.scene) throw Error("SCENE_MISMATCH");
      if (!/^[-a-zA-Z0-9]{16,80}$/.test(a.action_id)) throw Error("INVALID_ACTION_ID");
      if (s.activeChallenge || battleLocksWorld(s)) throw Error("CHALLENGE_ACTIVE");
      base2.runtime.position(s, a.position);
      if (!s.movingClock?.transport || Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y) > 2) throw Error("NATIVE_CRAB_CHECKPOINT_REQUIRED");
      const head = structuredClone(s);
      advanceNativeCrab(head, 0, enabled);
      if (!head.nativeCrabV1) throw Error("NATIVE_CRAB_CLOSED");
      const n = head.nativeCrabV1;
      let text2, person;
      const quietFrame = () => {
        const f2 = nativeCrabFrame(head, a.position, true).frame;
        if (!f2.visible || f2.scene !== head.scene) throw Error("ANIMAL_AWAY");
        const distance2 = Math.hypot(a.position.x + 8 - f2.foot.x, a.position.y + 6 - f2.foot.y);
        if (distance2 < 72) throw Error("LEAVE_CRAB_SPACE");
        if (distance2 > 112) throw Error("TOO_FAR");
        if (f2.phase !== "idle" || f2.pose !== "stand") throw Error("CRAB_NEEDS_QUIET_MOMENT");
        return f2;
      };
      if (command.verb === "sample") {
        if (a.target !== nativeCrabId || !enabled && (!n.plan || !!n.page)) throw Error("NATIVE_CRAB_CLOSED");
        const frame = quietFrame(), at = now2();
        if (typeof cancel === "function" && cancel()) throw Error("REQUEST_IDENTITY_CANCELLED");
        await wait(400);
        if (typeof cancel === "function" && cancel()) throw Error("REQUEST_IDENTITY_CANCELLED");
        if (now2() - at < 400) throw Error("NATIVE_OBSERVATION_CLOCK");
        if (canonical2(quietFrame()) !== canonical2(frame)) throw Error("OBSERVATION_STALE");
        n.frame = structuredClone(frame);
        n.sample = { frame: structuredClone(frame), behavior: "shore-space", quietMs: 400, sourceAction: a.action_id, version: head.version + 1, minute: head.townMinutes ?? 540, scene: head.scene, player: { ...a.position } };
        text2 = ["\u4F60\u505C\u4E86\u4E00\u4F1A\u513F\uFF0C\u87F9\u4E5F\u5B89\u9759\u7559\u5728\u81EA\u5DF1\u7684\u5730\u65B9\u3002\u53EF\u4EE5\u8BB0\u4E0B\u8FD9\u6B21\u89C2\u5BDF\u3002", "You pause for a moment. The crab stays quietly in its own space. You can record this observation."];
      } else if (command.verb === "record") {
        const q = currentNativeSample(s, a.position);
        if (a.target !== nativeCrabId || !q) throw Error("OBSERVATION_STALE");
        const f2 = quietFrame();
        if (canonical2(f2) !== canonical2(q.frame)) throw Error("OBSERVATION_STALE");
        n.observation ??= event2(a, head);
        delete n.sample;
        text2 = ["\u87F9\u7684\u5B89\u9759\u6A2A\u6B65\u5DF2\u7559\u5728\u6536\u85CF\u91CC\u3002\u5B83\u662F\u4E00\u6B21\u53D1\u73B0\uFF0C\u4E0D\u662F\u6355\u83B7\u7684\u52A8\u7269\u3002", "The crab\u2019s quiet sidestep is in Collections. It is a discovery, not a captured animal."];
      } else {
        if (!sameAnimalRef(command.ref, crabCommissionRef)) throw Error("NATIVE_CRAB_REF_MISMATCH");
        if (command.verb !== "cancel") {
          const e = rooms[head.scene].entities.find((e2) => e2.person === crabCommission.resident && e2.id === a.target);
          if (!head.known.includes(crabCommission.resident)) throw Error("INTRODUCE_FIRST");
          if (!e || !presentEntity(head, e)) throw Error("PERSON_AWAY");
          const p = observedActor(e, a.actorPosition);
          if (Math.hypot(a.position.x + 8 - p.x, a.position.y + 6 - p.y) > 75) throw Error("TOO_FAR");
          person = crabCommission.resident;
        }
        if (command.verb === "brief") {
          if (!enabled && !n.brief) throw Error("NATIVE_CRAB_CLOSED");
          n.brief ??= event2(a, head);
          text2 = [...crabCommission.brief];
        } else if (command.verb === "accept") {
          if (!enabled) throw Error("NATIVE_CRAB_CLOSED");
          if (!n.brief) throw Error("COMMISSION_PREMISE_UNREAD");
          if (n.plan || n.page || head.animalNotebookV1?.active) throw Error("COMMISSION_UNAVAILABLE");
          n.plan = event2(a, head);
          text2 = ["\u8FD9\u4EFD\u5CB8\u8FB9\u89C2\u5BDF\u7EA6\u5B9A\u5DF2\u8BB0\u4E0B\uFF0C\u6CA1\u6709\u671F\u9650\u3002", "Your shore observation plan is saved. There is no deadline."];
        } else if (command.verb === "cancel") {
          if (a.target !== "animal-notebook" || !n.plan || n.page) throw Error("COMMISSION_MISMATCH");
          delete n.plan;
          text2 = ["\u7EA6\u5B9A\u5DF2\u6536\u8D77\uFF0C\u87F9\u7684\u89C2\u5BDF\u4ECD\u7559\u5728\u6536\u85CF\u91CC\u3002", "The plan is set aside. Your crab observation remains in Collections."];
        } else {
          if (!n.plan || n.page) throw Error("COMMISSION_UNAVAILABLE");
          if (!n.observation) throw Error("OBSERVATIONS_MISSING");
          if ((head.relations.ruth ?? 0) >= 100) throw Error("RELATION_FULL");
          n.page = event2(a, head);
          head.relations.ruth = (head.relations.ruth ?? 0) + 1;
          text2 = [...crabCommission.page];
        }
        delete n.sample;
      }
      head.position = { ...a.position };
      head.version = s.version + 1;
      head.cursor = s.cursor + 1;
      head.history.push({ id: a.action_id, kind: person ? "talk" : "action", ...person ? { person } : {}, text: text2 });
      head.history = head.history.slice(-500);
      this.assertReadable(head);
      return { head, text: text2, kind: "action", accepted: true, actionId: a.action };
    }
  };
  const project = (s) => {
    runtime2.assertReadable(s);
    const old = base2.animalProject(s), n = s.nativeCrabV1;
    const entry = { ref: { ...crabCommissionRef }, definition: structuredClone(crabCommission), enabled, briefed: !!n?.brief, completed: !!n?.page, active: !!n?.plan && !n.page, missing: n?.observation ? [] : structuredClone(crabCommission.requirements) };
    return { ...old, commissions: [...old.commissions, ...s.known.includes(crabCommission.resident) && (enabled || n?.brief || n?.page) ? [entry] : []], pages: [...old.pages, ...n?.page ? [{ ref: { ...crabCommissionRef }, ...n.page, title: [...crabCommission.title], text: [...crabCommission.page] }] : []], sample: currentNativeSample(s) ?? old.sample };
  };
  return { ...base2, runtime: runtime2, animalProject: project, nativeEnabled: enabled, advanceForeground: (before, next) => advanceNativeCrab(next, nativeForegroundBudget(before, next), enabled), lifeProject: (s) => {
    const old = base2.lifeProject(s), n = s.nativeCrabV1;
    return { ...old, animals: project(s), collections: [...old.collections, ...n?.observation ? [{ record: { id: "observe:" + nativeCrabId + ":shore-space", ...n.observation, source: { id: nativeCrabId, kind: "animal-schedule", visualVersion: nativeCrabPin.id } }, isRecord: true }] : []] };
  } };
}

// server/life-assembly.ts
function createHarborLife(base2, plantStarts = true, nativeOptions = {}, content) {
  return withNativeCrabLife(createAnimalLife(base2, content, plantStarts), nativeOptions);
}

// server/candidate-motion-authority.ts
import { createHash as createHash8, randomUUID as randomUUID2 } from "node:crypto";

// src/candidate/clock-types.ts
var motionActionId = (journey, ordinal) => `motion-${journey}-${ordinal}`;

// server/candidate-motion-authority.ts
var wire = (v) => JSON.parse(JSON.stringify(v));
var canonical3 = (v) => Array.isArray(v) ? v.map(canonical3) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical3(v[k])])) : v;
var fail6 = (code) => {
  throw new MotionRejection(code);
};
var stable = (s) => {
  const { scene, position, townMinutes: townMinutes2, awakeMinutes, energy, visited, movingClock, version, cursor, ...rest } = s;
  return JSON.stringify(rest);
};
function withCompactMotion(authority, store, runtime2, motion = createMovingClock(), now2 = Date.now, play, waitForSpeed) {
  const inFlight = /* @__PURE__ */ new Map();
  const method = async (owner2, id, input) => {
    if (typeof owner2 !== "string" || !owner2.trim() || owner2.length > 256) fail6("AUTH_REQUIRED");
    const body = wire(input), p = body?.payload;
    if (!body || !/^[-a-zA-Z0-9]{16,80}$/.test(body.action_id) || !Number.isSafeInteger(body.expected_version) || body.expected_version < 0 || !["candidate-motion-open", "candidate-motion-step"].includes(body.action) || p?.transport !== 1 || !Number.isSafeInteger(p.ordinal) || p.ordinal < 1 || typeof p.previous !== "string" || p.previous.length > 80) fail6("INVALID_MOTION_ACTION");
    try {
      runtime2.validateAction(body);
    } catch (error) {
      if (error?.message === "INVALID_ACTION") fail6("INVALID_ACTION");
      throw error;
    }
    if (body.action_id !== motionActionId(id, p.ordinal)) fail6("ACTION_ID_CONFLICT");
    const hash2 = createHash8("sha256").update(JSON.stringify(canonical3({ id, body }))).digest("hex"), key2 = owner2 + ":" + id + ":" + body.action_id, old = inFlight.get(key2);
    if (old) {
      if (old.hash !== hash2) fail6("ACTION_ID_CONFLICT");
      return wire(await old.promise);
    }
    const run = async () => store.transaction(async (repo) => {
      if (await repo.receipt(owner2, body.action_id)) fail6("ACTION_ID_CONFLICT");
      const row = await repo.session(owner2, id);
      if (!row) fail6("SESSION_NOT_FOUND");
      const before = runtime2.upgrade(JSON.parse(row.data));
      if (JSON.stringify(before) !== row.data) fail6("MIGRATION_REQUIRED");
      runtime2.assertReadable(before);
      const last = before.movingClock?.transport?.last;
      if (last && p.ordinal === last.ack.ordinal) {
        if (body.action_id !== last.ack.actionId || hash2 !== last.digest) fail6("ACTION_ID_CONFLICT");
        return last.ack;
      }
      if (last && p.ordinal < last.ack.ordinal) fail6("MOTION_RECEIPT_RETIRED");
      if (p.ordinal !== (last?.ack.ordinal ?? 0) + 1 || p.previous !== (last?.ack.token ?? "")) fail6("MOTION_CONFIRMATION_REQUIRED");
      if (before.version !== body.expected_version) fail6("VERSION_CONFLICT");
      if (await repo.preparedCount(owner2)) fail6("MOTION_BUSINESS_PREPARED");
      let next = motion(before, body).head;
      if (stable(next) !== stable(before) || next.id !== id || next.mapVersion !== before.mapVersion || next.version !== before.version + 1) fail6("UNSUPPORTED_MOTION_DELTA");
      const f2 = p.foreground;
      if (f2 !== void 0) {
        if (!play) fail6("CANDIDATE_ACTIVE_CLOSED");
        if (!f2 || typeof f2 !== "object" || Object.keys(f2).sort().join(",") !== "activeMs,client,lease,sequence" || typeof f2.client !== "string" || !/^[-a-f0-9]{36}$/.test(f2.client) || typeof f2.lease !== "string" || f2.lease.length !== 36 || !Number.isSafeInteger(f2.sequence) || f2.sequence < 1 || !Number.isSafeInteger(f2.activeMs) || f2.activeMs < 0 || f2.activeMs > 3e3) fail6("INVALID_ACTIVE_ACTION");
        next = play.apply(next, { ...body, scene: next.scene, position: next.position, action: "candidate-active-tick", payload: f2 });
      }
      const settled = structuredClone(next);
      runtime2.finalizeMotion?.(before, next);
      let expected;
      try {
        expected = applyWeatherPatch({ ...settled, nativeCrabV1: next.nativeCrabV1 }, weatherPatch(settled, next), { ...settled, townMinutes: before.townMinutes });
      } catch {
        fail6("UNSUPPORTED_MOTION_DELTA");
      }
      if (JSON.stringify(canonical3(expected)) !== JSON.stringify(canonical3(next))) fail6("UNSUPPORTED_MOTION_DELTA");
      const cursor = row.cursor + 1, { transport: _, ...clock } = next.movingClock;
      const playFields = f2 ? (({ transport: _2, ...c }) => c)(next.activePlayClock) : void 0;
      const ack = wire({ schema: 1, id, mapVersion: next.mapVersion, baseVersion: before.version, version: next.version, cursor, ordinal: p.ordinal, actionId: body.action_id, token: randomUUID2(), fields: { ...weatherPatch(before, next) ? { weather: weatherPatch(before, next) } : {}, ...playFields ? { play: playFields } : {}, ...next.nativeCrabV1 ? { nativeCrabV1: next.nativeCrabV1 } : {}, scene: next.scene, position: next.position, townMinutes: next.townMinutes, awakeMinutes: next.awakeMinutes, energy: next.energy, visited: next.visited, clock } });
      next.cursor = cursor;
      next.movingClock.transport = { version: 1, last: { digest: hash2, ack } };
      runtime2.assertReadable(next);
      await repo.write(owner2, next, cursor, now2());
      return ack;
    });
    const promise = Promise.resolve().then(run).catch(async (error) => {
      if (!waitForSpeed || !(error instanceof MotionRejection) || error.code !== "MOTION_TOO_FAST" || error.retryAfterMs === void 0) throw error;
      await waitForSpeed(error.retryAfterMs);
      return run();
    });
    inFlight.set(key2, { hash: hash2, promise });
    try {
      return wire(await promise);
    } finally {
      if (inFlight.get(key2)?.promise === promise) inFlight.delete(key2);
    }
  };
  return new Proxy(authority, { get(target, key2) {
    if (key2 === "motion") return method;
    const value = Reflect.get(target, key2, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

// server/active-play-clock.ts
import { randomUUID as randomUUID3 } from "node:crypto";
var activePlayLeaseMs = 3e3;
function validActivePlay(s) {
  const c = s.activePlayClock;
  if (!c) return true;
  const l = c.lease, t3 = c.transport, a = t3?.last?.ack;
  return c.schema === 1 && [2e3, 4e3].includes(c.millisecondsPerMinute) && Number.isSafeInteger(c.remainderMs) && c.remainderMs >= 0 && c.remainderMs < c.millisecondsPerMinute && (!l || typeof l.id === "string" && l.id.length === 36 && typeof l.client === "string" && l.client.length === 36 && typeof l.boot === "string" && Number.isSafeInteger(l.sequence) && l.sequence >= 0 && Number.isSafeInteger(l.lastAt) && l.lastAt >= 0) && (!t3 || typeof t3.last.digest === "string" && /^[a-f0-9]{64}$/.test(t3.last.digest) && a?.channel === "active-play" && a.id === s.id && a.version === a.baseVersion + 1 && Number.isSafeInteger(a.ordinal) && a.ordinal > 0 && Number.isSafeInteger(a.cursor) && typeof a.token === "string" && a.token.length === 36 && !("transport" in a.fields.clock));
}
function createActivePlayClock({ now: now2 = Date.now, boot = randomUUID3(), defaultRate = 4e3 } = {}) {
  if (![2e3, 4e3].includes(defaultRate)) throw Error("INVALID_ACTIVE_RATE");
  const eligible2 = (s) => !s.activeChallenge && !battleLocksWorld(s);
  const settle = (s, at, activeMs) => {
    const c = s.activePlayClock, l = c?.lease;
    if (!c || !l) return;
    const elapsed = at - l.lastAt;
    if (l.boot !== boot || !eligible2(s) || elapsed < 0 || elapsed > activePlayLeaseMs) return;
    const total2 = c.remainderMs + Math.min(elapsed, activeMs), minutes = Math.floor(total2 / c.millisecondsPerMinute);
    c.remainderMs = total2 % c.millisecondsPerMinute;
    advanceTown(s, minutes);
    advanceAwake(s, minutes);
  };
  const apply = (before, a) => {
    const s = structuredClone(before), p = a.payload, at = now2();
    if (!Number.isSafeInteger(at) || at < 0) throw new MotionRejection("INVALID_ACTIVE_CLOCK");
    if (a.scene !== s.scene || Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y) > 0.01) throw new MotionRejection("UNVERIFIED_POSITION");
    const c = s.activePlayClock ?? (s.activePlayClock = { schema: 1, millisecondsPerMinute: defaultRate, remainderMs: 0 }), l = c.lease;
    if (a.action === "candidate-active-open") {
      if (!eligible2(s)) throw new MotionRejection("CHALLENGE_ACTIVE");
      if (p.millisecondsPerMinute !== void 0 && p.millisecondsPerMinute !== c.millisecondsPerMinute) throw new MotionRejection("INVALID_ACTIVE_RATE");
      if (l && l.client !== p.client && l.boot === boot && at >= l.lastAt && at - l.lastAt <= activePlayLeaseMs) throw new MotionRejection("ACTIVE_LEASE_BUSY");
      c.lease = { id: randomUUID3(), client: p.client, boot, sequence: 0, lastAt: at };
    } else {
      if (!Number.isSafeInteger(p.activeMs) || p.activeMs < 0 || p.activeMs > activePlayLeaseMs) throw new MotionRejection("INVALID_ACTIVE_ACTION");
      if (!l || l.id !== p.lease || l.client !== p.client || l.boot !== boot) throw new MotionRejection("ACTIVE_LEASE_EXPIRED");
      if (p.sequence !== l.sequence + 1) throw new MotionRejection("ACTIVE_SEQUENCE");
      if (a.action === "candidate-active-pause") {
        settle(s, at, p.activeMs);
        delete c.lease;
      } else if (a.action === "candidate-active-tick") {
        if (!eligible2(s)) throw new MotionRejection("CHALLENGE_ACTIVE");
        const elapsed = at - l.lastAt;
        if (elapsed < 0 || elapsed > activePlayLeaseMs) throw new MotionRejection("ACTIVE_LEASE_EXPIRED");
        settle(s, at, p.activeMs);
        l.sequence = p.sequence;
        l.lastAt = at;
      } else throw new MotionRejection("INVALID_ACTIVE_ACTION");
    }
    if (!validActivePlay(s) || townMinutes(s) < townMinutes(before)) throw new MotionRejection("INVALID_ACTIVE_CLOCK");
    return s;
  };
  const business = (before, a) => {
    const s = structuredClone(before), c = s.activePlayClock;
    if (!c) return s;
    const l = c.lease, fence = a.activePlay;
    if (l) {
      if (!fence || fence.client !== l.client || fence.lease !== l.id || !Number.isSafeInteger(fence.activeMs) || fence.activeMs < 0 || fence.activeMs > activePlayLeaseMs) throw new MotionRejection("ACTIVE_CONFIRMATION_REQUIRED");
      settle(s, now2(), fence.activeMs);
      delete c.lease;
    }
    return s;
  };
  return { apply, business };
}
function withActivePlayRuntime(base2, clock) {
  return {
    ...base2,
    assertReadable(s) {
      if (!validActivePlay(s)) throw Error("UNSUPPORTED_SAVE");
      base2.assertReadable(s);
    },
    async prepare(s, a, ...context) {
      try {
        return await base2.prepare(a.action.startsWith("candidate-") ? s : clock.business(s, a), a, ...context);
      } catch (error) {
        throw s.activePlayClock || a.activePlay ? brandActivePrepareFailure(error) : error;
      }
    }
  };
}

// server/active-play-authority.ts
import { createHash as createHash9, randomUUID as randomUUID4 } from "node:crypto";

// src/candidate/active-play-types.ts
var activePlayActionId = (id, ordinal) => `play-${id}-${ordinal}`;

// server/active-play-authority.ts
var wire2 = (v) => JSON.parse(JSON.stringify(v));
var canonical4 = (v) => Array.isArray(v) ? v.map(canonical4) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical4(v[k])])) : v;
function withActivePlayAuthority(authority, store, runtime2, clock, now2 = Date.now) {
  const method = async (owner2, id, input) => {
    if (typeof owner2 !== "string" || !owner2.trim() || owner2.length > 256) throw new MotionRejection("AUTH_REQUIRED");
    const a = wire2(input), p = a?.payload;
    if (!a || !["candidate-active-open", "candidate-active-tick", "candidate-active-pause"].includes(a.action) || !Number.isSafeInteger(a.expected_version) || a.expected_version < 0 || !Number.isSafeInteger(p?.ordinal) || p.ordinal < 1 || typeof p.previous !== "string" || p.previous.length > 80 || typeof p.client !== "string" || !/^[-a-f0-9]{36}$/.test(p.client) || a.action_id !== activePlayActionId(id, p.ordinal)) throw new MotionRejection("INVALID_ACTIVE_ACTION");
    try {
      runtime2.validateAction(a);
    } catch (e) {
      if (e.message === "INVALID_ACTION") throw new MotionRejection("INVALID_ACTION");
      throw e;
    }
    const digest2 = createHash9("sha256").update(JSON.stringify(canonical4({ id, body: a }))).digest("hex");
    return store.transaction(async (repo) => {
      if (await repo.receipt(owner2, a.action_id)) throw new MotionRejection("ACTION_ID_CONFLICT");
      const row = await repo.session(owner2, id);
      if (!row) throw new MotionRejection("SESSION_NOT_FOUND");
      const before = runtime2.upgrade(JSON.parse(row.data));
      if (JSON.stringify(before) !== row.data) throw new MotionRejection("MIGRATION_REQUIRED");
      runtime2.assertReadable(before);
      const last = before.activePlayClock?.transport?.last;
      if (last && p.ordinal === last.ack.ordinal) {
        if (last.digest !== digest2) throw new MotionRejection("ACTION_ID_CONFLICT");
        return last.ack;
      }
      if (last && p.ordinal < last.ack.ordinal) throw new MotionRejection("ACTIVE_RECEIPT_RETIRED");
      if (p.ordinal !== (last?.ack.ordinal ?? 0) + 1 || p.previous !== (last?.ack.token ?? "")) throw new MotionRejection("ACTIVE_CONFIRMATION_REQUIRED");
      if (before.version !== a.expected_version) throw new MotionRejection("VERSION_CONFLICT");
      if (await repo.preparedCount(owner2)) throw new MotionRejection("MOTION_BUSINESS_PREPARED");
      const next = clock.apply(before, a), cursor = row.cursor + 1;
      next.version = before.version + 1;
      next.cursor = cursor;
      const { transport: _, ...c } = next.activePlayClock;
      const ack = wire2({ schema: 1, channel: "active-play", id, mapVersion: next.mapVersion, baseVersion: before.version, version: next.version, cursor, ordinal: p.ordinal, actionId: a.action_id, token: randomUUID4(), fields: { ...weatherPatch(before, next) ? { weather: weatherPatch(before, next) } : {}, ...next.nativeCrabV1 ? { nativeCrabV1: next.nativeCrabV1 } : {}, townMinutes: next.townMinutes ?? 540, awakeMinutes: next.awakeMinutes ?? 0, energy: next.energy, clock: c } });
      next.activePlayClock.transport = { last: { digest: digest2, ack } };
      runtime2.assertReadable(next);
      await repo.write(owner2, next, cursor, now2());
      return ack;
    });
  };
  return new Proxy(authority, { get(target, key2) {
    if (key2 === "activePlay") return method;
    const v = Reflect.get(target, key2, target);
    return typeof v === "function" ? v.bind(target) : v;
  } });
}

// server/exploration-assembly.ts
function createExplorationAssembly({ resolveDialogue, notes, now: now2 = Date.now, boot, defaultRate = 4e3, fishingNewStarts, plantStarts = true, ornamentalFernStarts = plantStarts, crabEnabled = false, observeWait, motionWait = (ms) => new Promise((r) => setTimeout(r, ms)), createLife = createHarborLife, decorateLife = (r) => r, decorateRuntime = (r) => ({ runtime: r }), initial: initial4, weather: weatherOptions = {}, afterRain = false } = {}) {
  const motion = createMovingClock({ now: now2, boot, worldForSave: (s) => {
    const w = landWorld(dynamicWorld(s.flags, !!s.dynamicAssetRooms), s.landV1), b = nativeCrabCollision(s);
    return b.length ? { ...w, scenes: { ...w.scenes, [s.scene]: { ...w.scenes[s.scene], obstacles: [...w.scenes[s.scene].obstacles, ...b] } } } : w;
  } });
  const afterRainIntegration = afterRain === true ? createAfterRainIntegration() : void 0;
  const base2 = createRuntime(resolveDialogue, notes, motion, { fishingNewStarts, afterRainResolve: afterRainIntegration?.resolve });
  const life = withOrnamentalFern(decorateLife(createLife(initial4 ? { ...base2, initial: initial4 } : base2, plantStarts, { enabled: crabEnabled, now: now2, wait: observeWait })), { newStarts: ornamentalFernStarts });
  const decorated = decorateRuntime(life.runtime);
  const weather = createWeatherSettlement(weatherOptions);
  const weatherRuntime = withWeatherRuntime(decorated.runtime, weather);
  const originalPlay = createActivePlayClock({ now: now2, boot, defaultRate });
  const play = { ...originalPlay, apply: (s, a) => {
    const next = originalPlay.apply(s, a);
    life.advanceForeground(s, next);
    weather.settle(s, next);
    return next;
  }, business: (s, a) => {
    const next = originalPlay.business(s, a);
    life.advanceForeground(s, next);
    weather.settle(s, next);
    return next;
  } };
  const runtime2 = withActivePlayRuntime(withMovingClock(weatherRuntime, motion), play);
  return {
    ...life,
    ...decorated,
    runtime: runtime2,
    motion,
    play,
    ...afterRainIntegration ? { lifeProject: (s) => ({ ...life.lifeProject(s), afterRain: afterRainIntegration.project(s) }) } : {},
    decorateAuthority: (authority, guardedStore, finalRuntime = runtime2) => withActivePlayAuthority(withCompactMotion(authority, guardedStore, finalRuntime, motion, now2, play, motionWait), guardedStore, finalRuntime, play, now2)
  };
}

// server/content/reviewed-evening-gull-watch.json
var reviewed_evening_gull_watch_default = {
  schema: 1,
  sourceBatch: "AI-M4-v5",
  contractHash: "efa7da631ced846e7d6b69cfa363f808a0e6ac15d485ec1a2fb9a43a4ed1f473",
  definition: {
    schema: 1,
    id: "animals:evening-gull-watch",
    revision: 1,
    capability: "animal-notebook-v1",
    resident: "dani",
    title: [
      "\u7559\u4E00\u70B9\u5B89\u9759\u7684\u7A7A\u95F4",
      "Leave a little quiet space"
    ],
    brief: [
      "\u201C\u8BF7\u5206\u522B\u89C2\u5BDF\uFF1A\u7B2C3\u53EA\u5CB8\u8FB9\u6D77\u9E25\u508D\u665A\u5728\u6D77\u5CB8\u5B89\u9759\u6D3B\u52A8\uFF1B\u7B2C4\u53EA\u5CB8\u8FB9\u6D77\u9E25\u508D\u665A\u5728\u6D77\u5CB8\u5B89\u9759\u6D3B\u52A8\u3002\u7ED9\u5B83\u4EEC\u7559\u51FA\u7A7A\u95F4\uFF0C\u4E0D\u5FC5\u50AC\u4FC3\u3002\u6CA1\u6709\u671F\u9650\u3002\u201D",
      "\u201CWatch each separately: shore gull 3 moving quietly in The Coast (evening); shore gull 4 moving quietly in The Coast (evening). Leave them space. No deadline.\u201D"
    ],
    page: [
      "\u6211\u4E0EDani Costa\u5206\u4EAB\u4E86\u4E0D\u540C\u7684\u89C2\u5BDF\uFF1A\u7B2C3\u53EA\u5CB8\u8FB9\u6D77\u9E25\u508D\u665A\u5728\u6D77\u5CB8\u5B89\u9759\u6D3B\u52A8\uFF1B\u7B2C4\u53EA\u5CB8\u8FB9\u6D77\u9E25\u508D\u665A\u5728\u6D77\u5CB8\u5B89\u9759\u6D3B\u52A8\u3002",
      "I shared different observations with Dani Costa: shore gull 3 moving quietly in The Coast (evening); shore gull 4 moving quietly in The Coast (evening)."
    ],
    requirements: [
      {
        animal: "harbor-gull-3",
        behavior: "shore-space"
      },
      {
        animal: "harbor-gull-4",
        behavior: "shore-space"
      }
    ]
  },
  ref: {
    id: "animals:evening-gull-watch",
    revision: 1,
    hash: "90f342762db592665e8df74bb7ffcab6ce67e905fadfaed6e742854eee5e264a",
    capability: "animal-notebook-v1"
  },
  groundedChoice: {
    schema: 1,
    id: "animals:evening-gull-watch",
    revision: 1,
    resident: "dani",
    theme: "leave-space",
    observations: [
      {
        animal: "harbor-gull-3",
        behavior: "shore-space",
        period: "evening",
        scene: "coast"
      },
      {
        animal: "harbor-gull-4",
        behavior: "shore-space",
        period: "evening",
        scene: "coast"
      }
    ]
  },
  independentReview: {
    format: "harbor-animal-review-v2",
    passed: true,
    findings: []
  },
  gameChatCalls: 2,
  underlyingModel: null,
  cost: null,
  rewardContract: "original animal-notebook-v1 fixed +1 relationship on completed share, one immutable knowledge page; no cash/items",
  finalCodeCommit: "10d80bdcf282e989450b7d1ebfe91700e754c38e"
};

// server/content/phase2-quiet-after-gulls.json
var phase2_quiet_after_gulls_default = {
  schema: 1,
  sourceKind: "offline-fixture",
  contractHash: "efa7da631ced846e7d6b69cfa363f808a0e6ac15d485ec1a2fb9a43a4ed1f473",
  prerequisite: {
    id: "animals:evening-gull-watch",
    revision: 1,
    hash: "90f342762db592665e8df74bb7ffcab6ce67e905fadfaed6e742854eee5e264a",
    capability: "animal-notebook-v1"
  },
  continuation: [
    "\u6D77\u9E25\u7684\u508D\u665A\u5DF2\u7ECF\u8BB0\u5728\u518C\u91CC\u3002\u63A5\u4E0B\u6765\uFF0C\u591C\u91CC\u53BB\u4F4F\u6237\u5EAD\u9662\u770B\u770B\u7B2C3\u53EA\u6D77\u6E7E\u732B\u5B89\u9759\u7761\u89C9\uFF1B\u89C2\u5BDF\u540E\u53EF\u4EE5\u6539\u65E5\u627EDani\u5206\u4EAB\u3002",
    "The evening gull note is already in your book. Next, watch harbor cat 3 sleeping in Residents\u2019 Courtyard at night; you can share it with Dani on another day."
  ],
  continuationHash: "bc7235947b5e79f08dcf8ac3d180062e8955430bcdb9c169e1e0df13e5698969",
  groundedChoice: {
    schema: 1,
    id: "animals:quiet-after-gulls",
    revision: 1,
    resident: "dani",
    theme: "compare-routines",
    observations: [
      {
        animal: "harbor-gull-3",
        behavior: "shore-space",
        period: "evening",
        scene: "coast"
      },
      {
        animal: "harbor-cat-3",
        behavior: "sleep",
        period: "night",
        scene: "courtyard"
      }
    ]
  },
  independentReview: {
    format: "harbor-animal-review-v2",
    passed: true,
    findings: []
  },
  definition: {
    schema: 1,
    id: "animals:quiet-after-gulls",
    revision: 1,
    capability: "animal-notebook-v1",
    resident: "dani",
    title: [
      "\u5404\u81EA\u7684\u4F5C\u606F",
      "Different daily routines"
    ],
    brief: [
      "\u201C\u4E0A\u6B21\u5DF2\u7ECF\u8BB0\u4E0B\u7B2C3\u53EA\u5CB8\u8FB9\u6D77\u9E25\u508D\u665A\u5728\u6D77\u5CB8\u5B89\u9759\u6D3B\u52A8\u3002\u8FD9\u6B21\u8BF7\u5728\u591C\u95F4\u53BB\u4F4F\u6237\u5EAD\u9662\uFF0C\u5B89\u9759\u89C2\u5BDF\u7B2C3\u53EA\u6D77\u6E7E\u732B\u7761\u89C9\u3002\u6CBF\u7528\u4E0A\u6B21\u7684\u6D77\u9E25\u8BB0\u5F55\uFF1B\u522B\u53EB\u9192\u732B\u3002\u6CA1\u6709\u671F\u9650\u3002\u201D",
      "\u201CYour earlier note already records shore gull 3 moving quietly in The Coast (evening). This time, quietly watch harbor cat 3 sleeping in Residents\u2019 Courtyard at night. Keep the gull note; let the cat sleep. No deadline.\u201D"
    ],
    page: [
      "\u6211\u4E0EDani Costa\u5206\u4EAB\u4E86\u4E24\u6BB5\u4E0D\u540C\u65F6\u523B\u7684\u89C2\u5BDF\uFF1A\u5148\u524D\u5728\u6D77\u5CB8\u508D\u665A\u8BB0\u4E0B\u7684\u7B2C3\u53EA\u5CB8\u8FB9\u6D77\u9E25\u5B89\u9759\u6D3B\u52A8\uFF0C\u4EE5\u53CA\u8FD9\u6B21\u591C\u95F4\u5728\u4F4F\u6237\u5EAD\u9662\u770B\u5230\u7684\u7B2C3\u53EA\u6D77\u6E7E\u732B\u7761\u89C9\u3002\u6211\u4EEC\u90FD\u7ED9\u5B83\u4EEC\u7559\u4E86\u7A7A\u95F4\u3002",
      "I shared two observations with Dani Costa: the earlier note of shore gull 3 moving quietly in The Coast (evening), and harbor cat 3 sleeping in Residents\u2019 Courtyard at night. We gave them both space."
    ],
    requirements: [
      {
        animal: "harbor-gull-3",
        behavior: "shore-space"
      },
      {
        animal: "harbor-cat-3",
        behavior: "sleep"
      }
    ]
  },
  ref: {
    id: "animals:quiet-after-gulls",
    revision: 1,
    hash: "c91feac72f18d5e7b6b40ff5e0074360080fe6c97ee2321ff39a04375ab8baf0",
    capability: "animal-notebook-v1"
  },
  choiceHash: "aa3601b0e296c8731b717329b49e49a1716fcb1790b3b898874a6aa5d4c8cc58"
};

// server/animal-grounded-review.ts
var animalScheduleSourceHash = contentHash(acceptedAnimals);
var animalContractHash = contentHash({ choice: animalChoiceSchema, review: animalBoundReviewSchema, constraints: animalChoiceConstraints, schedule: animalScheduleSourceHash });
var registeredAnimalScheduleFacts = Object.freeze(acceptedAnimals.flatMap((a) => Object.entries(a.schedule).map(([period2, slot2]) => Object.freeze({ animal: a.id, period: period2, scene: slot2.scene, activity: slot2.activity }))));
var admittedAnimalObservationFacts = Object.freeze(acceptedAnimals.flatMap((a) => Object.entries(a.schedule).flatMap(([period2, s]) => {
  const common2 = { animal: a.id, period: period2, scene: s.scene };
  if (a.species === "gull") return [Object.freeze({ ...common2, behavior: "shore-space" })];
  if (a.species === "cat" && (s.activity === "sun-rest" || s.activity === "sleep")) return [Object.freeze({ ...common2, behavior: s.activity })];
  return [];
})));
function observationFactId(claim) {
  return "fact:" + contentHash({ schedule: animalScheduleSourceHash, claim });
}
var claimOf = (o) => ({ animal: o?.animal, behavior: o?.behavior, period: o?.period, scene: o?.scene });
var reference = (o, i) => ({ observationId: `obs-${i + 1}`, factId: observationFactId(claimOf(o)) });
function inspectAnimalChoice(value, known, existing = builtInCommissions) {
  const d = value, issues = [], observations = Array.isArray(d?.observations) ? d.observations.map((o, i) => ({ ...reference(o, i), claim: claimOf(o) })) : [];
  const add = (ruleId, path, constraint, index) => issues.push({ ...index === void 0 ? { observationId: null, factId: null } : reference(d.observations[index], index), ruleId, path, constraint });
  for (const issue of contractViolations(d, animalChoiceSchema)) {
    const m = /^\$\.observations\[(\d+)\]/.exec(issue.path), index = m ? Number(m[1]) : void 0;
    const rule = issue.path === "$.observations" && issue.constraint === "count" ? "ANIMAL_OBSERVATION_COUNT" : index !== void 0 ? issue.path.endsWith(".animal") ? "ANIMAL_KNOWN_ANIMAL" : "ANIMAL_OBSERVATION_FIELDS" : "ANIMAL_GROUNDED_FIELDS";
    add(rule, issue.path, issue.constraint, index);
  }
  if (d && typeof d.resident === "string" && animalResidents.includes(d.resident) && !known.includes(d.resident)) add("ANIMAL_UNKNOWN_RESIDENT", "$.resident", "already-introduced");
  const unique2 = /* @__PURE__ */ new Set();
  for (const [i, o] of (Array.isArray(d?.observations) ? d.observations : []).entries()) {
    const a = acceptedAnimals.find((a2) => a2.id === o?.animal);
    if (!a) {
      add("ANIMAL_KNOWN_ANIMAL", `$.observations[${i}].animal`, "registered-individual", i);
      continue;
    }
    if (!admittedAnimalObservationFacts.some((f2) => canonical2(f2) === canonical2(claimOf(o)))) add("ANIMAL_SCHEDULE_MISMATCH", `$.observations[${i}]`, "exact-individual-period-scene-activity", i);
    const key2 = o.animal + ":" + o.behavior;
    if (unique2.has(key2)) add("ANIMAL_DUPLICATE_REQUIREMENT", `$.observations[${i}]`, "unique-individual-behavior", i);
    unique2.add(key2);
  }
  if (d?.theme === "leave-space" && (!Array.isArray(d.observations) || !d.observations.some((o) => o?.behavior === "shore-space"))) add("ANIMAL_THEME_MISMATCH", "$.theme", "leave-space-requires-gull");
  if (Array.isArray(d?.observations)) {
    const requirements = d.observations.map((o) => ({ animal: o?.animal, behavior: o?.behavior }));
    const key2 = (v) => canonical2([...v].sort((a, b) => canonical2(a).localeCompare(canonical2(b))));
    if (existing.some((v) => v.id === d.id || key2(v.requirements) === key2(requirements))) add("ANIMAL_COSMETIC_DUPLICATE", "$", "new-id-and-requirements");
  }
  return { contractHash: animalContractHash, rawCandidateHash: contentHash(value), observations, issues, knownResidents: known.filter((v) => animalResidents.includes(v)) };
}
function parseBoundAnimalReview(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > animalContractLimits.reviewBytes) throw Error("ANIMAL_REVIEW_INVALID");
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    throw Error("ANIMAL_REVIEW_INVALID");
  }
  if (contractViolations(v, animalBoundReviewSchema).length || v.passed && v.findings.length || !v.passed && !v.findings.length || v.findings.some((f2) => f2.observationId === null !== (f2.factId === null))) throw Error("ANIMAL_REVIEW_INVALID");
  return v;
}
var AnimalReviewUntrustedError = class extends Error {
  constructor(reasons, originalReview) {
    super("ANIMAL_REVIEW_UNTRUSTED");
    this.reasons = reasons;
    this.originalReview = originalReview;
    this.name = "AnimalReviewUntrustedError";
  }
  reasons;
  originalReview;
  code = "ANIMAL_REVIEW_UNTRUSTED";
};
var findingKey = (v) => canonical2({ observationId: v.observationId, factId: v.factId, ruleId: v.ruleId });
function assertBoundAnimalReview(review, packet) {
  parseBoundAnimalReview(JSON.stringify(review));
  const reasons = [], expected = new Set(packet.issues.map(findingKey)), seen5 = /* @__PURE__ */ new Set();
  for (const finding of review.findings) {
    const key2 = findingKey(finding);
    if (seen5.has(key2)) reasons.push("DUPLICATE_FINDING");
    seen5.add(key2);
    if (!expected.has(key2)) reasons.push("UNSUPPORTED_RULE_OR_FACT_REFERENCE");
  }
  if (review.passed && expected.size) reasons.push("ACCEPTS_DETERMINISTIC_VIOLATION");
  if (!review.passed && !expected.size) reasons.push("REJECTS_DETERMINISTICALLY_VALID_FACTS");
  if (!review.passed && [...expected].some((k) => !seen5.has(k))) reasons.push("UNCITED_DETERMINISTIC_VIOLATION");
  if (reasons.length) throw new AnimalReviewUntrustedError(Object.freeze([...new Set(reasons)]), structuredClone(review));
  return { trusted: true, passed: review.passed };
}
var animalChoiceFieldGuide = Object.freeze([...describeContractFields(animalChoiceSchema), ...animalChoiceConstraints.map((r) => r.ruleId + ": " + r.description)]);
var animalReviewFieldGuide = Object.freeze([...describeContractFields(animalBoundReviewSchema), "passed=true requires findings=[]; passed=false requires at least one actual problem", "observationId and factId must both be null for a story-level issue, otherwise both must match one exact packet observation", "Every finding must match a deterministic issue; cite all distinct issues; no free-text reasons, positive commentary or overrides"]);
var issueWords = {
  ANIMAL_GROUNDED_FIELDS: ["\u9876\u5C42\u5B57\u6BB5\u4E0D\u7B26\u5408\u56FA\u5B9A\u5408\u540C", "Top-level fields violate the fixed contract"],
  ANIMAL_OBSERVATION_FIELDS: ["\u89C2\u5BDF\u5B57\u6BB5\u4E0D\u7B26\u5408\u56FA\u5B9A\u5408\u540C", "Observation fields violate the fixed contract"],
  ANIMAL_OBSERVATION_COUNT: [`\u89C2\u5BDF\u6570\u91CF\u987B\u4E3A${animalContractLimits.minimumObservations}\u2013${animalContractLimits.maximumObservations}\u6761`, `Observation count must be ${animalContractLimits.minimumObservations}\u2013${animalContractLimits.maximumObservations}`],
  ANIMAL_KNOWN_ANIMAL: ["\u52A8\u7269\u4E2A\u4F53\u672A\u51C6\u5165", "Animal individual is not admitted"],
  ANIMAL_SCHEDULE_MISMATCH: ["\u4E2A\u4F53\u3001\u65F6\u6BB5\u3001\u5730\u70B9\u6216\u884C\u4E3A\u4E0E\u767B\u8BB0\u65E5\u7A0B\u4E0D\u7B26", "Individual, period, scene or behavior conflicts with the registered schedule"],
  ANIMAL_DUPLICATE_REQUIREMENT: ["\u540C\u4E00\u4E2A\u4F53\u4E0E\u884C\u4E3A\u91CD\u590D", "Individual and behavior requirement repeats"],
  ANIMAL_UNKNOWN_RESIDENT: ["\u5C45\u6C11\u5C1A\u672A\u8BA4\u8BC6", "Resident has not been introduced"],
  ANIMAL_THEME_MISMATCH: ["\u5B89\u9759\u7A7A\u95F4\u4E3B\u9898\u7F3A\u5C11\u6D77\u9E25\u89C2\u5BDF", "Quiet-space theme requires a gull observation"],
  ANIMAL_COSMETIC_DUPLICATE: ["ID\u6216\u9700\u6C42\u4E0E\u65E2\u6709\u59D4\u6258\u91CD\u590D", "Id or requirements duplicate an existing commission"]
};

// server/animal-grounding.ts
var animalGroundingPolicy = Object.freeze({ id: "animal-grounded-choice-v5", maximumFindings: animalContractLimits.maximumFindings, legacyMaximumFindingLength: animalContractLimits.legacyFindingCodeUnits, maximumObservations: animalContractLimits.maximumObservations, freeNarrative: false, boundReviewFreeNarrative: false });
var periodWords = { morning: ["\u4E0A\u5348", "morning"], afternoon: ["\u5348\u540E", "afternoon"], evening: ["\u508D\u665A", "evening"], night: ["\u591C\u95F4", "night"] };
var verbWords = { "sun-rest": ["\u6652\u592A\u9633", "sun-resting"], sleep: ["\u7761\u89C9", "sleeping"], "shore-space": ["\u5B89\u9759\u6D3B\u52A8", "moving quietly"] };
function compileAnimalStoryChoice(v, known) {
  const d = v;
  const violations = contractViolations(d, animalChoiceSchema);
  if (violations.some((v2) => !v2.path.startsWith("$.observations")) || !known.includes(d.resident)) throw Error("ANIMAL_GROUNDED_FIELDS");
  if (violations.some((v2) => v2.path.endsWith(".animal"))) throw Error("ANIMAL_SCHEDULE_MISMATCH");
  if (violations.length) throw Error("ANIMAL_GROUNDED_OBSERVATIONS");
  const report = inspectAnimalChoice(d, known, []);
  if (report.issues.some((v2) => v2.ruleId === "ANIMAL_THEME_MISMATCH")) throw Error("ANIMAL_THEME_MISMATCH");
  if (report.issues.length) throw Error("ANIMAL_SCHEDULE_MISMATCH");
  const names2 = (o) => {
    const a = acceptedAnimals.find((a2) => a2.id === o.animal), n = o.animal.split("-").at(-1);
    return a.species === "cat" ? [`\u7B2C${n}\u53EA\u6D77\u6E7E\u732B`, `harbor cat ${n}`] : [`\u7B2C${n}\u53EA\u5CB8\u8FB9\u6D77\u9E25`, `shore gull ${n}`];
  };
  const facts = (locale) => d.observations.map((o) => locale === "en" ? `${tx(names2(o), locale)} ${tx(verbWords[o.behavior], locale)} in ${tx(rooms[o.scene].title, locale)} (${tx(periodWords[o.period], locale)})` : `${tx(names2(o), locale)}${tx(periodWords[o.period], locale)}\u5728${tx(rooms[o.scene].title, locale)}${tx(verbWords[o.behavior], locale)}`).join(locale === "en" ? "; " : "\uFF1B");
  const result = {
    schema: 1,
    id: d.id,
    revision: d.revision,
    capability: "animal-notebook-v1",
    resident: d.resident,
    title: d.theme === "compare-routines" ? ["\u5404\u81EA\u7684\u4F5C\u606F", "Different daily routines"] : ["\u7559\u4E00\u70B9\u5B89\u9759\u7684\u7A7A\u95F4", "Leave a little quiet space"],
    brief: [`\u201C\u8BF7\u5206\u522B\u89C2\u5BDF\uFF1A${facts("zh")}\u3002\u7ED9\u5B83\u4EEC\u7559\u51FA\u7A7A\u95F4\uFF0C\u4E0D\u5FC5\u50AC\u4FC3\u3002\u6CA1\u6709\u671F\u9650\u3002\u201D`, `\u201CWatch each separately: ${facts("en")}. Leave them space. No deadline.\u201D`],
    page: [`\u6211\u4E0E${tx(people[d.resident].name, "en")}\u5206\u4EAB\u4E86\u4E0D\u540C\u7684\u89C2\u5BDF\uFF1A${facts("zh")}\u3002`, `I shared different observations with ${tx(people[d.resident].name, "en")}: ${facts("en")}.`],
    requirements: d.observations.map(({ animal, behavior }) => ({ animal, behavior }))
  };
  validateCommission(result);
  return result;
}
var animalGroundingSourceHash = contentHash({ policy: animalGroundingPolicy, choiceSchema: animalChoiceSchema, reviewSchema: animalBoundReviewSchema, animals: acceptedAnimals, places: Object.fromEntries(Object.entries(rooms).map(([id, r]) => [id, r.title])) });

// server/animal-phase2-copy.ts
var quietAfterGullsChoiceHash = "aa3601b0e296c8731b717329b49e49a1716fcb1790b3b898874a6aa5d4c8cc58";
function compileQuietAfterGulls(choice2) {
  if (contentHash(choice2) !== quietAfterGullsChoiceHash) throw Error("ANIMAL_PHASE2_CHOICE_MISMATCH");
  const base2 = compileAnimalStoryChoice(choice2, ["dani"]);
  const definition = {
    ...base2,
    brief: [
      "\u201C\u4E0A\u6B21\u5DF2\u7ECF\u8BB0\u4E0B\u7B2C3\u53EA\u5CB8\u8FB9\u6D77\u9E25\u508D\u665A\u5728\u6D77\u5CB8\u5B89\u9759\u6D3B\u52A8\u3002\u8FD9\u6B21\u8BF7\u5728\u591C\u95F4\u53BB\u4F4F\u6237\u5EAD\u9662\uFF0C\u5B89\u9759\u89C2\u5BDF\u7B2C3\u53EA\u6D77\u6E7E\u732B\u7761\u89C9\u3002\u6CBF\u7528\u4E0A\u6B21\u7684\u6D77\u9E25\u8BB0\u5F55\uFF1B\u522B\u53EB\u9192\u732B\u3002\u6CA1\u6709\u671F\u9650\u3002\u201D",
      "\u201CYour earlier note already records shore gull 3 moving quietly in The Coast (evening). This time, quietly watch harbor cat 3 sleeping in Residents\u2019 Courtyard at night. Keep the gull note; let the cat sleep. No deadline.\u201D"
    ],
    page: [
      "\u6211\u4E0EDani Costa\u5206\u4EAB\u4E86\u4E24\u6BB5\u4E0D\u540C\u65F6\u523B\u7684\u89C2\u5BDF\uFF1A\u5148\u524D\u5728\u6D77\u5CB8\u508D\u665A\u8BB0\u4E0B\u7684\u7B2C3\u53EA\u5CB8\u8FB9\u6D77\u9E25\u5B89\u9759\u6D3B\u52A8\uFF0C\u4EE5\u53CA\u8FD9\u6B21\u591C\u95F4\u5728\u4F4F\u6237\u5EAD\u9662\u770B\u5230\u7684\u7B2C3\u53EA\u6D77\u6E7E\u732B\u7761\u89C9\u3002\u6211\u4EEC\u90FD\u7ED9\u5B83\u4EEC\u7559\u4E86\u7A7A\u95F4\u3002",
      "I shared two observations with Dani Costa: the earlier note of shore gull 3 moving quietly in The Coast (evening), and harbor cat 3 sleeping in Residents\u2019 Courtyard at night. We gave them both space."
    ]
  };
  validateCommission(definition);
  return definition;
}

// server/reviewed-animal-life.ts
function reviewedAnimalRegistry(newStarts = true) {
  if (reviewed_evening_gull_watch_default.contractHash !== animalContractHash) throw Error("REVIEWED_ANIMAL_CONTRACT_MISMATCH");
  validateCommission(reviewed_evening_gull_watch_default.definition);
  const inspection = inspectAnimalChoice(reviewed_evening_gull_watch_default.groundedChoice, ["dani"], builtInCommissions);
  assertBoundAnimalReview(parseBoundAnimalReview(JSON.stringify(reviewed_evening_gull_watch_default.independentReview)), inspection);
  if (canonical2(compileAnimalStoryChoice(reviewed_evening_gull_watch_default.groundedChoice, ["dani"])) !== canonical2(reviewed_evening_gull_watch_default.definition)) throw Error("REVIEWED_ANIMAL_DEFINITION_MISMATCH");
  const definitions = [...builtInCommissions, reviewed_evening_gull_watch_default.definition];
  const enabled = [...builtInCommissions, ...newStarts ? [reviewed_evening_gull_watch_default.definition] : []].map((d) => d.id + "@" + d.revision);
  const registry = new AnimalContentRegistry(definitions, enabled);
  if (canonical2(registry.ref(reviewed_evening_gull_watch_default.definition.id, reviewed_evening_gull_watch_default.definition.revision)) !== canonical2(reviewed_evening_gull_watch_default.ref)) throw Error("REVIEWED_ANIMAL_REF_MISMATCH");
  return registry;
}
function createReviewedAnimalLife(...args) {
  return createHarborLife(args[0], args[1], args[2], reviewedAnimalRegistry());
}
function reviewedAnimalArcRegistry(newStarts = true) {
  const first = reviewedAnimalRegistry(newStarts);
  if (phase2_quiet_after_gulls_default.sourceKind !== "offline-fixture" || phase2_quiet_after_gulls_default.contractHash !== animalContractHash || canonical2(phase2_quiet_after_gulls_default.prerequisite) !== canonical2(reviewed_evening_gull_watch_default.ref) || phase2_quiet_after_gulls_default.continuationHash !== contentHash(phase2_quiet_after_gulls_default.continuation)) throw Error("ANIMAL_STORY_SOURCE_MISMATCH");
  validateCommission(phase2_quiet_after_gulls_default.definition);
  const existing = first.list().map((e) => e.definition);
  const inspection = inspectAnimalChoice(phase2_quiet_after_gulls_default.groundedChoice, ["dani"], existing);
  assertBoundAnimalReview(parseBoundAnimalReview(JSON.stringify(phase2_quiet_after_gulls_default.independentReview)), inspection);
  if (canonical2(compileQuietAfterGulls(phase2_quiet_after_gulls_default.groundedChoice)) !== canonical2(phase2_quiet_after_gulls_default.definition)) throw Error("ANIMAL_STORY_DEFINITION_MISMATCH");
  const defs = [...existing, phase2_quiet_after_gulls_default.definition];
  const enabled = defs.filter((d) => d.id !== phase2_quiet_after_gulls_default.definition.id || newStarts).map((d) => d.id + "@" + d.revision);
  const key2 = phase2_quiet_after_gulls_default.ref.id + "@" + phase2_quiet_after_gulls_default.ref.revision;
  const registry = new AnimalContentRegistry(defs, enabled, { [key2]: reviewed_evening_gull_watch_default.ref }, { [key2]: phase2_quiet_after_gulls_default.continuation });
  if (canonical2(registry.ref(phase2_quiet_after_gulls_default.ref.id, phase2_quiet_after_gulls_default.ref.revision)) !== canonical2(phase2_quiet_after_gulls_default.ref)) throw Error("ANIMAL_STORY_REF_MISMATCH");
  return registry;
}
function createReviewedAnimalArcLife(...args) {
  return createHarborLife(args[0], args[1], args[2], reviewedAnimalArcRegistry());
}

// server/plant-basil.ts
var basilVerbs = ["read-offer", "accept-basil", "deliver-basil", "close-basil", "recall-delivery"];
function withBasilPlantUses(assembly, options = {}) {
  const enabled = options.enabled !== false, starts = enabled && options.newStarts !== false, registry = createPlantsRegistry();
  const parse = (a) => {
    const v = a.action.slice(10);
    if (v.endsWith("-mint")) throw Error("MINT_CONTENT_CLOSED");
    if (!a.action.startsWith("plant-use:") || !basilVerbs.includes(v) || a.payload !== void 0) throw Error("INVALID_PLANT_USE_COMMAND");
    return v;
  };
  const runtime2 = {
    ...assembly.runtime,
    assertReadable(s) {
      assembly.runtime.assertReadable(s);
      assertPlantUsesReadable(s, registry);
    },
    validateAction(a) {
      assembly.runtime.validateAction(a);
      if (a.action.startsWith("plant-use:")) try {
        parse(a);
      } catch (error) {
        throw a.activePlay ? brandActivePrepareFailure(error) : error;
      }
    },
    async prepare(s, a, cancel, context) {
      this.assertReadable(s);
      if (!a.action.startsWith("plant-use:")) {
        if (a.action === "life:accept-order" && s.plantUsesV1?.order) throw Error("ORDER_ACTIVE");
        const r2 = await assembly.runtime.prepare(s, a, cancel, context);
        this.assertReadable(r2.head);
        return r2;
      }
      const v = parse(a);
      if (!enabled && v !== "deliver-basil" && v !== "close-basil") throw Error("PLANT_USES_CLOSED");
      if (a.expected_version !== s.version) throw Error("VERSION_CONFLICT");
      admitPlantUse(assembly, s, a, v);
      const r = applyPlantUse(s, v, a.action_id, registry, starts);
      finishPlantUse(r, s, a, v === "close-basil" ? void 0 : "theo");
      this.assertReadable(r.head);
      return { ...r, kind: a.action, accepted: true, actionId: a.action };
    }
  };
  const project = (s) => {
    runtime2.assertReadable(s);
    return { snapshotVersion: s.version, enabled: true, basilEnabled: enabled, mintEnabled: false, newStarts: starts, wildFixtureOnly: false, offerRead: s.plantUsesV1?.offerReadAt !== void 0, order: structuredClone(s.plantUsesV1?.order ?? null), availableBasil: s.items["crop-basil"] ?? 0, cooldownUntil: s.lifeV1?.cooldownUntil ?? 0, deliveries: s.plantUsesV1?.deliveries ?? 0, mint: mintStatus(s), messages: { offer: ["\u53A8\u623F\u9700\u8981\u4E24\u4EFD\u7F57\u52D2\uFF0C\u4ED8$7\uFF1B\u4E5F\u53EF\u6BCF\u4EFD$3\u5356\u7ED9\u6742\u8D27\u94FA\u3002\u63A5\u53D7\u540E\u622A\u6B62\u540E\u592917:00\u3002", "Two basil portions for $7, or sell at the grocer for $3 each. Accepting makes them due at 17:00 the day after tomorrow."], recollection: ["\u4E0A\u6B21\u7684\u7F57\u52D2\u5DF2\u7ECF\u7528\u8FDB\u53A8\u623F\u3002", "Your last basil delivery went into the kitchen."] } };
  };
  return { ...assembly, runtime: runtime2, lifeProject: (s) => ({ ...assembly.lifeProject(s), plantUses: project(s) }), plantUsesProject: project };
}
function admitPlantUse(assembly, s, a, v, wild) {
  if (a.scene !== s.scene || !s.visited.includes(s.scene)) throw Error("SCENE_MISMATCH");
  assembly.runtime.position(s, a.position);
  if (s.movingClock && Math.hypot(a.position.x - s.position.x, a.position.y - s.position.y) > 4) throw Error("UNVERIFIED_POSITION");
  if (v === "close-basil" || v === "archive-mint") {
    if (a.target !== "life-bag") throw Error("PLANT_USE_TARGET");
    return;
  }
  let e;
  if (v === "observe-mint" || v === "collect-mint") {
    if (!wild) throw Error("MINT_CONTENT_CLOSED");
    if (s.scene !== wild.scene || a.target !== wild.id) throw Error("PLANT_USE_TARGET");
    e = wild;
  } else {
    const who = v === "share-mint" ? "dani" : "theo";
    if (!s.known.includes(who)) throw Error("INTRODUCE_FIRST");
    if (!residentHere(s, who, s.scene)) throw Error("PERSON_AWAY");
    if (who === "theo" && s.scene !== "cafe") throw Error("PLANT_USE_TARGET");
    e = rooms[s.scene].entities.find((e2) => e2.person === who);
    if (!e || a.target !== e.id) throw Error("PLANT_USE_TARGET");
    if (["read-offer", "accept-basil", "deliver-basil"].includes(v)) {
      const m = (s.townMinutes ?? 540) % 1440;
      if (m < 360 || m >= 1020) throw Error("SHOP_CLOSED");
    }
  }
  const at = "person" in e ? observedActor(e, a.actorPosition) : e.at, offset = { x: at.x - e.at.x, y: at.y - e.at.y }, w = landWorld(dynamicWorld(s.flags, true), s.landV1), rule = s.scene + "/" + e.id + "/" + a.action;
  const binding = compileSpatialBinding({ id: GAME_UUID, initialMap: [{ id: s.scene, current: true }], characters: [], domainRules: { rules: [{ id: rule, effects: [] }] } }, { version: 1, cartridgeId: GAME_UUID, mapVersion: "harbor-plant-use-local-v2", actionScope: "scene", interactionDistance: 75, scenes: [{ id: s.scene, spawn: rooms[s.scene].spawn }], entities: [{ id: e.id, scene: s.scene, position: { x: e.at.x - 8, y: e.at.y - 6 }, approach: e.approach, states: ["present"], actions: [rule] }], characters: [], portals: [] }, (scene, p) => walkable(w, scene, p));
  if (!binding.admits(rule, e.id, s.scene, { x: a.position.x - offset.x, y: a.position.y - offset.y })) throw Error("TOO_FAR");
  binding.assertTransition({ cartridgeId: GAME_UUID, map: [{ id: s.scene, current: true }], characters: [] }, { cartridgeId: GAME_UUID, map: [{ id: s.scene, current: true }], characters: [] }, rule, s.scene);
}
function finishPlantUse(r, previous, a, person) {
  r.head.position = { ...a.position };
  r.head.version = previous.version + 1;
  r.head.cursor = previous.cursor + 1;
  const n = r.head.animalNotebookV1;
  if (n?.sample) delete n.sample;
  r.head.history.push({ id: a.action_id, kind: person ? "talk" : "action", ...person ? { person } : {}, text: r.text });
  r.head.history = r.head.history.slice(-500);
}

// src/world/wild-mint-manifest.json
var wild_mint_manifest_default = {
  id: "harbor-mint-art-v1",
  review: {
    singleImage: "accepted",
    family: "accepted",
    targetScene: "accepted",
    technical: "accepted",
    rights: "project-reuse-confirmed"
  },
  bush: {
    image: "./art/plants/wild-mint-bush.png",
    sha256: "c6660a62a5c76a492257a6ae1d50b3b239397de1ce55f7771502304ebfd1ac48",
    sourceSHA256: "48931d17a316975d763afbfd29947fdaee91ff1c451fc07ea0c8b9f6b44ec0c5",
    requestId: "26a4b80f-4db9-475d-afc0-7cf8f7480011",
    taskId: "mt_8a37b5430cba4130a6c03d5341a368ff",
    width: 256,
    height: 256
  },
  root: [
    128.75,
    205.5
  ],
  scale: 0.22929936305732485,
  leaf: {
    image: "./art/plants/wild-mint-leaf-compact-v2.png",
    sha256: "16695d05074c5ecd7f691a28e8cb023ded415ea3ce2d909965bea2371b459aaf",
    sourceSHA256: "a38321e7a025bece9f15f1c82ff2e5ee11e3497b7cb262e9c58fd46c1adb50ee",
    requestId: "58f27b2c-0b31-4ff1-a654-6b058535973a",
    taskId: "mt_809642a41f825b65c9619ea9a810a5ff",
    width: 256,
    height: 256
  }
};

// src/world/wild-mint-art.ts
var wildMintAssets = wild_mint_manifest_default;
var mintConsumerContract = Object.freeze({ node: mintNode, canvas: [256, 256], maximumWidth: 48, maximumHeight: 36, root: [128.75, 205.5], itemSlot: [64, 64], collision: "none", partialHarvest: "same retained clump", geometryStatus: "native alpha bounds168x157; scale36/157; root native515,822" });
function mintArtAccepted(a) {
  if (!a || a.id !== "harbor-mint-art-v1" || !a.review || Object.keys(a.review).length !== 5 || !["singleImage", "family", "targetScene", "technical"].every((k) => a.review[k] === "accepted") || a.review.rights !== "project-reuse-confirmed") return false;
  return [a.bush, a.leaf].every((f2) => f2 && /^\.\/art\/[a-z0-9/-]+\.png$/.test(f2.image) && [f2.sha256, f2.sourceSHA256].every((h) => /^[a-f0-9]{64}$/.test(h)) && !!f2.requestId && !!f2.taskId && f2.width === 256 && f2.height === 256) && Array.isArray(a.root) && a.root.length === 2 && a.root.every((n) => Number.isFinite(n) && n >= 0 && n <= 256) && Number.isFinite(a.scale) && a.scale > 0 && a.scale <= 1;
}

// server/wild-mint.ts
var verbs2 = ["observe-mint", "collect-mint", "archive-mint", "share-mint"];
function withWildMint(assembly, options = {}) {
  if (options.enabled !== true) return assembly;
  const assets = options.assets === void 0 ? wildMintAssets : options.assets;
  if (!mintArtAccepted(assets)) throw Error("MINT_ART_NOT_ADMITTED");
  const starts = options.newStarts !== false, registry = createPlantsRegistry();
  const isMint = (a) => a?.action?.startsWith("plant-use:") && verbs2.includes(a.action.slice(10));
  const parse = (a) => {
    if (!a || typeof a.target !== "string" || a.target.length > 160 || !a.position || !Number.isFinite(a.position.x) || !Number.isFinite(a.position.y) || a.payload !== void 0) throw Error("INVALID_PLANT_USE_COMMAND");
    return a.action.slice(10);
  };
  const runtime2 = {
    ...assembly.runtime,
    validateAction(a) {
      if (!isMint(a)) return assembly.runtime.validateAction(a);
      try {
        parse(a);
      } catch (e) {
        throw a.activePlay ? brandActivePrepareFailure(e) : e;
      }
    },
    async prepare(s, a, cancel, context) {
      if (!isMint(a)) return assembly.runtime.prepare(s, a, cancel, context);
      assembly.runtime.assertReadable(s);
      const v = parse(a);
      if (a.expected_version !== s.version) throw Error("VERSION_CONFLICT");
      admitPlantUse(assembly, s, a, v, mintNode);
      const r = applyPlantUse(s, v, a.action_id, registry, starts);
      finishPlantUse(r, s, a, v === "share-mint" ? "dani" : void 0);
      assembly.runtime.assertReadable(r.head);
      return { ...r, kind: a.action, accepted: true, actionId: a.action };
    }
  };
  const project = (s) => ({ ...assembly.plantUsesProject(s), mintEnabled: true, mintNewStarts: starts, wildFixtureOnly: false, mintArtId: assets.id });
  return { ...assembly, runtime: runtime2, plantUsesProject: project, lifeProject: (s) => ({ ...assembly.lifeProject(s), plantUses: project(s) }) };
}
export {
  FISHING_MODE,
  FISHING_NEW_STARTS,
  FISHING_PROTOCOL,
  FISHING_RELEASE,
  createExplorationAssembly,
  createReviewedAnimalArcLife,
  createReviewedAnimalLife,
  createRuntime,
  fishingClientContract,
  fishingContract,
  initial2 as initial,
  makeDemoServer,
  withBasilPlantUses,
  withWildMint
};
