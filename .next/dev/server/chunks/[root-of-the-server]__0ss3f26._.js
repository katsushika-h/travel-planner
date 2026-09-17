module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[project]/app/api/travel-objects/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {
__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/api-validation.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/prisma.ts [app-route] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
const dynamic = "force-dynamic";
function readOptionalJson(value, field) {
    if (value === undefined) return undefined;
    if (value === null) return __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Prisma"].JsonNull;
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isRecord"])(value)) throw new Error(`${field} must be a JSON object.`);
    return value;
}
async function GET(request) {
    const tripId = new URL(request.url).searchParams.get("tripId");
    if (!tripId) {
        return Response.json({
            error: "tripId is required."
        }, {
            status: 400
        });
    }
    const travelObjects = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].travelObject.findMany({
        where: {
            tripId
        },
        orderBy: [
            {
                startDateTime: "asc"
            },
            {
                createdAt: "asc"
            }
        ]
    });
    return Response.json(travelObjects);
}
async function POST(request) {
    try {
        const body = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readJsonBody"])(request);
        const startDateTime = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readDate"])(body.startDateTime, "startDateTime");
        const endDateTime = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readDate"])(body.endDateTime, "endDateTime");
        const isAllDay = body.isAllDay === true;
        if (isAllDay ? endDateTime < startDateTime : endDateTime <= startDateTime) {
            return Response.json({
                error: isAllDay ? "endDateTime must be on or after startDateTime." : "endDateTime must be after startDateTime."
            }, {
                status: 400
            });
        }
        const tripId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readTrimmedString"])(body.tripId, "tripId");
        const trip = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].trip.findUnique({
            where: {
                id: tripId
            }
        });
        if (!trip) {
            return Response.json({
                error: "Trip not found."
            }, {
                status: 404
            });
        }
        const travelObject = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].travelObject.create({
            data: {
                tripId,
                title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readTrimmedString"])(body.title, "title"),
                type: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readEventType"])(body.type ?? "unclassified", "type"),
                startDateTime,
                endDateTime,
                dayIndex: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readPositiveInteger"])(body.dayIndex ?? 1, "dayIndex"),
                isAllDay,
                location: readOptionalJson(body.location, "location"),
                cost: readOptionalJson(body.cost, "cost"),
                notes: body.notes === null ? null : (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readTrimmedString"])(body.notes, "notes", {
                    optional: true
                }),
                tags: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2d$validation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readTags"])(body.tags)
            }
        });
        return Response.json(travelObject, {
            status: 201
        });
    } catch (error) {
        return Response.json({
            error: error instanceof Error ? error.message : "Invalid travel object data."
        }, {
            status: 400
        });
    }
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/lib/api-validation.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "isRecord",
    ()=>isRecord,
    "readDate",
    ()=>readDate,
    "readEventType",
    ()=>readEventType,
    "readJsonBody",
    ()=>readJsonBody,
    "readPositiveInteger",
    ()=>readPositiveInteger,
    "readTags",
    ()=>readTags,
    "readTimeZone",
    ()=>readTimeZone,
    "readTrimmedString",
    ()=>readTrimmedString
]);
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readTrimmedString(value, field, { optional = false } = {}) {
    if (value === undefined && optional) {
        return undefined;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${field} must be a non-empty string.`);
    }
    return value.trim();
}
function readDate(value, field, dateOnly = false) {
    if (typeof value !== "string") {
        throw new Error(`${field} must be an ISO date string.`);
    }
    const normalized = dateOnly ? `${value}T00:00:00.000Z` : value;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`${field} must be a valid ISO date string.`);
    }
    return date;
}
function readTimeZone(value) {
    const timezone = readTrimmedString(value, "timezone");
    try {
        Intl.DateTimeFormat(undefined, {
            timeZone: timezone
        });
    } catch  {
        throw new Error("timezone must be a valid IANA timezone name.");
    }
    return timezone;
}
function readTags(value) {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || value.some((tag)=>typeof tag !== "string")) {
        throw new Error("tags must be an array of strings.");
    }
    return value.map((tag)=>tag.trim()).filter(Boolean);
}
function readPositiveInteger(value, field) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${field} must be a positive integer.`);
    }
    return value;
}
async function readJsonBody(request) {
    const body = await request.json().catch(()=>null);
    if (!isRecord(body)) {
        throw new Error("Request body must be a JSON object.");
    }
    return body;
}
function readEventType(value, field = "type") {
    const type = readTrimmedString(value, field);
    if (type.length > 20) throw new Error(`${field} must be 20 characters or fewer.`);
    return type;
}
}),
"[project]/lib/prisma.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {
__turbopack_context__.s([
    "prisma",
    ()=>prisma
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$prisma$2f$adapter$2d$pg$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@prisma/adapter-pg/dist/index.mjs [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$prisma$2f$adapter$2d$pg$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$prisma$2f$adapter$2d$pg$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
const globalForPrisma = globalThis;
function createPrismaClient() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not configured.");
    }
    return new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["PrismaClient"]({
        adapter: new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$prisma$2f$adapter$2d$pg$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PrismaPg"]({
            connectionString
        })
    });
}
const prisma = globalForPrisma.prisma ?? createPrismaClient();
if ("TURBOPACK compile-time truthy", 1) {
    globalForPrisma.prisma = prisma;
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0ss3f26._.js.map