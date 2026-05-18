const crypto = require("crypto");

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

module.exports = {
  makeAlertId: () => makeId("evt"),
  makeBatchId: () => makeId("batch"),
  makeSessionId: () => makeId("sess"),
  makeExportId: () => makeId("export")
};
