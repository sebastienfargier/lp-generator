# Email Builder V2 ← HCC : réception sécurisée du lancement

**Statut : conception, aucune implémentation.** Dépôt `lp-generator`, branche `email-builder-v2` @ `3dd2c3f`. Contrat de référence : `hub-creative-content/docs/POC_CONTRAT_EMAIL_BUILDER_V2.md` (branche `poc-hcc-email-builder` @ `b8107ce`), lu en lecture seule avec le code des deux endpoints (`src/app/api/builder/v1/launch/{authorize,exchange}/route.ts`, `src/lib/builder/{hmac,secrets,config,erreurs,autorisation,lancement}.ts`). Les valeurs ci-dessous sont des exemples ; aucun secret n'est cité.

Périmètre : lancement, session Builder, protection des routes IA. **Hors périmètre** : API documentaire (document, versions, publications), renouvellement et révocation des jetons ; non implémentés côté HCC (§11.8 du contrat).

---

## 1. État du Builder (audit)

| Sujet | Constat |
|---|---|
| Next.js | 16.3.6 (App Router, runtime Node), React 19.2.8 ; pas de `src/` ; `next.config.ts` vide. |
| Entrée de l'éditeur | `app/email-builder/page.tsx` (Server Component, sans paramètre) → `BuilderShell` (client). Aucune route dynamique par asset. |
| Aperçus en `iframe` | `/email-builder/preview/[id]` (vignettes de l'entrée, `email-thumb.tsx`) et `/email-library/preview/[type]` (panneau des lames, route du dashboard) ; canvas en `iframe srcDoc`. |
| Routes IA (Anthropic) | `/api/email-builder/assistant`, `/api/email-builder/reference` ; dans le même dépôt : `/api/generate` (landing), `/api/generate-email`, `/api/edit-email` (ancien générateur). **Toutes publiques.** |
| Autres routes | `/api/email-builder/render` (rendu serveur, sans modèle, 512 Ko), `/api/export-email` (ancien générateur). |
| Documents | `EmailDocument` en mémoire (`useReducer`) ; aucune persistance, aucun stockage local. |
| Rendu HTML | `renderDocumentEmail` (serveur, templates sur disque) → `buildExportableEmailHtml` → `validateExportHtml`. |
| Cookies, proxy | Aucun cookie, aucun `proxy.ts`, aucun en-tête de sécurité (ni CSP, ni `Referrer-Policy`). |
| Variables lues | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `EMAIL_ASSETS_BASE_URL` (export), `NODE_ENV`. Le mode simulé (`devMock`) est refusé quand `NODE_ENV=production`. |
| Routes publiques | Toutes : dashboard, générateurs, Builder, APIs. |

Réutilisable tel quel : la séparation route mince (`route.ts`) / handler à dépendances injectables (`handleReference(request, options)`, `handleAssistant…`) ; les tests par appel direct des handlers avec des `Request` et un garde-fou `fetch` ; `node:crypto` (aucune dépendance à ajouter).

---

## 2. Architecture

```
Navigateur ──session Better Auth──▶ HCC
    │  303 /hcc/start?asset=…                ▲ GET /launch/authorize (navigation)
    ▼                                        │ POST /launch/exchange (serveur → serveur, HMAC)
Navigateur ──cookie __Host-hcc_session──▶ Serveur Builder ──────────┘
                                                  └──▶ Anthropic (routes IA, session obligatoire)
```

- Le navigateur ne voit jamais : `code_verifier`, jeton `hcca_…`, clé de signature, secret de session.
- Le Builder n'a **aucune base** : tout l'état de session vit dans deux cookies chiffrés (transaction de lancement, session), ce qui fonctionne sur Vercel sans stockage partagé.
- Module serveur unique (`server-only`) `lib/hcc/` : configuration, clés dérivées, scellement des cookies, PKCE, signature HMAC, client d'échange, lecture de session.

---

## 3. Séquence de lancement (côté Builder)

```
1. HCC  → Navigateur   303 https://<builder>/hcc/start?asset=<assetId>
2. GET /hcc/start?asset=…                                       (Builder)
     asset ∈ /^[A-Za-z0-9_-]{1,64}$/ et présent une seule fois, sinon 400 (page d'erreur, pas de redirection)
     state    = base64url(randomBytes(32))                       → 43 caractères
     verifier = base64url(HMAC-SHA256(K_pkce, "pkce:" + state))  → 43 caractères, jamais stocké ni envoyé
     challenge= base64url(SHA-256(ascii(verifier)))               → 43 caractères
     Set-Cookie __Host-hcc_tx = seal({ v:1, state, asset, iat })  HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=120
     303 <HCC_API_URL>/api/builder/v1/launch/authorize
           ?client_id=<HCC_CLIENT_ID>&asset=<asset>&state=<state>&code_challenge=<challenge>&code_challenge_method=S256
3. HCC : session, droits, code 60 s → 303 <URL de rappel FIXE>?code=…&state=…
4. GET /hcc/callback?code=…&state=…                              (Builder)
     a. supprimer __Host-hcc_tx DANS TOUTE RÉPONSE (succès ou échec)
     b. code ∈ /^[A-Za-z0-9_-]{43}$/, state ∈ /^[A-Za-z0-9_-]{43}$/, chacun une seule fois
     c. tx = unseal(__Host-hcc_tx) ; absent, illisible ou iat > 120 s → refus
     d. timingSafeEqual(state, tx.state) → sinon refus (CSRF de connexion)
     e. verifier = HMAC(K_pkce, "pkce:" + state)  (recalculé)
     f. POST /api/builder/v1/launch/exchange signé (§5)  → 200 ou refus
     g. réponse validée (§5.3) ; asset.id === tx.asset ; format "email" ; scope "owner"
     h. Set-Cookie __Host-hcc_session = seal(session)  HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=min(expires_in, 1800)
     i. 303 /email-builder/<assetId>   (URL propre : ni code, ni state)
5. Pages et routes du Builder : cookie de session obligatoire (proxy optimiste + vérification dans chaque route).
```

Tous les refus de l'étape 4 répondent **303 vers une page fixe du Builder** (`/hcc/erreur?raison=<code fermé>` : `lancement_expire`, `lancement_invalide`, `hcc_indisponible`), jamais vers une URL reçue, jamais avec le code, et invitent à relancer depuis le HCC. En-têtes de `/hcc/*` : `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. `code` et `state` ne sont jamais journalisés (journal structuré à liste blanche, comme le HCC).

---

## 4. State et PKCE : vérification de la conception du contrat

**Conforme RFC 7636.** HMAC-SHA256 produit 32 octets ; base64url sans remplissage → 43 caractères de `[A-Za-z0-9_-]`, sous-ensemble des caractères non réservés `[A-Za-z0-9._~-]` : verifier valide (43 ≤ longueur ≤ 128), accepté par le `FORMAT_VERIFIER` du HCC. Challenge S256 = `base64url(SHA-256(ASCII(verifier)))`, 43 caractères, identique au `challengeS256` du HCC. Vecteur de test RFC 7636 (annexe B) à reprendre : verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`.

| Exigence | Réponse |
|---|---|
| state imprévisible | 32 octets `randomBytes` (256 bits), 43 caractères, dans le format HCC `/^[A-Za-z0-9_-]{22,128}$/`. |
| Dérivation serveur du verifier | HMAC avec une clé connue du seul serveur Builder : connaître `state` (visible dans les URL) ne donne pas le verifier. |
| Secret propre au Builder | Oui ; voir l'amélioration A ci-dessous. |
| Validation du state | Comparaison en temps constant avec le cookie ; cookie absent = refus. |
| Connexion forcée (login CSRF) | Un attaquant qui envoie la victime sur `/hcc/callback?code=<son code>&state=<son state>` échoue : le navigateur de la victime n'a pas de cookie `__Host-hcc_tx` portant ce `state`. |
| Verifier absent du navigateur | Jamais émis : ni cookie, ni URL, ni HTML. |
| Expiration du parcours | `iat` **chiffré** dans le cookie, vérifié côté serveur (≤ 120 s) ; `Max-Age` n'est qu'une indication du navigateur. Le code HCC expire en 60 s. |
| Callback non réutilisable | Cookie de transaction supprimé à la première visite ; code à usage unique (garanti par la base HCC). Une seconde visite échoue des deux côtés. |

Améliorations proposées **avant implémentation** (compatibles avec le HCC, qui ne voit que le challenge) :

- **A. Séparation des clés.** Le contrat utilise `BUILDER_SESSION_SECRET` à la fois pour le PKCE et pour chiffrer la session. Dériver deux clés indépendantes par HKDF-SHA256 (`crypto.hkdfSync`) : `K_pkce` (info `hcc-pkce-v1`) et `K_cookie` (info `hcc-cookie-v1`, AES-256-GCM). Le verifier reste conforme. Exiger un secret d'au moins 32 octets aléatoires.
- **B. Cookie de transaction scellé `{ v, state, asset, iat }`** (AES-256-GCM) au lieu du `state` seul en clair : lie le code à l'asset demandé (refus si `asset.id` diffère), donne une expiration vérifiée côté serveur, n'expose rien. Reste un cookie interne au Builder : aucun impact sur le HCC.
- **C. Un seul lancement à la fois par navigateur.** Un second `/hcc/start` remplace le cookie de transaction : le premier callback échoue (« relancer depuis le HCC »). Acceptable pour le POC ; documenté.

---

## 5. Échange HMAC (format exact du HCC)

### 5.1 Requête
```http
POST <HCC_API_URL>/api/builder/v1/launch/exchange
Content-Type: application/json
Authorization: HCC-Client <HCC_CLIENT_ID>
HCC-Client-Id: <HCC_CLIENT_ID>
HCC-Key-Id: <HCC_SIGNING_KEY_ID>
HCC-Timestamp: <secondes Unix>
HCC-Nonce: <base64url(randomBytes(16)) — 22 caractères, unique par requête>
HCC-Signature: v1=<hex HMAC-SHA256(clé, chaîne)>

{"code":"<43 car.>","code_verifier":"<43 car.>"}
```
```
chaîne = METHOD "\n" pathname+search "\n" timestamp "\n" nonce "\n" hex(SHA-256(corps brut UTF-8)) "\n" client-id "\n" Idempotency-Key (vide ici)
```
- Le corps signé est **la chaîne exacte envoyée** (sérialiser une fois, signer cette chaîne, l'envoyer telle quelle).
- `pathname + search` est celui que le HCC lit dans `request.url` : `/api/builder/v1/launch/exchange` (pas de requête). `HCC_API_URL` est une origine sans chemin.
- Clé : `HCC_SIGNING_KEY` décodée en base64url (≥ 32 octets) ; `kid` = `HCC_SIGNING_KEY_ID`.
- Fenêtre ±300 s : l'horloge du serveur Builder doit être juste (Vercel : NTP).
- **Aucun en-tête `Origin`** (le HCC répond `403 origin_refusee`) : le `fetch` serveur de Node n'en ajoute pas ; ne jamais faire cet appel depuis le navigateur.
- Nonce enregistré par le HCC : une requête n'est jamais rejouée ; pas de nouvelle tentative automatique (un nouvel essai = nouveau nonce, nouvel horodatage).
- `redirect: "error"`, délai d'attente court (≈ 10 s), `cache: "no-store"`.

### 5.2 Erreurs HCC (`{"error":{"code","message"}}`, `HCC-Contract-Version: 1`)
| Statut | Code | Conduite du Builder |
|---|---|---|
| 400 | `invalid_grant` (code inconnu, expiré, utilisé, PKCE, droits) | page « lancement expiré, relance depuis le HCC » |
| 400 | `invalid_request` | page « lancement invalide » |
| 401 | `invalid_client` (signature, horloge, clé, nonce rejoué) | page « indisponible » ; journal `client_refuse` (sans détail) |
| 403 | `origin_refusee` | erreur de développement |
| 429 | `rate_limited` (+ `Retry-After`) | page « réessaie dans un instant » |
| 503 | `client_non_configure` | page « indisponible » |
| autre / réseau | — | page « indisponible » |

### 5.3 Réponse 200 (validée strictement avant usage)
```json
{ "access_token": "hcca_<43>", "token_type": "Bearer", "expires_in": 1800, "scope": "owner", "contractVersion": 1,
  "user": { "id": "…", "nom": "…" },
  "asset": { "id": "…", "nom": "…", "format": "email", "projet": { "id": "…", "nom": "…" } | null },
  "permissions": { "canEdit": true, "canPublish": true } }
```
Contrôles : `access_token` ∈ `/^hcca_[A-Za-z0-9_-]{43}$/`, `token_type = "Bearer"`, `0 < expires_in ≤ 1800`, `scope = "owner"`, `contractVersion = 1`, `asset.format = "email"`, `asset.id = tx.asset`. Sinon refus, aucun cookie.

---

## 6. Session Builder

| Cookie | Contenu (scellé AES-256-GCM, IV 12 octets aléatoire, AAD = nom du cookie + version) | Attributs |
|---|---|---|
| `__Host-hcc_tx` | `{ v:1, state, asset, iat }` | HttpOnly ; Secure ; SameSite=Lax ; Path=/ ; Max-Age=120 |
| `__Host-hcc_session` | `{ v:1, token, expiresAt, assetId, assetNom, userId, userNom, permissions }` | HttpOnly ; Secure ; SameSite=Lax ; Path=/ ; Max-Age=min(expires_in, 1800) |

- **SameSite=Lax** : envoyé sur les navigations de premier niveau (rappel depuis le HCC, ouverture de l'éditeur), jamais sur un POST ou un `fetch` intersite. `Strict` casserait le rappel (redirection depuis le HCC).
- **Expiration** : `expiresAt` = maintenant + `expires_in` − 30 s, vérifié à chaque lecture. Le plafond de 8 h est garanti par le HCC. Sans endpoint de renouvellement (non implémenté côté HCC), la session dure 30 min au plus ; à expiration : page « Rouvrir depuis le HCC », l'état de la page reste affiché.
- **Déconnexion** : `POST /hcc/logout` (vérification `Origin`) → supprime le cookie → 303 `/hcc/deconnecte`. Révocation côté HCC (`POST /token/revoke`) à ajouter dès qu'elle existe.
- **Jeton jamais dans le JavaScript** : le cookie est `HttpOnly` et chiffré ; aucune donnée du jeton dans le HTML, les props des composants client ni les réponses JSON. Les Server Components ne passent au client que `assetNom`, `userNom`, `permissions`.
- **Accès direct refusé** : `/email-builder*` sans session valide → page « Ouvre l'Email Builder depuis le HCC » (aucun éditeur, aucun appel). Les vignettes `/email-builder/preview/*` et `/email-library/preview/*` exigent aussi la session.
- **Rotation de `BUILDER_SESSION_SECRET`** : invalide les sessions (30 min au plus) ; acceptable au POC.

---

## 7. Protection des routes IA et anti-abus

1. **Session obligatoire** dans chaque `route.ts` IA (`assistant`, `reference`) et dans `render` : `requireBuilderSession(request)` avant d'appeler le handler (le handler et ses tests ne changent pas). 401 `{"status":"error","code":"session",…}` sinon.
2. **`proxy.ts`** (Next 16, runtime Node) : matcher `/email-builder/:path*`, `/api/email-builder/:path*`, `/email-library/preview/:path*`. Vérification **optimiste** (cookie présent et déchiffrable) ; la doc Next le réserve à cet usage : la vérification réelle reste dans les routes.
3. **Origine** : routes mutantes (`POST`) refusées si `Origin` absent ou différent de l'origine du Builder (`403`) ; `Content-Type: application/json` exigé sauf `reference` (multipart). Aucun en-tête CORS émis : une page tierce ne lit jamais une réponse, et le cookie `Lax` n'est pas envoyé sur ses POST.
4. **Limitation par session** : compteur en mémoire par empreinte de jeton (ex. assistant 20 / 10 min, référence 5 / 10 min) — approximatif sur plusieurs instances, suffisant au POC ; option plateforme : règle de limitation Vercel Firewall (décision, pas de modification Vercel ici). Limites de taille existantes conservées.
5. **Routes héritées** (`/api/generate`, `/api/generate-email`, `/api/edit-email`, `/api/export-email`, pages des générateurs) : absentes d'un dépôt Builder isolé ; sinon bloquées par `proxy.ts` (404) sur le déploiement POC.
6. **En-têtes** : `Content-Security-Policy: frame-ancestors 'self'` (pas `'none'` : les vignettes sont des `iframe` du Builder lui-même) ; `Referrer-Policy: no-referrer` sur `/hcc/*` (`strict-origin-when-cross-origin` ailleurs) ; `X-Content-Type-Options: nosniff`.

---

## 8. Routes et fichiers à créer ou modifier (prévision)

| Élément | Nature |
|---|---|
| `lib/hcc/config.ts` | lecture et validation des variables (`HCC_API_URL`, `HCC_CLIENT_ID`, `HCC_SIGNING_KEY_ID`, `HCC_SIGNING_KEY`, `BUILDER_SESSION_SECRET`) ; absente → routes `/hcc/*` en 503, éditeur inaccessible |
| `lib/hcc/crypto.ts` | HKDF, scellement AES-GCM, PKCE, HMAC, comparaison en temps constant |
| `lib/hcc/exchange.ts` | échange signé, validation de la réponse (Zod) |
| `lib/hcc/session.ts` | `readBuilderSession`, `requireBuilderSession` |
| `app/hcc/start/route.ts`, `app/hcc/callback/route.ts`, `app/hcc/logout/route.ts` | routes du parcours |
| `app/hcc/{erreur,requis,deconnecte}/page.tsx` | pages statiques sans donnée |
| `app/email-builder/[assetId]/page.tsx` | entrée protégée (ou garde dans `app/email-builder/page.tsx`, décision 4) |
| `proxy.ts` | contrôle optimiste et blocage des routes héritées |
| `app/api/email-builder/{assistant,reference,render}/route.ts` | garde de session + `Origin` (3 lignes chacune) |
| `next.config.ts` | en-têtes de sécurité |

L'éditeur (`BuilderShell`, `BuilderWorkspace`, réducteurs) n'est pas modifié par cette étape.

---

## 9. Tests nécessaires

Unitaires (aucun réseau) :
- PKCE : vecteur RFC 7636 ; verifier dérivé de 43 caractères conformes ; même `state` → même verifier ; deux `state` → verifiers différents ; clé différente → verifier différent.
- HMAC : chaîne et signature identiques à `chaineASigner`/`signer` du HCC sur un vecteur partagé (clé, horodatage, nonce, corps fixes) ; nonce de 22 caractères ; aucun `Origin`.
- Scellement : aller-retour ; altération (IV, chiffré, tag, AAD, nom de cookie) refusée ; `iat` dépassé refusé ; version inconnue refusée.
- Réponse d'échange : chaque champ invalide refusé ; `asset.id` différent refusé.

Routes (appel direct des handlers, `fetch` HCC simulé) :
- `/hcc/start` : asset invalide ou dupliqué → 400 ; succès → cookie `__Host-hcc_tx` (attributs exacts), `Location` vers `authorize` avec les cinq paramètres, `Referrer-Policy: no-referrer`.
- `/hcc/callback` : sans cookie, cookie altéré, expiré, `state` différent, code mal formé, paramètre dupliqué → refus sans appel au HCC ; `invalid_grant`, `invalid_client`, 429, 503, réseau → pages d'erreur ; succès → cookie de session (attributs, `Max-Age`), cookie de transaction supprimé, `Location` sans `code` ni `state` ; deuxième visite → refus.
- Routes IA : sans session → 401 et moteur jamais appelé ; `Origin` étranger → 403 ; session expirée → 401 ; avec session → moteur simulé appelé.
- Pages : `/email-builder` sans session → page « Ouvre depuis le HCC », sans éditeur ; aucune réponse ne contient `hcca_`.
- Journal : ni `code`, ni `state`, ni jeton, ni signature.

Bout en bout (local) : HCC et Builder en `next dev`, client `email-builder-local`, rappel `http://localhost:<port>/hcc/callback`.

---

## 10. Ordre d'implémentation

1. `lib/hcc/` (config, crypto, échange, session) et ses tests unitaires.
2. `/hcc/start`, `/hcc/callback`, `/hcc/logout` et pages fixes ; tests de routes.
3. Gardes des routes IA et de rendu ; `proxy.ts` ; en-têtes.
4. Entrée protégée de l'éditeur (affichage du nom de l'asset et de l'utilisateur, sans persistance).
5. Recette locale avec le HCC, puis projet Vercel POC isolé et ses variables (hors de cette mission).
6. Mission suivante : API documentaire (document, versions, publications), renouvellement et révocation.

---

## 11. Écarts et points ouverts avec le HCC

| # | Point | Proposition |
|---|---|---|
| E1 | Contrat §4.7 : `frame-ancestors 'none'` | `'self'` : le Builder affiche ses propres aperçus en `iframe`. Interdit toujours l'intégration par un tiers. |
| E2 | Même secret pour le PKCE et le cookie | Clés dérivées par HKDF (A) ; sans effet sur le HCC. |
| E3 | Cookie de transaction « state seul » | Cookie scellé `{state, asset, iat}` (B) ; sans effet sur le HCC. |
| E4 | Redirection finale `/email-builder/{assetId}` | Route dynamique à créer (ou garde sur `/email-builder` : décision 4). |
| E5 | Étape 1 (POST HCC → `/hcc/start`) non implémentée côté HCC | Recette provisoire : ouvrir `/hcc/start?asset=…` à la main, connecté au HCC. |
| E6 | Renouvellement et révocation non implémentés | Session de 30 min au plus ; déconnexion locale uniquement. |
| E7 | `__Host-` exige `Secure` ; en local `http://localhost` | Accepté par Chrome et Firefox, refusé par Safari : recette locale sous Chrome/Firefox, ou HTTPS local (décision 5). |
| E8 | En local, HCC et Builder partagent l'hôte `localhost` (ports différents) | Les cookies ne distinguent pas les ports : noms distincts (`__Host-hcc_*` vs cookies Better Auth) ; même site, donc `SameSite` ne protège pas entre les deux apps en local — l'`Origin` (avec port) reste vérifié. |
| E9 | Le rappel doit être **identique** à `EMAIL_BUILDER_REDIRECT_URI` du HCC | Une URL de Builder stable par environnement (pas une URL de Preview changeante, cf. [D-10]). |
| E10 | Le panneau des lames charge `/email-library/preview/[type]` (route du dashboard) | À conserver et protéger dans le Builder isolé. |

### Décisions à prendre
1. Séparation des clés par HKDF (recommandé : oui).
2. Cookie de transaction scellé `{state, asset, iat}` (recommandé : oui).
3. `frame-ancestors 'self'` au lieu de `'none'` (recommandé : oui).
4. Entrée de l'éditeur : route `/email-builder/[assetId]` ou `/email-builder` gardée.
5. Recette locale : navigateur (Chrome/Firefox) ou HTTPS local.
6. Routes héritées : dépôt Builder isolé, ou blocage par `proxy.ts` sur le déploiement POC.
7. Limitation : compteur en mémoire seul, ou règle Vercel Firewall en plus.
8. Comportement à l'expiration : page « Rouvrir depuis le HCC » (proposé) ou relance automatique de `/hcc/start`.

---

## 12. Aperçu HTML pour le HCC : `POST /api/hcc/v1/render` (sens HCC → Builder)

Appel **serveur à serveur**, sans session Builder, protégé uniquement par sa signature HMAC (hors du filtre de `proxy.ts`). Rendu en lecture seule : aucune écriture, aucun appel réseau, aucun appel Anthropic.

### 12.1 Clé dédiée (aucun nouveau secret)
```
clé de rendu = HKDF-SHA256(IKM  = octets de la clé partagée k1 (base64url décodé, la même que HCC_SIGNING_KEY),
                           salt = UTF-8 "hcc-email-builder-v1",
                           info = UTF-8 "hcc-to-builder:render",
                           L    = 32 octets)
```
La clé brute k1 (sens Builder → HCC) n'est jamais acceptée par cette route.

### 12.2 Requête
```http
POST https://<builder>/api/hcc/v1/render
Content-Type: application/json
HCC-Client-Id: <EMAIL_BUILDER_CLIENT_ID>      (= HCC_CLIENT_ID du Builder)
HCC-Key-Id: <kid>                             (= HCC_SIGNING_KEY_ID du Builder)
HCC-Timestamp: <secondes Unix>                (fenêtre ±300 s)
HCC-Nonce: <22 à 64 caractères base64url>     (unique par requête)
HCC-Signature: v1=<hex HMAC-SHA256(clé de rendu, chaîne)>
(sans en-tête Origin)

{"document": { …EmailDocument v1… }}
```
Chaîne signée (identique au contrat §4.2) : `POST \n /api/hcc/v1/render \n timestamp \n nonce \n hex(SHA-256(corps brut UTF-8)) \n client-id \n Idempotency-Key (ou vide)`. Le corps signé est la chaîne EXACTE envoyée.

### 12.3 Réponses (`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `HCC-Contract-Version: 1`)
| Statut | Corps |
|---|---|
| 200 | `{"html":"<!DOCTYPE html>…","contractVersion":1}` |
| 400 | `invalid_request` (JSON invalide, clé en plus) |
| 401 | `invalid_client` (signature, client, kid, fenêtre, nonce absent, mal formé ou rejoué) |
| 403 | `origin_refusee` |
| 413 | `payload_too_large` (corps > 600 Ko) |
| 422 | `invalid_document` (`parseEmailDocument` : schemaVersion ≠ 1, lame inconnue…) ; `empty_document` (aucune lame) |
| 429 | `rate_limited` |
| 500 | `render_failed` |
| 503 | `client_non_configure` (clé ou `EMAIL_ASSETS_BASE_URL` absente ou non HTTPS) |

Erreurs au format `{"error":{"code","message"}}`.

### 12.4 HTML renvoyé
`renderDocumentEmail` (sans repères d'édition) puis `toPreviewHtml(…, { assetsBase })` : images, logo et icônes en URL absolues sous `EMAIL_ASSETS_BASE_URL` (variable serveur validée, jamais l'en-tête Host ni le document), réseaux sociaux en pixel transparent `data:image/gif`, liens inertes (`data-preview-href`). Filet final : aucun `<script>`, événement `on*`, `href` actif, `javascript:`, repère ni URL de démonstration. Media query mobile conservée.

### 12.5 Vecteur de test (clé FICTIVE)
| Élément | Valeur |
|---|---|
| Clé partagée k1 (fictive) | octets `0x01…0x20` = base64url `AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA` |
| Clé de rendu (hex) | `0f174bb17c0c4efe41cc9555653f7d9da6d3e0f87b92bcb241cff913bbeb75b2` |
| Corps | `{"document":{}}` → SHA-256 `577fb1126636075a0283c21bc2eb10e101cdf16837c11cee50bb82e6241dec9e` |
| Timestamp, nonce, client | `1791465600`, `AAAAAAAAAAAAAAAAAAAAAA`, `email-builder-poc` |
| Signature | `v1=c028b7d24b628f006771e30d59b5966bad97f1063a36baef9d2d57579efddc22` |
