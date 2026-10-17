# Platform no-parameter token response: mock contract candidate

This isolated branch adds a request/response probe and synthetic tests only. It is not imported by the public server, Worker, or client. The default game continues to use its current temporary account behavior. No real token, platform request, account lookup, or player save is involved.

The caller must later supply the platform's confirmed HTTPS **current Bearer subject** endpoint. The probe sends `GET` with `Authorization: Bearer`, without a query string. It requires HTTP 200, JSON `retcode === 0`, JSON `errcode === 0`, and a decimal-string `data.telegram_id` identical to the expected ID. It never converts an ID to a JavaScript number. The mock includes `9007199254740993` to catch precision loss.

Passing this shape test does not establish that the endpoint binds `data.telegram_id` to the Bearer token. Before any production connection, the platform must document that binding, token lifetime/revocation and failure contract. The existing account/Worker candidate remains disabled; do not use this probe result as an authenticated owner or publish this branch.
