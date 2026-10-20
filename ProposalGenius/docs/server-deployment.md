# AgencyOS auf dem Polymath-Server

## Deployment-Modell

AgencyOS läuft als eigener Node-/Docker-Service unter `/opt/agency-os`. Der
Service verwendet serverseitig und read-only:

- `/opt/polymath/.env` als gemeinsame Betriebsumgebung
- `/etc/polymath/firebase-admin-key.json` als denselben Firebase-Service-Account
- das bestehende Docker-Netzwerk `n8n-server_default`

`.env`, Service-Account-Dateien und andere Secrets werden nicht in Git übertragen
und nicht in das Docker-Image kopiert. Der öffentliche Firebase-Web-Key wird beim
Containerstart aus `FIREBASE_WEB_API_KEY` in eine ignorierte Runtime-Datei für
das Browser-SDK geschrieben.

## Git-Workflow

Das Projekt verwendet den Server als Git-Remote. Nach einer lokalen Änderung
reicht der Push:

```bash
git add -A
git commit -m "Beschreibung der Änderung"
git push server main
```

Der Push aktualisiert das Bare-Repository `/opt/git/agency-os.git`. Für den
laufenden Container muss anschließend auf dem Server aktualisiert und gebaut
werden (siehe nächster Abschnitt); ein automatischer Produktions-Deploy bei
jeder Push-Aktion ist absichtlich nicht aktiviert.

## Aktualisieren

```bash
ssh -i ~/.ssh/id_ed25519_polymath root@169.58.121.93
cd /opt/agency-os
git pull --ff-only origin main
docker compose --env-file /opt/polymath/.env up -d --build
docker compose ps
docker compose logs --tail=100 agency-os
```

## Prüfen

Der Service ist absichtlich nicht direkt an einen Host-Port gebunden. Die
interne Prüfung erfolgt im Container:

```bash
docker compose exec -T agency-os node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(r.status, await r.text()); process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message); process.exit(1)})"
```

## Noch offen für öffentliche Erreichbarkeit

`agencyos.com` ist als autoritative URL vorgesehen. Der DNS-A-Record muss auf
`169.58.121.93` zeigen; danach stellt Caddy automatisch TLS bereit. `BASE_URL`
ist bereits auf `https://agencyos.com` voreingestellt. Firebase Authorized
Domains und die Stripe-Webhook-URL müssen vor dem produktiven Betrieb noch
gemeinsam angepasst und getestet werden.

Die gemeinsame Produktionsumgebung enthält die getrennten AgencyOS-Preis-IDs
für EUR, USD, IDR, SGD und AUD sowie die Live-Stripe-Schlüssel. Das Backend
ordnet die Währung ausschließlich serverseitig anhand der verifizierten
Region zu; die Polymath-Preis-IDs bleiben davon getrennt.

Vor dem öffentlichen Cutover müssen noch die Stripe-Live-Webhook-Zieladresse,
Firebase-Authorized-Domains und der DNS-A-Record geprüft werden. Ein echter
Kauf-Test benötigt anschließend ein vom Betreiber freigegebenes Testkonto und
eine echte Zahlungsmethode; dabei werden keine Testkarten im Live-System
verwendet.
