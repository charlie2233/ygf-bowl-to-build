# Apple OAuth installation and rotation receipt

This receipt records non-secret production configuration only. It contains no
private key, client-secret JWT, Apple password, 2FA code, email, wallet ID, or
redeem code.

## Installed configuration

- Apple team ID: `K99RADPB9G`
- Primary App ID: `com.malatangai.web`
- Services ID / Supabase client ID: `com.malatangai.web.login`
- Active Sign in with Apple key ID: `89K2DH69VQ`
- Apple web domain: `ukmperxeemwlhjatrfex.supabase.co`
- Apple return URL:
  `https://ukmperxeemwlhjatrfex.supabase.co/auth/v1/callback`
- Application return URL:
  `https://malatangai.com/auth/callback`
- Client-secret expiry: `2027-01-27T22:34:19Z`
- Rotation target: no later than `2027-01-13`, leaving a fourteen-day buffer.

The Apple return URL and application return URL are intentionally different.
Apple posts to Supabase first; Supabase then sends the browser through the
application's PKCE callback.

On July 31, 2026 the provider was enabled in production and
`https://malatangai.com/auth?next=/wallet` reached Apple's authorization page
with the registered Services ID and exact Supabase callback. That proves
configuration and outbound routing, not completed human authentication. Normal
sign-in and anonymous-wallet preservation stay open until their return paths
are observed.

## Secret custody

The one-time `.p8` download is stored only below ignored `private/apple/` with
mode `0600`. The repository and deployment environment do not contain it. The
generated client-secret JWT is shown only to Supabase's server-side provider
configuration. It must not appear in screenshots, DOM snapshots, shell output,
issues, commits, analytics, browser URLs, or chat.

An earlier generated JWT was replaced immediately after it appeared in a local
automation snapshot. Supabase now has only the replacement JWT. The earlier
Apple key was revoked; neither the revoked key nor replaced JWT is an active
credential.

## Rotation procedure

1. Confirm the active key ID and client-secret expiry without opening or
   printing secret material.
2. Generate a replacement with the checked-in command and a new output path:

   ```bash
   pnpm apple:client-secret -- \
     --team-id '<TEAM_ID>' \
     --key-id '<KEY_ID>' \
     --client-id 'com.malatangai.web.login' \
     --private-key 'private/apple/AuthKey_<KEY_ID>.p8' \
     --output 'private/apple/apple-client-secret-<KEY_ID>-<DATE>.jwt' \
     --days 180
   ```

3. Confirm the command reports only the output path and expiry, the new file is
   mode `0600`, and Git continues to ignore it.
4. Replace the Apple secret in Supabase without disabling the provider. Do not
   put this JWT in Vercel: Supabase is the OAuth client that uses it.
5. Verify both live paths: normal Apple sign-in restores the expected wallet;
   anonymous `linkIdentity` preserves the same user, wallet, Credits, grant,
   and expiry.
6. Delete the superseded local JWT after the new round trips succeed. Revoke
   the Apple signing key only for compromise or planned key replacement; a JWT
   rotation does not normally require a new `.p8` key.
7. Update this receipt with the new non-secret key ID, expiry, test date, and
   named remaining gate.

If the signing key is suspected of exposure, create a replacement Apple key,
install a client secret signed by that replacement, complete both live paths,
then revoke the old Apple key. Never revoke the only working key before the
replacement is installed.
