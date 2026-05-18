const pythonService = require("../services/pythonService");

test("parseJsonOutput parses the final JSON line from Python stdout", () => {
  const parsed = pythonService.parseJsonOutput("log line\n{\"ok\":true,\"count\":2}\n");
  expect(parsed).toEqual({ ok: true, count: 2 });
});
