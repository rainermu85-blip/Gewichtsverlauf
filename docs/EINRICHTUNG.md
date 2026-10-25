# Einmalige Einrichtung

Die App kann noch keine echten Einträge annehmen, solange kein Cloudflare-Hosting und keine GitHub-OAuth-App eingerichtet sind. Die vorhandene ChatGPT-GitHub-Verbindung ist keine Besucheranmeldung und liefert dafür keinen wiederverwendbaren Client Secret.

## Empfohlener Weg: Assistent

1. Bei [Cloudflare](https://dash.cloudflare.com/sign-up) ein Konto erstellen, falls noch keines vorhanden ist. Eine eigene Domain ist nicht nötig.
2. Node.js 24 installieren, das private Repository auf dem eigenen Computer klonen und `npm ci` ausführen.
3. `npm run setup` ausführen. Falls erforderlich öffnet sich die offizielle Cloudflare-Anmeldung im Browser. Ein Konto mit Worker- und D1-Rechten auswählen.
4. Der Assistent erstellt oder verwendet eine Datenbank namens `gewichtsverlauf`, wendet das Schema an und veröffentlicht zunächst nur die noch nicht nutzbare Anmeldung. Die erhaltene Datenbank-ID wird in `wrangler.json` gespeichert. Für eine neue Datenbank wird Westeuropa als Standort-Hinweis gesetzt; das ist keine zugesicherte Datenresidenz.
5. Die ausgegebene GitHub-Adresse im Browser öffnen. Kontrollieren, dass dort dein Konto **rainermu85-blip** angemeldet ist. Unter **Settings → Developer settings → OAuth Apps → New OAuth App** registrieren:

   | Feld | Wert |
   | --- | --- |
   | Application name | `Gewichtsverlauf` |
   | Homepage URL | Die ausgegebene HTTPS-Adresse, ohne abschließenden Schrägstrich |
   | Authorization callback URL | Dieselbe Adresse plus `/auth/callback` |
   | Enable Device Flow | Nicht aktivieren |

6. **Client ID** in den Assistenten eingeben. Auf **Generate a new client secret** klicken und den Secret ausschließlich in den folgenden `wrangler secret put`-Dialog eingeben. Der Assistent selbst liest oder speichert den Secret nicht. Keine Zugangsdaten in Chat, Commit oder Browser-JavaScript kopieren.
7. Nach der abschließenden Veröffentlichung die Website besuchen, **Mit GitHub anmelden** wählen und den Zugriff erlauben. Es werden keine Repository- oder E-Mail-Berechtigungen verlangt. Nur die numerische GitHub-Konto-ID `260273876` bekommt Zugriff.
8. In Chrome oder Brave auf Android **App installieren** wählen. Falls kein Browserdialog erscheint, oben rechts das Browsermenü öffnen und **App installieren** bzw. **Zum Startbildschirm hinzufügen** wählen. Das Symbol startet die App anschließend im eigenen Fenster.

Die Einrichtung lässt sich nach einem Abbruch wieder starten. Eine vorhandene Datenbank wird wiederverwendet; Einträge werden dabei nicht gelöscht. Nach erfolgreicher Einrichtung die nicht geheimen Änderungen an `wrangler.json` ins private Repository übernehmen. Secrets bleiben ausschließlich bei Cloudflare.

## Manuelle Alternative

```sh
npm ci
npx wrangler login
npx wrangler d1 create gewichtsverlauf --location weur
```

Die zurückgegebene `database_id` in `wrangler.json` anstelle der Null-ID eintragen. Danach:

```sh
npm run deploy
```

Die Website-Adresse aus der Ausgabe in `vars.APP_ORIGIN` eintragen, z. B. `https://gewichtsverlauf.DEINE-SUBDOMAIN.workers.dev`. Die GitHub-OAuth-App mit dieser Homepage und dem Callback `/auth/callback` registrieren. Ihre Client ID in `vars.GITHUB_CLIENT_ID` eintragen. `ALLOWED_GITHUB_ID` bleibt `260273876`.

```sh
npx wrangler secret put GITHUB_CLIENT_SECRET
npm run deploy
```

Der Client Secret wird im interaktiven Terminaldialog eingegeben. Er gehört nicht in `wrangler.json`. Die `.dev.vars`-Datei dient nur dem lokalen Betrieb und wird ignoriert. Cloudflare-Bindings und Vars aus der Konfigurationsdatei sind maßgeblich für Deployments; Änderungen nur im Dashboard können sonst überschrieben werden.

## Neue Version veröffentlichen

```sh
git pull
npm ci
npm run check
npm run deploy
```

Datenbank-Migrationen werden vor dem Worker angewendet. Bestehende Einträge bleiben erhalten. Nach Änderungen am Offline-Shell muss die Cache-Version in `public/sw.js` erhöht werden.

## Alle Sitzungen sofort abmelden

```sh
npx wrangler d1 execute DB --remote --command "DELETE FROM sessions"
```

Dadurch werden keine Gewichtseinträge gelöscht. Für einen späteren Zugriff ist eine neue GitHub-Anmeldung nötig. Eine Änderung an `ALLOWED_GITHUB_ID` entzieht alten Konten auch vor Ablauf ihrer Sitzung den Zugriff.

## Prüfen nach dem Livegang

- Ohne Anmeldung erscheint nur die Login-Seite; `/api/entries` antwortet mit HTTP 401.
- Ein anderes GitHub-Konto darf keine Sitzung erhalten.
- Mit dem freigegebenen Konto ein Gewicht speichern, auf einem zweiten Browser anmelden und denselben Eintrag sehen.
- Eintrag ersetzen und löschen; dabei muss jeweils eine Bestätigung erscheinen.
- Auf Android installieren und anschließend über das neue Symbol starten. Installation und Login auf einem echten Gerät müssen nach dem Livegang geprüft werden.

## Häufige Ursachen

- **„Anmeldung wird noch eingerichtet“:** `APP_ORIGIN`, `GITHUB_CLIENT_ID` oder `GITHUB_CLIENT_SECRET` fehlen. Nach Änderungen erneut veröffentlichen.
- **GitHub meldet einen falschen Callback:** Homepage, `APP_ORIGIN` und Callback müssen zur aktuell genutzten Adresse passen. Keine Vorschau-Domain und keinen abschließenden Schrägstrich verwenden.
- **„Dieses GitHub-Konto hat keinen Zugriff“:** Mit `rainermu85-blip` anmelden. Ein gleicher Anzeigename reicht nicht; geprüft wird die feste numerische ID.
- **„Unbekannte Adresse“:** Die besuchte Domain stimmt nicht mit `APP_ORIGIN` überein. Die stabile Hauptadresse benutzen.
- **Offline:** Es werden bewusst keine Gewichtseinträge auf dem Gerät gespeichert. Nach Wiederherstellung der Verbindung erneut laden und absenden.
- **Mehrere Cloudflare-Konten:** Das Konto auswählen, dem die Datenbank gehört; bei Bedarf `account_id` in der Wrangler-Konfiguration ergänzen.
