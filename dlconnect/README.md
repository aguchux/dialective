# Dialect Library Connect

Single-page webinar interest site for `connect.dialectlibrary.com`.

Run `npm install` and `npm run dev` from this directory. Configure `CONNECT_API_URL` as the server-side base URL of the Nest API (for example `https://api.dialectlibrary.com/api/v1`). The browser calls only the site's local `/api/connect` proxy, so no new browser CORS origin is needed.

Entering an email that belongs to an active Dialect Library member shows a masked version of their record (`A••••• O•••••, a•••••••@gmail.com`) so they can confirm it; confirming sets `ConnectRegistration.userId`, which is what lets event reminders use the email and phone number they already verified. The registration is linked **only** on an explicit "yes, that's me" — "Not me" leaves it anonymous, and the API re-checks the email against an active account rather than trusting the flag. The lookup is masked and rate-limited to 10/min because it is the one place here that reveals whether an email has an account at all.

The header "Register Free" CTA and the in-page panel render the same `AttendForm` component, so the two entry points cannot drift apart.

Deploy this directory as a separate Next.js project and attach `connect.dialectlibrary.com` to that project. The registration table is owned by the API Prisma migration `20260920090000_connect_registrations`; apply it through the normal reviewed production migration workflow before enabling this site. No event day, speaker identities, or final agenda times are announced yet.

The hero images in `public/images/` were generated for this page using the built-in image-generation tool. Prompt: ultra-wide cinematic contributor portraits with a luminous voice-data globe, dark clear headline area on the left, no embedded text or logos.
