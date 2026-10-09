// Central helper so internal error details (DB messages, stack traces) are
// logged on the server but never sent to the client.
// Responds in this app's { message } format. `friendly` keeps the useful,
// user-facing part of the old messages (e.g. "Failed to load config.").
function sendServerError(res, err, context = "", friendly = "Internal server error") {
  console.error(context ? `[${context}]` : "[error]", err);
  if (res.headersSent) return;
  res.status(500).json({ message: friendly });
}

module.exports = { sendServerError };
