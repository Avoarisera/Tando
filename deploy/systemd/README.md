# Sync Linear via systemd (VPS)

Remplace le cron Vercel (`vercel.json`, ignoré hors Vercel). Un timer systemd appelle
`GET /api/cron/sync` toutes les 15 min → sync incrémentale Linear + snapshots mensuels.

## 1. Sécuriser l'endpoint (obligatoire)

Sans `CRON_SECRET`, l'endpoint est **ouvert**. Générer un secret et l'ajouter à
l'environnement de l'app Nuxt (Docker `-e CRON_SECRET=…`, compose, ou son propre unit) :

```bash
openssl rand -hex 32   # → copie la valeur
```

Redémarre l'app pour qu'elle prenne `CRON_SECRET`.

## 2. Fichier d'environnement du timer

```bash
sudo install -d /etc/tando
sudo install -m600 deploy/systemd/tando-sync.env.example /etc/tando/sync.env
sudo nano /etc/tando/sync.env      # même CRON_SECRET que l'app + SYNC_URL correcte
```

## 3. Installer service + timer

```bash
sudo cp deploy/systemd/tando-sync.service /etc/systemd/system/
sudo cp deploy/systemd/tando-sync.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tando-sync.timer
```

## 4. Vérifier

```bash
systemctl list-timers tando-sync.timer     # prochain déclenchement
sudo systemctl start tando-sync.service    # lancer un run tout de suite
journalctl -u tando-sync.service -n 50 --no-pager   # logs / erreurs
```

Un run OK sort en exit 0 ; une réponse HTTP ≥400 (ex. 401 = mauvais secret) marque le
service `failed` et apparaît dans `journalctl`.
