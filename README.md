# Gewichtsverlauf

Eine einfache Web-App: Gewicht mit einer Nachkommastelle eintragen und den Verlauf ansehen. Die Gewichte werden in **IndexedDB**, einer lokalen Datenbank auf dem jeweiligen Gerät, gespeichert. Kein Cloudflare, kein Backend, keine Anmeldung und keine externen Laufzeit-Abhängigkeiten.

## Benutzen

Nach Aktivierung von GitHub Pages: `https://rainermu85-blip.github.io/Gewichtsverlauf/`.

- Gewicht mit Komma oder Punkt eingeben; nach dem Speichern erscheint das Diagramm.
- Echte Zeitabstände auf der X-Achse und automatisch angepasste Y-Achse.
- Ein Eintrag pro Tag, mit Datumsauswahl, Bearbeiten und Löschen nach Bestätigung.
- In Chrome/Brave auf Android **App installieren** wählen oder das Browsermenü verwenden. Der Browser entscheidet, ob der Installationsdialog automatisch erscheint.
- Nach dem ersten vollständigen Laden auch offline benutzbar, einschließlich Speichern neuer Gewichte.
- **Sicherung herunterladen** speichert eine JSON-Datei im Download-Ordner. **Sicherung laden** stellt sie auf diesem oder einem anderen Gerät wieder her. Vorhandene Tage aus der Sicherung werden nach Bestätigung ersetzt, andere Einträge bleiben erhalten.
- Zusätzlich CSV-Export für Tabellenprogramme.

## Wo liegen die Daten?

Die Einträge liegen in einer lokalen Datenbank im geschützten App-/Websitespeicher von Chrome bzw. Brave. Sie sind **nicht im Browser-Cache**. Schließen, Neustarten und das Leeren des reinen Caches löschen sie nicht. Der Service Worker speichert im Cache ausschließlich Programmdateien, damit die App ohne Netz startet.

Die App kann über **Speicher schützen** dauerhafte Speicherung anfordern. Ob sie zugesichert wird, entscheidet der Browser. Auch damit gilt: „Alle Websitedaten löschen“, das Löschen der Browser-App-Daten oder das Zurücksetzen des Handys kann die Datenbank löschen. Im privaten Browsermodus ist der Speicher nicht dauerhaft. Deshalb regelmäßig eine Sicherung herunterladen. Aufbewahrte Sicherungen enthalten die Gewichte im Klartext.

Die Einträge werden nicht hochgeladen und nicht automatisch zwischen Geräten oder Chrome und Brave synchronisiert. Jeder Browser hat seine eigene Datenbank. Die öffentlich erreichbare Website zeigt Besuchern deren eigene lokalen Einträge, niemals deine. Andere Personen mit Zugriff auf dein entsperrtes Gerät können deine Einträge sehen; die App hat keine eigene Anmeldung.

## GitHub Pages einmal aktivieren

[Einrichtung und Grenzen von GitHub Pages](docs/EINRICHTUNG.md). Die GitHub-Verbindung dieses Arbeitsbereichs hat keinen Zugriff auf Pages-Einstellungen; sie müssen vom Eigentümer gesetzt werden.

Der Code funktioniert sowohl unter `/Gewichtsverlauf/` als auch auf einer eigenen Domain. Manifest, Startadresse, Service Worker und Dateien verwenden relative Pfade.

## Lokal starten und prüfen

Node.js 22 oder neuer genügt. Es müssen keine Pakete installiert werden.

```sh
npm run check
npm run dev
```

Entwicklung: `http://localhost:4173/Gewichtsverlauf/`. Tests prüfen Gewichtseingaben, Kalendertage, Zeitabstände, Y-Achse und Sicherungsvalidierung. Browserprüfungen testen zusätzlich echte IndexedDB-Speicherung, Neustart, Cache-Löschung, Offline-Schreiben, Sicherung/Wiederherstellung und den GitHub-Pages-Unterpfad.

`public/` enthält die gesamte App. Für ein Update am Offline-Shell auch die Cache-Version in `public/sw.js` erhöhen. Änderungen der Website-Adresse führen zu einer anderen lokalen Datenbank; vorher eine Sicherung erstellen und anschließend dort laden.
