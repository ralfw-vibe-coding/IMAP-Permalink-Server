Wenn ich eine Email nach Generierung eines Permalinks lösche oder verschiebe, dann funktioniert der Permalink nicht mehr.
Das darf nicht sein!

Kann die Email, solange sie nicht phyisisch gelöscht ist, sondern nur in einem anderen Folder ist, über ihre ID immer gefunden werden?

Wenn nicht, dann muss die Email in der Datenbank gespeichert werden (mit ihrem Thread). Dann muss beim Anlegen des Permalink sofort alles gesichert werden, was später zur Anzeige nötig ist.

---
Permalinks speichern jetzt beim Erzeugen einen Snapshot der Mail in der Datenbank (Empfänger und Body zusätzlich zu den bisherigen Metadaten). Die öffentliche Permalink-Ansicht verwendet diesen Snapshot primär und greift nur noch für alte Permalinks ohne Snapshot auf IMAP zurück. Dadurch bleiben neue Permalinks stabil, auch wenn die Mail später in einen anderen Ordner verschoben wird. Wichtig: die aktuelle `src/database/schema.sql` muss noch in Neon ausgeführt werden, damit die neuen Spalten und die erweiterte Funktion live vorhanden sind.
