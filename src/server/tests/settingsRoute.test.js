const request = require("supertest");
const { createApp } = require("../index");

test("POST /api/settings saves settings when MongoDB is unavailable", async () => {
  const app = await createApp({ connectDb: false });
  const response = await request(app)
    .post("/api/settings")
    .send({
      theme: "light",
      captureWindowSeconds: 9,
      zoomLevel: 125,
      systemNotificationsEnabled: true,
      ignoredKey: "should not be saved"
    })
    .expect(200);

  expect(response.body.settings.theme).toBe("light");
  expect(response.body.settings.captureWindowSeconds).toBe(9);
  expect(response.body.settings.zoomLevel).toBe(125);
  expect(response.body.settings.systemNotificationsEnabled).toBe(true);
  expect(response.body.settings.ignoredKey).toBeUndefined();
});
