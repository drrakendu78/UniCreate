# UniCreate — Documentation technique

## Vue d'ensemble

UniCreate est une application desktop (Tauri 2 + React) pour créer et soumettre des manifestes WinGet sur `microsoft/winget-pkgs`. Elle remplace l'utilisation de `wingetcreate` CLI ou `YAMLCreate.ps1` par une interface graphique avec auto-complétion.

**Repo** : https://github.com/drrakendu78/UniCreate
**Version** : 1.0.0
**Identifiant** : `com.drrakendu78.unicreate`

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Rust (Tauri 2) |
| State | Zustand + persist middleware |
| Styles | Tailwind CSS + Radix UI |
| Icônes | Lucide React |
| HTTP (Rust) | reqwest 0.13 |
| Hash | sha2 (SHA256) |
| MSIX | zip 2 (extraction signature) |
| Keychain | keyring 3 (stockage token OS) |
| GitHub API | REST v3 (via reqwest) |

## Structure du projet

```
UniCreate/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── lib.rs              # Commandes Tauri (point d'entrée, 12 commandes)
│       ├── hash.rs             # Téléchargement + SHA256 + détection type/arch + MSIX signature
│       ├── github.rs           # API GitHub (metadata, manifestes existants, check exists, soumission PR)
│       └── yaml_generator.rs   # Génération YAML (version, installer, locale, locales additionnelles)
├── src/
│   ├── main.tsx
│   ├── App.tsx                 # Router + Toast container + raccourci Ctrl+Enter
│   ├── index.css               # Thème light/dark + animations
│   ├── pages/
│   │   ├── Home.tsx            # Accueil : nouveau/update + import URL winget-pkgs + historique
│   │   ├── StepInstaller.tsx   # Étape 1 : URL + drag & drop + auto-détection arch + MSIX signature
│   │   ├── StepMetadata.tsx    # Étape 2 : métadonnées + validation ID + multi-locale
│   │   ├── StepReview.tsx      # Étape 3 : preview YAML (inclut locales additionnelles)
│   │   └── StepSubmit.tsx      # Étape 4 : auth GitHub + keychain + historique soumissions
│   ├── components/
│   │   └── StepperHeader.tsx   # Barre de progression des étapes
│   ├── stores/
│   │   ├── manifest-store.ts   # Store principal (persisté dans localStorage)
│   │   ├── toast-store.ts      # Notifications toast (succès/erreur/info, auto-dismiss 4s)
│   │   └── history-store.ts    # Historique des soumissions (persisté dans localStorage)
│   └── lib/
│       ├── types.ts            # Types TypeScript
│       ├── utils.ts            # Utilitaires (cn)
│       └── repo-mappings.ts    # Mappings perso repo→package (via .env.local / VITE_REPO_MAPPINGS)
├── .env.example                # Template pour les mappings perso
├── .env.local                  # Mappings perso (gitignored)
└── index.html                  # Détection thème système (dark/light)
```

## Commandes Tauri

| Commande | Module | Description |
|----------|--------|-------------|
| `download_and_hash(url)` | hash.rs | Télécharge, SHA256, détecte type + arch + signature MSIX |
| `hash_local_file(path)` | hash.rs | Hash un fichier local (drag & drop), détecte type/arch/signature |
| `generate_yaml(manifest)` | yaml_generator.rs | Génère les fichiers YAML winget 1.9.0 (+ locales additionnelles) |
| `save_yaml_files(files, package_id, version)` | lib.rs | Sauvegarde les YAML sur le Bureau |
| `fetch_repo_metadata(url)` | github.rs | Récupère les métadonnées d'un repo GitHub |
| `fetch_existing_manifest(package_id)` | github.rs | Récupère un manifeste existant depuis winget-pkgs |
| `check_package_exists(package_id)` | github.rs | Vérifie si un PackageIdentifier existe dans winget-pkgs |
| `authenticate_github(token)` | github.rs | Vérifie un token PAT GitHub |
| `submit_manifest(token, yaml_files, package_id, version)` | github.rs | Fork + branche + commit + PR sur winget-pkgs |
| `store_github_token(token)` | lib.rs | Stocke le token dans le keychain OS (Windows Credential Manager) |
| `get_github_token()` | lib.rs | Récupère le token depuis le keychain OS |
| `clear_github_token()` | lib.rs | Supprime le token du keychain OS |

## Wizard (étapes)

```
Home → Installer → Metadata → Review → Submit
       (étape 1)   (étape 2)  (étape 3) (étape 4)
```

### Home
- **Nouveau package** : démarre le wizard vide
- **Mise à jour** : recherche par PackageIdentifier ou URL winget-pkgs, pré-remplit les métadonnées
- **Import URL** : coller `https://github.com/microsoft/winget-pkgs/tree/.../manifests/...` → auto-extrait le PackageIdentifier
- **Historique** : liste des 5 dernières PR soumises avec liens directs

### Étape 1 — Installer
- Input URL + bouton "Analyze"
- **Drag & drop** : glisser un fichier local pour calculer le hash (URL à fournir séparément)
- Télécharge le fichier, calcule SHA256 automatiquement
- **Détection auto type** : msi, exe, msix, zip depuis le nom de fichier
- **Détection auto architecture** : x64, x86, arm64, arm depuis le nom de fichier (patterns: _x64, amd64, win64, etc.)
- **MSIX SignatureSha256** : extraction automatique depuis AppxSignature.p7x dans le package MSIX
- Si URL GitHub : fetch les métadonnées du repo en parallèle
- Support multi-installer (plusieurs architectures)
- Badge "SIGNED" affiché pour les MSIX avec signature détectée

### Étape 2 — Metadata
- **Requis** : PackageIdentifier, Version, Locale, Publisher, PackageName, License, ShortDescription
- **Validation PackageIdentifier en temps réel** :
  - Format regex : `Publisher.Package` (lettres/chiffres)
  - Check existence dans winget-pkgs (debounce 800ms)
  - Indicateurs visuels : spinner (checking), checkmark vert (existe), badge "NEW" (nouveau), icône erreur (format invalide)
- **Optionnels** (section dépliable) : Description, URLs, Author, Moniker, Tags, ReleaseNotes
- **Multi-locale** (section dépliable) :
  - Ajouter des locales supplémentaires (fr-FR, de-DE, etc.)
  - Chaque locale a ses propres champs traduits (PackageName, ShortDescription, Description)
  - Publisher et License pré-remplis depuis la locale par défaut
  - Génère des fichiers YAML additionnels avec `ManifestType: "locale"` (vs `"defaultLocale"`)

### Étape 3 — Review
- Génère et affiche les fichiers YAML en onglets (3 + locales additionnelles)
- Boutons : copier dans le presse-papier, sauvegarder sur le Bureau

### Étape 4 — Submit
- Input token GitHub PAT (scope `public_repo` requis)
- **Stockage token optionnel** : checkbox "Remember" → stocke dans le keychain OS (Windows Credential Manager)
- Token chargé automatiquement au montage si déjà stocké
- Authentification → Fork winget-pkgs → Créer branche → Commit fichiers → Ouvrir PR
- Soumission ajoutée à l'historique automatiquement
- Toast de succès/erreur

## Format YAML winget 1.9.0

Fichiers générés dans `manifests/<lettre>/<Publisher>/<Package>/<Version>/` :

1. **`Publisher.Package.yaml`** — Version file (`ManifestType: "version"`)
2. **`Publisher.Package.installer.yaml`** — Installer file (`ManifestType: "installer"`)
3. **`Publisher.Package.locale.en-US.yaml`** — Default locale (`ManifestType: "defaultLocale"`)
4. **`Publisher.Package.locale.fr-FR.yaml`** — Locale additionnelle (`ManifestType: "locale"`) — si ajoutée

## Sérialisation Rust ↔ TypeScript

Toutes les structs Rust utilisent `#[serde(rename_all = "camelCase")]` pour matcher les noms JavaScript.
Exception : `GitHubUser` utilise `#[serde(alias = "...")]` car il désérialise du snake_case (API GitHub) et sérialise en camelCase (frontend).

## Thème

- Détection automatique du thème système via `prefers-color-scheme: dark`
- Écoute en temps réel les changements de thème Windows
- CSS variables Tailwind pour light et dark mode

## Persistance

- **localStorage** (`unicreate-manifest`) : étape en cours, manifest, mode update — via Zustand persist
- **localStorage** (`unicreate-history`) : historique des soumissions (packageId, version, prUrl, date, user)
- **Keychain OS** : token GitHub PAT (optionnel, opt-in via checkbox "Remember")
- **Pas sauvegardé** : états temporaires (isAnalyzing, isSubmitting), YAML généré, toasts
- **Reset** : efface manifest + localStorage manifest (historique et token conservés)

## Toast Notifications

- Système de notifications non-bloquantes en bas à droite
- 3 types : `success` (vert), `error` (rouge), `info` (bleu)
- Auto-dismiss après 4 secondes
- Bouton de fermeture manuelle
- Store Zustand séparé (`toast-store.ts`)

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl+Enter` | Cliquer le bouton principal de l'étape en cours (Analyze, Continue, Submit) |
| `Enter` | Valider le champ URL (étape 1), lancer la recherche (mode update) |

Le raccourci Ctrl+Enter utilise `data-action="primary"` sur les boutons pour les identifier.

## Drag & Drop

- Écoute l'événement `onDragDropEvent` de la fenêtre Tauri
- Zone de drop visuelle avec animation (bordure bleue pointillée + icône Upload)
- Quand un fichier est déposé :
  1. Hash calculé localement via `hash_local_file`
  2. Type et architecture auto-détectés
  3. L'utilisateur doit fournir l'URL de téléchargement
  4. Cliquer "Add with local hash" pour ajouter l'installer

## Mappings perso (repo-mappings)

Permet de mapper un repo GitHub à un PackageIdentifier/PackageName personnalisé.
Configuré dans `.env.local` (gitignored) via la variable `VITE_REPO_MAPPINGS`.

Format : `owner/repo:PackageIdentifier:Package Name` (virgule pour séparer plusieurs mappings)

## Sécurité

- Aucune donnée stockée côté serveur (100% local)
- Token GitHub : en mémoire par défaut, optionnellement dans le keychain OS
- CSP Tauri : `default-src 'self'; connect-src 'self' https://api.github.com https://*`
- Pas de base de données, pas de telemetry
- Keychain utilise Windows Credential Manager (chiffré par l'OS)

## Mise a jour recente (ajoutee par moi, Codex) - 2026-02-19

Changements ajoutes dans l'application pour fiabiliser la generation WinGet :

- Headers `$schema` automatiques dans tous les YAML generes (fichier `version`, `installer`, `defaultLocale`, `locale`).
- Mode silencieux auto pour les installateurs `exe` :
  - si `InstallerSwitches.Silent` est absent -> valeur auto `"/S"`
  - si `InstallerSwitches.SilentWithProgress` est absent -> valeur auto `"/S"`
  - si des switches sont deja fournis, ils sont conserves (pas ecrases).
- Version du schema centralisee dans le generateur Rust (`MANIFEST_SCHEMA_VERSION = "1.9.0"`) pour eviter les incoherences entre `ManifestVersion` et les URLs de schema.

Fichier impacte :

- `src-tauri/src/yaml_generator.rs`

## Mise a jour recente (ajoutee par moi, Codex) - 2026-02-19 (Recover PRs)

Objectif:

- Eviter la perte d'historique PR apres build/reinstall en permettant de recuperer les PR deja creees depuis GitHub.

Changements ajoutes:

- Nouveau bouton `Recover PRs` sur la Home, visible meme quand l'historique est vide.
- Recuperation via token stocke en keychain (`get_github_token`), avec message guide si absent.
- Appel backend pour recuperer les PR `winget-pkgs` creees avec UniCreate:
  - filtre: `repo:microsoft/winget-pkgs is:pr author:{username} "Created with [UniCreate]"`
  - tri: creation descendante
  - limite: 10 cote UI (API bornee a 1..30)
- Parsing automatique du titre PR:
  - regex: `^New version:\\s+(.+?)\\s+version\\s+(.+)$`
  - fallback: `packageId = title`, `version = "-"`
- Fusion intelligente de l'historique local:
  - dedup par `prUrl`
  - garde l'entree la plus recente
  - tri descendant par date
  - tronquage strict a 10 entrees (choix produit verrouille)
- Etats UX:
  - bouton desactive pendant recuperation
  - spinner sur `Recovering...`
  - toast succes / info / erreur selon resultat

Nouveaux elements backend/frontend:

- Commande Tauri: `fetch_unicreate_recent_prs(token, limit?)`
- Struct Rust: `RecoveredPr { pr_url, title, created_at, user_login }`
- Type TS: `RecoveredPr`
- Store historique: `mergeRecoveredSubmissions(entries, maxItems)`

Fichiers impactes:

- `src-tauri/src/github.rs`
- `src-tauri/src/lib.rs`
- `src/lib/types.ts`
- `src/stores/history-store.ts`
- `src/pages/Home.tsx`

## Mise a jour recente (ajoutee par moi, Codex) - 2026-02-19 (Auth/Home UX + Securite renforcee)

Objectif:

- Garder une UX fluide sur la Home pour `Recover PRs` tout en renforcant la securite de session.

Changements ajoutes:

- **Auth popup directement sur Home** (sans redirection vers Submit):
  - clic `Recover PRs` sans session -> popup GitHub Device Flow
  - connexion reussie -> recovery automatique des PR depuis Home
- **Bouton `Disconnect`** sur Home:
  - purge du token keychain
  - purge de la session memoire
- **Etat de session globalise**:
  - creation d'un store dedie `auth-session-store` (Zustand non persiste)
  - la session ne saute plus juste en changeant de page (Home -> Installer/Update -> Home)
- **Politique securite session**:
  - `Remember session` par defaut sur `false` dans la popup Home
  - session non sauvegardee = session ephemere en memoire
  - **auto-lock** de session ephemere apres 15 minutes d'inactivite
  - sur token invalide/401: purge + demande de reconnexion
- **Durcissement Rust GitHub headers**:
  - suppression du `unwrap()` sur construction header `Authorization` (plus de panic)
  - validation token vide dans `authenticate_github`
- **Polish UX Home (recent submissions)**:
  - header garde sur une ligne
  - suppression de l'affichage `(session)` qui degradait l'UI
  - affichage compact `@username` quand dispo

Autres correctifs lies:

- `StepInstaller` mis a jour pour les events drag/drop Tauri v2:
  - remplacement `hover/cancel` par `enter/over/leave`
  - correction erreur TS build.

Fichiers impactes:

- `src/pages/Home.tsx`
- `src/stores/auth-session-store.ts`
- `src/pages/StepInstaller.tsx`
- `src-tauri/src/github.rs`

## Mise a jour recente (ajoutee par moi, Codex) - 2026-02-19 (Review light + reprise de draft Installer)

Objectif:

- Corriger la lisibilite de l'etape Review en mode light.
- Eviter la perte des installers ajoutes quand on revient sur Home puis qu'on repart sur Installer.

Changements ajoutes:

- **Etape Review (mode light)**:
  - fond du viewer YAML passe en clair en light mode
  - texte du code force en couleur sombre en light et claire en dark
  - resultat: contraste lisible dans les 2 themes.
- **Home -> New Package**:
  - suppression du reset systematique si un draft existe deja
  - si draft detecte, l'app reprend la progression (`setStep("installer")`) au lieu d'effacer les installers
  - le reset reste applique quand on sort explicitement du mode update vers un nouveau package.

Fichiers impactes:

- `src/pages/StepReview.tsx`
- `src/pages/Home.tsx`

## Mise a jour recente (ajoutee par moi, Codex) - 2026-02-19 (Session Home<->Submit + logo light)

Objectif:

- Eviter le doublon de connexion: si l'utilisateur se connecte depuis Home, Submit doit reutiliser la meme session.
- Afficher le logo avec texte noir sans fond en mode light.

Changements ajoutes:

- **Session unifiee Home/Submit**:
  - `StepSubmit` lit et synchronise `auth-session-store` (`activeSessionToken`, `savedSessionUser`, `hasSavedSession`).
  - login fait sur Home est immediatement reconnu sur Submit (plus de reconnexion inutile).
  - login Device Flow depuis Submit met aussi a jour le store partage.
  - `Disconnect` dans Submit efface keychain + session partagee.
  - gestion 401 sur submit: purge session + message de reconnexion.
  - le bouton `New Manifest` apres succes ne vide plus la session.
- **Light logo adapte**:
  - ajout asset `src/assets/logo-text-light.png` (texte noir sans background).
  - `Home` affiche:
    - logo light en mode clair (`dark:hidden`)
    - logo dark actuel en mode sombre (`dark:block`).

Fichiers impactes:

- `src/pages/StepSubmit.tsx`
- `src/pages/Home.tsx`
- `src/assets/logo-text-light.png`

## Mise a jour recente (ajoutee par moi, Codex) - 2026-02-19 (Fix import StepSubmit)

Objectif:

- Eviter l'erreur runtime Vite `does not provide an export named 'StepSubmit'` dans `App.tsx`.

Changements ajoutes:

- `StepSubmit` expose maintenant aussi un export default:
  - `export default StepSubmit`
- `App.tsx` utilise un import default:
  - `import StepSubmit from "@/pages/StepSubmit"`

Fichiers impactes:

- `src/pages/StepSubmit.tsx`
- `src/App.tsx`

## Mise a jour recente (ajoutee par moi, Codex) - 2026-02-19 (Statut PR live sur Home)

Objectif:

- Afficher dans `Recent Submissions` si une PR est `Open`, `Merged` ou `Closed`.
- Donner un signal visuel quand il y a un souci (`Attention`).
- Fonctionner uniquement quand l'utilisateur est connecte.

Changements ajoutes:

- **Backend Tauri / GitHub**
  - nouvelle struct `PrLiveStatus` (`prUrl`, `status`, `hasIssues`, `mergeableState`)
  - nouvelle commande `fetch_pr_statuses(pr_urls, token?)`
  - parsing des URLs PR GitHub
  - lecture de l'etat PR via `GET /repos/{owner}/{repo}/pulls/{number}`
  - fallback automatique sans token si token refuse (401/403)
- **Frontend Home**
  - polling auto toutes les 30 secondes des statuts PR visibles
  - badges:
    - `Merged` (vert)
    - `Open` (bleu)
    - `Closed` (rouge)
    - `Unknown` (neutre)
    - badge `Attention` si souci detecte
  - **condition stricte**: affichage et refresh live seulement si `activeSessionToken` present
  - hors connexion: liste PR visible mais sans statut live

Fichiers impactes:

- `src-tauri/src/github.rs`
- `src-tauri/src/lib.rs`
- `src/lib/types.ts`
- `src/pages/Home.tsx`

## Mise a jour recente (ajoutee par moi, Codex) - 2026-02-19 (UX header Recent Submissions)

Objectif:

- Eviter que le pseudo soit coupe dans l'en-tete `Recent Submissions`.

Changements ajoutes:

- separation de l'en-tete en 2 lignes:
  - ligne 1: titre + boutons d'action
  - ligne 2 (si connecte): `@username` + diode `Live/Sync`
- pseudo avec espace dedie (`max-w` augmente) et tooltip complet.

Fichier impacte:

- `src/pages/Home.tsx`
