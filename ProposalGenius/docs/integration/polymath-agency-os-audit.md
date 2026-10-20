# Polymath Production / Agency OS – Architektur- und Migrationsaudit

Stand: 2026-09-12
Status: **INTERN DEPLOYED – Caddy-Route vorbereitet, DNS und Sicherheitsbereinigung offen**

## Zusammenfassung

Der Workspace enthält eine bestehende Node-/Express-Anwendung für Agency OS mit statischen HTML-, CSS- und Browser-JavaScript-Dateien. Die Anwendung enthält bereits Proposal-/Dokumentenansicht, digitale Signatur, Follow-up-Automation, PPP-Preislogik sowie Stripe-/E-Mail-nahe Komponenten. Eine belastbare Umschaltung auf das zentrale Firebase-Projekt oder eine produktive Migration wurde **nicht** ausgeführt. AgencyOS ist intern auf dem Polymath-Server deployed; `agencyos.com` ist als Caddy-Route konfiguriert, aber der DNS-A-Record zeigt noch nicht auf den Server.

Zu Beginn waren mehrere maßgebliche Dateien als macOS-iCloud-Dateien mit `compressed,dataless` nicht lesbar. Sie wurden inzwischen lokal hydratisiert und geprüft.

## Sicherer Befund – sofortige Maßnahmen erforderlich

Im Workspace bzw. in einem Backup wurden produktionsnahe Zugangsdaten im Klartext erkannt:

- `/Users/konstantinregler/Documents/Polymath Productions/_backups/20260824-235201/appsettings.json.ORIG` enthält mindestens einen Stripe-Secret-Key sowie einen Brevo/API-Key; weitere Providerwerte sind ebenfalls enthalten.
- `proposalgen-98eef-firebase-adminsdk-fbsvc-465104c385.json` ist eine Firebase-Admin-Credential-Datei im Projektordner.
- `.env` existiert im Projektordner; ihr Inhalt wurde nicht ausgegeben.

Die Werte wurden hier nicht wiederholt. Die betroffenen Secrets müssen außerhalb dieses Audits rotiert, aus Backups/Cloud-Historien entfernt oder sicher verschlüsselt und die tatsächliche Exposition geprüft werden. Es wurde lediglich ein interner AgencyOS-Container ohne öffentlichen Port gestartet; kein Billing-Cutover, keine Auth-/Firestore-/Storage-Migration und keine n8n-Aktivierung wurden ausgeführt.

## Festgestellte Architektur

### Sicher beobachtbar

- Runtime: Node.js-Anwendung mit mehreren CommonJS-Modulen und statischem Frontend.
- Vorhandene Domänenmodule: `locationVerification.js`, `cronService.js`, `emailService.js`.
- `locationVerification.js` enthält PPP-Tiers, IP-/Timezone-Prüfung und Stripe-Price-ID-Auswahl.
- `cronService.js` verarbeitet offene `proposals` aus Firestore, mit Memory-Store als Fallback, und versendet Follow-ups nach 48 Stunden.
- `public/view.html` und `public/view.js` implementieren die kundenseitige Angebotsansicht, E-Signatur und mehrsprachige Darstellung.
- Im `node_modules`-Bestand sind unter anderem Firebase Client/Admin SDK, Stripe, Express, dotenv, CORS, Helmet und Rate-Limit-Pakete vorhanden.
- `storage.rules` und `firestore.rules` sind vorhanden und wurden lokal gelesen; ihre produktive Durchsetzung wurde nicht verändert.
- Das Projekt hatte zunächst kein Git-Repository. Inzwischen existiert ein lokales Repository mit einem Server-Remote.

### Nicht verifiziert

- Vollständiges Authentifizierungs- und Session-Modell sowie die fachliche Entitlement-Trennung.
- Billing-/Price-ID-Zuordnung von AgencyOS gegenüber Polymath.
- DNS-Auflösung und TLS für `agencyos.com`; die Caddy-Route ist serverseitig geladen, OAuth-Redirects und Stripe-Webhook-Ziel sind noch nicht angepasst.
- n8n-Produktkontext und sichere E-Mail-Transportintegration.
- Billing-Webhooks, n8n-Integration, OAuth-Redirects und CI/CD-Secrets.
- Vollständige Paket-/Script-Konfiguration und vorhandene Tests.

## Zielarchitektur für den nächsten sicheren Implementierungsschritt

1. Zentrale serverseitige Firebase-Initialisierung mit Projekt `polymath-productions`; Admin SDK ausschließlich serverseitig.
2. Gemeinsame Identität über Firebase Auth UID und normalisierte, serververwaltete Entitlements:

   ```text
   users/{uid}
   users/{uid}/productAccess/{productId}
   organizations/{organizationId}
   organizations/{organizationId}/members/{uid}
   subscriptions/{subscriptionId}
   auditLogs/{eventId}
   ```

3. Getrennte Produktzugänge für `polymath` und `agency_os`; kein automatisches Freischalten des jeweils anderen Produkts.
4. Serverseitige Entitlement- und Rollenprüfung vor jedem geschützten Produkt-/Organisationszugriff.
5. Gemeinsame serverseitige n8n-Schicht mit Produktkontext, Request-ID, Idempotency-Key, Timeout, begrenzten Retries und signierten Webhooks.
6. Zentrale, allowlist-basierte Account-Weiterleitungen ohne frei manipulierbare Open Redirects.
7. Rückwärtskompatibles Lesen während der Migration und dauerhafte Herkunftsreferenzen über `migration.sourceSystem`, `migration.sourceId` und `migrationVersion`.

## Migrationsplan (noch nicht ausgeführt)

## Zwischenstand Deployment 2026-09-12

- Lokales Git-Repository initialisiert; Remote `server` zeigt auf das Bare-Repository `/opt/git/agency-os.git`.
- Server-Checkout: `/opt/agency-os`.
- Commits `f144212`, `727c8fc`, `6a1635a` und `6fe9f80` gepusht.
- Docker-Image `agency-os:latest` gebaut.
- Container `agency-os-agency-os-1` läuft im bestehenden Netzwerk `n8n-server_default` als `uid=100:101`.
- `/api/health` antwortet mit HTTP 200 und `firebaseConnected: true`.
- `public/firebase-runtime-config.js` wird beim Containerstart aus `/opt/polymath/.env` erzeugt; Secret-Muster wurden in dieser Datei nicht gefunden.
- Kein AgencyOS-Host-Port wurde veröffentlicht; Caddy routet `agencyos.com` intern zu `agency-os:3000` und die Konfiguration ist valide.
- `BASE_URL` ist auf `https://agencyos.com` gesetzt. DNS zeigt aktuell weiterhin auf `64.190.63.222`; deshalb kann Let's Encrypt noch kein Zertifikat ausstellen.

### Vorbedingungen

- Secrets rotieren und Exposition bewerten.
- Alle Projektdateien lokal hydratisieren und eine unveränderte Sicherung erstellen.
- Zweites Polymath-Repository bzw. die tatsächlich zentrale Account-Anwendung eindeutig bestimmen.
- Firebase-Export/Backup, Billing-System, n8n-Endpunkte und erlaubte Produkt-URLs bestätigen.

### Dry Run

- Legacy-Auth-Nutzer, Provider, Verifizierung, MFA, Disabled-Status, Claims und UID-/E-Mail-/Provider-Kollisionen inventarisieren.
- Firestore-Dokumente, Organisationsmitgliedschaften, Rollen, Projekte, Kunden, Dateien, Storage-Pfade, Abos und externe IDs nur lesen.
- Stabile Migrations-IDs und Checkpoints erzeugen; keine Produktionsdaten schreiben.
- Kollisionsbericht, verwaiste Referenzen und unklare Subscription-Zustände ausgeben, ohne E-Mail-Adressen oder Tokens zu loggen.

### Cutover-Gates

Produktiver Cutover bleibt gesperrt, bis Backup/Export, erfolgreicher Dry Run, geprüfter Kollisionsbericht, vorbereitete Rules/Indizes, Rollback-Plan und ausdrückliche Freigabe vorliegen. Danach: Staging-Probelauf, repräsentative Testkonten, Auth-/Datenverifikation, Umschaltung, n8n-Aktivierung, Monitoring und offenes Rollback-Fenster.

## Arbeitspaketstatus

| Arbeitspaket | Status | Begründung |
|---|---|---|
| Workspace-/Projektinventar | Erledigt | Struktur, Code, Rules und Deployment-Konfiguration geprüft. |
| Sicherheitsprüfung | Blockiert | Klartext-Secrets erkannt; Rotation und Expositionsprüfung offen. |
| Firebase-Zielkonfiguration | Intern umgesetzt | Client-Runtime und Admin-Service-Account zeigen auf `polymath-productions`; Healthcheck bestätigt die Verbindung. |
| Gemeinsames Account-/Entitlement-Modell | Entwurf | Zielmodell dokumentiert, noch nicht in bestehende Logik integriert. |
| Auth-/Datenmigration | Nicht begonnen | Kein Produktionszugriff und keine belastbare Legacy-Bestandsaufnahme. |
| n8n-Integration | Nicht begonnen | Keine sichere Konfiguration/Workflow-Allowlist verifiziert. |
| Firestore-/Storage-Rules | Unverändert | Vorhandene Rules wurden nicht für AgencyOS angepasst. |
| Frontend-Account-Erlebnis | Teilweise | Firebase-Konfiguration umgestellt; gemeinsames Polymath-Account-UI fehlt. |
| Tests/Build | Teilweise | Node-Syntax und Docker-Build erfolgreich; noch keine vollständige End-to-End-/Emulator-Suite. |
| Produktions-Cutover | Gesperrt | DNS/TLS, Billing, n8n und Secret-Bereinigung offen. |

## Benötigte externe Entscheidungen nach der Bereinigung

- Welche zentrale Account- und Billing-Anwendung ist maßgeblich?
- Wo liegen die autoritativen Agency-OS- und Polymath-Subscription-/Price-IDs?
- Welche zentrale Account-URL und welche erlaubten Return-Origins gelten?
- Welche n8n-Workflows darf Agency OS verwenden und welche Staging-URL ist vorgesehen?
- Ist nach Backup, Dry Run und Staging-Probelauf der produktive Cutover freigegeben?

## Ehrlicher Endstatus

**STATUS: BLOCKIERT – KONKRETE FREIGABE ODER INFORMATION ERFORDERLICH**

Blockadegründe: Klartext-Secrets müssen rotiert/bereinigt werden; außerdem fehlen Price-IDs, n8n-/Billing-Freigaben und die DNS-Umstellung von `agencyos.com` auf `169.58.121.93`. Die Caddy-Route selbst ist vorbereitet und serverseitig valide.

## Update 2026-09-24 – Release-Härtung

Der historische Befund oben beschreibt den Ausgangszustand und bleibt als
Auditspur erhalten. Im aktuellen Release wurden die wichtigsten Blocker im
Code bearbeitet: produktive Stripe-Webhooks erfordern jetzt immer die
Signaturprüfung und werden idempotent verarbeitet; Entitlements verwenden ein
zeitlich begrenztes `subscriptionAccessUntil`; abgelaufene Zugänge werden
regelmäßig auf Free zurückgesetzt; CORS, CSP, Rate-Limits und ausgehende
Webhook-Ziele wurden eingeschränkt; Browser-Fallback-Keys wurden entfernt;
E-Mail-Versand läuft über den token-geschützten gemeinsamen n8n-Transport;
Firestore-/Storage-Regeln blockieren clientseitige Proposal-Manipulationen.

Offen bleiben externe Cutover-Prüfungen: DNS/KAS, Firebase-Deployment der
Rules, Stripe-Live-Webhook-URL, echte Testzahlung, Zustelltest einer
Transaktionsmail und eine rechtliche Prüfung der Betreiberangaben. Der
Dependency-Scan meldet weiterhin moderate transitive Hinweise in `qs` und
`uuid`; ein erzwungenes Major-Upgrade wurde wegen des Express-/Firebase-
Kompatibilitätsrisikos nicht blind durchgeführt.
