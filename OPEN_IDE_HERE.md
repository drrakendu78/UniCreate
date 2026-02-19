# Ouvre ce dossier dans l'IDE

Chemin projet a ouvrir:

`C:\Users\djame\Documents\projet\UniCreate`

## Ce que je vais faire ensuite

Objectif: ajouter un systeme d'update via API GitHub avec popup dans l'app avant release.

1. Backend Tauri (Rust)
- Ajouter une commande `check_app_update`.
- Appeler `https://api.github.com/repos/drrakendu78/UniCreate/releases/latest`.
- Comparer `latest_version` avec la version actuelle de l'app.
- Retourner: `currentVersion`, `latestVersion`, `hasUpdate`, `releaseNotes`, `releaseUrl`, `publishedAt`.

2. Frontend React
- Ajouter un type TS `AppUpdateInfo`.
- Appeler `invoke("check_app_update")` au lancement.
- Afficher une popup si `hasUpdate = true`.
- Boutons: `Later` et `Open Release`.

3. UX
- Popup propre, lisible dark/light, non bloquante.
- Option de masquer temporairement la popup pour la meme version.

4. Validation technique
- `tsc --noEmit`
- `cargo check`

## Note

Le travail doit etre fait dans ce dossier uniquement:

`C:\Users\djame\Documents\projet\UniCreate`
