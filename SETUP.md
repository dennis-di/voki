# Voki · Einrichtung

Einmalig, ca. 20 Minuten. Reihenfolge einhalten.

## 1. Datenbank anlegen
1. Supabase-Dashboard › dein Projekt › **SQL Editor** › **New query**
2. Inhalt von `supabase/schema.sql` einfügen › **Run**
3. Erwartet: „Success. No rows returned“

Das legt Tabellen, Zugriffsregeln und deine erste Einladung an: **START-GAT5FX** (Admin-Konto, einmal gültig).

## 2. Anmeldung absichern
**Authentication › Sign In / Providers › Email**
- **Allow new users to sign up: AUS.** Konten entstehen nur noch über Einladungscodes (die Server-Funktion darf trotzdem anlegen).
- „Confirm email“ ist egal, die Konten werden bestätigt angelegt.

## 3. Server-Funktionen anlegen (3 Stück)
**Edge Functions › Deploy a new function › Via Editor**, jeweils:

| Name | Datei |
|---|---|
| `signup` | `supabase/functions/signup/index.ts` |
| `admin` | `supabase/functions/admin/index.ts` |
| `read-photo` | `supabase/functions/read-photo/index.ts` |

Namen genau so schreiben, Code komplett ersetzen, **Deploy**.
Danach bei **jeder** Funktion: Function › **Details** › **Verify JWT with legacy secret: AUS** › Save.
(Die Funktionen prüfen die Anmeldung selbst. Mit dem neuen Publishable Key würde die alte Prüfung jeden Aufruf ablehnen.)

Alternativ mit der Supabase CLI:
```
supabase functions deploy signup --no-verify-jwt --project-ref kjeuvgvsakhstyhqarat
supabase functions deploy admin --no-verify-jwt --project-ref kjeuvgvsakhstyhqarat
supabase functions deploy read-photo --no-verify-jwt --project-ref kjeuvgvsakhstyhqarat
```

## 4. Dein Claude-Schlüssel
**Edge Functions › Secrets › Add new secret**
- Name: `ANTHROPIC_API_KEY`
- Wert: dein Schlüssel von console.anthropic.com

Er wird nur für Konten benutzt, bei denen du im Admin-Bereich „Foto-Erkennung mit deinem Claude-Schlüssel“ einschaltest. Limit: 40 Fotos pro Kind und Tag (in `read-photo/index.ts` änderbar). Am besten in der Anthropic-Console zusätzlich ein Monatslimit setzen.

## 5. App veröffentlichen (Vercel)
1. Diesen Ordner in ein neues GitHub-Repository hochladen (ohne `node_modules`).
2. vercel.com › **Add New › Project** › Repository wählen. Vercel erkennt Vite selbst. **Deploy**.
3. Umgebungsvariablen sind nicht nötig (URL und Publishable Key stehen im Code; sie sind öffentlich).

Lokal testen: `npm install` und `npm run dev`.

## 6. Erstes Konto
1. App öffnen › **Neues Konto** › Code `START-GAT5FX`, Benutzername und Passwort wählen.
2. Du bist Admin. Unten erscheint der Reiter **Admin**.
3. Dort Einladungen erstellen: Für deine Kinder „Foto-Erkennung mit deinem Claude-Schlüssel“ einschalten, für andere aus.
4. Der Text mit Code und Link wird kopiert, du schickst ihn per WhatsApp.

## Auf dem Handy installieren
- iPhone: Link in Safari öffnen › Teilen › **Zum Home-Bildschirm**
- Android: Chrome › Menü › **App installieren**

## Gut zu wissen
- Passwort vergessen: Admin › Konto › Passwort zurücksetzen.
- Buchstaben-Aufnahmen liegen in `public/audio` (neu erzeugen: `tools/letters.py`).
- Stimmen der Aufnahmen: Piper „Gilles“ (CC0), „Thorsten“ (CC0), „Ryan“ (CC BY-NC-SA 4.0, nur nicht-kommerziell).
