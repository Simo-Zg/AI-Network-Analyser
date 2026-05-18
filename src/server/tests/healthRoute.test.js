const request = require("supertest");
const { createApp } = require("../index");

test("GET /api/health returns backend, MongoDB, and Python status", async () => {
  const app = await createApp({ connectDb: false });
  const response = await request(app).get("/api/health").expect(200);
  expect(response.body.backend.ok).toBe(true);
  expect(response.body.mongodb).toHaveProperty("state");
  expect(response.body.python).toHaveProperty("python");
  expect(response.body).toHaveProperty("modelLoaded");
});

test("GET /api/model/info includes model history collection", async () => {
  const app = await createApp({ connectDb: false });
  const response = await request(app).get("/api/model/info").expect(200);
  expect(response.body).toHaveProperty("history");
  expect(Array.isArray(response.body.history)).toBe(true);
});
