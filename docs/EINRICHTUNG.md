# GitHub Pages aktivieren

Es werden kein Cloudflare-Konto, kein OAuth-Client und keine Zugangsdaten benötigt.

1. [Repository-Einstellungen → Pages](https://github.com/rainermu85-blip/Gewichtsverlauf/settings/pages) öffnen.
2. Unter **Build and deployment → Source** den Eintrag **GitHub Actions** wählen.
3. Unter [Actions](https://github.com/rainermu85-blip/Gewichtsverlauf/actions) den Workflow **Prüfen und auf GitHub Pages veröffentlichen** öffnen und **Run workflow** auf `main` ausführen. Weitere Pushes veröffentlichen automatisch.
4. Nach erfolgreicher Veröffentlichung die von GitHub angegebene Adresse öffnen: normalerweise `https://rainermu85-blip.github.io/Gewichtsverlauf/`.
5. Auf Android in Chrome oder Brave **App installieren** bzw. im Browsermenü **Zum Startbildschirm hinzufügen** wählen. Nach dem ersten vollständigen Laden kann die App offline benutzt werden.

## Falls GitHub bei einem privaten Repository einen Tarifwechsel verlangt

GitHub Pages ist bei öffentlichen Repositories im kostenlosen GitHub-Tarif enthalten. Für private Repositories hängt die Verfügbarkeit vom GitHub-Tarif ab. Dieses Repository ist derzeit privat. Es wird kein Tarif gebucht und die Sichtbarkeit wird nicht automatisch geändert.

Für einen vollständig kostenlosen Betrieb kann der **reine App-Code** öffentlich bereitgestellt werden, sofern du das möchtest. Die Gewichtseinträge liegen ausschließlich auf dem Gerät und werden dadurch nicht öffentlich. Eine Änderung der Repository-Sichtbarkeit muss der Eigentümer bewusst in den Einstellungen vornehmen. Alternativ kann bei einem bereits passenden GitHub-Tarif das Repository privat bleiben; die Pages-Webseite selbst ist trotzdem öffentlich erreichbar.

## Speicher und Sicherung

Die Browser-Cache-Dateien enthalten nur die App, keine Gewichte. Die Einträge liegen in IndexedDB. Das Leeren des reinen Caches lässt sie bestehen; „Cookies und andere Websitedaten“ bzw. „Alle Websitedaten“ können sie entfernen. Eine eigene JSON-Sicherung lässt sich im Download-Ordner aufbewahren und bei Bedarf wieder einlesen. Das funktioniert auch beim Wechsel zwischen Chrome und Brave oder auf ein anderes Handy.
