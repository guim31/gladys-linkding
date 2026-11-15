# linkding

Verbinde Gladys mit [linkding](https://linkding.link), dem selbst gehosteten
Lesezeichen-Manager: Verfolge deine Zähler (Lesezeichen, ungelesene,
archivierte), sieh deine ungelesenen Lesezeichen auf dem Dashboard, reagiere,
wenn ein Lesezeichen hinzugefügt wird, lies die neuesten in einer Nachricht
und speichere, wenn du es erlaubst, Links aus deinen Szenen. Alles bleibt in
deinem lokalen Netzwerk: Gladys spricht direkt mit deinem linkding-Server.

Getestet mit einem echten linkding-1.47.0-Server (dem offiziellen
Docker-Image). Rückmeldungen sind im Gladys-Forum willkommen.

## Voraussetzungen

- Gladys Assistant 5.1 oder neuer.
- linkding, vom Gladys-Rechner aus erreichbar, standardmäßig auf Port 9090,
  oder hinter einem Reverse Proxy.
- Ein API-Token: Öffne in linkding **Settings → Integrations** und erstelle im
  Abschnitt **REST API** ein Token. Die Integration sieht die Lesezeichen des
  Benutzers, dem das Token gehört.

## Konfiguration

1. Öffne den Reiter **Konfiguration** der Integration.
2. Gib unter **linkding-Adresse** die IP-Adresse des Servers ein, zum
   Beispiel `192.168.1.50`: Die Integration nutzt dann Port 9090. Füge einen
   Port hinzu, falls deiner abweicht (`192.168.1.50:9091`). Hinter einem
   Reverse Proxy gibst du die vollständige Adresse ein
   (`https://links.example.org`, mit Pfad, falls linkding unter einem Pfad
   läuft).
3. Füge das **API-Token** ein.
4. **Filter (optional)**: ein **Tag** (`lesen`) und/oder eine **Suche**
   (Wörter, wie im Suchfeld von linkding). Die Zähler, das Widget, der
   Auslöser **Neues Lesezeichen** und **Neueste linkding-Lesezeichen lesen**
   berücksichtigen dann nur die passenden Lesezeichen. Lass beide leer für
   alle Lesezeichen.
5. **linkding lesen alle**: 5, 15 (Standard), 30 oder 60 Minuten.
6. **Szenen dürfen Lesezeichen hinzufügen**: standardmäßig aus. Schalte es
   ein, um die Szenenaktion **Lesezeichen zu linkding hinzufügen** zu nutzen.
7. **Sprache der Namen und Meldungen** legt die Namen der Funktionen (beim
   Hinzufügen des Geräts festgelegt) und die Texte der Integration fest.
   Standardmäßig Französisch.
8. Speichere und nutze dann **Verbindung testen**: Der Test zeigt die
   linkding-Version und die Anzahl der Lesezeichen.
9. Füge im Reiter **Entdecken** das Gerät **linkding** hinzu.

## Geräte

**linkding** (ein Gerät):

| Funktion                | Wert                                                     |
| ----------------------- | -------------------------------------------------------- |
| Server erreichbar       | 1, wenn linkding antwortet, sonst 0                      |
| Lesezeichen             | Anzahl der Lesezeichen, ohne archivierte                 |
| Ungelesene Lesezeichen  | Anzahl der als ungelesen markierten Lesezeichen          |
| Archivierte Lesezeichen | Anzahl der archivierten Lesezeichen                      |
| Neuestes Lesezeichen    | Titel des neuesten Lesezeichens (ohne Titel: die Domain) |
| linkding-Version        | Version des Servers, z. B. 1.47.0                        |

Die Filter der Konfiguration gelten für die drei Zähler und das neueste
Lesezeichen. Die Zähler behalten ihren Verlauf: Ein Diagramm zeigt, wie dein
Lesestapel wächst. Antwortet linkding nicht, geht **Server erreichbar** auf 0
und die Zähler behalten ihren letzten Wert.

## Dashboard-Widget

**linkding**: zwei Kacheln (ungelesen, Lesezeichen) und die sechs neuesten
ungelesenen Lesezeichen, mit Domain, Datum und Tags. Tippe auf ein
Lesezeichen, um seine Beschreibung zu lesen und es zu öffnen (nur
https-Links). In den Widget-Einstellungen zeigt **Liste** stattdessen die
neuesten Lesezeichen (ungelesene tragen dann ein Abzeichen **Ungelesen**), und
**Zähler anzeigen** blendet die zwei Kacheln aus.

## Szenen-Auslöser

**Neues Lesezeichen**: Ein Lesezeichen, das zu den Filtern der Konfiguration
passt, wird zu linkding hinzugefügt, aus der Web-App, der
Browser-Erweiterung oder über die API. Importe (deren Lesezeichen ihr altes
Datum behalten) und die Lesezeichen dieser Integration werden nicht gemeldet.

Variablen: **Titel**, **Link**, **Beschreibung**, **Tags** (durch Kommas
getrennt), **Ungelesen** und **Lesezeichen-ID**.

Das erste Lesen nach der Installation ist still: Die schon vorhandenen
Lesezeichen werden nicht gemeldet. Pro Lesen gehen höchstens zehn Ereignisse
raus; der Rest zählt als gesehen.

## Szenen-Aktionen

- **Lesezeichen zu linkding hinzufügen** (schalte zuerst **Szenen dürfen
  Lesezeichen hinzufügen** ein): **Link** (Pflicht) und optional **Titel**
  (leer: linkding liest den Titel der Seite), **Tags** (durch Leerzeichen
  oder Kommas getrennt; fehlende Tags werden angelegt) und **Als ungelesen
  markieren**. Ein Link, der schon in linkding ist, bleibt genau, wie er ist
  (linkding würde sonst Titel und Tags ersetzen). Gibt **Lesezeichen-ID**,
  **Titel** und **Schon gespeichert** zurück.
- **Neueste linkding-Lesezeichen lesen**: **Lesezeichen** (nur ungelesene,
  Standard, oder alle) und **Anzahl der Lesezeichen** (1, 3, 5 oder 10). Gibt
  **Anzahl gelesener Lesezeichen**, **Lesezeichen, eines pro Zeile** (`Titel —
Adresse`), **Titel des neuesten Lesezeichens** und **Adresse des neuesten
  Lesezeichens** zurück.

## Szenen-Beispiele

- **Neuer Lesestoff aufs Handy**: Auslöser **Neues Lesezeichen** → eine
  Nachricht senden „Zu lesen: {{triggerEvent.data.title}}
  {{triggerEvent.data.url}}“.
- **Sonntagslektüre**: jeden Sonntag um 10:00 → **Neueste
  linkding-Lesezeichen lesen**, nur ungelesene, 5 Lesezeichen → eine
  Nachricht mit der Ausgabe **Lesezeichen, eines pro Zeile** senden.
- **Kamera-Clip aufheben**: Wenn eine andere Integration eine Clip-Adresse
  liefert → **Lesezeichen zu linkding hinzufügen** mit dieser Adresse, Tag
  `klingel`.
- **Lesestapel**: jeden Abend → nur weiter, wenn **Ungelesene Lesezeichen**
  über 30 liegt → eine Nachricht senden „Dein Lesestapel hat mehr als 30
  Lesezeichen“.
- **Server aus**: **Server erreichbar** geht auf 0 → eine Nachricht senden.

## Fehlerbehebung

- **„linkding hat das API-Token abgelehnt“**: Das Token wurde gelöscht oder
  falsch eingegeben. Erstelle ein neues unter linkding → Settings →
  Integrations.
- **„linkding antwortet nicht“**: Prüfe Adresse und Port vom Gladys-Rechner
  aus. Der Container nutzt ein Bridge-Netzwerk: `localhost` ist der Container
  selbst, gib stattdessen die IP-Adresse des Servers ein.
- **„Diese Adresse antwortet nicht wie linkding“**: Eine Login-Seite des
  Proxys antwortet statt linkding, oder der Pfad ist falsch. Gib die Adresse
  von linkding selbst ein.
- **„Das Hinzufügen von Lesezeichen durch Szenen ist aus“**: Schalte
  **Szenen dürfen Lesezeichen hinzufügen** in der Konfiguration ein.
- Für mehr Details in den Logs der Integration setze `LOG_LEVEL=debug`.

## Grenzen

- Ein linkding-Benutzer: der Besitzer des Tokens.
- Der Auslöser kommt beim nächsten Lesen (standardmäßig 15 Minuten), nicht
  sofort: linkding schickt nichts von sich aus. Er liest die 50 neuesten
  Lesezeichen: Kommen zwischen zwei Lesevorgängen mehr als 50 dazu, werden die
  ältesten nicht gemeldet.
- Ein direkt archiviert hinzugefügtes Lesezeichen wird gezählt, aber nicht
  gemeldet.
- Die Integration löscht, ändert und archiviert nie etwas in linkding.
- Nicht mit dem linkding-Projekt verbunden.
